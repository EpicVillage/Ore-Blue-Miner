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
exports.closeUserAutomation = closeUserAutomation;
exports.createUserAutomation = createUserAutomation;
exports.getUserAutomationStatus = getUserAutomationStatus;
const web3_js_1 = require("@solana/web3.js");
const solana_1 = require("../../src/utils/solana");
const accounts_1 = require("../../src/utils/accounts");
const program_1 = require("../../src/utils/program");
const web3_js_2 = require("@solana/web3.js");
const jupiter_1 = require("../../src/utils/jupiter");
const database_1 = require("../../src/utils/database");
const logger_1 = __importDefault(require("../../src/utils/logger"));
// BORE protocol program ID (Ore Blue mining)
const ORB_PROGRAM_ID = new web3_js_1.PublicKey('boreXQWsKpsJz5RR9BMtN8Vk4ndAk23sutj8spWYhwk');
/**
 * User-specific automation utilities for Telegram bot
 *
 * These functions work with a user's wallet instead of the global wallet
 */
/**
 * Check if automation account exists and get its info for a specific user wallet
 */
async function getAutomationInfo(userWallet) {
    const connection = (0, solana_1.getConnection)();
    const [automationPDA] = (0, accounts_1.getAutomationPDA)(userWallet.publicKey);
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
/**
 * Calculate target rounds - use full budget allocation
 */
function calculateTargetRounds(maxBudget, solPerRound) {
    const maxRounds = Math.floor(maxBudget / solPerRound);
    return Math.min(maxRounds, 1000);
}
/**
 * Build instruction to close automation account for a user
 */
async function buildCloseAutomationInstruction(userWallet) {
    const [minerPDA] = (0, accounts_1.getMinerPDA)(userWallet.publicKey);
    const [automationPDA] = (0, accounts_1.getAutomationPDA)(userWallet.publicKey);
    const AUTOMATE_DISCRIMINATOR = 0x00;
    const data = Buffer.alloc(34);
    data.writeUInt8(AUTOMATE_DISCRIMINATOR, 0);
    const keys = [
        { pubkey: userWallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: automationPDA, isSigner: false, isWritable: true },
        { pubkey: web3_js_1.PublicKey.default, isSigner: false, isWritable: true },
        { pubkey: minerPDA, isSigner: false, isWritable: true },
        { pubkey: web3_js_2.SystemProgram.programId, isSigner: false, isWritable: false },
    ];
    return new web3_js_2.TransactionInstruction({
        keys,
        programId: ORB_PROGRAM_ID,
        data,
    });
}
/**
 * Close automation account for a specific user
 */
async function closeUserAutomation(userWallet, telegramId) {
    try {
        logger_1.default.info(`[User Automation] Closing automation for telegram user ${telegramId}...`);
        const automationInfo = await getAutomationInfo(userWallet);
        if (!automationInfo || automationInfo.balance === 0) {
            return {
                success: false,
                error: 'No automation account found',
            };
        }
        const returnedSol = automationInfo.balance / 1e9;
        logger_1.default.info(`[User Automation] Will return ${returnedSol.toFixed(4)} SOL to user`);
        const closeInstruction = await buildCloseAutomationInstruction(userWallet);
        // Build transaction with user's wallet as signer
        const { Transaction, sendAndConfirmTransaction: sendTx } = await Promise.resolve().then(() => __importStar(require('@solana/web3.js')));
        const connection = (0, solana_1.getConnection)();
        const tx = new Transaction().add(closeInstruction);
        tx.feePayer = userWallet.publicKey;
        tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        const signature = await connection.sendTransaction(tx, [userWallet]);
        await connection.confirmTransaction(signature);
        logger_1.default.info(`[User Automation] Closed: ${signature}`);
        // Record transaction
        try {
            const { priceInUsd: orbPriceUsd } = await (0, jupiter_1.getOrbPrice)();
            await (0, database_1.recordTransaction)({
                type: 'automation_close',
                signature,
                solAmount: returnedSol,
                status: 'success',
                notes: `User ${telegramId} closed automation - returned ${returnedSol.toFixed(4)} SOL`,
                orbPriceUsd,
                txFeeSol: 0.0005,
                walletAddress: userWallet.publicKey.toBase58(),
            });
        }
        catch (error) {
            logger_1.default.error('[User Automation] Failed to record transaction:', error);
        }
        return {
            success: true,
            signature,
            returnedSol,
        };
    }
    catch (error) {
        logger_1.default.error('[User Automation] Failed to close:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
/**
 * Create automation account for a specific user
 */
async function createUserAutomation(userWallet, telegramId) {
    try {
        logger_1.default.info(`[User Automation] Creating automation for telegram user ${telegramId}...`);
        // Load user-specific settings
        const { getUserSettings } = await Promise.resolve().then(() => __importStar(require('./userSettings')));
        const userSettings = await getUserSettings(telegramId);
        // Check if automation already exists
        const existingAutomation = await getAutomationInfo(userWallet);
        if (existingAutomation && existingAutomation.balance > 0) {
            return {
                success: false,
                error: 'Automation already exists - close it first',
            };
        }
        // Get wallet balance
        const connection = (0, solana_1.getConnection)();
        const balance = await connection.getBalance(userWallet.publicKey);
        const solBalance = balance / 1e9;
        logger_1.default.info(`[User Automation] User wallet balance: ${solBalance.toFixed(4)} SOL`);
        // Use user-specific settings
        const solPerBlock = userSettings.sol_per_block;
        const blocksPerRound = userSettings.num_blocks;
        const solPerRound = solPerBlock * blocksPerRound;
        logger_1.default.info(`[User Automation] User settings: ${solPerBlock} SOL/block × ${blocksPerRound} blocks = ${solPerRound.toFixed(4)} SOL/round`);
        // Calculate budget using user's automation budget percentage
        const maxBudget = solBalance * (userSettings.automation_budget_percent / 100);
        const targetRounds = calculateTargetRounds(maxBudget, solPerRound);
        const usableBudget = targetRounds * solPerRound;
        logger_1.default.info(`[User Automation] Allocating ${usableBudget.toFixed(4)} SOL for ${targetRounds} rounds`);
        if (usableBudget < solPerRound) {
            return {
                success: false,
                error: `Insufficient balance - need at least ${solPerRound.toFixed(4)} SOL`,
            };
        }
        // Get motherload for logging (optional - skip if fails)
        let motherloadOrb = 0;
        try {
            const treasury = await (0, accounts_1.fetchTreasury)();
            motherloadOrb = Number(treasury.motherlode) / 1e9;
        }
        catch (error) {
            logger_1.default.debug('[User Automation] Could not fetch treasury for logging, continuing anyway');
        }
        // Create automation instruction
        const deposit = usableBudget;
        const feePerExecution = 0.00001;
        const strategy = program_1.AutomationStrategy.Random;
        const squareMask = BigInt(blocksPerRound);
        const instruction = (0, program_1.buildAutomateInstruction)(solPerBlock, deposit, feePerExecution, strategy, squareMask, userWallet.publicKey, // walletPublicKey parameter
        userWallet.publicKey // executor parameter (self-execute)
        );
        // Build and send transaction
        const { Transaction } = await Promise.resolve().then(() => __importStar(require('@solana/web3.js')));
        const tx = new Transaction().add(instruction);
        tx.feePayer = userWallet.publicKey;
        tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        const signature = await connection.sendTransaction(tx, [userWallet]);
        await connection.confirmTransaction(signature);
        logger_1.default.info(`[User Automation] Created: ${signature}`);
        // Record transaction
        try {
            const { priceInUsd: orbPriceUsd } = await (0, jupiter_1.getOrbPrice)();
            await (0, database_1.recordTransaction)({
                type: 'automation_setup',
                signature,
                solAmount: deposit,
                status: 'success',
                notes: `User ${telegramId} setup: ${targetRounds} rounds @ ${solPerRound.toFixed(4)} SOL/round (motherload: ${motherloadOrb.toFixed(2)} ORB)`,
                orbPriceUsd,
                txFeeSol: 0.005,
                walletAddress: userWallet.publicKey.toBase58(),
            });
        }
        catch (error) {
            logger_1.default.error('[User Automation] Failed to record transaction:', error);
        }
        return {
            success: true,
            signature,
            depositedSol: deposit,
            targetRounds,
        };
    }
    catch (error) {
        logger_1.default.error('[User Automation] Failed to create:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
/**
 * Get automation status for a user
 */
async function getUserAutomationStatus(userWallet) {
    try {
        const automationInfo = await getAutomationInfo(userWallet);
        if (!automationInfo || automationInfo.balance === 0) {
            return { active: false };
        }
        const balance = automationInfo.balance / 1e9;
        const costPerRound = automationInfo.costPerRound / 1e9;
        const estimatedRounds = costPerRound > 0 ? Math.floor(balance / costPerRound) : 0;
        return {
            active: true,
            balance,
            costPerRound,
            estimatedRounds,
        };
    }
    catch (error) {
        logger_1.default.error('[User Automation] Failed to get status:', error);
        return { active: false };
    }
}
//# sourceMappingURL=userAutomation.js.map