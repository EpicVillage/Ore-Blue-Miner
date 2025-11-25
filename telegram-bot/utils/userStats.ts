import { allQuery, getQuery } from '../../src/utils/database';
import logger from '../../src/utils/logger';

/**
 * User-specific stats and history utilities for Telegram bot
 */

/**
 * Get recent transactions for a specific wallet address
 */
export async function getUserTransactions(walletAddress: string, limit: number = 10): Promise<any[]> {
  try {
    const transactions = await allQuery(`
      SELECT * FROM transactions
      WHERE (wallet_address = ? OR wallet_address IS NULL)
        AND type != 'auto_deploy'
      ORDER BY timestamp DESC
      LIMIT ?
    `, [walletAddress, limit]);

    return transactions || [];
  } catch (error) {
    logger.error('[User Stats] Failed to get transactions:', error);
    return [];
  }
}

/**
 * Get performance stats for a specific user
 */
export async function getUserPerformanceStats(walletAddress: string): Promise<{
  totalTransactions: number;
  successfulTransactions: number;
  successRate: number;
  totalSolSpent: number;
  totalOrbEarned: number;
  totalFeesPaid: number;
  avgOrbPrice: number;
}> {
  try {
    const stats = await getQuery<any>(`
      SELECT
        COUNT(*) as totalTransactions,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successfulTransactions,
        SUM(COALESCE(sol_amount, 0)) as totalSolSpent,
        SUM(COALESCE(orb_amount, 0)) as totalOrbEarned,
        SUM(COALESCE(tx_fee_sol, 0)) as totalFeesPaid,
        AVG(COALESCE(orb_price_usd, 0)) as avgOrbPrice
      FROM transactions
      WHERE wallet_address = ? OR wallet_address IS NULL
    `, [walletAddress]);

    const totalTransactions = stats?.totalTransactions || 0;
    const successfulTransactions = stats?.successfulTransactions || 0;
    const successRate = totalTransactions > 0 ? (successfulTransactions / totalTransactions) * 100 : 0;

    return {
      totalTransactions,
      successfulTransactions,
      successRate,
      totalSolSpent: stats?.totalSolSpent || 0,
      totalOrbEarned: stats?.totalOrbEarned || 0,
      totalFeesPaid: stats?.totalFeesPaid || 0,
      avgOrbPrice: stats?.avgOrbPrice || 0,
    };
  } catch (error) {
    logger.error('[User Stats] Failed to get performance stats:', error);
    return {
      totalTransactions: 0,
      successfulTransactions: 0,
      successRate: 0,
      totalSolSpent: 0,
      totalOrbEarned: 0,
      totalFeesPaid: 0,
      avgOrbPrice: 0,
    };
  }
}

/**
 * Get mining stats for a specific user
 * Tracks deployments (which generate mining rewards)
 */
export async function getUserMiningStats(walletAddress: string): Promise<{
  totalMines: number;
  successfulMines: number;
  totalOrbMined: number;
  avgOrbPerMine: number;
}> {
  try {
    const stats = await getQuery<any>(`
      SELECT
        COUNT(*) as totalMines,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successfulMines,
        SUM(COALESCE(sol_amount, 0)) as totalSolDeployed
      FROM transactions
      WHERE type = 'deploy' AND (wallet_address = ? OR wallet_address IS NULL)
    `, [walletAddress]);

    // Get ORB earned from claims (actual mining rewards)
    const claimStats = await getQuery<any>(`
      SELECT
        SUM(COALESCE(orb_amount, 0)) as totalOrbClaimed
      FROM transactions
      WHERE type = 'claim_orb' AND status = 'success'
        AND (wallet_address = ? OR wallet_address IS NULL)
    `, [walletAddress]);

    const totalMines = stats?.totalMines || 0;
    const totalOrbMined = claimStats?.totalOrbClaimed || 0;
    const avgOrbPerMine = totalMines > 0 ? totalOrbMined / totalMines : 0;

    return {
      totalMines,
      successfulMines: stats?.successfulMines || 0,
      totalOrbMined,
      avgOrbPerMine,
    };
  } catch (error) {
    logger.error('[User Stats] Failed to get mining stats:', error);
    return {
      totalMines: 0,
      successfulMines: 0,
      totalOrbMined: 0,
      avgOrbPerMine: 0,
    };
  }
}

/**
 * Get claim stats for a specific user
 */
export async function getUserClaimStats(walletAddress: string): Promise<{
  totalClaims: number;
  totalOrbClaimed: number;
  totalSolClaimed: number;
}> {
  try {
    const stats = await getQuery<any>(`
      SELECT
        COUNT(*) as totalClaims,
        SUM(CASE WHEN type = 'claim_orb' THEN COALESCE(orb_amount, 0) ELSE 0 END) as totalOrbClaimed,
        SUM(CASE WHEN type = 'claim_sol' THEN COALESCE(sol_amount, 0) ELSE 0 END) as totalSolClaimed
      FROM transactions
      WHERE (type = 'claim_sol' OR type = 'claim_orb' OR type = 'claim_staking') AND status = 'success'
        AND (wallet_address = ? OR wallet_address IS NULL)
    `, [walletAddress]);

    return {
      totalClaims: stats?.totalClaims || 0,
      totalOrbClaimed: stats?.totalOrbClaimed || 0,
      totalSolClaimed: stats?.totalSolClaimed || 0,
    };
  } catch (error) {
    logger.error('[User Stats] Failed to get claim stats:', error);
    return {
      totalClaims: 0,
      totalOrbClaimed: 0,
      totalSolClaimed: 0,
    };
  }
}

/**
 * Format transaction for display
 */
export function formatTransactionForDisplay(tx: any): string {
  const timestamp = new Date(tx.timestamp).toLocaleString();
  const type = tx.type.toUpperCase();
  const status = tx.status === 'success' ? '✅' : '❌';

  let details = `${status} *${type}* - ${timestamp}`;

  // Solscan link
  const solscanLink = tx.signature ? `[Solscan](https://solscan.io/tx/${tx.signature})` : '';

  if (tx.orb_amount && tx.orb_amount > 0) {
    details += `\n   🔮 ${tx.orb_amount.toFixed(4)} ORB${solscanLink ? ` | ${solscanLink}` : ''}`;
  }

  if (tx.sol_amount && tx.sol_amount > 0) {
    details += `\n   💎 ${tx.sol_amount.toFixed(4)} SOL${solscanLink ? ` | ${solscanLink}` : ''}`;
  }

  return details;
}
