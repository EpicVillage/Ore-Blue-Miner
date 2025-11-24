import { runQuery, getQuery, recordTransaction } from '../../src/utils/database';
import logger from '../../src/utils/logger';
import { getUserWallet } from './userWallet';
import { getConnection } from '../../src/utils/solana';
import { fetchStake } from '../../src/utils/accounts';
import { formatORB, formatSOL } from './formatters';
import { PublicKey } from '@solana/web3.js';

/**
 * User-specific staking operations for telegram bot users
 */

export interface UserStakingInfo {
  telegram_id: string;
  staked_amount: number;
  accrued_rewards: number;
  last_updated: number;
}

/**
 * Get user staking info from blockchain
 */
export async function getUserStakingInfo(telegramId: string): Promise<UserStakingInfo | null> {
  try {
    const wallet = await getUserWallet(telegramId);
    if (!wallet) {
      return null;
    }

    // Fetch stake account from blockchain
    const stake = await fetchStake(wallet.publicKey);
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
  } catch (error) {
    logger.error('[User Staking] Failed to get staking info:', error);
    // Fallback to database
    const row = await getQuery<UserStakingInfo>(`
      SELECT * FROM user_staking WHERE telegram_id = ?
    `, [telegramId]);
    return row || null;
  }
}

/**
 * Create or update user staking record
 */
export async function updateUserStakingInfo(
  telegramId: string,
  stakedAmount: number,
  accruedRewards: number
): Promise<void> {
  await runQuery(`
    INSERT INTO user_staking (telegram_id, staked_amount, accrued_rewards, last_updated)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(telegram_id) DO UPDATE SET
      staked_amount = excluded.staked_amount,
      accrued_rewards = excluded.accrued_rewards,
      last_updated = excluded.last_updated
  `, [telegramId, stakedAmount, accruedRewards, Date.now()]);

  logger.debug(`[User Staking] Updated staking info for ${telegramId}: ${stakedAmount} staked, ${accruedRewards} rewards`);
}

/**
 * Stake ORB for a user
 */
export async function stakeUserOrb(
  telegramId: string,
  amount: number,
  dryRun: boolean = false
): Promise<{ success: boolean; signature?: string; error?: string }> {
  try {
    const wallet = await getUserWallet(telegramId);
    if (!wallet) {
      return { success: false, error: 'Wallet not found' };
    }

    const connection = getConnection();
    // const stakingProgram = getStakingProgram(wallet); // TODO: implement when needed

    if (dryRun) {
      logger.info(`[User Staking] DRY RUN: Would stake ${amount} ORB for ${telegramId}`);
      return { success: true, signature: 'DRY_RUN' };
    }

    // Execute staking transaction
    // TODO: Implement actual staking logic based on your program
    logger.info(`[User Staking] Staking ${amount} ORB for ${telegramId}`);

    // For now, just update the database record
    const currentInfo = await getUserStakingInfo(telegramId);
    const newStakedAmount = (currentInfo?.staked_amount || 0) + amount;
    await updateUserStakingInfo(telegramId, newStakedAmount, currentInfo?.accrued_rewards || 0);

    // Record transaction
    await recordTransaction({
      type: 'stake',
      orbAmount: amount,
      status: 'success',
      notes: `Staked ${amount} ORB for user ${telegramId}`,
    });

    return { success: true, signature: 'MOCK_SIGNATURE' };
  } catch (error: any) {
    logger.error('[User Staking] Failed to stake ORB:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Claim staking rewards for a user
 */
export async function claimUserStakingRewards(
  telegramId: string,
  dryRun: boolean = false
): Promise<{ success: boolean; amount?: number; signature?: string; error?: string }> {
  try {
    const wallet = await getUserWallet(telegramId);
    if (!wallet) {
      return { success: false, error: 'Wallet not found' };
    }

    const stakingInfo = await getUserStakingInfo(telegramId);
    if (!stakingInfo || stakingInfo.accrued_rewards === 0) {
      return { success: false, error: 'No rewards to claim' };
    }

    const connection = getConnection();
    // const stakingProgram = getStakingProgram(wallet); // TODO: implement when needed

    if (dryRun) {
      logger.info(`[User Staking] DRY RUN: Would claim ${stakingInfo.accrued_rewards} ORB rewards for ${telegramId}`);
      return { success: true, amount: stakingInfo.accrued_rewards, signature: 'DRY_RUN' };
    }

    // Execute claim transaction
    // TODO: Implement actual claiming logic based on your program
    logger.info(`[User Staking] Claiming ${stakingInfo.accrued_rewards} ORB rewards for ${telegramId}`);

    const claimedAmount = stakingInfo.accrued_rewards;

    // Update staking info (reset rewards)
    await updateUserStakingInfo(telegramId, stakingInfo.staked_amount, 0);

    // Record transaction
    await recordTransaction({
      type: 'claim_orb',
      orbAmount: claimedAmount,
      status: 'success',
      notes: `Claimed ${claimedAmount} ORB staking rewards for user ${telegramId}`,
    });

    return { success: true, amount: claimedAmount, signature: 'MOCK_SIGNATURE' };
  } catch (error: any) {
    logger.error('[User Staking] Failed to claim rewards:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get staking pool info from blockchain
 */
export async function getStakingPoolInfo(): Promise<{
  totalStaked: number;
  rewardRate: number;
  poolAddress: string;
}> {
  try {
    // TODO: Implement actual blockchain query
    // This is a placeholder
    return {
      totalStaked: 0,
      rewardRate: 0,
      poolAddress: 'N/A',
    };
  } catch (error) {
    logger.error('[User Staking] Failed to get pool info:', error);
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
export function formatStakingDisplay(
  stakingInfo: UserStakingInfo | null,
  poolInfo?: { totalStaked: number; rewardRate: number }
): string {
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
• Staked Amount: ${formatORB(stakingInfo.staked_amount)}
• Accrued Rewards: ${formatORB(stakingInfo.accrued_rewards)}
• Last Updated: ${lastUpdated}

${poolInfo ? `*Pool Info:*
• Total Staked: ${formatORB(poolInfo.totalStaked)}
• Reward Rate: ${poolInfo.rewardRate}% APY` : ''}

${stakingInfo.accrued_rewards > 0 ? '✨ You have rewards to claim!' : ''}
`.trim();
}
