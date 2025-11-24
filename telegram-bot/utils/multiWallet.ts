import { runQuery, getQuery, allQuery } from '../../src/utils/database';
import { encryptPrivateKey, decryptPrivateKey } from './userDatabase';
import logger from '../../src/utils/logger';
import { Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';

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
export async function addUserWallet(
  telegramId: string,
  walletName: string,
  privateKey: string,
  publicKey: string,
  setAsActive: boolean = false
): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if wallet name already exists for this user
    const existing = await getQuery<{ count: number }>(`
      SELECT COUNT(*) as count FROM user_wallets
      WHERE telegram_id = ? AND wallet_name = ?
    `, [telegramId, walletName]);

    if (existing && existing.count > 0) {
      return { success: false, error: 'Wallet name already exists' };
    }

    // Check if this public key already exists for this user
    const existingPubkey = await getQuery<{ count: number }>(`
      SELECT COUNT(*) as count FROM user_wallets
      WHERE telegram_id = ? AND public_key = ?
    `, [telegramId, publicKey]);

    if (existingPubkey && existingPubkey.count > 0) {
      return { success: false, error: 'This wallet is already added' };
    }

    const encryptedKey = encryptPrivateKey(privateKey, telegramId);
    const isActive = setAsActive ? 1 : 0;

    // If setting as active, deactivate all other wallets first
    if (setAsActive) {
      await runQuery(`
        UPDATE user_wallets SET is_active = 0 WHERE telegram_id = ?
      `, [telegramId]);
    }

    await runQuery(`
      INSERT INTO user_wallets (telegram_id, wallet_name, private_key_encrypted, public_key, is_active, created_at, last_used)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [telegramId, walletName, encryptedKey, publicKey, isActive, Date.now(), Date.now()]);

    logger.info(`[Multi-Wallet] Added wallet "${walletName}" for ${telegramId}`);
    return { success: true };
  } catch (error: any) {
    logger.error('[Multi-Wallet] Failed to add wallet:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get all wallets for a user
 */
export async function getUserWallets(telegramId: string): Promise<UserWallet[]> {
  const rows = await allQuery<any>(`
    SELECT * FROM user_wallets
    WHERE telegram_id = ?
    ORDER BY is_active DESC, last_used DESC
  `, [telegramId]);

  return rows.map(convertWalletFromDb);
}

/**
 * Get active wallet for a user
 */
export async function getActiveWallet(telegramId: string): Promise<UserWallet | null> {
  const row = await getQuery<any>(`
    SELECT * FROM user_wallets
    WHERE telegram_id = ? AND is_active = 1
    LIMIT 1
  `, [telegramId]);

  return row ? convertWalletFromDb(row) : null;
}

/**
 * Get wallet by ID
 */
export async function getWalletById(walletId: number): Promise<UserWallet | null> {
  const row = await getQuery<any>(`
    SELECT * FROM user_wallets WHERE id = ?
  `, [walletId]);

  return row ? convertWalletFromDb(row) : null;
}

/**
 * Switch active wallet
 */
export async function switchActiveWallet(
  telegramId: string,
  walletId: number
): Promise<{ success: boolean; error?: string }> {
  try {
    // Verify wallet belongs to user
    const wallet = await getWalletById(walletId);
    if (!wallet || wallet.telegram_id !== telegramId) {
      return { success: false, error: 'Wallet not found' };
    }

    // Deactivate all wallets for this user
    await runQuery(`
      UPDATE user_wallets SET is_active = 0 WHERE telegram_id = ?
    `, [telegramId]);

    // Activate the selected wallet
    await runQuery(`
      UPDATE user_wallets SET is_active = 1, last_used = ? WHERE id = ?
    `, [Date.now(), walletId]);

    logger.info(`[Multi-Wallet] Switched active wallet to "${wallet.wallet_name}" for ${telegramId}`);
    return { success: true };
  } catch (error: any) {
    logger.error('[Multi-Wallet] Failed to switch wallet:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Remove a wallet
 */
export async function removeWallet(
  telegramId: string,
  walletId: number
): Promise<{ success: boolean; error?: string }> {
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
        await runQuery(`
          UPDATE user_wallets SET is_active = 1 WHERE id = ?
        `, [otherWallet.id]);
      }
    }

    await runQuery(`
      DELETE FROM user_wallets WHERE id = ?
    `, [walletId]);

    logger.info(`[Multi-Wallet] Removed wallet "${wallet.wallet_name}" for ${telegramId}`);
    return { success: true };
  } catch (error: any) {
    logger.error('[Multi-Wallet] Failed to remove wallet:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Rename a wallet
 */
export async function renameWallet(
  telegramId: string,
  walletId: number,
  newName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Verify wallet belongs to user
    const wallet = await getWalletById(walletId);
    if (!wallet || wallet.telegram_id !== telegramId) {
      return { success: false, error: 'Wallet not found' };
    }

    // Check if new name already exists
    const existing = await getQuery<{ count: number }>(`
      SELECT COUNT(*) as count FROM user_wallets
      WHERE telegram_id = ? AND wallet_name = ? AND id != ?
    `, [telegramId, newName, walletId]);

    if (existing && existing.count > 0) {
      return { success: false, error: 'Wallet name already exists' };
    }

    await runQuery(`
      UPDATE user_wallets SET wallet_name = ? WHERE id = ?
    `, [newName, walletId]);

    logger.info(`[Multi-Wallet] Renamed wallet ${walletId} to "${newName}" for ${telegramId}`);
    return { success: true };
  } catch (error: any) {
    logger.error('[Multi-Wallet] Failed to rename wallet:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get decrypted keypair for active wallet
 */
export async function getActiveWalletKeypair(telegramId: string): Promise<Keypair | null> {
  try {
    const wallet = await getActiveWallet(telegramId);
    if (!wallet) {
      return null;
    }

    // Multi-wallet feature: wallets stored here are always v2 (per-user encryption)
    const privateKey = decryptPrivateKey(wallet.private_key_encrypted, telegramId, 2);

    // Try to parse as base58 first
    try {
      const secretKey = bs58.decode(privateKey);
      return Keypair.fromSecretKey(secretKey);
    } catch {
      // Try as JSON array
      const secretKey = Uint8Array.from(JSON.parse(privateKey));
      return Keypair.fromSecretKey(secretKey);
    }
  } catch (error) {
    logger.error('[Multi-Wallet] Failed to get keypair:', error);
    return null;
  }
}

/**
 * Update last used timestamp
 */
export async function updateWalletLastUsed(walletId: number): Promise<void> {
  await runQuery(`
    UPDATE user_wallets SET last_used = ? WHERE id = ?
  `, [Date.now(), walletId]);
}

/**
 * Convert database row to UserWallet object
 */
function convertWalletFromDb(row: any): UserWallet {
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
export function formatWalletsDisplay(wallets: UserWallet[]): string {
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
export async function migrateExistingUsersToMultiWallet(): Promise<void> {
  try {
    logger.info('[Multi-Wallet] Starting migration of existing users...');

    // Get all users from telegram_users table
    const users = await allQuery<any>(`
      SELECT telegram_id, username, private_key_encrypted, public_key, created_at
      FROM telegram_users
    `);

    for (const user of users) {
      // Check if user already has wallets in user_wallets
      const existingWallets = await getUserWallets(user.telegram_id);

      if (existingWallets.length === 0) {
        // Migrate to user_wallets as "Main Wallet"
        await runQuery(`
          INSERT INTO user_wallets (telegram_id, wallet_name, private_key_encrypted, public_key, is_active, created_at, last_used)
          VALUES (?, ?, ?, ?, 1, ?, ?)
        `, [user.telegram_id, 'Main Wallet', user.private_key_encrypted, user.public_key, user.created_at, user.created_at]);

        logger.info(`[Multi-Wallet] Migrated user ${user.telegram_id} to multi-wallet`);
      }
    }

    logger.info('[Multi-Wallet] Migration complete');
  } catch (error) {
    logger.error('[Multi-Wallet] Migration failed:', error);
  }
}
