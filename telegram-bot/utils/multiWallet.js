"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addUserWallet = addUserWallet;
exports.getUserWallets = getUserWallets;
exports.getActiveWallet = getActiveWallet;
exports.getWalletById = getWalletById;
exports.switchActiveWallet = switchActiveWallet;
exports.removeWallet = removeWallet;
exports.renameWallet = renameWallet;
exports.getActiveWalletKeypair = getActiveWalletKeypair;
exports.updateWalletLastUsed = updateWalletLastUsed;
exports.formatWalletsDisplay = formatWalletsDisplay;
exports.migrateExistingUsersToMultiWallet = migrateExistingUsersToMultiWallet;
const database_1 = require("../../src/utils/database");
const userDatabase_1 = require("./userDatabase");
const logger_1 = __importDefault(require("../../src/utils/logger"));
const web3_js_1 = require("@solana/web3.js");
const bs58_1 = __importDefault(require("bs58"));
/**
 * Add a new wallet for a user
 */
async function addUserWallet(telegramId, walletName, privateKey, publicKey, setAsActive = false) {
    try {
        // Check if wallet name already exists for this user
        const existing = await (0, database_1.getQuery)(`
      SELECT COUNT(*) as count FROM user_wallets
      WHERE telegram_id = ? AND wallet_name = ?
    `, [telegramId, walletName]);
        if (existing && existing.count > 0) {
            return { success: false, error: 'Wallet name already exists' };
        }
        // Check if this public key already exists for this user
        const existingPubkey = await (0, database_1.getQuery)(`
      SELECT COUNT(*) as count FROM user_wallets
      WHERE telegram_id = ? AND public_key = ?
    `, [telegramId, publicKey]);
        if (existingPubkey && existingPubkey.count > 0) {
            return { success: false, error: 'This wallet is already added' };
        }
        const encryptedKey = (0, userDatabase_1.encryptPrivateKey)(privateKey);
        const isActive = setAsActive ? 1 : 0;
        // If setting as active, deactivate all other wallets first
        if (setAsActive) {
            await (0, database_1.runQuery)(`
        UPDATE user_wallets SET is_active = 0 WHERE telegram_id = ?
      `, [telegramId]);
        }
        await (0, database_1.runQuery)(`
      INSERT INTO user_wallets (telegram_id, wallet_name, private_key_encrypted, public_key, is_active, created_at, last_used)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [telegramId, walletName, encryptedKey, publicKey, isActive, Date.now(), Date.now()]);
        logger_1.default.info(`[Multi-Wallet] Added wallet "${walletName}" for ${telegramId}`);
        return { success: true };
    }
    catch (error) {
        logger_1.default.error('[Multi-Wallet] Failed to add wallet:', error);
        return { success: false, error: error.message };
    }
}
/**
 * Get all wallets for a user
 */
async function getUserWallets(telegramId) {
    const rows = await (0, database_1.allQuery)(`
    SELECT * FROM user_wallets
    WHERE telegram_id = ?
    ORDER BY is_active DESC, last_used DESC
  `, [telegramId]);
    return rows.map(convertWalletFromDb);
}
/**
 * Get active wallet for a user
 */
async function getActiveWallet(telegramId) {
    const row = await (0, database_1.getQuery)(`
    SELECT * FROM user_wallets
    WHERE telegram_id = ? AND is_active = 1
    LIMIT 1
  `, [telegramId]);
    return row ? convertWalletFromDb(row) : null;
}
/**
 * Get wallet by ID
 */
async function getWalletById(walletId) {
    const row = await (0, database_1.getQuery)(`
    SELECT * FROM user_wallets WHERE id = ?
  `, [walletId]);
    return row ? convertWalletFromDb(row) : null;
}
/**
 * Switch active wallet
 */
async function switchActiveWallet(telegramId, walletId) {
    try {
        // Verify wallet belongs to user
        const wallet = await getWalletById(walletId);
        if (!wallet || wallet.telegram_id !== telegramId) {
            return { success: false, error: 'Wallet not found' };
        }
        // Deactivate all wallets for this user
        await (0, database_1.runQuery)(`
      UPDATE user_wallets SET is_active = 0 WHERE telegram_id = ?
    `, [telegramId]);
        // Activate the selected wallet
        await (0, database_1.runQuery)(`
      UPDATE user_wallets SET is_active = 1, last_used = ? WHERE id = ?
    `, [Date.now(), walletId]);
        logger_1.default.info(`[Multi-Wallet] Switched active wallet to "${wallet.wallet_name}" for ${telegramId}`);
        return { success: true };
    }
    catch (error) {
        logger_1.default.error('[Multi-Wallet] Failed to switch wallet:', error);
        return { success: false, error: error.message };
    }
}
/**
 * Remove a wallet
 */
async function removeWallet(telegramId, walletId) {
    try {
        // Verify wallet belongs to user
        const wallet = await getWalletById(walletId);
        if (!wallet || wallet.telegram_id !== telegramId) {
            return { success: false, error: 'Wallet not found' };
        }
        // Check if it's the only wallet
        const wallets = await getUserWallets(telegramId);
        if (wallets.length === 1) {
            return { success: false, error: 'Cannot remove the only wallet. Add another wallet first.' };
        }
        // If removing active wallet, activate another one
        if (wallet.is_active) {
            const otherWallet = wallets.find(w => w.id !== walletId);
            if (otherWallet) {
                await (0, database_1.runQuery)(`
          UPDATE user_wallets SET is_active = 1 WHERE id = ?
        `, [otherWallet.id]);
            }
        }
        await (0, database_1.runQuery)(`
      DELETE FROM user_wallets WHERE id = ?
    `, [walletId]);
        logger_1.default.info(`[Multi-Wallet] Removed wallet "${wallet.wallet_name}" for ${telegramId}`);
        return { success: true };
    }
    catch (error) {
        logger_1.default.error('[Multi-Wallet] Failed to remove wallet:', error);
        return { success: false, error: error.message };
    }
}
/**
 * Rename a wallet
 */
async function renameWallet(telegramId, walletId, newName) {
    try {
        // Verify wallet belongs to user
        const wallet = await getWalletById(walletId);
        if (!wallet || wallet.telegram_id !== telegramId) {
            return { success: false, error: 'Wallet not found' };
        }
        // Check if new name already exists
        const existing = await (0, database_1.getQuery)(`
      SELECT COUNT(*) as count FROM user_wallets
      WHERE telegram_id = ? AND wallet_name = ? AND id != ?
    `, [telegramId, newName, walletId]);
        if (existing && existing.count > 0) {
            return { success: false, error: 'Wallet name already exists' };
        }
        await (0, database_1.runQuery)(`
      UPDATE user_wallets SET wallet_name = ? WHERE id = ?
    `, [newName, walletId]);
        logger_1.default.info(`[Multi-Wallet] Renamed wallet ${walletId} to "${newName}" for ${telegramId}`);
        return { success: true };
    }
    catch (error) {
        logger_1.default.error('[Multi-Wallet] Failed to rename wallet:', error);
        return { success: false, error: error.message };
    }
}
/**
 * Get decrypted keypair for active wallet
 */
async function getActiveWalletKeypair(telegramId) {
    try {
        const wallet = await getActiveWallet(telegramId);
        if (!wallet) {
            return null;
        }
        const privateKey = (0, userDatabase_1.decryptPrivateKey)(wallet.private_key_encrypted);
        // Try to parse as base58 first
        try {
            const secretKey = bs58_1.default.decode(privateKey);
            return web3_js_1.Keypair.fromSecretKey(secretKey);
        }
        catch {
            // Try as JSON array
            const secretKey = Uint8Array.from(JSON.parse(privateKey));
            return web3_js_1.Keypair.fromSecretKey(secretKey);
        }
    }
    catch (error) {
        logger_1.default.error('[Multi-Wallet] Failed to get keypair:', error);
        return null;
    }
}
/**
 * Update last used timestamp
 */
async function updateWalletLastUsed(walletId) {
    await (0, database_1.runQuery)(`
    UPDATE user_wallets SET last_used = ? WHERE id = ?
  `, [Date.now(), walletId]);
}
/**
 * Convert database row to UserWallet object
 */
function convertWalletFromDb(row) {
    return {
        id: row.id,
        telegram_id: row.telegram_id,
        wallet_name: row.wallet_name,
        private_key_encrypted: row.private_key_encrypted,
        public_key: row.public_key,
        is_active: row.is_active === 1,
        created_at: row.created_at,
        last_used: row.last_used,
    };
}
/**
 * Format wallets list for display
 */
function formatWalletsDisplay(wallets) {
    if (wallets.length === 0) {
        return '💼 *Your Wallets*\n\nNo wallets found.';
    }
    const walletsList = wallets.map((wallet, index) => {
        const activeIndicator = wallet.is_active ? '✅ ' : '  ';
        const publicKeyShort = `${wallet.public_key.slice(0, 4)}...${wallet.public_key.slice(-4)}`;
        const lastUsed = new Date(wallet.last_used).toLocaleDateString();
        return `${activeIndicator}${index + 1}. *${wallet.wallet_name}*
   \`${publicKeyShort}\`
   Last used: ${lastUsed}`;
    }).join('\n\n');
    return `💼 *Your Wallets* (${wallets.length})

${walletsList}

${wallets.length < 5 ? '\n💡 You can add up to 5 wallets.' : '⚠️ Maximum wallets reached (5).'}`;
}
/**
 * Migrate existing telegram_users to user_wallets
 */
async function migrateExistingUsersToMultiWallet() {
    try {
        logger_1.default.info('[Multi-Wallet] Starting migration of existing users...');
        // Get all users from telegram_users table
        const users = await (0, database_1.allQuery)(`
      SELECT telegram_id, username, private_key_encrypted, public_key, created_at
      FROM telegram_users
    `);
        for (const user of users) {
            // Check if user already has wallets in user_wallets
            const existingWallets = await getUserWallets(user.telegram_id);
            if (existingWallets.length === 0) {
                // Migrate to user_wallets as "Main Wallet"
                await (0, database_1.runQuery)(`
          INSERT INTO user_wallets (telegram_id, wallet_name, private_key_encrypted, public_key, is_active, created_at, last_used)
          VALUES (?, ?, ?, ?, 1, ?, ?)
        `, [user.telegram_id, 'Main Wallet', user.private_key_encrypted, user.public_key, user.created_at, user.created_at]);
                logger_1.default.info(`[Multi-Wallet] Migrated user ${user.telegram_id} to multi-wallet`);
            }
        }
        logger_1.default.info('[Multi-Wallet] Migration complete');
    }
    catch (error) {
        logger_1.default.error('[Multi-Wallet] Migration failed:', error);
    }
}
//# sourceMappingURL=multiWallet.js.map