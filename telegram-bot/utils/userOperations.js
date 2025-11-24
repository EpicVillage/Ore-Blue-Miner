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
exports.claimUserSol = claimUserSol;
exports.claimUserOrb = claimUserOrb;
exports.claimUserStakingRewards = claimUserStakingRewards;
exports.swapUserOrbToSol = swapUserOrbToSol;
exports.deployUserSol = deployUserSol;
exports.getUserClaimableRewards = getUserClaimableRewards;
const userWallet_1 = require("./userWallet");
const userSettings_1 = require("./userSettings");
const database_1 = require("../../src/utils/database");
const logger_1 = __importDefault(require("../../src/utils/logger"));
const jupiter_1 = require("../../src/utils/jupiter");
const program_1 = require("../../src/utils/program");
const accounts_1 = require("../../src/utils/accounts");
/**
 * Claim SOL rewards from mining for a user
 */
async function claimUserSol(telegramId) {
    try {
        const wallet = await (0, userWallet_1.getUserWallet)(telegramId);
        if (!wallet) {
            return { success: false, error: 'Wallet not found' };
        }
        const settings = await (0, userSettings_1.getUserSettings)(telegramId);
        logger_1.default.info(`[User Claim] Claiming SOL rewards for ${telegramId}`);
        // Fetch miner account for mining rewards
        const miner = await (0, accounts_1.fetchMiner)(wallet.publicKey);
        if (!miner) {
            return { success: false, error: 'No miner account found' };
        }
        const miningSol = Number(miner.rewardsSol) / 1e9;
        if (miningSol === 0) {
            return { success: false, error: 'No SOL rewards to claim' };
        }
        logger_1.default.info(`[User Claim] Mining Rewards: ${miningSol.toFixed(4)} SOL`);
        // Build and send claim instruction
        const instruction = (0, program_1.buildClaimSolInstruction)(wallet.publicKey);
        const signature = await (0, program_1.sendAndConfirmTransaction)([instruction], 'Claim SOL', { walletKeypair: wallet });
        // Record transaction
        await (0, database_1.recordTransaction)({
            type: 'claim_sol',
            signature,
            solAmount: miningSol,
            status: 'success',
            notes: `Claimed ${miningSol.toFixed(4)} SOL`,
            walletAddress: wallet.publicKey.toBase58(),
        });
        logger_1.default.info(`[User Claim] Successfully claimed ${miningSol.toFixed(4)} SOL | ${signature}`);
        return { success: true, solAmount: miningSol, signature };
    }
    catch (error) {
        logger_1.default.error('[User Claim] Failed to claim SOL:', error);
        return { success: false, error: error.message };
    }
}
/**
 * Claim ORB rewards from mining for a user
 */
async function claimUserOrb(telegramId) {
    try {
        const wallet = await (0, userWallet_1.getUserWallet)(telegramId);
        if (!wallet) {
            return { success: false, error: 'Wallet not found' };
        }
        const settings = await (0, userSettings_1.getUserSettings)(telegramId);
        logger_1.default.info(`[User Claim] Claiming ORB rewards for ${telegramId}`);
        // Fetch miner account for mining rewards
        const miner = await (0, accounts_1.fetchMiner)(wallet.publicKey);
        if (!miner) {
            return { success: false, error: 'No miner account found' };
        }
        const miningOrb = Number(miner.rewardsOre) / 1e9;
        if (miningOrb === 0) {
            return { success: false, error: 'No ORB rewards to claim' };
        }
        logger_1.default.info(`[User Claim] Mining Rewards: ${miningOrb.toFixed(2)} ORB`);
        // Build and send claim instruction
        const instruction = await (0, program_1.buildClaimOreInstruction)(wallet.publicKey);
        const signature = await (0, program_1.sendAndConfirmTransaction)([instruction], 'Claim ORB', { walletKeypair: wallet });
        // Record transaction
        await (0, database_1.recordTransaction)({
            type: 'claim_orb',
            signature,
            orbAmount: miningOrb,
            status: 'success',
            notes: `Claimed ${miningOrb.toFixed(2)} ORB`,
            walletAddress: wallet.publicKey.toBase58(),
        });
        logger_1.default.info(`[User Claim] Successfully claimed ${miningOrb.toFixed(2)} ORB | ${signature}`);
        return { success: true, orbAmount: miningOrb, signature };
    }
    catch (error) {
        logger_1.default.error('[User Claim] Failed to claim ORB:', error);
        return { success: false, error: error.message };
    }
}
/**
 * Claim staking rewards for a user
 */
async function claimUserStakingRewards(telegramId) {
    try {
        const wallet = await (0, userWallet_1.getUserWallet)(telegramId);
        if (!wallet) {
            return { success: false, error: 'Wallet not found' };
        }
        const settings = await (0, userSettings_1.getUserSettings)(telegramId);
        logger_1.default.info(`[User Claim] Claiming staking rewards for ${telegramId}`);
        // Fetch stake account for staking rewards
        const stake = await (0, accounts_1.fetchStake)(wallet.publicKey);
        if (!stake) {
            return { success: false, error: 'No stake account found' };
        }
        const stakingSol = Number(stake.rewardsSol) / 1e9;
        const stakingOrb = Number(stake.rewardsOre) / 1e9;
        if (stakingSol === 0 && stakingOrb === 0) {
            return { success: false, error: 'No staking rewards to claim' };
        }
        logger_1.default.info(`[User Claim] Staking Rewards: ${stakingSol.toFixed(4)} SOL, ${stakingOrb.toFixed(2)} ORB`);
        // TODO: Implement actual staking claim instructions
        // For now, return a placeholder
        logger_1.default.warn('[User Claim] Staking claim instructions not implemented yet');
        return { success: false, error: 'Staking claim not implemented yet' };
    }
    catch (error) {
        logger_1.default.error('[User Claim] Failed to claim staking rewards:', error);
        return { success: false, error: error.message };
    }
}
/**
 * Swap ORB to SOL for a user
 */
async function swapUserOrbToSol(telegramId, amount) {
    try {
        const wallet = await (0, userWallet_1.getUserWallet)(telegramId);
        if (!wallet) {
            return { success: false, error: 'Wallet not found' };
        }
        const settings = await (0, userSettings_1.getUserSettings)(telegramId);
        logger_1.default.info(`[User Swap] Swapping ${amount.toFixed(2)} ORB to SOL for ${telegramId}`);
        // Validate amount
        if (amount <= 0) {
            return { success: false, error: 'Swap amount must be greater than 0' };
        }
        if (amount < settings.min_swap_amount) {
            return { success: false, error: `Minimum swap amount is ${settings.min_swap_amount} ORB` };
        }
        // Check ORB balance
        const { getUserBalances } = await Promise.resolve().then(() => __importStar(require('./userWallet')));
        const balances = await getUserBalances(telegramId);
        if (!balances || balances.orb < amount) {
            return { success: false, error: `Insufficient ORB balance. Need ${amount} ORB, have ${balances?.orb.toFixed(2) || 0} ORB` };
        }
        // Check price protection
        if (settings.min_orb_price > 0) {
            const orbPrice = await (0, jupiter_1.getOrbPrice)();
            if (orbPrice.priceInUsd < settings.min_orb_price) {
                return {
                    success: false,
                    error: `ORB price ($${orbPrice.priceInUsd.toFixed(2)}) below minimum ($${settings.min_orb_price})`
                };
            }
        }
        // Check remaining ORB after swap
        const remainingOrb = balances.orb - amount;
        if (remainingOrb < settings.min_orb_to_keep) {
            return {
                success: false,
                error: `Cannot swap: would leave ${remainingOrb.toFixed(2)} ORB (minimum is ${settings.min_orb_to_keep} ORB)`
            };
        }
        // Get quote
        const quote = await (0, jupiter_1.getSwapQuote)(amount, settings.slippage_bps);
        if (!quote) {
            return { success: false, error: 'Failed to get swap quote' };
        }
        const expectedSol = Number(quote.outAmount) / 1e9;
        logger_1.default.info(`[User Swap] Expected output: ${expectedSol.toFixed(4)} SOL`);
        // Execute swap
        const result = await (0, jupiter_1.swapOrbToSol)(amount, settings.slippage_bps, wallet);
        if (result.success) {
            // Record transaction
            await (0, database_1.recordTransaction)({
                type: 'swap',
                signature: result.signature,
                orbAmount: amount,
                solAmount: result.solReceived || 0,
                status: 'success',
                notes: `Swapped ${amount.toFixed(2)} ORB → ${result.solReceived?.toFixed(4)} SOL`,
                walletAddress: wallet.publicKey.toBase58(),
            });
            logger_1.default.info(`[User Swap] Successfully swapped ${amount.toFixed(2)} ORB → ${result.solReceived?.toFixed(4)} SOL | ${result.signature}`);
            return { success: true, orbSwapped: amount, solReceived: result.solReceived, signature: result.signature };
        }
        else {
            return { success: false, error: 'Swap failed' };
        }
    }
    catch (error) {
        logger_1.default.error('[User Swap] Failed to swap:', error);
        return { success: false, error: error.message };
    }
}
/**
 * Deploy SOL to current round for a user
 */
async function deployUserSol(telegramId, amount) {
    try {
        const wallet = await (0, userWallet_1.getUserWallet)(telegramId);
        if (!wallet) {
            return { success: false, error: 'Wallet not found' };
        }
        const settings = await (0, userSettings_1.getUserSettings)(telegramId);
        logger_1.default.info(`[User Deploy] Deploying ${amount.toFixed(4)} SOL for ${telegramId}`);
        // Validate amount
        if (amount <= 0) {
            return { success: false, error: 'Deployment amount must be greater than 0' };
        }
        // Check SOL balance
        const { getUserBalances } = await Promise.resolve().then(() => __importStar(require('./userWallet')));
        const balances = await getUserBalances(telegramId);
        if (!balances || balances.sol < amount) {
            return {
                success: false,
                error: `Insufficient SOL balance. Need ${amount} SOL, have ${balances?.sol.toFixed(4) || 0} SOL`
            };
        }
        // Get current board info
        const board = await (0, accounts_1.fetchBoard)();
        const roundId = Number(board.roundId);
        logger_1.default.info(`[User Deploy] Current round: ${roundId}, Motherload: ${Number(board.motherload) / 1e9} ORB`);
        // Build and send deploy instruction
        const instruction = await (0, program_1.buildDeployInstruction)(amount, wallet.publicKey);
        const signature = await (0, program_1.sendAndConfirmTransaction)([instruction], 'Deploy', { walletKeypair: wallet });
        // Calculate 1% dev fee
        const devFee = amount * 0.01;
        // Record transaction
        await (0, database_1.recordTransaction)({
            type: 'deploy',
            signature,
            roundId,
            solAmount: amount,
            status: 'success',
            notes: `Deployed ${amount.toFixed(4)} SOL to round ${roundId}`,
            walletAddress: wallet.publicKey.toBase58(),
            devFeeSol: devFee,
            txFeeSol: 0.000005,
        });
        // Record user round participation
        const { recordUserRound } = await Promise.resolve().then(() => __importStar(require('./userRounds')));
        await recordUserRound(telegramId, roundId, Number(board.motherload) / 1e9, amount, 25 // assuming 25 squares
        );
        logger_1.default.info(`[User Deploy] Successfully deployed ${amount.toFixed(4)} SOL to round ${roundId} | ${signature}`);
        return { success: true, solDeployed: amount, roundId, signature };
    }
    catch (error) {
        logger_1.default.error('[User Deploy] Failed to deploy:', error);
        return { success: false, error: error.message };
    }
}
/**
 * Get claimable rewards for a user
 */
async function getUserClaimableRewards(telegramId) {
    try {
        const wallet = await (0, userWallet_1.getUserWallet)(telegramId);
        if (!wallet) {
            return { miningSol: 0, miningOrb: 0, stakingSol: 0, stakingOrb: 0, totalSol: 0, totalOrb: 0 };
        }
        let miningSol = 0, miningOrb = 0, stakingSol = 0, stakingOrb = 0;
        // Fetch miner account
        const miner = await (0, accounts_1.fetchMiner)(wallet.publicKey);
        if (miner) {
            miningSol = Number(miner.rewardsSol) / 1e9;
            miningOrb = Number(miner.rewardsOre) / 1e9;
        }
        // Fetch stake account
        const stake = await (0, accounts_1.fetchStake)(wallet.publicKey);
        if (stake) {
            stakingSol = Number(stake.rewardsSol) / 1e9;
            stakingOrb = Number(stake.rewardsOre) / 1e9;
        }
        return {
            miningSol,
            miningOrb,
            stakingSol,
            stakingOrb,
            totalSol: miningSol + stakingSol,
            totalOrb: miningOrb + stakingOrb,
        };
    }
    catch (error) {
        logger_1.default.error('[User Operations] Failed to get claimable rewards:', error);
        return { miningSol: 0, miningOrb: 0, stakingSol: 0, stakingOrb: 0, totalSol: 0, totalOrb: 0 };
    }
}
//# sourceMappingURL=userOperations.js.map