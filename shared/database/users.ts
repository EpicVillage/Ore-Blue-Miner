import { runQuery, getQuery, allQuery } from '../../src/utils/database';
import crypto from 'crypto';
import logger from '../../src/utils/logger';

/**
 * Unified User Management for Multi-Platform Support
 *
 * Supports Telegram, Discord, and future platforms.
 * Users can link multiple platforms to the same wallet.
 */

export type Platform = 'telegram' | 'discord';

export interface PlatformUser {
  platform: Platform;
  platform_id: string;
  username?: string;
  public_key: string;
  private_key_encrypted: string;
  key_version: number;
  created_at: number;
  last_active: number;
}

export interface LinkedAccount {
  telegram_id: string | null;
  discord_id: string | null;
  link_code: string | null;
  linked_at: number | null;
}

// Encryption setup
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const ENCRYPTION_KEY = process.env.TELEGRAM_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');

const getEncryptionKey = (): Buffer => {
  const key = Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex');
  if (key.length !== 32) {
    throw new Error('Encryption key must be 32 bytes');
  }
  return key;
};

/**
 * Derive a user-specific encryption key using HMAC
 */
function deriveUserEncryptionKey(userId: string): Buffer {
  return crypto.createHmac('sha256', getEncryptionKey())
    .update(userId)
    .digest();
}

/**
 * Encrypt a private key for secure storage
 */
export function encryptPrivateKey(privateKey: string, userId: string): string {
  const iv = crypto.randomBytes(16);
  const userKey = deriveUserEncryptionKey(userId);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, userKey, iv);

  let encrypted = cipher.update(privateKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt a private key from storage
 */
export function decryptPrivateKey(encryptedData: string, userId: string, keyVersion: number = 2): string {
  const parts = encryptedData.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }

  const [ivHex, authTagHex, encrypted] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  let decryptionKey: Buffer;
  if (keyVersion === 1) {
    decryptionKey = getEncryptionKey();
  } else {
    decryptionKey = deriveUserEncryptionKey(userId);
  }

  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, decryptionKey, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Initialize linked_accounts table for cross-platform linking
 */
export async function initializeLinkedAccountsTable(): Promise<void> {
  await runQuery(`
    CREATE TABLE IF NOT EXISTS linked_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT UNIQUE,
      discord_id TEXT UNIQUE,
      link_code TEXT,
      link_code_expires INTEGER,
      linked_at INTEGER,
      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
    )
  `);

  await runQuery(`CREATE INDEX IF NOT EXISTS idx_linked_telegram ON linked_accounts(telegram_id)`);
  await runQuery(`CREATE INDEX IF NOT EXISTS idx_linked_discord ON linked_accounts(discord_id)`);
  await runQuery(`CREATE INDEX IF NOT EXISTS idx_link_code ON linked_accounts(link_code)`);

  logger.info('[Shared DB] Linked accounts table initialized');
}

/**
 * Initialize Discord users table
 */
export async function initializeDiscordUsersTable(): Promise<void> {
  await runQuery(`
    CREATE TABLE IF NOT EXISTS discord_users (
      discord_id TEXT PRIMARY KEY,
      username TEXT,
      private_key_encrypted TEXT NOT NULL,
      public_key TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_active INTEGER NOT NULL,
      key_version INTEGER DEFAULT 2
    )
  `);

  logger.info('[Shared DB] Discord users table initialized');
}

/**
 * Get the table name for a platform
 */
function getTableName(platform: Platform): string {
  return platform === 'telegram' ? 'telegram_users' : 'discord_users';
}

/**
 * Get the ID column name for a platform
 */
function getIdColumn(platform: Platform): string {
  return platform === 'telegram' ? 'telegram_id' : 'discord_id';
}

/**
 * Get user by platform and ID
 */
export async function getUser(platform: Platform, platformId: string): Promise<PlatformUser | null> {
  const table = getTableName(platform);
  const idColumn = getIdColumn(platform);

  const row = await getQuery<any>(`
    SELECT * FROM ${table} WHERE ${idColumn} = ?
  `, [platformId]);

  if (!row) return null;

  return {
    platform,
    platform_id: row[idColumn],
    username: row.username,
    public_key: row.public_key,
    private_key_encrypted: row.private_key_encrypted,
    key_version: row.key_version || 1,
    created_at: row.created_at,
    last_active: row.last_active,
  };
}

/**
 * Save user for any platform
 */
export async function saveUser(
  platform: Platform,
  platformId: string,
  privateKey: string,
  publicKey: string,
  username?: string
): Promise<void> {
  const table = getTableName(platform);
  const idColumn = getIdColumn(platform);
  const encryptedKey = encryptPrivateKey(privateKey, platformId);
  const now = Date.now();

  await runQuery(`
    INSERT INTO ${table} (${idColumn}, username, private_key_encrypted, public_key, created_at, last_active, key_version)
    VALUES (?, ?, ?, ?, ?, ?, 2)
    ON CONFLICT(${idColumn}) DO UPDATE SET
      username = excluded.username,
      private_key_encrypted = excluded.private_key_encrypted,
      public_key = excluded.public_key,
      last_active = excluded.last_active,
      key_version = 2
  `, [platformId, username || null, encryptedKey, publicKey, now, now]);

  logger.info(`[Shared DB] User saved: ${platform}:${platformId} (${publicKey})`);
}

/**
 * Update user's last active timestamp
 */
export async function updateLastActive(platform: Platform, platformId: string): Promise<void> {
  const table = getTableName(platform);
  const idColumn = getIdColumn(platform);

  await runQuery(`
    UPDATE ${table} SET last_active = ? WHERE ${idColumn} = ?
  `, [Date.now(), platformId]);
}

/**
 * Delete user
 */
export async function deleteUser(platform: Platform, platformId: string): Promise<void> {
  const table = getTableName(platform);
  const idColumn = getIdColumn(platform);

  await runQuery(`
    DELETE FROM ${table} WHERE ${idColumn} = ?
  `, [platformId]);

  logger.info(`[Shared DB] User deleted: ${platform}:${platformId}`);
}

/**
 * Get decrypted private key for a user
 */
export async function getUserPrivateKey(platform: Platform, platformId: string): Promise<string | null> {
  const user = await getUser(platform, platformId);
  if (!user) return null;

  try {
    const keyVersion = user.key_version || 1;
    const privateKey = decryptPrivateKey(user.private_key_encrypted, platformId, keyVersion);

    // Auto-migration to v2 encryption
    if (keyVersion === 1) {
      const table = getTableName(platform);
      const idColumn = getIdColumn(platform);
      const newEncryptedKey = encryptPrivateKey(privateKey, platformId);

      await runQuery(`
        UPDATE ${table}
        SET private_key_encrypted = ?, key_version = 2
        WHERE ${idColumn} = ?
      `, [newEncryptedKey, platformId]);

      logger.info(`[Shared DB] Migrated ${platform}:${platformId} to key_version 2`);
    }

    return privateKey;
  } catch (error) {
    logger.error(`[Shared DB] Failed to decrypt private key for ${platform}:${platformId}:`, error);
    return null;
  }
}

/**
 * Generate a link code for account linking
 */
export async function generateLinkCode(platform: Platform, platformId: string): Promise<string> {
  const linkCode = crypto.randomBytes(4).toString('hex').toUpperCase(); // 8 character code
  const expiresAt = Date.now() + (15 * 60 * 1000); // 15 minutes

  const idColumn = getIdColumn(platform);
  const otherIdColumn = platform === 'telegram' ? 'discord_id' : 'telegram_id';

  // Check if user already has a linked account entry
  const existing = await getQuery<any>(`
    SELECT * FROM linked_accounts WHERE ${idColumn} = ?
  `, [platformId]);

  if (existing) {
    // Update existing entry with new link code
    await runQuery(`
      UPDATE linked_accounts
      SET link_code = ?, link_code_expires = ?
      WHERE ${idColumn} = ?
    `, [linkCode, expiresAt, platformId]);
  } else {
    // Create new entry
    await runQuery(`
      INSERT INTO linked_accounts (${idColumn}, link_code, link_code_expires)
      VALUES (?, ?, ?)
    `, [platformId, linkCode, expiresAt]);
  }

  logger.info(`[Shared DB] Generated link code for ${platform}:${platformId}: ${linkCode}`);
  return linkCode;
}

/**
 * Link accounts using a link code
 */
export async function linkAccounts(
  platform: Platform,
  platformId: string,
  linkCode: string
): Promise<{ success: boolean; error?: string; linkedTo?: string }> {
  const idColumn = getIdColumn(platform);
  const otherIdColumn = platform === 'telegram' ? 'discord_id' : 'telegram_id';
  const otherPlatform = platform === 'telegram' ? 'discord' : 'telegram';

  // Find the link code (from the other platform)
  const linkEntry = await getQuery<any>(`
    SELECT * FROM linked_accounts
    WHERE link_code = ? AND link_code_expires > ? AND ${otherIdColumn} IS NOT NULL
  `, [linkCode.toUpperCase(), Date.now()]);

  if (!linkEntry) {
    return { success: false, error: 'Invalid or expired link code' };
  }

  const otherPlatformId = linkEntry[otherIdColumn];

  // Check if this platform account is already linked
  const existingLink = await getQuery<any>(`
    SELECT * FROM linked_accounts WHERE ${idColumn} = ?
  `, [platformId]);

  if (existingLink && existingLink[otherIdColumn]) {
    return { success: false, error: 'Your account is already linked to another account' };
  }

  // Update the link entry to include this platform
  await runQuery(`
    UPDATE linked_accounts
    SET ${idColumn} = ?, link_code = NULL, link_code_expires = NULL, linked_at = ?
    WHERE ${otherIdColumn} = ?
  `, [platformId, Date.now(), otherPlatformId]);

  // Delete any orphaned entry for this platform (if exists)
  if (existingLink && existingLink.id !== linkEntry.id) {
    await runQuery(`DELETE FROM linked_accounts WHERE id = ?`, [existingLink.id]);
  }

  logger.info(`[Shared DB] Linked ${platform}:${platformId} to ${otherPlatform}:${otherPlatformId}`);

  return { success: true, linkedTo: otherPlatformId };
}

/**
 * Get linked account for a user
 */
export async function getLinkedAccount(platform: Platform, platformId: string): Promise<LinkedAccount | null> {
  const idColumn = getIdColumn(platform);

  const row = await getQuery<any>(`
    SELECT telegram_id, discord_id, link_code, linked_at
    FROM linked_accounts
    WHERE ${idColumn} = ?
  `, [platformId]);

  if (!row) return null;

  return {
    telegram_id: row.telegram_id,
    discord_id: row.discord_id,
    link_code: row.link_code,
    linked_at: row.linked_at,
  };
}

/**
 * Unlink accounts
 */
export async function unlinkAccounts(platform: Platform, platformId: string): Promise<boolean> {
  const idColumn = getIdColumn(platform);
  const otherIdColumn = platform === 'telegram' ? 'discord_id' : 'telegram_id';

  // Get the linked entry
  const entry = await getQuery<any>(`
    SELECT * FROM linked_accounts WHERE ${idColumn} = ?
  `, [platformId]);

  if (!entry || !entry[otherIdColumn]) {
    return false; // Not linked
  }

  // Remove this platform from the link (keep the other)
  await runQuery(`
    UPDATE linked_accounts
    SET ${idColumn} = NULL, linked_at = NULL
    WHERE ${idColumn} = ?
  `, [platformId]);

  logger.info(`[Shared DB] Unlinked ${platform}:${platformId}`);
  return true;
}

/**
 * Get the linked platform ID for settings/data sharing
 * If a Discord user is linked to Telegram, they share the Telegram user's data
 */
export async function getLinkedPlatformId(
  platform: Platform,
  platformId: string
): Promise<{ platform: Platform; platformId: string } | null> {
  const linked = await getLinkedAccount(platform, platformId);

  if (!linked || !linked.linked_at) {
    return null; // Not linked
  }

  // Return the other platform's ID
  if (platform === 'telegram' && linked.discord_id) {
    return { platform: 'discord', platformId: linked.discord_id };
  } else if (platform === 'discord' && linked.telegram_id) {
    return { platform: 'telegram', platformId: linked.telegram_id };
  }

  return null;
}

/**
 * Get total user count across all platforms
 */
export async function getTotalUserCount(): Promise<{ telegram: number; discord: number; linked: number }> {
  const telegramCount = await getQuery<{ count: number }>(`
    SELECT COUNT(*) as count FROM telegram_users
  `);

  const discordCount = await getQuery<{ count: number }>(`
    SELECT COUNT(*) as count FROM discord_users
  `);

  const linkedCount = await getQuery<{ count: number }>(`
    SELECT COUNT(*) as count FROM linked_accounts WHERE linked_at IS NOT NULL
  `);

  return {
    telegram: telegramCount?.count || 0,
    discord: discordCount?.count || 0,
    linked: linkedCount?.count || 0,
  };
}
