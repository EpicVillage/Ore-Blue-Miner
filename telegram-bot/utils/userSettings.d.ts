/**
 * User-specific settings management for telegram bot users
 * Each user can configure their own mining, automation, and safety parameters
 */
export interface UserSettings {
    telegram_id: string;
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
/**
 * Get user settings (creates default if not exists)
 */
export declare function getUserSettings(telegramId: string): Promise<UserSettings>;
/**
 * Update user setting
 */
export declare function updateUserSetting(telegramId: string, key: keyof UserSettings, value: any): Promise<void>;
/**
 * Update multiple user settings at once
 */
export declare function updateUserSettings(telegramId: string, updates: Partial<UserSettings>): Promise<void>;
/**
 * Reset user settings to defaults
 */
export declare function resetUserSettings(telegramId: string): Promise<void>;
/**
 * Get all users with specific setting enabled
 */
export declare function getUsersWithSetting(setting: keyof UserSettings, value: any): Promise<string[]>;
/**
 * Get formatted settings display for user
 */
export declare function formatSettingsDisplay(settings: UserSettings): string;
//# sourceMappingURL=userSettings.d.ts.map