/**
 * User-specific PnL calculation and tracking
 * Calculates profit/loss for individual telegram users
 */
export interface UserPnLSummary {
    totalOrbEarned: number;
    totalOrbClaimed: number;
    totalSolClaimed: number;
    totalSwappedOrb: number;
    totalSwappedSol: number;
    totalSolDeployed: number;
    totalFeesPaid: number;
    totalProtocolFees: number;
    totalTxFees: number;
    currentOrbBalance: number;
    currentSolBalance: number;
    currentAutomationBalance: number;
    claimableSol: number;
    claimableOrb: number;
    netSolPnl: number;
    netOrbPnl: number;
    totalPnlSol: number;
    totalPnlUsd: number;
    roiPercent: number;
    roundsParticipated: number;
    totalTransactions: number;
    successfulTransactions: number;
    successRate: number;
    avgOrbPriceUsd: number;
    currentOrbPriceUsd: number;
}
/**
 * Calculate comprehensive PnL for a user
 */
export declare function calculateUserPnL(telegramId: string, publicKey: string, currentOrbBalance: number, currentSolBalance: number, currentAutomationBalance: number, claimableSol: number, claimableOrb: number, currentOrbPriceUsd: number): Promise<UserPnLSummary>;
/**
 * Format PnL summary for display
 */
export declare function formatPnLDisplay(pnl: UserPnLSummary): string;
/**
 * Record balance snapshot for historical tracking
 */
export declare function recordUserBalanceSnapshot(telegramId: string, solBalance: number, orbBalance: number, orbPriceUsd: number, automationSol?: number, claimableSol?: number, claimableOrb?: number, stakedOrb?: number): Promise<void>;
/**
 * Get balance history for a user
 */
export declare function getUserBalanceHistory(telegramId: string, limit?: number): Promise<any[]>;
//# sourceMappingURL=userPnL.d.ts.map