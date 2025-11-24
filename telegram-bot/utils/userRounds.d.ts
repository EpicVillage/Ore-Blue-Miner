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
export declare function recordUserRound(telegramId: string, roundId: number, motherlode: number, deployedSol: number, squaresDeployed: number): Promise<void>;
/**
 * Update round win status and rewards
 */
export declare function updateUserRoundRewards(telegramId: string, roundId: number, won: boolean, rewardsClaimed: number, orbRewards: number): Promise<void>;
/**
 * Get user's recent rounds
 */
export declare function getUserRecentRounds(telegramId: string, limit?: number): Promise<UserRound[]>;
/**
 * Get user's round statistics
 */
export declare function getUserRoundStats(telegramId: string): Promise<{
    totalRounds: number;
    totalDeployed: number;
    totalWins: number;
    totalRewardsSol: number;
    totalRewardsOrb: number;
    winRate: number;
    avgDeployment: number;
    avgMotherlode: number;
}>;
/**
 * Get specific round info for user
 */
export declare function getUserRound(telegramId: string, roundId: number): Promise<UserRound | null>;
/**
 * Format recent rounds for display
 */
export declare function formatRecentRoundsDisplay(rounds: UserRound[]): string;
/**
 * Format round stats for display
 */
export declare function formatRoundStatsDisplay(stats: {
    totalRounds: number;
    totalDeployed: number;
    totalWins: number;
    totalRewardsSol: number;
    totalRewardsOrb: number;
    winRate: number;
    avgDeployment: number;
    avgMotherlode: number;
}): string;
/**
 * Get current round info from blockchain
 */
export declare function getCurrentRoundInfo(): Promise<{
    roundId: number;
    motherlode: number;
    prizePool: number;
    timeRemaining: number;
    participants: number;
} | null>;
/**
 * Format current round info for display
 */
export declare function formatCurrentRoundDisplay(roundInfo: {
    roundId: number;
    motherlode: number;
    prizePool: number;
    timeRemaining: number;
    participants: number;
} | null): string;
//# sourceMappingURL=userRounds.d.ts.map