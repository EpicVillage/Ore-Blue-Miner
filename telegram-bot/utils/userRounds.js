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
exports.recordUserRound = recordUserRound;
exports.updateUserRoundRewards = updateUserRoundRewards;
exports.getUserRecentRounds = getUserRecentRounds;
exports.getUserRoundStats = getUserRoundStats;
exports.getUserRound = getUserRound;
exports.formatRecentRoundsDisplay = formatRecentRoundsDisplay;
exports.formatRoundStatsDisplay = formatRoundStatsDisplay;
exports.getCurrentRoundInfo = getCurrentRoundInfo;
exports.formatCurrentRoundDisplay = formatCurrentRoundDisplay;
const database_1 = require("../../src/utils/database");
const logger_1 = __importDefault(require("../../src/utils/logger"));
const formatters_1 = require("./formatters");
/**
 * Record user participation in a round
 */
async function recordUserRound(telegramId, roundId, motherlode, deployedSol, squaresDeployed) {
    await (0, database_1.runQuery)(`
    INSERT INTO user_rounds (
      telegram_id, round_id, timestamp, motherlode, deployed_sol, squares_deployed
    )
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(telegram_id, round_id) DO UPDATE SET
      motherlode = excluded.motherlode,
      deployed_sol = excluded.deployed_sol,
      squares_deployed = excluded.squares_deployed
  `, [telegramId, roundId, Date.now(), motherlode, deployedSol, squaresDeployed]);
    logger_1.default.debug(`[User Rounds] Recorded round ${roundId} for ${telegramId}: ${deployedSol} SOL deployed`);
}
/**
 * Update round win status and rewards
 */
async function updateUserRoundRewards(telegramId, roundId, won, rewardsClaimed, orbRewards) {
    await (0, database_1.runQuery)(`
    UPDATE user_rounds
    SET won = ?, rewards_claimed = ?, orb_rewards = ?
    WHERE telegram_id = ? AND round_id = ?
  `, [won ? 1 : 0, rewardsClaimed, orbRewards, telegramId, roundId]);
    logger_1.default.debug(`[User Rounds] Updated round ${roundId} rewards for ${telegramId}: ${rewardsClaimed} SOL, ${orbRewards} ORB`);
}
/**
 * Get user's recent rounds
 */
async function getUserRecentRounds(telegramId, limit = 10) {
    const rows = await (0, database_1.allQuery)(`
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
async function getUserRoundStats(telegramId) {
    const stats = await (0, database_1.getQuery)(`
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
async function getUserRound(telegramId, roundId) {
    const row = await (0, database_1.getQuery)(`
    SELECT * FROM user_rounds
    WHERE telegram_id = ? AND round_id = ?
  `, [telegramId, roundId]);
    return row ? convertRoundFromDb(row) : null;
}
/**
 * Convert database row to UserRound object
 */
function convertRoundFromDb(row) {
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
function formatRecentRoundsDisplay(rounds) {
    if (rounds.length === 0) {
        return `
📜 *Recent Rounds*

No rounds participated yet.
`.trim();
    }
    const roundsList = rounds.map((round, index) => {
        const winStatus = round.won ? '✅ Won' : round.rewards_claimed > 0 ? '💰 Partial' : '❌ Lost';
        const rewards = round.rewards_claimed > 0 || round.orb_rewards > 0
            ? `\n  Rewards: ${(0, formatters_1.formatSOL)(round.rewards_claimed)} + ${(0, formatters_1.formatORB)(round.orb_rewards)}`
            : '';
        return `
${index + 1}. *Round #${round.round_id}* ${winStatus}
  Motherlode: ${(0, formatters_1.formatORB)(round.motherlode)}
  Deployed: ${(0, formatters_1.formatSOL)(round.deployed_sol)} (${round.squares_deployed} squares)
  Time: ${(0, formatters_1.formatTimestamp)(round.timestamp)}${rewards}`;
    }).join('\n');
    return `
📜 *Recent Rounds*

${roundsList}
`.trim();
}
/**
 * Format round stats for display
 */
function formatRoundStatsDisplay(stats) {
    return `
📊 *Round Statistics*

*Overall Performance:*
• Total Rounds: ${stats.totalRounds}
• Total Deployed: ${(0, formatters_1.formatSOL)(stats.totalDeployed)}
• Total Wins: ${stats.totalWins}
• Win Rate: ${stats.winRate.toFixed(1)}%

*Rewards Earned:*
• SOL Rewards: ${(0, formatters_1.formatSOL)(stats.totalRewardsSol)}
• ORB Rewards: ${(0, formatters_1.formatORB)(stats.totalRewardsOrb)}

*Averages:*
• Avg Deployment: ${(0, formatters_1.formatSOL)(stats.avgDeployment)}
• Avg Motherlode: ${(0, formatters_1.formatORB)(stats.avgMotherlode)}
`.trim();
}
/**
 * Get current round info from blockchain
 */
async function getCurrentRoundInfo() {
    try {
        const { fetchBoard, fetchRound } = await Promise.resolve().then(() => __importStar(require('../../src/utils/accounts')));
        // Fetch board to get current round ID and motherload
        const board = await fetchBoard();
        const roundId = Number(board.roundId);
        const motherlode = Number(board.motherload) / 1e9;
        // Fetch round details
        const round = await fetchRound(board.roundId);
        // Prize pool is the total ORB in the round
        const prizePool = motherlode;
        // Calculate time remaining (rounds are ~60 seconds)
        // This is approximate since we don't have exact timestamp
        const timeRemaining = 0; // TODO: Calculate based on block time
        // Participants count (if available from round data)
        const participants = 0; // TODO: Extract from round data if available
        logger_1.default.debug(`[User Rounds] Current round ${roundId}, motherload: ${motherlode.toFixed(2)} ORB`);
        return {
            roundId,
            motherlode,
            prizePool,
            timeRemaining,
            participants,
        };
    }
    catch (error) {
        logger_1.default.error('[User Rounds] Failed to get current round info:', error);
        return null;
    }
}
/**
 * Format current round info for display
 */
function formatCurrentRoundDisplay(roundInfo) {
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

*Prize Pool:* ${(0, formatters_1.formatORB)(roundInfo.prizePool)}
*Motherlode:* ${(0, formatters_1.formatORB)(roundInfo.motherlode)}
*Participants:* ${roundInfo.participants}
*Time Remaining:* ${timeRemainingStr}
`.trim();
}
//# sourceMappingURL=userRounds.js.map