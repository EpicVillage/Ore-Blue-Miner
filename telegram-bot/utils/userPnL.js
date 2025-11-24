"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateUserPnL = calculateUserPnL;
exports.formatPnLDisplay = formatPnLDisplay;
exports.recordUserBalanceSnapshot = recordUserBalanceSnapshot;
exports.getUserBalanceHistory = getUserBalanceHistory;
const database_1 = require("../../src/utils/database");
const logger_1 = __importDefault(require("../../src/utils/logger"));
const formatters_1 = require("./formatters");
/**
 * Calculate comprehensive PnL for a user
 */
async function calculateUserPnL(telegramId, publicKey, currentOrbBalance, currentSolBalance, currentAutomationBalance, claimableSol, claimableOrb, currentOrbPriceUsd) {
    // Get transaction summary for this user
    const txSummary = await (0, database_1.getQuery)(`
    SELECT
      COALESCE(SUM(CASE WHEN type = 'automation_setup' THEN sol_amount WHEN type = 'automation_close' THEN -sol_amount ELSE 0 END), 0) as total_deployed,
      COALESCE(SUM(CASE WHEN type = 'claim_sol' THEN sol_amount ELSE 0 END), 0) as total_claimed_sol,
      COALESCE(SUM(CASE WHEN type = 'claim_orb' THEN orb_amount ELSE 0 END), 0) as total_claimed_orb,
      COALESCE(SUM(CASE WHEN type = 'swap' THEN orb_amount ELSE 0 END), 0) as total_swapped_orb,
      COALESCE(SUM(CASE WHEN type = 'swap' THEN sol_amount ELSE 0 END), 0) as total_swapped_sol,
      COALESCE(SUM(tx_fee_sol), 0) as total_tx_fees,
      COALESCE(SUM(protocol_fee_sol), 0) as total_protocol_fees,
      COALESCE(SUM(CASE WHEN type IN ('deploy', 'claim_sol', 'claim_orb', 'mine') THEN orb_amount ELSE 0 END), 0) as total_orb_earned
    FROM transactions
    WHERE wallet_address = ? AND status = 'success'
  `, [publicKey]);
    // Get rounds participated count
    const roundsCount = await (0, database_1.getQuery)(`
    SELECT COUNT(*) as count FROM user_rounds WHERE telegram_id = ?
  `, [telegramId]);
    // Get transaction counts
    const txCounts = await (0, database_1.getQuery)(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful
    FROM transactions
    WHERE wallet_address = ?
  `, [publicKey]);
    // Get average ORB price from transactions
    const avgPrice = await (0, database_1.getQuery)(`
    SELECT AVG(orb_price_usd) as avg_price
    FROM transactions
    WHERE wallet_address = ? AND orb_price_usd > 0
  `, [publicKey]);
    const totalSolDeployed = txSummary?.total_deployed || 0;
    const totalClaimedSol = txSummary?.total_claimed_sol || 0;
    const totalClaimedOrb = txSummary?.total_claimed_orb || 0;
    const totalSwappedOrb = txSummary?.total_swapped_orb || 0;
    const totalSwappedSol = txSummary?.total_swapped_sol || 0;
    const totalTxFees = txSummary?.total_tx_fees || 0;
    const totalProtocolFees = txSummary?.total_protocol_fees || 0;
    const totalOrbEarned = txSummary?.total_orb_earned || 0;
    const totalFeesPaid = totalTxFees + totalProtocolFees;
    const roundsParticipated = roundsCount?.count || 0;
    const totalTransactions = txCounts?.total || 0;
    const successfulTransactions = txCounts?.successful || 0;
    const successRate = totalTransactions > 0 ? (successfulTransactions / totalTransactions) * 100 : 0;
    const avgOrbPriceUsd = avgPrice?.avg_price || currentOrbPriceUsd;
    // Calculate net ORB balance (earned - swapped)
    const netOrbPnl = totalClaimedOrb - totalSwappedOrb;
    // Calculate net SOL PnL (claimed + swapped + automation balance - deployed - fees)
    const totalSolReceived = totalClaimedSol + totalSwappedSol + currentAutomationBalance + claimableSol;
    const netSolPnl = totalSolReceived - totalSolDeployed - totalFeesPaid;
    // Total current holdings value in SOL
    const currentOrbValue = (currentOrbBalance + claimableOrb) * (currentOrbPriceUsd / 100); // Rough conversion
    const totalPnlSol = netSolPnl + currentOrbValue;
    // Total PnL in USD
    const totalPnlUsd = (netSolPnl * 100) + ((currentOrbBalance + claimableOrb) * currentOrbPriceUsd);
    // Calculate ROI
    let roiPercent = 0;
    if (totalSolDeployed > 0) {
        const totalCurrentValue = currentSolBalance + currentAutomationBalance + claimableSol + currentOrbValue;
        roiPercent = ((totalCurrentValue - totalSolDeployed) / totalSolDeployed) * 100;
    }
    return {
        // Income
        totalOrbEarned,
        totalOrbClaimed: totalClaimedOrb,
        totalSolClaimed: totalClaimedSol,
        totalSwappedOrb,
        totalSwappedSol,
        // Expenses
        totalSolDeployed,
        totalFeesPaid,
        totalProtocolFees,
        totalTxFees,
        // Current Holdings
        currentOrbBalance,
        currentSolBalance,
        currentAutomationBalance,
        claimableSol,
        claimableOrb,
        // Profit
        netSolPnl,
        netOrbPnl,
        totalPnlSol,
        totalPnlUsd,
        roiPercent,
        // Stats
        roundsParticipated,
        totalTransactions,
        successfulTransactions,
        successRate,
        // Prices
        avgOrbPriceUsd,
        currentOrbPriceUsd,
    };
}
/**
 * Format PnL summary for display
 */
function formatPnLDisplay(pnl) {
    const profitEmoji = pnl.netSolPnl >= 0 ? '📈' : '📉';
    const roiEmoji = pnl.roiPercent >= 0 ? '✅' : '❌';
    return `
💰 *Profit & Loss Summary*

${profitEmoji} *Net P/L:* ${(0, formatters_1.formatSOL)(pnl.netSolPnl)} (${(0, formatters_1.formatPercent)(pnl.roiPercent)})
${roiEmoji} *ROI:* ${(0, formatters_1.formatPercent)(pnl.roiPercent)}

*📊 Income Breakdown:*
• ORB Earned: ${(0, formatters_1.formatORB)(pnl.totalOrbEarned)}
• ORB Claimed: ${(0, formatters_1.formatORB)(pnl.totalOrbClaimed)}
• SOL from Mining: ${(0, formatters_1.formatSOL)(pnl.totalSolClaimed)}
• SOL from Swaps: ${(0, formatters_1.formatSOL)(pnl.totalSwappedSol)}
• ORB Swapped: ${(0, formatters_1.formatORB)(pnl.totalSwappedOrb)}

*💸 Expense Breakdown:*
• Total Deployed: ${(0, formatters_1.formatSOL)(pnl.totalSolDeployed)}
• Total Fees: ${(0, formatters_1.formatSOL)(pnl.totalFeesPaid)}
  - Protocol Fees: ${(0, formatters_1.formatSOL)(pnl.totalProtocolFees)}
  - Transaction Fees: ${(0, formatters_1.formatSOL)(pnl.totalTxFees)}

*💼 Current Holdings:*
• Wallet SOL: ${(0, formatters_1.formatSOL)(pnl.currentSolBalance)}
• Wallet ORB: ${(0, formatters_1.formatORB)(pnl.currentOrbBalance)}
• Automation SOL: ${(0, formatters_1.formatSOL)(pnl.currentAutomationBalance)}
• Claimable SOL: ${(0, formatters_1.formatSOL)(pnl.claimableSol)}
• Claimable ORB: ${(0, formatters_1.formatORB)(pnl.claimableOrb)}
• ORB Value: ${(0, formatters_1.formatUSD)(pnl.currentOrbBalance * pnl.currentOrbPriceUsd)}

*📈 Performance:*
• Rounds Participated: ${pnl.roundsParticipated}
• Total Transactions: ${pnl.totalTransactions}
• Success Rate: ${(0, formatters_1.formatPercent)(pnl.successRate)}
• Avg ORB Price: ${(0, formatters_1.formatUSD)(pnl.avgOrbPriceUsd)}
`.trim();
}
/**
 * Record balance snapshot for historical tracking
 */
async function recordUserBalanceSnapshot(telegramId, solBalance, orbBalance, orbPriceUsd, automationSol = 0, claimableSol = 0, claimableOrb = 0, stakedOrb = 0) {
    const portfolioValueUsd = (solBalance * 100) + (orbBalance * orbPriceUsd) + (automationSol * 100) + (claimableSol * 100) + (claimableOrb * orbPriceUsd) + (stakedOrb * orbPriceUsd);
    await (0, database_1.allQuery)(`
    INSERT INTO user_balance_history (
      telegram_id, timestamp, sol_balance, orb_balance, orb_price_usd, portfolio_value_usd,
      automation_sol, claimable_sol, claimable_orb, staked_orb
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [telegramId, Date.now(), solBalance, orbBalance, orbPriceUsd, portfolioValueUsd, automationSol, claimableSol, claimableOrb, stakedOrb]);
    logger_1.default.debug(`[User PnL] Recorded balance snapshot for ${telegramId}`);
}
/**
 * Get balance history for a user
 */
async function getUserBalanceHistory(telegramId, limit = 100) {
    return (0, database_1.allQuery)(`
    SELECT * FROM user_balance_history
    WHERE telegram_id = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `, [telegramId, limit]);
}
//# sourceMappingURL=userPnL.js.map