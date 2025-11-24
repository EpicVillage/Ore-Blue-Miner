import { runQuery, getQuery, allQuery } from '../../src/utils/database';
import logger from '../../src/utils/logger';
import { formatORB, formatSOL, formatTimestamp } from './formatters';

/**
 * User-specific rounds tracking for telegram bot users
 * Tracks participation in mining rounds
 */

export interface UserRound {
  id: number;
  telegram_id: string;
  round_id: number;
  timestamp: number;
  motherlode: number;
  deployed_sol: number;
  squares_deployed: number;
  won: boolean;
  rewards_claimed: number;
  orb_rewards: number;
  created_at: number;
}

/**
 * Record user participation in a round
 */
export async function recordUserRound(
  telegramId: string,
  roundId: number,
  motherlode: number,
  deployedSol: number,
  squaresDeployed: number
): Promise<void> {
  await runQuery(`
    INSERT INTO user_rounds (
      telegram_id, round_id, timestamp, motherlode, deployed_sol, squares_deployed
    )
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(telegram_id, round_id) DO UPDATE SET
      motherlode = excluded.motherlode,
      deployed_sol = excluded.deployed_sol,
      squares_deployed = excluded.squares_deployed
  `, [telegramId, roundId, Date.now(), motherlode, deployedSol, squaresDeployed]);

  logger.debug(`[User Rounds] Recorded round ${roundId} for ${telegramId}: ${deployedSol} SOL deployed`);
}

/**
 * Update round win status and rewards
 */
export async function updateUserRoundRewards(
  telegramId: string,
  roundId: number,
  won: boolean,
  rewardsClaimed: number,
  orbRewards: number
): Promise<void> {
  await runQuery(`
    UPDATE user_rounds
    SET won = ?, rewards_claimed = ?, orb_rewards = ?
    WHERE telegram_id = ? AND round_id = ?
  `, [won ? 1 : 0, rewardsClaimed, orbRewards, telegramId, roundId]);

  logger.debug(`[User Rounds] Updated round ${roundId} rewards for ${telegramId}: ${rewardsClaimed} SOL, ${orbRewards} ORB`);
}

/**
 * Get user's recent rounds
 */
export async function getUserRecentRounds(
  telegramId: string,
  limit: number = 10
): Promise<UserRound[]> {
  const rows = await allQuery<any>(`
    SELECT * FROM user_rounds
    WHERE telegram_id = ?
    ORDER BY round_id DESC
    LIMIT ?
  `, [telegramId, limit]);

  return rows.map(convertRoundFromDb);
}

/**
 * Get user's round statistics
 */
export async function getUserRoundStats(telegramId: string): Promise<{
  totalRounds: number;
  totalDeployed: number;
  totalWins: number;
  totalRewardsSol: number;
  totalRewardsOrb: number;
  winRate: number;
  avgDeployment: number;
  avgMotherlode: number;
}> {
  const stats = await getQuery<{
    total_rounds: number;
    total_deployed: number;
    total_wins: number;
    total_rewards_sol: number;
    total_rewards_orb: number;
    avg_deployment: number;
    avg_motherlode: number;
  }>(`
    SELECT
      COUNT(*) as total_rounds,
      COALESCE(SUM(deployed_sol), 0) as total_deployed,
      COALESCE(SUM(won), 0) as total_wins,
      COALESCE(SUM(rewards_claimed), 0) as total_rewards_sol,
      COALESCE(SUM(orb_rewards), 0) as total_rewards_orb,
      COALESCE(AVG(deployed_sol), 0) as avg_deployment,
      COALESCE(AVG(motherlode), 0) as avg_motherlode
    FROM user_rounds
    WHERE telegram_id = ?
  `, [telegramId]);

  const totalRounds = stats?.total_rounds || 0;
  const totalWins = stats?.total_wins || 0;
  const winRate = totalRounds > 0 ? (totalWins / totalRounds) * 100 : 0;

  return {
    totalRounds,
    totalDeployed: stats?.total_deployed || 0,
    totalWins,
    totalRewardsSol: stats?.total_rewards_sol || 0,
    totalRewardsOrb: stats?.total_rewards_orb || 0,
    winRate,
    avgDeployment: stats?.avg_deployment || 0,
    avgMotherlode: stats?.avg_motherlode || 0,
  };
}

/**
 * Get specific round info for user
 */
export async function getUserRound(
  telegramId: string,
  roundId: number
): Promise<UserRound | null> {
  const row = await getQuery<any>(`
    SELECT * FROM user_rounds
    WHERE telegram_id = ? AND round_id = ?
  `, [telegramId, roundId]);

  return row ? convertRoundFromDb(row) : null;
}

/**
 * Convert database row to UserRound object
 */
function convertRoundFromDb(row: any): UserRound {
  return {
    id: row.id,
    telegram_id: row.telegram_id,
    round_id: row.round_id,
    timestamp: row.timestamp,
    motherlode: row.motherlode,
    deployed_sol: row.deployed_sol,
    squares_deployed: row.squares_deployed,
    won: row.won === 1,
    rewards_claimed: row.rewards_claimed,
    orb_rewards: row.orb_rewards,
    created_at: row.created_at,
  };
}

/**
 * Format recent rounds for display
 */
export function formatRecentRoundsDisplay(rounds: UserRound[]): string {
  if (rounds.length === 0) {
    return `
📜 *Recent Rounds*

No rounds participated yet.
`.trim();
  }

  const roundsList = rounds.map((round, index) => {
    const winStatus = round.won ? '✅ Won' : round.rewards_claimed > 0 ? '💰 Partial' : '❌ Lost';
    const rewards = round.rewards_claimed > 0 || round.orb_rewards > 0
      ? `\n  Rewards: ${formatSOL(round.rewards_claimed)} + ${formatORB(round.orb_rewards)}`
      : '';

    return `
${index + 1}. *Round #${round.round_id}* ${winStatus}
  Motherlode: ${formatORB(round.motherlode)}
  Deployed: ${formatSOL(round.deployed_sol)} (${round.squares_deployed} squares)
  Time: ${formatTimestamp(round.timestamp)}${rewards}`;
  }).join('\n');

  return `
📜 *Recent Rounds*

${roundsList}
`.trim();
}

/**
 * Format round stats for display
 */
export function formatRoundStatsDisplay(stats: {
  totalRounds: number;
  totalDeployed: number;
  totalWins: number;
  totalRewardsSol: number;
  totalRewardsOrb: number;
  winRate: number;
  avgDeployment: number;
  avgMotherlode: number;
}): string {
  return `
📊 *Round Statistics*

*Overall Performance:*
• Total Rounds: ${stats.totalRounds}
• Total Deployed: ${formatSOL(stats.totalDeployed)}
• Total Wins: ${stats.totalWins}
• Win Rate: ${stats.winRate.toFixed(1)}%

*Rewards Earned:*
• SOL Rewards: ${formatSOL(stats.totalRewardsSol)}
• ORB Rewards: ${formatORB(stats.totalRewardsOrb)}

*Averages:*
• Avg Deployment: ${formatSOL(stats.avgDeployment)}
• Avg Motherlode: ${formatORB(stats.avgMotherlode)}
`.trim();
}

/**
 * Get current round info from blockchain
 */
export async function getCurrentRoundInfo(): Promise<{
  roundId: number;
  motherlode: number;
  prizePool: number;
  timeRemaining: number;
  participants: number;
} | null> {
  try {
    const { fetchBoard, fetchRound } = await import('../../src/utils/accounts');

    // Fetch board to get current round ID
    const board = await fetchBoard();
    const roundId = Number(board.roundId);

    // Fetch round details to get motherload
    const round = await fetchRound(board.roundId);
    const motherlode = Number(round.motherload) / 1e9;

    // Prize pool is the total ORB in the round
    const prizePool = motherlode;

    // Calculate time remaining (rounds are ~60 seconds)
    // This is approximate since we don't have exact timestamp
    const timeRemaining = 0; // TODO: Calculate based on block time

    // Participants count (if available from round data)
    const participants = 0; // TODO: Extract from round data if available

    logger.debug(`[User Rounds] Current round ${roundId}, motherload: ${motherlode.toFixed(2)} ORB`);

    return {
      roundId,
      motherlode,
      prizePool,
      timeRemaining,
      participants,
    };
  } catch (error) {
    logger.error('[User Rounds] Failed to get current round info:', error);
    return null;
  }
}

/**
 * Format current round info for display
 */
export function formatCurrentRoundDisplay(roundInfo: {
  roundId: number;
  motherlode: number;
  prizePool: number;
  timeRemaining: number;
  participants: number;
} | null): string {
  if (!roundInfo) {
    return `
🎯 *Current Round*

Unable to fetch current round information.
`.trim();
  }

  const timeRemainingStr = roundInfo.timeRemaining > 0
    ? `${Math.floor(roundInfo.timeRemaining / 60)}m ${roundInfo.timeRemaining % 60}s`
    : 'Round ended';

  return `
🎯 *Current Round #${roundInfo.roundId}*

*Prize Pool:* ${formatORB(roundInfo.prizePool)}
*Motherlode:* ${formatORB(roundInfo.motherlode)}
*Participants:* ${roundInfo.participants}
*Time Remaining:* ${timeRemainingStr}
`.trim();
}
