/**
 * Encrypt a private key for secure storage
 */
export declare function encryptPrivateKey(privateKey: string): string;
/**
 * Decrypt a private key from storage
 */
export declare function decryptPrivateKey(encryptedData: string): string;
export interface TelegramUser {
    telegram_id: string;
    username?: string;
    private_key_encrypted: string;
    public_key: string;
    created_at: number;
    last_active: number;
}
/**
 * Initialize telegram users table
 */
export declare function initializeTelegramUsersTable(): Promise<void>;
/**
 * Get user by Telegram ID
 */
export declare function getUser(telegramId: string): Promise<TelegramUser | null>;
/**
 * Create or update user
 */
export declare function saveUser(telegramId: string, privateKey: string, publicKey: string, username?: string): Promise<void>;
/**
 * Update user's last active timestamp
 */
export declare function updateLastActive(telegramId: string): Promise<void>;
/**
 * Delete user
 */
export declare function deleteUser(telegramId: string): Promise<void>;
/**
 * Get decrypted private key for a user
 */
export declare function getUserPrivateKey(telegramId: string): Promise<string | null>;
/**
 * Get total number of users
 */
export declare function getUserCount(): Promise<number>;
//# sourceMappingURL=userDatabase.d.ts.map