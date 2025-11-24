"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeAutoExecutor = initializeAutoExecutor;
exports.stopAutoExecutor = stopAutoExecutor;
exports.getAutoExecutorStatus = getAutoExecutorStatus;
exports.manualTriggerAutoExecutor = manualTriggerAutoExecutor;
const web3_js_1 = require("@solana/web3.js");
const bn_js_1 = __importDefault(require("bn.js"));
const solana_1 = require("../../src/utils/solana");
const accounts_1 = require("../../src/utils/accounts");
const program_1 = require("../../src/utils/program");
const database_1 = require("../../src/utils/database");
const logger_1 = __importDefault(require("../../src/utils/logger"));
const jupiter_1 = require("../../src/utils/jupiter");
const userSettings_1 = require("./userSettings");
const userWallet_1 = require("./userWallet");
const userRounds_1 = require("./userRounds");
let isRunning = false;
let executorInterval = null;
let lastRoundId = null;
/**
 * Get automation account info for a user
 */
async function getAutomationInfo(userPublicKey) {
    try {
        const connection = (0, solana_1.getConnection)();
        const [automationPDA] = (0, accounts_1.getAutomationPDA)(userPublicKey);
        const accountInfo = await connection.getAccountInfo(automationPDA);
        if (!accountInfo || accountInfo.data.length < 112) {
            return null;
        }
        const data = accountInfo.data;
        const amountPerSquare = data.readBigUInt64LE(8);
        const balance = data.readBigUInt64LE(48);
        const mask = data.readBigUInt64LE(104);
        return {
            pda: automationPDA,
            amountPerSquare: Number(amountPerSquare),
            balance: Number(balance),
            mask: Number(mask),
            costPerRound: Number(amountPerSquare) * Number(mask),
        };
    }
    catch (error) {
        logger_1.default.error('[Auto-Executor] Failed to get automation info:', error);
        return null;
    }
}
/**
 * Get all telegram users with active automation accounts
 */
async function getUsersWithActiveAutomation() {
    try {
        const users = await (0, database_1.allQuery)('SELECT telegram_id, public_key FROM telegram_users WHERE public_key IS NOT NULL');
        // Filter to only users with active automation accounts
        const usersWithAutomation = [];
        for (const user of users) {
            try {
                const userPublicKey = new web3_js_1.PublicKey(user.public_key);
                const automationInfo = await getAutomationInfo(userPublicKey);
                if (automationInfo && automationInfo.balance > 0) {
                    usersWithAutomation.push(user);
                }
            }
            catch (error) {
                logger_1.default.debug(`[Auto-Executor] Skipping user ${user.telegram_id}: ${error}`);
            }
        }
        return usersWithAutomation;
    }
    catch (error) {
        logger_1.default.error('[Auto-Executor] Failed to get users with automation:', error);
        return [];
    }
}
/**
 * Execute automation for a single user
 */
async function executeUserAutomation(telegramId, userWallet, board, treasury) {
    try {
        const userPublicKey = userWallet.publicKey;
        const settings = await (0, userSettings_1.getUserSettings)(telegramId);
        // Check motherload threshold
        const currentMotherload = Number(treasury.motherlode) / 1e9;
        if (currentMotherload < settings.motherload_threshold) {
            logger_1.default.debug(`[Auto-Executor] User ${telegramId}: Motherload ${currentMotherload.toFixed(2)} below threshold ${settings.motherload_threshold}`);
            return false;
        }
        // Get automation info
        const automationInfo = await getAutomationInfo(userPublicKey);
        if (!automationInfo) {
            logger_1.default.debug(`[Auto-Executor] User ${telegramId}: No automation account found`);
            return false;
        }
        // Check if automation is completely depleted
        if (automationInfo.balance === 0) {
            logger_1.default.info(`[Auto-Executor] User ${telegramId}: Automation depleted (0 SOL remaining)`);
            // Auto-restart: close old automation and create new one
            logger_1.default.info(`[Auto-Executor] User ${telegramId}: 🔄 Auto-restarting automation with new budget...`);
            try {
                const { closeUserAutomation, createUserAutomation } = await Promise.resolve().then(() => __importStar(require('./userAutomation')));
                // Close old automation account
                const closeResult = await closeUserAutomation(userWallet, telegramId);
                if (closeResult.success) {
                    logger_1.default.info(`[Auto-Executor] User ${telegramId}: Closed depleted automation`);
                }
                // Wait a bit for the close to finalize
                await new Promise(resolve => setTimeout(resolve, 2000));
                // Create new automation account with automation_budget_percent
                const createResult = await createUserAutomation(userWallet, telegramId);
                if (createResult.success) {
                    logger_1.default.info(`[Auto-Executor] User ${telegramId}: ✅ Created new automation: ${createResult.targetRounds} rounds @ ${createResult.depositedSol?.toFixed(4)} SOL | ${createResult.signature}`);
                    // Don't execute this round - let it execute next round to avoid double-deploy
                    return false;
                }
                else {
                    logger_1.default.warn(`[Auto-Executor] User ${telegramId}: Failed to create new automation: ${createResult.error}`);
                    return false;
                }
            }
            catch (error) {
                logger_1.default.error(`[Auto-Executor] User ${telegramId}: Auto-restart failed:`, error);
                return false;
            }
        }
        // Check if we have enough balance for this round
        if (automationInfo.balance < automationInfo.costPerRound) {
            logger_1.default.info(`[Auto-Executor] User ${telegramId}: Budget depleted (${(automationInfo.balance / 1e9).toFixed(4)} SOL < ${(automationInfo.costPerRound / 1e9).toFixed(4)} SOL)`);
            // Auto-restart: close old automation and create new one
            logger_1.default.info(`[Auto-Executor] User ${telegramId}: 🔄 Auto-restarting automation with new budget...`);
            try {
                const { closeUserAutomation, createUserAutomation } = await Promise.resolve().then(() => __importStar(require('./userAutomation')));
                // Close old automation account (returns remaining SOL)
                const closeResult = await closeUserAutomation(userWallet, telegramId);
                if (closeResult.success) {
                    logger_1.default.info(`[Auto-Executor] User ${telegramId}: Closed depleted automation, returned ${closeResult.returnedSol?.toFixed(4)} SOL`);
                }
                // Wait a bit for the close to finalize
                await new Promise(resolve => setTimeout(resolve, 2000));
                // Create new automation account with automation_budget_percent
                const createResult = await createUserAutomation(userWallet, telegramId);
                if (createResult.success) {
                    logger_1.default.info(`[Auto-Executor] User ${telegramId}: ✅ Created new automation: ${createResult.targetRounds} rounds @ ${createResult.depositedSol?.toFixed(4)} SOL | ${createResult.signature}`);
                    // Don't execute this round - let it execute next round to avoid double-deploy
                    return false;
                }
                else {
                    logger_1.default.warn(`[Auto-Executor] User ${telegramId}: Failed to create new automation: ${createResult.error}`);
                    return false;
                }
            }
            catch (error) {
                logger_1.default.error(`[Auto-Executor] User ${telegramId}: Auto-restart failed:`, error);
                return false;
            }
        }
        // Check if round is still active
        const connection = (0, solana_1.getConnection)();
        const currentSlot = await connection.getSlot();
        if (new bn_js_1.default(currentSlot).gte(board.endSlot)) {
            logger_1.default.debug(`[Auto-Executor] User ${telegramId}: Round has ended`);
            return false;
        }
        // Get miner and check if checkpoint is needed
        const miner = await (0, accounts_1.fetchMiner)(userPublicKey);
        if (miner && miner.checkpointId.lt(board.roundId)) {
            const roundsBehind = board.roundId.sub(miner.checkpointId).toNumber();
            logger_1.default.info(`[Auto-Executor] User ${telegramId}: Checkpointing ${roundsBehind} round(s)...`);
            try {
                const checkpointIx = await (0, program_1.buildCheckpointInstruction)(undefined, userPublicKey);
                const tx = new web3_js_1.Transaction().add(checkpointIx);
                tx.feePayer = userPublicKey;
                tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
                const signature = await connection.sendTransaction(tx, [userWallet]);
                await connection.confirmTransaction(signature);
                logger_1.default.info(`[Auto-Executor] User ${telegramId}: Checkpointed | ${signature}`);
                // Small delay after checkpoint
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            catch (error) {
                const errorMsg = error?.message || error?.toString() || String(error);
                logger_1.default.error(`[Auto-Executor] User ${telegramId}: Checkpoint failed: ${errorMsg}`);
                if (error?.logs) {
                    logger_1.default.error(`[Auto-Executor] Transaction logs:`, error.logs);
                }
                // Continue anyway - checkpoint might not always be needed
            }
        }
        // Build execute automation instruction
        logger_1.default.info(`[Auto-Executor] User ${telegramId}: Executing automation for round ${board.roundId.toString()}...`);
        const executeInstructions = await (0, program_1.buildExecuteAutomationInstruction)(userPublicKey);
        const tx = new web3_js_1.Transaction();
        for (const ix of executeInstructions) {
            tx.add(ix);
        }
        tx.feePayer = userPublicKey;
        tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        const signature = await connection.sendTransaction(tx, [userWallet]);
        await connection.confirmTransaction(signature);
        const solPerRound = automationInfo.costPerRound / 1e9;
        const remainingBalance = (automationInfo.balance - automationInfo.costPerRound) / 1e9;
        const remainingRounds = Math.floor(remainingBalance / solPerRound);
        logger_1.default.info(`[Auto-Executor] User ${telegramId}: ✅ Deployed ${solPerRound.toFixed(4)} SOL | ${remainingRounds} rounds left | ${signature}`);
        // Record transaction
        try {
            const { priceInUsd: orbPriceUsd } = await (0, jupiter_1.getOrbPrice)();
            const devFee = solPerRound * 0.01; // 1% dev fee
            await (0, database_1.recordTransaction)({
                type: 'auto_deploy',
                signature,
                roundId: board.roundId.toNumber(),
                solAmount: solPerRound,
                status: 'success',
                notes: `User ${telegramId} auto-deployed via automation`,
                orbPriceUsd,
                txFeeSol: 0.000005,
                devFeeSol: devFee,
                walletAddress: userPublicKey.toBase58(),
            });
        }
        catch (error) {
            logger_1.default.debug(`[Auto-Executor] Failed to record transaction for user ${telegramId}:`, error);
        }
        // Record user round participation
        try {
            await (0, userRounds_1.recordUserRound)(telegramId, board.roundId.toNumber(), currentMotherload, solPerRound, settings.num_blocks);
        }
        catch (error) {
            logger_1.default.debug(`[Auto-Executor] Failed to record round for user ${telegramId}:`, error);
        }
        return true;
    }
    catch (error) {
        const errorMsg = String(error.message || error);
        // Handle common errors
        if (errorMsg.includes('not checkpointed') || errorMsg.includes('checkpoint')) {
            logger_1.default.warn(`[Auto-Executor] User ${telegramId}: Checkpoint required - will retry next cycle`);
        }
        else if (errorMsg.includes('AlreadyDeployed') || errorMsg.includes('already deployed')) {
            logger_1.default.debug(`[Auto-Executor] User ${telegramId}: Already deployed this round`);
        }
        else if (errorMsg.includes('insufficient')) {
            logger_1.default.warn(`[Auto-Executor] User ${telegramId}: Insufficient balance`);
        }
        else {
            logger_1.default.error(`[Auto-Executor] User ${telegramId}: Execution failed:`, errorMsg);
        }
        return false;
    }
}
/**
 * Main executor loop - monitors rounds and executes automation for all users
 */
async function executorLoop() {
    try {
        // Fetch current board state
        const board = await (0, accounts_1.fetchBoard)();
        const currentRoundId = board.roundId.toString();
        // Check if this is a new round
        if (currentRoundId !== lastRoundId) {
            logger_1.default.info(`[Auto-Executor] 🔄 New round detected: ${currentRoundId}`);
            lastRoundId = currentRoundId;
            // Fetch treasury for motherload check
            const treasury = await (0, accounts_1.fetchTreasury)();
            const currentMotherload = Number(treasury.motherlode) / 1e9;
            logger_1.default.info(`[Auto-Executor] Motherload: ${currentMotherload.toFixed(2)} ORB`);
            // Get all users with active automation
            const users = await getUsersWithActiveAutomation();
            if (users.length === 0) {
                logger_1.default.debug('[Auto-Executor] No users with active automation accounts');
                return;
            }
            logger_1.default.info(`[Auto-Executor] Found ${users.length} user(s) with active automation`);
            // Execute automation for each user
            for (const user of users) {
                try {
                    const userWallet = await (0, userWallet_1.getUserWallet)(user.telegram_id);
                    if (!userWallet) {
                        logger_1.default.warn(`[Auto-Executor] User ${user.telegram_id}: Wallet not found`);
                        continue;
                    }
                    await executeUserAutomation(user.telegram_id, userWallet, board, treasury);
                    // Small delay between users to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                catch (error) {
                    logger_1.default.error(`[Auto-Executor] Failed to execute automation for user ${user.telegram_id}:`, error);
                }
            }
        }
    }
    catch (error) {
        logger_1.default.error('[Auto-Executor] Executor loop error:', error);
    }
}
/**
 * Initialize the automation executor service
 */
function initializeAutoExecutor() {
    if (isRunning) {
        logger_1.default.warn('[Auto-Executor] Service already running');
        return;
    }
    logger_1.default.info('[Auto-Executor] Starting automation executor service...');
    isRunning = true;
    // Run executor loop every 15 seconds
    const checkInterval = 15000;
    executorInterval = setInterval(async () => {
        if (isRunning) {
            await executorLoop();
        }
    }, checkInterval);
    // Run immediately on startup
    executorLoop().catch(error => {
        logger_1.default.error('[Auto-Executor] Initial loop failed:', error);
    });
    logger_1.default.info(`[Auto-Executor] ✅ Service started (checking every ${checkInterval / 1000}s)`);
}
/**
 * Stop the automation executor service
 */
function stopAutoExecutor() {
    if (!isRunning) {
        logger_1.default.warn('[Auto-Executor] Service not running');
        return;
    }
    logger_1.default.info('[Auto-Executor] Stopping automation executor service...');
    isRunning = false;
    if (executorInterval) {
        clearInterval(executorInterval);
        executorInterval = null;
    }
    logger_1.default.info('[Auto-Executor] ✅ Service stopped');
}
/**
 * Get executor service status
 */
function getAutoExecutorStatus() {
    return {
        running: isRunning,
        lastRound: lastRoundId,
    };
}
/**
 * Manually trigger executor loop (for testing)
 */
async function manualTriggerAutoExecutor() {
    logger_1.default.info('[Auto-Executor] Manual trigger requested');
    await executorLoop();
}
//# sourceMappingURL=autoExecutor.js.map