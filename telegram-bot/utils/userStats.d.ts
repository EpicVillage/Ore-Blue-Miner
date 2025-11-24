/**
 * User-specific stats and history utilities for Telegram bot
 */
/**
 * Get recent transactions for a specific wallet address
 */
export declare function getUserTransactions(walletAddress: string, limit?: number): Promise<any[]>;
/**
 * Get performance stats for a specific user
 */
export declare function getUserPerformanceStats(walletAddress: string): Promise<{
    totalTransactions: number;
    successfulTransactions: number;
    successRate: number;
    totalSolSpent: number;
    totalOrbEarned: number;
    totalFeesPaid: number;
    avgOrbPrice: number;
}>;
/**
 * Get mining stats for a specific user
 */
export declare function getUserMiningStats(walletAddress: string): Promise<{
    totalMines: number;
    successfulMines: number;
    totalOrbMined: number;
    avgOrbPerMine: number;
}>;
/**
 * Get claim stats for a specific user
 */
export declare function getUserClaimStats(walletAddress: string): Promise<{
    totalClaims: number;
    totalOrbClaimed: number;
    totalSolClaimed: number;
}>;
/**
 * Format transaction for display
 */
export declare function formatTransactionForDisplay(tx: any): string;
//# sourceMappingURL=userStats.d.ts.map