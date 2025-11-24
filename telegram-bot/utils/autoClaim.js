"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeAutoClaim = initializeAutoClaim;
exports.stopAutoClaim = stopAutoClaim;
exports.manualTriggerAutoClaim = manualTriggerAutoClaim;
exports.getAutoClaimStatus = getAutoClaimStatus;
const database_1 = require("../../src/utils/database");
const logger_1 = __importDefault(require("../../src/utils/logger"));
const userSettings_1 = require("./userSettings");
const userOperations_1 = require("./userOperations");
const formatters_1 = require("./formatters");
const orbAutoTransfer_1 = require("./orbAutoTransfer");
/**
 * Auto-Claim & Auto-Transfer Background Service
 *
 * Periodically checks all users' claimable rewards and automatically
 * claims them when thresholds are met. After claiming, also checks
 * and executes auto-transfer if ORB balance exceeds threshold.
 */
const AUTO_CLAIM_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
let autoClaimInterval = null;
let bot = null;
/**
 * Get all telegram users from database
 */
async function getAllUsers() {
    try {
        const users = await (0, database_1.allQuery)(`
      SELECT telegram_id FROM telegram_users
    `);
        return users.map(u => u.telegram_id);
    }
    catch (error) {
        logger_1.default.error('[Auto-Claim] Failed to get users:', error);
        return [];
    }
}
/**
 * Check and process auto-claims for a single user
 */
async function processUserAutoClaims(telegramId) {
    try {
        // Get user settings
        const settings = await (0, userSettings_1.getUserSettings)(telegramId);
        // Get claimable rewards
        const rewards = await (0, userOperations_1.getUserClaimableRewards)(telegramId);
        const claimedRewards = [];
        // Check mining SOL threshold
        if (settings.auto_claim_sol_threshold > 0 && rewards.miningSol >= settings.auto_claim_sol_threshold) {
            logger_1.default.info(`[Auto-Claim] ${telegramId}: Mining SOL ${rewards.miningSol.toFixed(4)} >= threshold ${settings.auto_claim_sol_threshold}`);
            const result = await (0, userOperations_1.claimUserSol)(telegramId);
            if (result.success && result.solAmount) {
                claimedRewards.push(`${(0, formatters_1.formatSOL)(result.solAmount)} SOL from mining`);
                logger_1.default.info(`[Auto-Claim] ${telegramId}: Claimed ${result.solAmount.toFixed(4)} SOL | ${result.signature}`);
            }
            else {
                logger_1.default.warn(`[Auto-Claim] ${telegramId}: Failed to claim SOL - ${result.error}`);
            }
        }
        // Check mining ORB threshold
        if (settings.auto_claim_orb_threshold > 0 && rewards.miningOrb >= settings.auto_claim_orb_threshold) {
            logger_1.default.info(`[Auto-Claim] ${telegramId}: Mining ORB ${rewards.miningOrb.toFixed(2)} >= threshold ${settings.auto_claim_orb_threshold}`);
            const result = await (0, userOperations_1.claimUserOrb)(telegramId);
            if (result.success && result.orbAmount) {
                claimedRewards.push(`${(0, formatters_1.formatORB)(result.orbAmount)} ORB from mining`);
                logger_1.default.info(`[Auto-Claim] ${telegramId}: Claimed ${result.orbAmount.toFixed(2)} ORB | ${result.signature}`);
            }
            else {
                logger_1.default.warn(`[Auto-Claim] ${telegramId}: Failed to claim ORB - ${result.error}`);
            }
        }
        // Check staking rewards threshold
        if (settings.auto_claim_staking_threshold > 0 && rewards.stakingOrb >= settings.auto_claim_staking_threshold) {
            logger_1.default.info(`[Auto-Claim] ${telegramId}: Staking rewards ${rewards.stakingOrb.toFixed(2)} >= threshold ${settings.auto_claim_staking_threshold}`);
            // Note: Staking claim is not fully implemented yet in userOperations.ts
            logger_1.default.warn(`[Auto-Claim] ${telegramId}: Staking claim not implemented yet`);
            // TODO: Implement staking claim when available
            // const result = await claimUserStakingRewards(telegramId);
            // if (result.success) {
            //   claimedRewards.push(`${formatORB(rewards.stakingOrb)} ORB from staking`);
            // }
        }
        // Send notification if any claims were made
        if (claimedRewards.length > 0 && bot) {
            const message = `✅ *Auto-Claim Successful*\n\nClaimed:\n${claimedRewards.map(r => `• ${r}`).join('\n')}`;
            try {
                await bot.telegram.sendMessage(telegramId, message, { parse_mode: 'Markdown' });
            }
            catch (error) {
                logger_1.default.warn(`[Auto-Claim] Failed to send notification to ${telegramId}:`, error);
            }
        }
        // Check and execute auto-transfer after claims (if enabled)
        try {
            const transferResult = await (0, orbAutoTransfer_1.checkAndExecuteOrbTransfer)(telegramId);
            if (transferResult.transferred) {
                logger_1.default.info(`[Auto-Transfer] ${telegramId}: Transferred ${transferResult.amount?.toFixed(2)} ORB | ${transferResult.signature}`);
            }
            else if (transferResult.error) {
                logger_1.default.warn(`[Auto-Transfer] ${telegramId}: ${transferResult.error}`);
            }
        }
        catch (error) {
            logger_1.default.error(`[Auto-Transfer] Error for ${telegramId}:`, error);
        }
    }
    catch (error) {
        logger_1.default.error(`[Auto-Claim] Error processing user ${telegramId}:`, error);
    }
}
/**
 * Run auto-claim check for all users
 */
async function runAutoClaimCheck() {
    try {
        logger_1.default.debug('[Auto-Claim] Running periodic check...');
        const users = await getAllUsers();
        if (users.length === 0) {
            logger_1.default.debug('[Auto-Claim] No users found');
            return;
        }
        logger_1.default.info(`[Auto-Claim] Checking ${users.length} users for auto-claims`);
        // Process users sequentially to avoid rate limits
        for (const telegramId of users) {
            await processUserAutoClaims(telegramId);
            // Small delay between users to avoid overwhelming the blockchain/bot
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        logger_1.default.debug('[Auto-Claim] Check complete');
    }
    catch (error) {
        logger_1.default.error('[Auto-Claim] Error during check:', error);
    }
}
/**
 * Initialize auto-claim service
 */
function initializeAutoClaim(telegrafBot) {
    bot = telegrafBot;
    if (autoClaimInterval) {
        logger_1.default.warn('[Auto-Claim] Already initialized, skipping');
        return;
    }
    logger_1.default.info(`[Auto-Claim] Initializing with ${AUTO_CLAIM_CHECK_INTERVAL / 1000}s interval`);
    // Run initial check after 1 minute (give bot time to fully start)
    setTimeout(() => {
        runAutoClaimCheck();
    }, 60 * 1000);
    // Set up periodic checks
    autoClaimInterval = setInterval(() => {
        runAutoClaimCheck();
    }, AUTO_CLAIM_CHECK_INTERVAL);
    logger_1.default.info('[Auto-Claim] Service started');
}
/**
 * Stop auto-claim service
 */
function stopAutoClaim() {
    if (autoClaimInterval) {
        clearInterval(autoClaimInterval);
        autoClaimInterval = null;
        logger_1.default.info('[Auto-Claim] Service stopped');
    }
}
/**
 * Manually trigger auto-claim check for a specific user
 */
async function manualTriggerAutoClaim(telegramId) {
    logger_1.default.info(`[Auto-Claim] Manual trigger for ${telegramId}`);
    await processUserAutoClaims(telegramId);
}
/**
 * Get auto-claim status
 */
function getAutoClaimStatus() {
    return {
        running: autoClaimInterval !== null,
        interval: AUTO_CLAIM_CHECK_INTERVAL,
    };
}
//# sourceMappingURL=autoClaim.js.map