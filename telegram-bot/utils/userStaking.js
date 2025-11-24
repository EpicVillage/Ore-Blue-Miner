"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserStakingInfo = getUserStakingInfo;
exports.updateUserStakingInfo = updateUserStakingInfo;
exports.stakeUserOrb = stakeUserOrb;
exports.claimUserStakingRewards = claimUserStakingRewards;
exports.getStakingPoolInfo = getStakingPoolInfo;
exports.formatStakingDisplay = formatStakingDisplay;
const database_1 = require("../../src/utils/database");
const logger_1 = __importDefault(require("../../src/utils/logger"));
const userWallet_1 = require("./userWallet");
const accounts_1 = require("../../src/utils/accounts");
const formatters_1 = require("./formatters");
/**
 * Get user staking info from blockchain
 */
async function getUserStakingInfo(telegramId) {
    try {
        const wallet = await (0, userWallet_1.getUserWallet)(telegramId);
        if (!wallet) {
            return null;
        }
        // Fetch stake account from blockchain
        const stake = await (0, accounts_1.fetchStake)(wallet.publicKey);
        if (!stake) {
            return null;
        }
        const stakedAmount = Number(stake.balance) / 1e9;
        const accruedRewards = Number(stake.rewardsOre) / 1e9;
        // Update database record
        await updateUserStakingInfo(telegramId, stakedAmount, accruedRewards);
        return {
            telegram_id: telegramId,
            staked_amount: stakedAmount,
            accrued_rewards: accruedRewards,
            last_updated: Date.now(),
        };
    }
    catch (error) {
        logger_1.default.error('[User Staking] Failed to get staking info:', error);
        // Fallback to database
        const row = await (0, database_1.getQuery)(`
      SELECT * FROM user_staking WHERE telegram_id = ?
    `, [telegramId]);
        return row || null;
    }
}
/**
 * Create or update user staking record
 */
async function updateUserStakingInfo(telegramId, stakedAmount, accruedRewards) {
    await (0, database_1.runQuery)(`
    INSERT INTO user_staking (telegram_id, staked_amount, accrued_rewards, last_updated)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(telegram_id) DO UPDATE SET
      staked_amount = excluded.staked_amount,
      accrued_rewards = excluded.accrued_rewards,
      last_updated = excluded.last_updated
  `, [telegramId, stakedAmount, accruedRewards, Date.now()]);
    logger_1.default.debug(`[User Staking] Updated staking info for ${telegramId}: ${stakedAmount} staked, ${accruedRewards} rewards`);
}
/**
 * Stake ORB for a user
 */
async function stakeUserOrb(telegramId, amount, dryRun = false) {
    try {
        const wallet = await (0, userWallet_1.getUserWallet)(telegramId);
        if (!wallet) {
            return { success: false, error: 'Wallet not found' };
        }
        const connection = getSolanaConnection();
        const stakingProgram = getStakingProgram(wallet);
        if (dryRun) {
            logger_1.default.info(`[User Staking] DRY RUN: Would stake ${amount} ORB for ${telegramId}`);
            return { success: true, signature: 'DRY_RUN' };
        }
        // Execute staking transaction
        // TODO: Implement actual staking logic based on your program
        logger_1.default.info(`[User Staking] Staking ${amount} ORB for ${telegramId}`);
        // For now, just update the database record
        const currentInfo = await getUserStakingInfo(telegramId);
        const newStakedAmount = (currentInfo?.staked_amount || 0) + amount;
        await updateUserStakingInfo(telegramId, newStakedAmount, currentInfo?.accrued_rewards || 0);
        // Record transaction
        await (0, database_1.recordTransaction)({
            type: 'stake',
            orbAmount: amount,
            status: 'success',
            notes: `Staked ${amount} ORB`,
            walletAddress: wallet.publicKey.toBase58(),
        });
        return { success: true, signature: 'MOCK_SIGNATURE' };
    }
    catch (error) {
        logger_1.default.error('[User Staking] Failed to stake ORB:', error);
        return { success: false, error: error.message };
    }
}
/**
 * Claim staking rewards for a user
 */
async function claimUserStakingRewards(telegramId, dryRun = false) {
    try {
        const wallet = await (0, userWallet_1.getUserWallet)(telegramId);
        if (!wallet) {
            return { success: false, error: 'Wallet not found' };
        }
        const stakingInfo = await getUserStakingInfo(telegramId);
        if (!stakingInfo || stakingInfo.accrued_rewards === 0) {
            return { success: false, error: 'No rewards to claim' };
        }
        const connection = getSolanaConnection();
        const stakingProgram = getStakingProgram(wallet);
        if (dryRun) {
            logger_1.default.info(`[User Staking] DRY RUN: Would claim ${stakingInfo.accrued_rewards} ORB rewards for ${telegramId}`);
            return { success: true, amount: stakingInfo.accrued_rewards, signature: 'DRY_RUN' };
        }
        // Execute claim transaction
        // TODO: Implement actual claiming logic based on your program
        logger_1.default.info(`[User Staking] Claiming ${stakingInfo.accrued_rewards} ORB rewards for ${telegramId}`);
        const claimedAmount = stakingInfo.accrued_rewards;
        // Update staking info (reset rewards)
        await updateUserStakingInfo(telegramId, stakingInfo.staked_amount, 0);
        // Record transaction
        await (0, database_1.recordTransaction)({
            type: 'claim_orb',
            orbAmount: claimedAmount,
            status: 'success',
            notes: `Claimed ${claimedAmount} ORB staking rewards`,
            walletAddress: wallet.publicKey.toBase58(),
        });
        return { success: true, amount: claimedAmount, signature: 'MOCK_SIGNATURE' };
    }
    catch (error) {
        logger_1.default.error('[User Staking] Failed to claim rewards:', error);
        return { success: false, error: error.message };
    }
}
/**
 * Get staking pool info from blockchain
 */
async function getStakingPoolInfo() {
    try {
        // TODO: Implement actual blockchain query
        // This is a placeholder
        return {
            totalStaked: 0,
            rewardRate: 0,
            poolAddress: 'N/A',
        };
    }
    catch (error) {
        logger_1.default.error('[User Staking] Failed to get pool info:', error);
        return {
            totalStaked: 0,
            rewardRate: 0,
            poolAddress: 'N/A',
        };
    }
}
/**
 * Format staking info for display
 */
function formatStakingDisplay(stakingInfo, poolInfo) {
    if (!stakingInfo || stakingInfo.staked_amount === 0) {
        return `
🏦 *Staking Status*

You have no ORB staked.

Use /stake to start earning rewards!
`.trim();
    }
    const lastUpdated = new Date(stakingInfo.last_updated).toLocaleString();
    return `
🏦 *Staking Status*

*Your Stake:*
• Staked Amount: ${(0, formatters_1.formatORB)(stakingInfo.staked_amount)}
• Accrued Rewards: ${(0, formatters_1.formatORB)(stakingInfo.accrued_rewards)}
• Last Updated: ${lastUpdated}

${poolInfo ? `*Pool Info:*
• Total Staked: ${(0, formatters_1.formatORB)(poolInfo.totalStaked)}
• Reward Rate: ${poolInfo.rewardRate}% APY` : ''}

${stakingInfo.accrued_rewards > 0 ? '✨ You have rewards to claim!' : ''}
`.trim();
}
//# sourceMappingURL=userStaking.js.map