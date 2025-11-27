import { Keypair } from '@solana/web3.js';
import { recordTransaction } from '../../src/utils/database';
import logger from '../../src/utils/logger';
import { getOrbPrice, swapOrbToSol, getSwapQuote } from '../../src/utils/jupiter';
import {
  buildClaimSolInstruction,
  buildClaimOreInstruction,
  buildDeployInstruction,
  sendAndConfirmTransaction
} from '../../src/utils/program';
import { fetchMiner, fetchStake, fetchBoard, fetchRound } from '../../src/utils/accounts';
import {
  Platform,
  getUserWallet,
  getUserBalances,
  getUserSettings
} from '../database';

// Re-export automation operations
export * from './automation';

/**
 * Shared Blockchain Operations
 *
 * Platform-agnostic operations for claim, swap, deploy, staking
 */

export interface ClaimResult {
  success: boolean;
  solAmount?: number;
  orbAmount?: number;
  signature?: string;
  error?: string;
}

export interface SwapResult {
  success: boolean;
  orbSwapped?: number;
  solReceived?: number;
  signature?: string;
  error?: string;
}

export interface DeployResult {
  success: boolean;
  solDeployed?: number;
  roundId?: number;
  signature?: string;
  error?: string;
}

/**
 * Claim SOL rewards from mining
 */
export async function claimSol(
  platform: Platform,
  platformId: string
): Promise<ClaimResult> {
  try {
    const wallet = await getUserWallet(platform, platformId);
    if (!wallet) {
      return { success: false, error: 'Wallet not found' };
    }

    logger.info(`[Operations] Claiming SOL rewards for ${platform}:${platformId}`);

    const miner = await fetchMiner(wallet.publicKey);
    if (!miner) {
      return { success: false, error: 'No miner account found' };
    }

    const miningSol = Number(miner.rewardsSol) / 1e9;
    if (miningSol === 0) {
      return { success: false, error: 'No SOL rewards to claim' };
    }

    logger.info(`[Operations] Mining Rewards: ${miningSol.toFixed(4)} SOL`);

    const instruction = buildClaimSolInstruction(wallet.publicKey);
    const { signature } = await sendAndConfirmTransaction([instruction], 'Claim SOL', { wallet });

    await recordTransaction({
      type: 'claim_sol',
      signature,
      solAmount: miningSol,
      status: 'success',
      notes: `Claimed ${miningSol.toFixed(4)} SOL for ${platform}:${platformId}`,
      walletAddress: wallet.publicKey.toBase58(),
      telegramId: platform === 'telegram' ? platformId : undefined,
    });

    logger.info(`[Operations] Successfully claimed ${miningSol.toFixed(4)} SOL | ${signature}`);

    return { success: true, solAmount: miningSol, signature };
  } catch (error: any) {
    logger.error('[Operations] Failed to claim SOL:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Claim ORB rewards from mining
 */
export async function claimOrb(
  platform: Platform,
  platformId: string
): Promise<ClaimResult> {
  try {
    const wallet = await getUserWallet(platform, platformId);
    if (!wallet) {
      return { success: false, error: 'Wallet not found' };
    }

    logger.info(`[Operations] Claiming ORB rewards for ${platform}:${platformId}`);

    const miner = await fetchMiner(wallet.publicKey);
    if (!miner) {
      return { success: false, error: 'No miner account found' };
    }

    const miningOrb = Number(miner.rewardsOre) / 1e9;
    if (miningOrb === 0) {
      return { success: false, error: 'No ORB rewards to claim' };
    }

    logger.info(`[Operations] Mining Rewards: ${miningOrb.toFixed(2)} ORB`);

    const instruction = await buildClaimOreInstruction(wallet.publicKey);
    const { signature } = await sendAndConfirmTransaction([instruction], 'Claim ORB', { wallet });

    await recordTransaction({
      type: 'claim_orb',
      signature,
      orbAmount: miningOrb,
      status: 'success',
      notes: `Claimed ${miningOrb.toFixed(2)} ORB for ${platform}:${platformId}`,
      walletAddress: wallet.publicKey.toBase58(),
      telegramId: platform === 'telegram' ? platformId : undefined,
    });

    logger.info(`[Operations] Successfully claimed ${miningOrb.toFixed(2)} ORB | ${signature}`);

    return { success: true, orbAmount: miningOrb, signature };
  } catch (error: any) {
    logger.error('[Operations] Failed to claim ORB:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Swap ORB to SOL
 */
export async function swapOrbToSolForUser(
  platform: Platform,
  platformId: string,
  amount: number
): Promise<SwapResult> {
  try {
    const wallet = await getUserWallet(platform, platformId);
    if (!wallet) {
      return { success: false, error: 'Wallet not found' };
    }

    const settings = await getUserSettings(platform, platformId);

    logger.info(`[Operations] Swapping ${amount.toFixed(2)} ORB to SOL for ${platform}:${platformId}`);

    if (amount <= 0) {
      return { success: false, error: 'Swap amount must be greater than 0' };
    }

    if (amount < settings.min_swap_amount) {
      return { success: false, error: `Minimum swap amount is ${settings.min_swap_amount} ORB` };
    }

    // Check ORB balance
    const balances = await getUserBalances(platform, platformId);
    if (!balances || balances.orb < amount) {
      return { success: false, error: `Insufficient ORB balance. Need ${amount} ORB, have ${balances?.orb.toFixed(2) || 0} ORB` };
    }

    // Check price protection
    if (settings.min_orb_price > 0) {
      const orbPrice = await getOrbPrice();
      if (orbPrice.priceInUsd < settings.min_orb_price) {
        return {
          success: false,
          error: `ORB price ($${orbPrice.priceInUsd.toFixed(2)}) below minimum ($${settings.min_orb_price})`
        };
      }
    }

    // Get quote
    const quote = await getSwapQuote(amount, settings.slippage_bps);
    if (!quote) {
      return { success: false, error: 'Failed to get swap quote' };
    }

    const expectedSol = Number(quote.outAmount) / 1e9;
    logger.info(`[Operations] Expected output: ${expectedSol.toFixed(4)} SOL`);

    // Execute swap
    const result = await swapOrbToSol(amount, settings.slippage_bps, wallet);

    if (result.success) {
      await recordTransaction({
        type: 'swap',
        signature: result.signature,
        orbAmount: amount,
        solAmount: result.solReceived || 0,
        status: 'success',
        notes: `Swapped ${amount.toFixed(2)} ORB → ${result.solReceived?.toFixed(4)} SOL for ${platform}:${platformId}`,
        walletAddress: wallet.publicKey.toBase58(),
        telegramId: platform === 'telegram' ? platformId : undefined,
      });

      logger.info(`[Operations] Successfully swapped ${amount.toFixed(2)} ORB → ${result.solReceived?.toFixed(4)} SOL | ${result.signature}`);

      return { success: true, orbSwapped: amount, solReceived: result.solReceived, signature: result.signature };
    } else {
      return { success: false, error: 'Swap failed' };
    }
  } catch (error: any) {
    logger.error('[Operations] Failed to swap:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Deploy SOL to current round
 */
export async function deploySol(
  platform: Platform,
  platformId: string,
  amount: number
): Promise<DeployResult> {
  try {
    const wallet = await getUserWallet(platform, platformId);
    if (!wallet) {
      return { success: false, error: 'Wallet not found' };
    }

    logger.info(`[Operations] Deploying ${amount.toFixed(4)} SOL for ${platform}:${platformId}`);

    if (amount <= 0) {
      return { success: false, error: 'Deployment amount must be greater than 0' };
    }

    // Check SOL balance
    const balances = await getUserBalances(platform, platformId);
    if (!balances || balances.sol < amount) {
      return {
        success: false,
        error: `Insufficient SOL balance. Need ${amount} SOL, have ${balances?.sol.toFixed(4) || 0} SOL`
      };
    }

    // Get current board info
    const board = await fetchBoard();
    const roundId = Number(board.roundId);

    // Fetch round to get motherload
    const round = await fetchRound(board.roundId);
    const motherloadOrb = Number(round.motherload) / 1e9;

    logger.info(`[Operations] Current round: ${roundId}, Motherload: ${motherloadOrb} ORB`);

    // Build and send deploy instructions
    const instructions = await buildDeployInstruction(amount, wallet.publicKey);
    const { signature } = await sendAndConfirmTransaction(instructions, 'Deploy', { wallet });

    // Calculate 1% dev fee
    const devFee = amount * 0.01;

    await recordTransaction({
      type: 'deploy',
      signature,
      roundId,
      solAmount: amount,
      status: 'success',
      notes: `Deployed ${amount.toFixed(4)} SOL to round ${roundId} for ${platform}:${platformId} (dev fee: ${devFee.toFixed(6)} SOL)`,
      txFeeSol: 0.000005,
      devFeeSol: devFee,
      walletAddress: wallet.publicKey.toBase58(),
      telegramId: platform === 'telegram' ? platformId : undefined,
    });

    logger.info(`[Operations] Successfully deployed ${amount.toFixed(4)} SOL to round ${roundId} | ${signature}`);

    return { success: true, solDeployed: amount, roundId, signature };
  } catch (error: any) {
    logger.error('[Operations] Failed to deploy:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get claimable rewards for a user
 */
export async function getClaimableRewards(
  platform: Platform,
  platformId: string
): Promise<{
  miningSol: number;
  miningOrb: number;
  stakingSol: number;
  stakingOrb: number;
  totalSol: number;
  totalOrb: number;
}> {
  try {
    const wallet = await getUserWallet(platform, platformId);
    if (!wallet) {
      return { miningSol: 0, miningOrb: 0, stakingSol: 0, stakingOrb: 0, totalSol: 0, totalOrb: 0 };
    }

    let miningSol = 0, miningOrb = 0, stakingSol = 0, stakingOrb = 0;

    // Fetch miner account
    const miner = await fetchMiner(wallet.publicKey);
    if (miner) {
      miningSol = Number(miner.rewardsSol) / 1e9;
      miningOrb = Number(miner.rewardsOre) / 1e9;
    }

    // Fetch stake account
    const stake = await fetchStake(wallet.publicKey);
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
  } catch (error) {
    logger.error('[Operations] Failed to get claimable rewards:', error);
    return { miningSol: 0, miningOrb: 0, stakingSol: 0, stakingOrb: 0, totalSol: 0, totalOrb: 0 };
  }
}
