/**
 * Shared Round Tracking
 *
 * Platform-agnostic round participation tracking for all platforms
 */

import { runQuery, getQuery, allQuery } from '../../src/utils/database';
import logger from '../../src/utils/logger';
import { Platform } from './users';

/**
 * Initialize platform_user_rounds table
 */
export async function initializeUserRoundsTable(): Promise<void> {
  await runQuery(`
    CREATE TABLE IF NOT EXISTS platform_user_rounds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      platform_id TEXT NOT NULL,
      round_id INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      motherlode REAL DEFAULT 0,
      deployed_sol REAL DEFAULT 0,
      squares_deployed INTEGER DEFAULT 0,
      deployed_squares TEXT DEFAULT '[]',
      winning_square INTEGER DEFAULT -1,
      hit INTEGER DEFAULT 0,
      won INTEGER DEFAULT 0,
      rewards_claimed REAL DEFAULT 0,
      orb_rewards REAL DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
      UNIQUE(platform, platform_id, round_id)
    )
  `);

  // Create indexes for faster queries
  await runQuery(`CREATE INDEX IF NOT EXISTS idx_platform_user_rounds_platform ON platform_user_rounds(platform, platform_id)`);
  await runQuery(`CREATE INDEX IF NOT EXISTS idx_platform_user_rounds_round_id ON platform_user_rounds(round_id)`);

  logger.info('[Shared DB] Platform user rounds table initialized');
}

export interface DeployedSquare {
  square: number;
  amount: number; // SOL amount
}

export interface UserRound {
  id: number;
  platform: Platform;
  platform_id: string;
  round_id: number;
  timestamp: number;
  motherlode: number;
  deployed_sol: number;
  squares_deployed: number;
  deployed_squares: DeployedSquare[];
  winning_square: number;
  hit: boolean;
  won: boolean;
  rewards_claimed: number;
  orb_rewards: number;
  created_at: number;
}

/**
 * Record user participation in a round
 */
export async function recordUserRound(
  platform: Platform,
  platformId: string,
  roundId: number,
  motherlode: number,
  deployedSol: number,
  squaresDeployed: number,
  deployedSquares: DeployedSquare[] = []
): Promise<void> {
  const deployedSquaresJson = JSON.stringify(deployedSquares);

  await runQuery(`
    INSERT INTO platform_user_rounds (
      platform, platform_id, round_id, timestamp, motherlode, deployed_sol, squares_deployed, deployed_squares
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(platform, platform_id, round_id) DO UPDATE SET
      motherlode = excluded.motherlode,
      deployed_sol = platform_user_rounds.deployed_sol + excluded.deployed_sol,
      squares_deployed = excluded.squares_deployed,
      deployed_squares = excluded.deployed_squares
  `, [platform, platformId, roundId, Date.now(), motherlode, deployedSol, squaresDeployed, deployedSquaresJson]);

  logger.debug(`[Shared Rounds] Recorded round ${roundId} for ${platform}:${platformId}: ${deployedSol} SOL deployed to ${squaresDeployed} squares`);
}

/**
 * Update round result with winning square and hit status
 */
export async function updateRoundResult(
  platform: Platform,
  platformId: string,
  roundId: number,
  winningSquare: number
): Promise<void> {
  const userRound = await getUserRound(platform, platformId, roundId);
  if (!userRound) {
    logger.debug(`[Shared Rounds] No round record found for ${platform}:${platformId} round ${roundId}`);
    return;
  }

  const hit = userRound.deployed_squares.some(ds => ds.square === winningSquare);

  await runQuery(`
    UPDATE platform_user_rounds
    SET winning_square = ?, hit = ?
    WHERE platform = ? AND platform_id = ? AND round_id = ?
  `, [winningSquare, hit ? 1 : 0, platform, platformId, roundId]);

  logger.debug(`[Shared Rounds] Updated round ${roundId} for ${platform}:${platformId}: winning=${winningSquare}, hit=${hit}`);
}

/**
 * Update all pending rounds with winning square (batch update after round ends)
 */
export async function updateAllRoundsResult(
  roundId: number,
  winningSquare: number
): Promise<void> {
  const pendingRounds = await allQuery<any>(`
    SELECT platform, platform_id, deployed_squares FROM platform_user_rounds
    WHERE round_id = ? AND winning_square = -1
  `, [roundId]);

  for (const row of pendingRounds) {
    const deployedSquares: DeployedSquare[] = JSON.parse(row.deployed_squares || '[]');
    const hit = deployedSquares.some(ds => ds.square === winningSquare);

    await runQuery(`
      UPDATE platform_user_rounds
      SET winning_square = ?, hit = ?
      WHERE platform = ? AND platform_id = ? AND round_id = ?
    `, [winningSquare, hit ? 1 : 0, row.platform, row.platform_id, roundId]);
  }

  logger.info(`[Shared Rounds] Updated ${pendingRounds.length} user rounds for round ${roundId} with winning square ${winningSquare}`);
}

/**
 * Update round win status and rewards
 */
export async function updateUserRoundRewards(
  platform: Platform,
  platformId: string,
  roundId: number,
  won: boolean,
  rewardsClaimed: number,
  orbRewards: number
): Promise<void> {
  await runQuery(`
    UPDATE platform_user_rounds
    SET won = ?, rewards_claimed = ?, orb_rewards = ?
    WHERE platform = ? AND platform_id = ? AND round_id = ?
  `, [won ? 1 : 0, rewardsClaimed, orbRewards, platform, platformId, roundId]);

  logger.debug(`[Shared Rounds] Updated round ${roundId} rewards for ${platform}:${platformId}: ${rewardsClaimed} SOL, ${orbRewards} ORB`);
}

/**
 * Get user's recent rounds
 */
export async function getUserRecentRounds(
  platform: Platform,
  platformId: string,
  limit: number = 10
): Promise<UserRound[]> {
  const rows = await allQuery<any>(`
    SELECT * FROM platform_user_rounds
    WHERE platform = ? AND platform_id = ?
    ORDER BY round_id DESC
    LIMIT ?
  `, [platform, platformId, limit]);

  return rows.map(convertRoundFromDb);
}

/**
 * Get user's round statistics
 */
export async function getUserRoundStats(platform: Platform, platformId: string): Promise<{
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
    FROM platform_user_rounds
    WHERE platform = ? AND platform_id = ?
  `, [platform, platformId]);

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
  platform: Platform,
  platformId: string,
  roundId: number
): Promise<UserRound | null> {
  const row = await getQuery<any>(`
    SELECT * FROM platform_user_rounds
    WHERE platform = ? AND platform_id = ? AND round_id = ?
  `, [platform, platformId, roundId]);

  return row ? convertRoundFromDb(row) : null;
}

/**
 * Convert database row to UserRound object
 */
function convertRoundFromDb(row: any): UserRound {
  let deployedSquares: DeployedSquare[] = [];
  try {
    deployedSquares = JSON.parse(row.deployed_squares || '[]');
  } catch {
    deployedSquares = [];
  }

  return {
    id: row.id,
    platform: row.platform as Platform,
    platform_id: row.platform_id,
    round_id: row.round_id,
    timestamp: row.timestamp,
    motherlode: row.motherlode,
    deployed_sol: row.deployed_sol,
    squares_deployed: row.squares_deployed,
    deployed_squares: deployedSquares,
    winning_square: row.winning_square ?? -1,
    hit: row.hit === 1,
    won: row.won === 1,
    rewards_claimed: row.rewards_claimed,
    orb_rewards: row.orb_rewards,
    created_at: row.created_at,
  };
}

/**
 * Calculate winning square from round's slotHash
 */
export function calculateWinningSquare(slotHash: Buffer): number {
  if (!slotHash || slotHash.length < 1) {
    return -1;
  }
  return slotHash[0] % 25;
}
