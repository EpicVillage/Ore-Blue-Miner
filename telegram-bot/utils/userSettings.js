"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserSettings = getUserSettings;
exports.updateUserSetting = updateUserSetting;
exports.updateUserSettings = updateUserSettings;
exports.resetUserSettings = resetUserSettings;
exports.getUsersWithSetting = getUsersWithSetting;
exports.formatSettingsDisplay = formatSettingsDisplay;
const database_1 = require("../../src/utils/database");
const logger_1 = __importDefault(require("../../src/utils/logger"));
/**
 * Get user settings (creates default if not exists)
 */
async function getUserSettings(telegramId) {
    let settings = await (0, database_1.getQuery)(`
    SELECT * FROM user_settings WHERE telegram_id = ?
  `, [telegramId]);
    // Create default settings if none exist
    if (!settings) {
        await createDefaultUserSettings(telegramId);
        settings = await (0, database_1.getQuery)(`
      SELECT * FROM user_settings WHERE telegram_id = ?
    `, [telegramId]);
    }
    return convertSettingsFromDb(settings);
}
/**
 * Create default settings for a new user
 */
async function createDefaultUserSettings(telegramId) {
    await (0, database_1.runQuery)(`
    INSERT INTO user_settings (telegram_id)
    VALUES (?)
  `, [telegramId]);
    logger_1.default.info(`[User Settings] Created default settings for ${telegramId}`);
}
/**
 * Update user setting
 */
async function updateUserSetting(telegramId, key, value) {
    // Ensure settings exist first
    await getUserSettings(telegramId);
    // Convert boolean to integer for storage
    const dbValue = typeof value === 'boolean' ? (value ? 1 : 0) : value;
    await (0, database_1.runQuery)(`
    UPDATE user_settings
    SET ${key} = ?, updated_at = ?
    WHERE telegram_id = ?
  `, [dbValue, Date.now(), telegramId]);
    logger_1.default.info(`[User Settings] Updated ${key} = ${value} for ${telegramId}`);
}
/**
 * Update multiple user settings at once
 */
async function updateUserSettings(telegramId, updates) {
    // Ensure settings exist first
    await getUserSettings(telegramId);
    const keys = Object.keys(updates).filter(k => k !== 'telegram_id' && k !== 'created_at' && k !== 'updated_at');
    if (keys.length === 0)
        return;
    const setClauses = keys.map(k => `${k} = ?`).join(', ');
    const values = keys.map(k => {
        const val = updates[k];
        return typeof val === 'boolean' ? (val ? 1 : 0) : val;
    });
    await (0, database_1.runQuery)(`
    UPDATE user_settings
    SET ${setClauses}, updated_at = ?
    WHERE telegram_id = ?
  `, [...values, Date.now(), telegramId]);
    logger_1.default.info(`[User Settings] Updated ${keys.length} settings for ${telegramId}`);
}
/**
 * Reset user settings to defaults
 */
async function resetUserSettings(telegramId) {
    await (0, database_1.runQuery)(`
    DELETE FROM user_settings WHERE telegram_id = ?
  `, [telegramId]);
    await createDefaultUserSettings(telegramId);
    logger_1.default.info(`[User Settings] Reset settings for ${telegramId}`);
}
/**
 * Convert database row to UserSettings object
 */
function convertSettingsFromDb(row) {
    return {
        telegram_id: row.telegram_id,
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
 * Get all users with specific setting enabled
 */
async function getUsersWithSetting(setting, value) {
    const dbValue = typeof value === 'boolean' ? (value ? 1 : 0) : value;
    const rows = await (0, database_1.allQuery)(`
    SELECT telegram_id FROM user_settings WHERE ${setting} = ?
  `, [dbValue]);
    return rows.map(r => r.telegram_id);
}
/**
 * Get formatted settings display for user
 */
function formatSettingsDisplay(settings) {
    return `
⚙️ *Your Mining Settings*

*Mining Configuration:*
• Motherload Threshold: ${settings.motherload_threshold} ORB
• SOL Per Block: ${settings.sol_per_block} SOL
• Number of Blocks: ${settings.num_blocks} blocks

*Automation:*
• Budget Allocation: ${settings.automation_budget_percent}%
• Auto-claim SOL: ≥${settings.auto_claim_sol_threshold} SOL
• Auto-claim ORB: ≥${settings.auto_claim_orb_threshold} ORB
• Auto-claim Staking: ≥${settings.auto_claim_staking_threshold} ORB

*Swap Settings:*
• Auto-swap: ${settings.auto_swap_enabled ? '✅ Enabled' : '❌ Disabled'}
• Swap Threshold: ${settings.swap_threshold} ORB
• Min ORB Price: $${settings.min_orb_price}
• Min ORB to Keep: ${settings.min_orb_to_keep} ORB
• Min Swap Amount: ${settings.min_swap_amount} ORB
• Slippage: ${(settings.slippage_bps / 100).toFixed(2)}%

*Staking:*
• Auto-stake: ${settings.auto_stake_enabled ? '✅ Enabled' : '❌ Disabled'}
• Stake Threshold: ${settings.stake_threshold} ORB

*Auto-Transfer:*
• Auto-transfer: ${settings.auto_transfer_enabled ? '✅ Enabled' : '❌ Disabled'}
• Transfer Threshold: ${settings.orb_transfer_threshold} ORB
• Recipient: ${settings.transfer_recipient_address ? `\`${settings.transfer_recipient_address.slice(0, 8)}...${settings.transfer_recipient_address.slice(-8)}\`` : 'Not set'}
`.trim();
}
//# sourceMappingURL=userSettings.js.map