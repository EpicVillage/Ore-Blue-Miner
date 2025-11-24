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
export declare function getUserStakingInfo(telegramId: string): Promise<UserStakingInfo | null>;
/**
 * Create or update user staking record
 */
export declare function updateUserStakingInfo(telegramId: string, stakedAmount: number, accruedRewards: number): Promise<void>;
/**
 * Stake ORB for a user
 */
export declare function stakeUserOrb(telegramId: string, amount: number, dryRun?: boolean): Promise<{
    success: boolean;
    signature?: string;
    error?: string;
}>;
/**
 * Claim staking rewards for a user
 */
export declare function claimUserStakingRewards(telegramId: string, dryRun?: boolean): Promise<{
    success: boolean;
    amount?: number;
    signature?: string;
    error?: string;
}>;
/**
 * Get staking pool info from blockchain
 */
export declare function getStakingPoolInfo(): Promise<{
    totalStaked: number;
    rewardRate: number;
    poolAddress: string;
}>;
/**
 * Format staking info for display
 */
export declare function formatStakingDisplay(stakingInfo: UserStakingInfo | null, poolInfo?: {
    totalStaked: number;
    rewardRate: number;
}): string;
//# sourceMappingURL=userStaking.d.ts.map