import { Keypair } from '@solana/web3.js';
/**
 * User Wallet Utilities
 *
 * Provides wallet operations for specific Telegram users
 */
/**
 * Get wallet keypair for a user
 */
export declare function getUserWallet(telegramId: string): Promise<Keypair | null>;
/**
 * Get SOL balance for a user's wallet
 */
export declare function getUserSolBalance(telegramId: string): Promise<number>;
/**
 * Get ORB balance for a user's wallet
 */
export declare function getUserOrbBalance(telegramId: string): Promise<number>;
/**
 * Get both SOL and ORB balances for a user
 */
export declare function getUserBalances(telegramId: string): Promise<{
    sol: number;
    orb: number;
    solBalance?: number;
    orbBalance?: number;
}>;
/**
 * Validate a private key and return public key if valid
 */
export declare function validatePrivateKey(privateKey: string): {
    valid: boolean;
    publicKey?: string;
    error?: string;
};
//# sourceMappingURL=userWallet.d.ts.map