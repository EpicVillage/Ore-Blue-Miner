import { Keypair } from '@solana/web3.js';
/**
 * Close automation account for a specific user
 */
export declare function closeUserAutomation(userWallet: Keypair, telegramId: string): Promise<{
    success: boolean;
    signature?: string;
    returnedSol?: number;
    error?: string;
}>;
/**
 * Create automation account for a specific user
 */
export declare function createUserAutomation(userWallet: Keypair, telegramId: string): Promise<{
    success: boolean;
    signature?: string;
    depositedSol?: number;
    targetRounds?: number;
    error?: string;
}>;
/**
 * Get automation status for a user
 */
export declare function getUserAutomationStatus(userWallet: Keypair): Promise<{
    active: boolean;
    balance?: number;
    costPerRound?: number;
    estimatedRounds?: number;
}>;
//# sourceMappingURL=userAutomation.d.ts.map