"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptPrivateKey = encryptPrivateKey;
exports.decryptPrivateKey = decryptPrivateKey;
exports.initializeTelegramUsersTable = initializeTelegramUsersTable;
exports.getUser = getUser;
exports.saveUser = saveUser;
exports.updateLastActive = updateLastActive;
exports.deleteUser = deleteUser;
exports.getUserPrivateKey = getUserPrivateKey;
exports.getUserCount = getUserCount;
const database_1 = require("../../src/utils/database");
const crypto_1 = __importDefault(require("crypto"));
const logger_1 = __importDefault(require("../../src/utils/logger"));
/**
 * Telegram User Database Management
 *
 * Handles storage and retrieval of user-specific wallet data
 * with encrypted private key storage
 */
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const ENCRYPTION_KEY = process.env.TELEGRAM_ENCRYPTION_KEY || crypto_1.default.randomBytes(32).toString('hex');
// Ensure encryption key is 32 bytes
const getEncryptionKey = () => {
    const key = Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex');
    if (key.length !== 32) {
        throw new Error('Encryption key must be 32 bytes');
    }
    return key;
};
/**
 * Encrypt a private key for secure storage
 */
function encryptPrivateKey(privateKey) {
    const iv = crypto_1.default.randomBytes(16);
    const cipher = crypto_1.default.createCipheriv(ENCRYPTION_ALGORITHM, getEncryptionKey(), iv);
    let encrypted = cipher.update(privateKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    // Return: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}
/**
 * Decrypt a private key from storage
 */
function decryptPrivateKey(encryptedData) {
    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
        throw new Error('Invalid encrypted data format');
    }
    const [ivHex, authTagHex, encrypted] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto_1.default.createDecipheriv(ENCRYPTION_ALGORITHM, getEncryptionKey(), iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}
/**
 * Initialize telegram users table
 */
async function initializeTelegramUsersTable() {
    await (0, database_1.runQuery)(`
    CREATE TABLE IF NOT EXISTS telegram_users (
      telegram_id TEXT PRIMARY KEY,
      username TEXT,
      private_key_encrypted TEXT NOT NULL,
      public_key TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_active INTEGER NOT NULL
    )
  `);
    logger_1.default.info('[Telegram DB] Users table initialized');
}
/**
 * Get user by Telegram ID
 */
async function getUser(telegramId) {
    const row = await (0, database_1.getQuery)(`
    SELECT * FROM telegram_users WHERE telegram_id = ?
  `, [telegramId]);
    return row || null;
}
/**
 * Create or update user
 */
async function saveUser(telegramId, privateKey, publicKey, username) {
    const encryptedKey = encryptPrivateKey(privateKey);
    const now = Date.now();
    await (0, database_1.runQuery)(`
    INSERT INTO telegram_users (telegram_id, username, private_key_encrypted, public_key, created_at, last_active)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(telegram_id) DO UPDATE SET
      username = excluded.username,
      private_key_encrypted = excluded.private_key_encrypted,
      public_key = excluded.public_key,
      last_active = excluded.last_active
  `, [telegramId, username || null, encryptedKey, publicKey, now, now]);
    logger_1.default.info(`[Telegram DB] User saved: ${telegramId} (${publicKey})`);
}
/**
 * Update user's last active timestamp
 */
async function updateLastActive(telegramId) {
    await (0, database_1.runQuery)(`
    UPDATE telegram_users SET last_active = ? WHERE telegram_id = ?
  `, [Date.now(), telegramId]);
}
/**
 * Delete user
 */
async function deleteUser(telegramId) {
    await (0, database_1.runQuery)(`
    DELETE FROM telegram_users WHERE telegram_id = ?
  `, [telegramId]);
    logger_1.default.info(`[Telegram DB] User deleted: ${telegramId}`);
}
/**
 * Get decrypted private key for a user
 */
async function getUserPrivateKey(telegramId) {
    const user = await getUser(telegramId);
    if (!user) {
        return null;
    }
    try {
        return decryptPrivateKey(user.private_key_encrypted);
    }
    catch (error) {
        logger_1.default.error(`[Telegram DB] Failed to decrypt private key for ${telegramId}:`, error);
        return null;
    }
}
/**
 * Get total number of users
 */
async function getUserCount() {
    const result = await (0, database_1.getQuery)(`
    SELECT COUNT(*) as count FROM telegram_users
  `);
    return result?.count || 0;
}
//# sourceMappingURL=userDatabase.js.map