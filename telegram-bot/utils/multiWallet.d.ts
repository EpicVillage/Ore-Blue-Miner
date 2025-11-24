import { Keypair } from '@solana/web3.js';
/**
 * Multi-wallet management for telegram bot users
 * Allows users to manage multiple wallets and switch between them
 */
export interface UserWallet {
    id: number;
    telegram_id: string;
    wallet_name: string;
    private_key_encrypted: string;
    public_key: string;
    is_active: boolean;
    created_at: number;
    last_used: number;
}
/**
 * Add a new wallet for a user
 */
export declare function addUserWallet(telegramId: string, walletName: string, privateKey: string, publicKey: string, setAsActive?: boolean): Promise<{
    success: boolean;
    error?: string;
}>;
/**
 * Get all wallets for a user
 */
export declare function getUserWallets(telegramId: string): Promise<UserWallet[]>;
/**
 * Get active wallet for a user
 */
export declare function getActiveWallet(telegramId: string): Promise<UserWallet | null>;
/**
 * Get wallet by ID
 */
export declare function getWalletById(walletId: number): Promise<UserWallet | null>;
/**
 * Switch active wallet
 */
export declare function switchActiveWallet(telegramId: string, walletId: number): Promise<{
    success: boolean;
    error?: string;
}>;
/**
 * Remove a wallet
 */
export declare function removeWallet(telegramId: string, walletId: number): Promise<{
    success: boolean;
    error?: string;
}>;
/**
 * Rename a wallet
 */
export declare function renameWallet(telegramId: string, walletId: number, newName: string): Promise<{
    success: boolean;
    error?: string;
}>;
/**
 * Get decrypted keypair for active wallet
 */
export declare function getActiveWalletKeypair(telegramId: string): Promise<Keypair | null>;
/**
 * Update last used timestamp
 */
export declare function updateWalletLastUsed(walletId: number): Promise<void>;
/**
 * Format wallets list for display
 */
export declare function formatWalletsDisplay(wallets: UserWallet[]): string;
/**
 * Migrate existing telegram_users to user_wallets
 */
export declare function migrateExistingUsersToMultiWallet(): Promise<void>;
//# sourceMappingURL=multiWallet.d.ts.map