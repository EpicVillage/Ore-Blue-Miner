import { runQuery, getQuery, allQuery } from '../../src/utils/database';
import logger from '../../src/utils/logger';
import { Platform, getLinkedAccount } from './users';

/**
 * Shared User Settings Management
 *
 * Each platform user has their own settings.
 * Linked accounts can optionally share settings.
 */

export interface UserSettings {
  user_id: string; // platform_id
  platform: Platform;
  motherload_threshold: number;
  sol_per_block: number;
  num_blocks: number;
  automation_budget_percent: number;
  auto_claim_sol_threshold: number;
  auto_claim_orb_threshold: number;
  auto_claim_staking_threshold: number;
  auto_swap_enabled: boolean;
  swap_threshold: number;
  min_orb_price: number;
  min_orb_to_keep: number;
  min_swap_amount: number;
  slippage_bps: number;
  auto_stake_enabled: boolean;
  stake_threshold: number;
  auto_transfer_enabled: boolean;
  orb_transfer_threshold: number;
  transfer_recipient_address: string | null;
  created_at: number;
  updated_at: number;
}

// Settings table per platform
function getSettingsTable(platform: Platform): string {
  return platform === 'telegram' ? 'user_settings' : 'discord_user_settings';
}

function getIdColumn(platform: Platform): string {
  return platform === 'telegram' ? 'telegram_id' : 'discord_id';
}

/**
 * Initialize Discord settings table (Telegram already exists)
 */
export async function initializeDiscordSettingsTable(): Promise<void> {
  await runQuery(`
    CREATE TABLE IF NOT EXISTS discord_user_settings (
      discord_id TEXT PRIMARY KEY,
      motherload_threshold REAL DEFAULT 5000,
      sol_per_block REAL DEFAULT 0.001,
      num_blocks INTEGER DEFAULT 10,
      automation_budget_percent REAL DEFAULT 50,
      auto_claim_sol_threshold REAL DEFAULT 0.01,
      auto_claim_orb_threshold REAL DEFAULT 10000,
      auto_claim_staking_threshold REAL DEFAULT 1,
      auto_swap_enabled INTEGER DEFAULT 0,
      swap_threshold REAL DEFAULT 100,
      min_orb_price REAL DEFAULT 0,
      min_orb_to_keep REAL DEFAULT 10,
      min_swap_amount REAL DEFAULT 1,
      slippage_bps INTEGER DEFAULT 300,
      auto_stake_enabled INTEGER DEFAULT 0,
      stake_threshold REAL DEFAULT 50,
      auto_transfer_enabled INTEGER DEFAULT 0,
      orb_transfer_threshold REAL DEFAULT 100,
      transfer_recipient_address TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
      updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
    )
  `);

  logger.info('[Shared DB] Discord settings table initialized');
}

/**
 * Convert database row to UserSettings object
 */
function convertSettingsFromDb(row: any, platform: Platform): UserSettings {
  const idColumn = getIdColumn(platform);
  return {
    user_id: row[idColumn],
    platform,
    motherload_threshold: row.motherload_threshold,
    sol_per_block: row.sol_per_block,
    num_blocks: row.num_blocks,
    automation_budget_percent: row.automation_budget_percent,
    auto_claim_sol_threshold: row.auto_claim_sol_threshold,
    auto_claim_orb_threshold: row.auto_claim_orb_threshold,
    auto_claim_staking_threshold: row.auto_claim_staking_threshold,
    auto_swap_enabled: row.auto_swap_enabled === 1,
    swap_threshold: row.swap_threshold,
    min_orb_price: row.min_orb_price,
    min_orb_to_keep: row.min_orb_to_keep,
    min_swap_amount: row.min_swap_amount,
    slippage_bps: row.slippage_bps,
    auto_stake_enabled: row.auto_stake_enabled === 1,
    stake_threshold: row.stake_threshold,
    auto_transfer_enabled: row.auto_transfer_enabled === 1,
    orb_transfer_threshold: row.orb_transfer_threshold,
    transfer_recipient_address: row.transfer_recipient_address,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Create default settings for a user
 */
async function createDefaultSettings(platform: Platform, platformId: string): Promise<void> {
  const table = getSettingsTable(platform);
  const idColumn = getIdColumn(platform);

  await runQuery(`
    INSERT INTO ${table} (${idColumn})
    VALUES (?)
  `, [platformId]);

  logger.debug(`[Shared Settings] Created default settings for ${platform}:${platformId}`);
}

/**
 * Get user settings (creates default if not exists)
 * If user is linked, optionally use linked account's settings
 */
export async function getUserSettings(
  platform: Platform,
  platformId: string,
  useLinkedSettings: boolean = false
): Promise<UserSettings> {
  // Check for linked account settings
  if (useLinkedSettings) {
    const linked = await getLinkedAccount(platform, platformId);
    if (linked?.linked_at) {
      const linkedPlatform = platform === 'telegram' ? 'discord' : 'telegram';
      const linkedId = platform === 'telegram' ? linked.discord_id : linked.telegram_id;
      if (linkedId) {
        // Try to get linked account's settings
        const linkedSettings = await getSettingsInternal(linkedPlatform as Platform, linkedId);
        if (linkedSettings) return linkedSettings;
      }
    }
  }

  return getSettingsInternal(platform, platformId);
}

/**
 * Internal settings fetch
 */
async function getSettingsInternal(platform: Platform, platformId: string): Promise<UserSettings> {
  const table = getSettingsTable(platform);
  const idColumn = getIdColumn(platform);

  let settings = await getQuery<any>(`
    SELECT * FROM ${table} WHERE ${idColumn} = ?
  `, [platformId]);

  if (!settings) {
    await createDefaultSettings(platform, platformId);
    settings = await getQuery<any>(`
      SELECT * FROM ${table} WHERE ${idColumn} = ?
    `, [platformId]);
  }

  return convertSettingsFromDb(settings!, platform);
}

/**
 * Update a single setting
 */
export async function updateUserSetting(
  platform: Platform,
  platformId: string,
  key: string,
  value: any
): Promise<void> {
  const table = getSettingsTable(platform);
  const idColumn = getIdColumn(platform);

  // Ensure settings exist
  await getUserSettings(platform, platformId);

  // Validate key to prevent SQL injection
  const validKeys = [
    'motherload_threshold', 'sol_per_block', 'num_blocks', 'automation_budget_percent',
    'auto_claim_sol_threshold', 'auto_claim_orb_threshold', 'auto_claim_staking_threshold',
    'auto_swap_enabled', 'swap_threshold', 'min_orb_price', 'min_orb_to_keep',
    'min_swap_amount', 'slippage_bps', 'auto_stake_enabled', 'stake_threshold',
    'auto_transfer_enabled', 'orb_transfer_threshold', 'transfer_recipient_address'
  ];

  if (!validKeys.includes(key)) {
    throw new Error(`Invalid setting key: ${key}`);
  }

  await runQuery(`
    UPDATE ${table}
    SET ${key} = ?, updated_at = ?
    WHERE ${idColumn} = ?
  `, [value, Date.now(), platformId]);

  logger.debug(`[Shared Settings] Updated ${platform}:${platformId} ${key} = ${value}`);
}

/**
 * Update multiple settings at once
 */
export async function updateUserSettings(
  platform: Platform,
  platformId: string,
  updates: Partial<UserSettings>
): Promise<void> {
  for (const [key, value] of Object.entries(updates)) {
    if (key !== 'user_id' && key !== 'platform' && key !== 'created_at' && key !== 'updated_at') {
      await updateUserSetting(platform, platformId, key, value);
    }
  }
}

/**
 * Reset user settings to defaults
 */
export async function resetUserSettings(platform: Platform, platformId: string): Promise<void> {
  const table = getSettingsTable(platform);
  const idColumn = getIdColumn(platform);

  await runQuery(`DELETE FROM ${table} WHERE ${idColumn} = ?`, [platformId]);
  await createDefaultSettings(platform, platformId);

  logger.info(`[Shared Settings] Reset settings for ${platform}:${platformId}`);
}

/**
 * Copy settings from one platform to another (for linked accounts)
 */
export async function copySettings(
  fromPlatform: Platform,
  fromId: string,
  toPlatform: Platform,
  toId: string
): Promise<void> {
  const sourceSettings = await getUserSettings(fromPlatform, fromId);

  // Ensure target settings exist
  await getUserSettings(toPlatform, toId);

  // Copy all values except identifiers
  const {
    user_id, platform, created_at, updated_at, ...settingsToUpdate
  } = sourceSettings;

  await updateUserSettings(toPlatform, toId, settingsToUpdate as Partial<UserSettings>);

  logger.info(`[Shared Settings] Copied settings from ${fromPlatform}:${fromId} to ${toPlatform}:${toId}`);
}

/**
 * Get all users with a specific setting enabled
 */
export async function getUsersWithSetting(
  platform: Platform,
  settingKey: string,
  value: any
): Promise<string[]> {
  const table = getSettingsTable(platform);
  const idColumn = getIdColumn(platform);

  const rows = await allQuery<any>(`
    SELECT ${idColumn} FROM ${table} WHERE ${settingKey} = ?
  `, [value]);

  return rows.map(row => row[idColumn]);
}

/**
 * Get all users across all platforms
 */
export async function getAllPlatformUsers(): Promise<Array<{ platform: Platform; platformId: string }>> {
  const telegramUsers = await allQuery<any>(`
    SELECT telegram_id FROM user_settings
  `);

  const discordUsers = await allQuery<any>(`
    SELECT discord_id FROM discord_user_settings
  `);

  return [
    ...telegramUsers.map(u => ({ platform: 'telegram' as Platform, platformId: u.telegram_id })),
    ...discordUsers.map(u => ({ platform: 'discord' as Platform, platformId: u.discord_id })),
  ];
}
