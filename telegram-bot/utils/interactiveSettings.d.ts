import { InlineKeyboardMarkup } from 'telegraf/types';
import { UserSettings } from './userSettings';
/**
 * Interactive settings configuration for telegram bot
 * Provides UI for updating user settings
 */
export interface SettingDefinition {
    key: keyof UserSettings;
    name: string;
    description: string;
    type: 'number' | 'boolean' | 'string';
    min?: number;
    max?: number;
    options?: string[];
    unit?: string;
}
export declare const SETTING_CATEGORIES: {
    mining: {
        name: string;
        settings: {
            key: keyof UserSettings;
            name: string;
            description: string;
            type: "number";
            min: number;
            max: number;
            unit: string;
        }[];
    };
    automation: {
        name: string;
        settings: {
            key: keyof UserSettings;
            name: string;
            description: string;
            type: "number";
            min: number;
            max: number;
            unit: string;
        }[];
    };
    swap: {
        name: string;
        settings: ({
            key: keyof UserSettings;
            name: string;
            description: string;
            type: "boolean";
            min?: undefined;
            max?: undefined;
            unit?: undefined;
        } | {
            key: keyof UserSettings;
            name: string;
            description: string;
            type: "number";
            min: number;
            max: number;
            unit: string;
        })[];
    };
    staking: {
        name: string;
        settings: ({
            key: keyof UserSettings;
            name: string;
            description: string;
            type: "boolean";
            min?: undefined;
            max?: undefined;
            unit?: undefined;
        } | {
            key: keyof UserSettings;
            name: string;
            description: string;
            type: "number";
            min: number;
            max: number;
            unit: string;
        })[];
    };
    transfer: {
        name: string;
        settings: ({
            key: keyof UserSettings;
            name: string;
            description: string;
            type: "boolean";
            min?: undefined;
            max?: undefined;
            unit?: undefined;
        } | {
            key: keyof UserSettings;
            name: string;
            description: string;
            type: "number";
            min: number;
            max: number;
            unit: string;
        })[];
    };
};
/**
 * Generate category selection keyboard
 */
export declare function getCategoryKeyboard(): InlineKeyboardMarkup;
/**
 * Generate settings list keyboard for a category
 */
export declare function getCategorySettingsKeyboard(categoryKey: string, currentSettings: UserSettings): InlineKeyboardMarkup;
/**
 * Generate edit keyboard for a specific setting
 */
export declare function getSettingEditKeyboard(categoryKey: string, settingKey: string, currentValue: any, definition: SettingDefinition): InlineKeyboardMarkup;
/**
 * Format setting display message
 */
export declare function formatSettingMessage(categoryKey: string, settingKey: string, currentValue: any, definition: SettingDefinition): string;
/**
 * Validate and parse setting value
 */
export declare function validateSettingValue(definition: SettingDefinition, value: string): {
    valid: boolean;
    parsedValue?: any;
    error?: string;
};
/**
 * Get setting definition
 */
export declare function getSettingDefinition(categoryKey: string, settingKey: string): SettingDefinition | null;
//# sourceMappingURL=interactiveSettings.d.ts.map