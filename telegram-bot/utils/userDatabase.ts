import { initializeDatabase, runQuery, getQuery, allQuery } from '../../src/utils/database';
import crypto from 'crypto';
import logger from '../../src/utils/logger';

/**
 * Telegram User Database Management
 *
 * Handles storage and retrieval of user-specific wallet data
 * with encrypted private key storage
 */

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const ENCRYPTION_KEY = process.env.TELEGRAM_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');

// Ensure encryption key is 32 bytes
const getEncryptionKey = (): Buffer => {
  const key = Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex');
  if (key.length !== 32) {
    throw new Error('Encryption key must be 32 bytes');
  }
  return key;
};

/**
 * Derive a user-specific encryption key using HMAC
 * This provides per-user key isolation - if one user's key is compromised, others remain secure
 */
function deriveUserEncryptionKey(telegramId: string): Buffer {
  return crypto.createHmac('sha256', getEncryptionKey())
    .update(telegramId)
    .digest();
}

/**
 * Encrypt a private key for secure storage (v2 - per-user keys)
 */
export function encryptPrivateKey(privateKey: string, telegramId: string): string {
  const iv = crypto.randomBytes(16);
  const userKey = deriveUserEncryptionKey(telegramId);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, userKey, iv);

  let encrypted = cipher.update(privateKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Return: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt a private key from storage
 * Supports both v1 (global key) and v2 (per-user key) for backward compatibility
 */
export function decryptPrivateKey(encryptedData: string, telegramId: string, keyVersion: number = 2): string {
  const parts = encryptedData.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }

  const [ivHex, authTagHex, encrypted] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  // Select decryption key based on version
  let decryptionKey: Buffer;
  if (keyVersion === 1) {
    // Legacy: use global key for existing users
    decryptionKey = getEncryptionKey();
  } else {
    // New: use per-user derived key
    decryptionKey = deriveUserEncryptionKey(telegramId);
  }

  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, decryptionKey, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

export interface TelegramUser {
  telegram_id: string;
  username?: string;
  private_key_encrypted: string;
  public_key: string;
  created_at: number;
  last_active: number;
  key_version: number; // 1 = global key (legacy), 2 = per-user key (new)
}

/**
 * Initialize telegram users table
 */
export async function initializeTelegramUsersTable(): Promise<void> {
  await runQuery(`
    CREATE TABLE IF NOT EXISTS telegram_users (
      telegram_id TEXT PRIMARY KEY,
      username TEXT,
      private_key_encrypted TEXT NOT NULL,
      public_key TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_active INTEGER NOT NULL,
      key_version INTEGER DEFAULT 1
    )
  `);

  // Migration: Add key_version column to existing tables
  try {
    await runQuery(`
      ALTER TABLE telegram_users ADD COLUMN key_version INTEGER DEFAULT 1
    `);
    logger.info('[Telegram DB] Added key_version column for encryption migration');
  } catch (error) {
    // Column already exists, ignore error
  }

  logger.info('[Telegram DB] Users table initialized');
}

/**
 * Get user by Telegram ID
 */
export async function getUser(telegramId: string): Promise<TelegramUser | null> {
  const row = await getQuery<TelegramUser>(`
    SELECT * FROM telegram_users WHERE telegram_id = ?
  `, [telegramId]);

  return row || null;
}

/**
 * Create or update user
 */
export async function saveUser(
  telegramId: string,
  privateKey: string,
  publicKey: string,
  username?: string
): Promise<void> {
  const encryptedKey = encryptPrivateKey(privateKey, telegramId);
  const now = Date.now();

  await runQuery(`
    INSERT INTO telegram_users (telegram_id, username, private_key_encrypted, public_key, created_at, last_active, key_version)
    VALUES (?, ?, ?, ?, ?, ?, 2)
    ON CONFLICT(telegram_id) DO UPDATE SET
      username = excluded.username,
      private_key_encrypted = excluded.private_key_encrypted,
      public_key = excluded.public_key,
      last_active = excluded.last_active,
      key_version = 2
  `, [telegramId, username || null, encryptedKey, publicKey, now, now]);

  logger.info(`[Telegram DB] User saved: ${telegramId} (${publicKey}) with key_version=2`);
}

/**
 * Update user's last active timestamp
 */
export async function updateLastActive(telegramId: string): Promise<void> {
  await runQuery(`
    UPDATE telegram_users SET last_active = ? WHERE telegram_id = ?
  `, [Date.now(), telegramId]);
}

/**
 * Delete user
 */
export async function deleteUser(telegramId: string): Promise<void> {
  await runQuery(`
    DELETE FROM telegram_users WHERE telegram_id = ?
  `, [telegramId]);

  logger.info(`[Telegram DB] User deleted: ${telegramId}`);
}

/**
 * Get decrypted private key for a user
 * Automatically migrates v1 (global key) users to v2 (per-user key) on first access
 */
export async function getUserPrivateKey(telegramId: string): Promise<string | null> {
  const user = await getUser(telegramId);
  if (!user) {
    return null;
  }

  try {
    // Decrypt using the appropriate key version
    const privateKey = decryptPrivateKey(user.private_key_encrypted, telegramId, user.key_version);

    // Auto-migration: If user is on v1 (global key), upgrade to v2 (per-user key)
    if (user.key_version === 1) {
      logger.info(`[Telegram DB] Migrating user ${telegramId} from key_version 1 to 2`);

      // Re-encrypt with per-user key
      const newEncryptedKey = encryptPrivateKey(privateKey, telegramId);

      // Update database with new encrypted key and version
      await runQuery(`
        UPDATE telegram_users
        SET private_key_encrypted = ?, key_version = 2
        WHERE telegram_id = ?
      `, [newEncryptedKey, telegramId]);

      logger.info(`[Telegram DB] Successfully migrated user ${telegramId} to key_version 2`);
    }

    return privateKey;
  } catch (error) {
    logger.error(`[Telegram DB] Failed to decrypt private key for ${telegramId}:`, error);
    return null;
  }
}

/**
 * Get total number of users
 */
export async function getUserCount(): Promise<number> {
  const result = await getQuery<{ count: number }>(`
    SELECT COUNT(*) as count FROM telegram_users
  `);

  return result?.count || 0;
}
