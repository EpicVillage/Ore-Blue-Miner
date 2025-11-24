/**
 * User-specific blockchain operations for telegram bot users
 * Handles claiming, swapping, deploying for individual users
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
 * Claim SOL rewards from mining for a user
 */
export declare function claimUserSol(telegramId: string): Promise<ClaimResult>;
/**
 * Claim ORB rewards from mining for a user
 */
export declare function claimUserOrb(telegramId: string): Promise<ClaimResult>;
/**
 * Claim staking rewards for a user
 */
export declare function claimUserStakingRewards(telegramId: string): Promise<ClaimResult>;
/**
 * Swap ORB to SOL for a user
 */
export declare function swapUserOrbToSol(telegramId: string, amount: number): Promise<SwapResult>;
/**
 * Deploy SOL to current round for a user
 */
export declare function deployUserSol(telegramId: string, amount: number): Promise<DeployResult>;
/**
 * Get claimable rewards for a user
 */
export declare function getUserClaimableRewards(telegramId: string): Promise<{
    miningSol: number;
    miningOrb: number;
    stakingSol: number;
    stakingOrb: number;
    totalSol: number;
    totalOrb: number;
}>;
//# sourceMappingURL=userOperations.d.ts.map