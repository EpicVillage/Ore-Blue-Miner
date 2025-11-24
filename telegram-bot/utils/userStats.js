"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserTransactions = getUserTransactions;
exports.getUserPerformanceStats = getUserPerformanceStats;
exports.getUserMiningStats = getUserMiningStats;
exports.getUserClaimStats = getUserClaimStats;
exports.formatTransactionForDisplay = formatTransactionForDisplay;
const database_1 = require("../../src/utils/database");
const logger_1 = __importDefault(require("../../src/utils/logger"));
/**
 * User-specific stats and history utilities for Telegram bot
 */
/**
 * Get recent transactions for a specific wallet address
 */
async function getUserTransactions(walletAddress, limit = 10) {
    try {
        const transactions = await (0, database_1.allQuery)(`
      SELECT * FROM transactions
      WHERE (wallet_address = ? OR wallet_address IS NULL)
        AND type != 'auto_deploy'
      ORDER BY timestamp DESC
      LIMIT ?
    `, [walletAddress, limit]);
        return transactions || [];
    }
    catch (error) {
        logger_1.default.error('[User Stats] Failed to get transactions:', error);
        return [];
    }
}
/**
 * Get performance stats for a specific user
 */
async function getUserPerformanceStats(walletAddress) {
    try {
        const stats = await (0, database_1.getQuery)(`
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
    }
    catch (error) {
        logger_1.default.error('[User Stats] Failed to get performance stats:', error);
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
 */
async function getUserMiningStats(walletAddress) {
    try {
        const stats = await (0, database_1.getQuery)(`
      SELECT
        COUNT(*) as totalMines,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successfulMines,
        SUM(COALESCE(orb_amount, 0)) as totalOrbMined,
        AVG(CASE WHEN status = 'success' AND orb_amount > 0 THEN orb_amount ELSE NULL END) as avgOrbPerMine
      FROM transactions
      WHERE type = 'mine' AND (wallet_address = ? OR wallet_address IS NULL)
    `, [walletAddress]);
        return {
            totalMines: stats?.totalMines || 0,
            successfulMines: stats?.successfulMines || 0,
            totalOrbMined: stats?.totalOrbMined || 0,
            avgOrbPerMine: stats?.avgOrbPerMine || 0,
        };
    }
    catch (error) {
        logger_1.default.error('[User Stats] Failed to get mining stats:', error);
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
async function getUserClaimStats(walletAddress) {
    try {
        const stats = await (0, database_1.getQuery)(`
      SELECT
        COUNT(*) as totalClaims,
        SUM(COALESCE(orb_amount, 0)) as totalOrbClaimed,
        SUM(COALESCE(sol_amount, 0)) as totalSolClaimed
      FROM transactions
      WHERE (type = 'claim_sol' OR type = 'claim_orb') AND status = 'success'
        AND (wallet_address = ? OR wallet_address IS NULL)
    `, [walletAddress]);
        return {
            totalClaims: stats?.totalClaims || 0,
            totalOrbClaimed: stats?.totalOrbClaimed || 0,
            totalSolClaimed: stats?.totalSolClaimed || 0,
        };
    }
    catch (error) {
        logger_1.default.error('[User Stats] Failed to get claim stats:', error);
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
function formatTransactionForDisplay(tx) {
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
//# sourceMappingURL=userStats.js.map