"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SETTING_CATEGORIES = void 0;
exports.getCategoryKeyboard = getCategoryKeyboard;
exports.getCategorySettingsKeyboard = getCategorySettingsKeyboard;
exports.getSettingEditKeyboard = getSettingEditKeyboard;
exports.formatSettingMessage = formatSettingMessage;
exports.validateSettingValue = validateSettingValue;
exports.getSettingDefinition = getSettingDefinition;
exports.SETTING_CATEGORIES = {
    mining: {
        name: '⛏️ Mining',
        settings: [
            {
                key: 'motherload_threshold',
                name: 'Motherload Threshold',
                description: 'Minimum motherload to trigger mining',
                type: 'number',
                min: 0,
                max: 1000,
                unit: 'ORB',
            },
            {
                key: 'sol_per_block',
                name: 'SOL Per Block',
                description: 'Amount of SOL to deploy per block',
                type: 'number',
                min: 0.001,
                max: 1,
                unit: 'SOL',
            },
            {
                key: 'num_blocks',
                name: 'Number of Blocks',
                description: 'Number of blocks to mine per round',
                type: 'number',
                min: 1,
                max: 25,
                unit: 'blocks',
            },
        ],
    },
    automation: {
        name: '🤖 Automation',
        settings: [
            {
                key: 'automation_budget_percent',
                name: 'Automation Budget',
                description: 'Percentage of wallet to allocate',
                type: 'number',
                min: 10,
                max: 99,
                unit: '%',
            },
            {
                key: 'auto_claim_sol_threshold',
                name: 'Auto-Claim SOL Threshold',
                description: 'Min SOL to auto-claim',
                type: 'number',
                min: 0,
                max: 10,
                unit: 'SOL',
            },
            {
                key: 'auto_claim_orb_threshold',
                name: 'Auto-Claim ORB Threshold',
                description: 'Min ORB to auto-claim',
                type: 'number',
                min: 0,
                max: 100,
                unit: 'ORB',
            },
            {
                key: 'auto_claim_staking_threshold',
                name: 'Auto-Claim Staking Threshold',
                description: 'Min staking ORB to auto-claim',
                type: 'number',
                min: 0,
                max: 10,
                unit: 'ORB',
            },
        ],
    },
    swap: {
        name: '💱 Swap',
        settings: [
            {
                key: 'auto_swap_enabled',
                name: 'Auto-Swap',
                description: 'Enable automatic ORB to SOL swapping',
                type: 'boolean',
            },
            {
                key: 'swap_threshold',
                name: 'Swap Threshold',
                description: 'Min ORB balance to trigger swap',
                type: 'number',
                min: 0,
                max: 1000,
                unit: 'ORB',
            },
            {
                key: 'min_orb_price',
                name: 'Min ORB Price',
                description: 'Minimum price to allow swap (dump protection)',
                type: 'number',
                min: 0,
                max: 200,
                unit: 'USD',
            },
            {
                key: 'min_orb_to_keep',
                name: 'Min ORB to Keep',
                description: 'Always keep this much ORB',
                type: 'number',
                min: 0,
                max: 50,
                unit: 'ORB',
            },
            {
                key: 'min_swap_amount',
                name: 'Min Swap Amount',
                description: 'Minimum amount per swap',
                type: 'number',
                min: 0.01,
                max: 10,
                unit: 'ORB',
            },
            {
                key: 'slippage_bps',
                name: 'Slippage',
                description: 'Max slippage tolerance',
                type: 'number',
                min: 10,
                max: 1000,
                unit: 'bps',
            },
        ],
    },
    staking: {
        name: '🏦 Staking',
        settings: [
            {
                key: 'auto_stake_enabled',
                name: 'Auto-Stake',
                description: 'Enable automatic ORB staking',
                type: 'boolean',
            },
            {
                key: 'stake_threshold',
                name: 'Stake Threshold',
                description: 'Min ORB to trigger auto-stake',
                type: 'number',
                min: 0,
                max: 500,
                unit: 'ORB',
            },
        ],
    },
    transfer: {
        name: '📤 Auto-Transfer',
        settings: [
            {
                key: 'auto_transfer_enabled',
                name: 'Auto-Transfer',
                description: 'Enable automatic ORB transfers',
                type: 'boolean',
            },
            {
                key: 'orb_transfer_threshold',
                name: 'Transfer Threshold',
                description: 'Min ORB balance to trigger transfer',
                type: 'number',
                min: 1,
                max: 1000,
                unit: 'ORB',
            },
        ],
    },
};
/**
 * Generate category selection keyboard
 */
function getCategoryKeyboard() {
    const categories = Object.entries(exports.SETTING_CATEGORIES);
    const buttons = categories.map(([key, cat]) => ([
        { text: cat.name, callback_data: `settings_cat_${key}` }
    ]));
    buttons.push([{ text: '🏠 Main Menu', callback_data: 'start' }]);
    return { inline_keyboard: buttons };
}
/**
 * Generate settings list keyboard for a category
 */
function getCategorySettingsKeyboard(categoryKey, currentSettings) {
    const category = exports.SETTING_CATEGORIES[categoryKey];
    if (!category) {
        return { inline_keyboard: [[{ text: '🏠 Main Menu', callback_data: 'start' }]] };
    }
    const buttons = category.settings.map(setting => {
        const currentValue = currentSettings[setting.key];
        let valueDisplay = '';
        if (setting.type === 'boolean') {
            valueDisplay = currentValue ? '✅' : '❌';
        }
        else if (setting.type === 'number') {
            valueDisplay = `${currentValue}${setting.unit || ''}`;
        }
        else {
            valueDisplay = String(currentValue);
        }
        return [{
                text: `${setting.name}: ${valueDisplay}`,
                callback_data: `settings_edit_${categoryKey}_${setting.key}`
            }];
    });
    // Add special "Set Recipient" button for transfer category
    if (categoryKey === 'transfer') {
        const recipientSet = currentSettings.transfer_recipient_address ? '✅' : '❌';
        buttons.push([{
                text: `📍 Set Recipient Address: ${recipientSet}`,
                callback_data: 'set_transfer_recipient_prompt'
            }]);
    }
    buttons.push([{ text: '⬅️ Back', callback_data: 'settings_menu' }]);
    return { inline_keyboard: buttons };
}
/**
 * Generate edit keyboard for a specific setting
 */
function getSettingEditKeyboard(categoryKey, settingKey, currentValue, definition) {
    const buttons = [];
    if (definition.type === 'boolean') {
        // Show single toggle button based on current state
        if (currentValue) {
            // Currently enabled, show disable button
            buttons.push([
                { text: '❌ Disable', callback_data: `settings_set_${categoryKey}_${settingKey}_false` }
            ]);
        }
        else {
            // Currently disabled, show enable button
            buttons.push([
                { text: '✅ Enable', callback_data: `settings_set_${categoryKey}_${settingKey}_true` }
            ]);
        }
    }
    else if (definition.type === 'string' && definition.options) {
        definition.options.forEach(option => {
            const isSelected = currentValue === option;
            buttons.push([{
                    text: isSelected ? `✅ ${option}` : option,
                    callback_data: `settings_set_${categoryKey}_${settingKey}_${option}`
                }]);
        });
    }
    else {
        // Number type - show input prompt
        buttons.push([{
                text: '✏️ Enter New Value',
                callback_data: `settings_input_${categoryKey}_${settingKey}`
            }]);
    }
    buttons.push([{ text: '⬅️ Back', callback_data: `settings_cat_${categoryKey}` }]);
    return { inline_keyboard: buttons };
}
/**
 * Format setting display message
 */
function formatSettingMessage(categoryKey, settingKey, currentValue, definition) {
    let valueDisplay = '';
    if (definition.type === 'boolean') {
        valueDisplay = currentValue ? '✅ Enabled' : '❌ Disabled';
    }
    else if (definition.type === 'number') {
        valueDisplay = `${currentValue} ${definition.unit || ''}`;
    }
    else {
        valueDisplay = String(currentValue);
    }
    let constraints = '';
    if (definition.type === 'number' && (definition.min !== undefined || definition.max !== undefined)) {
        constraints = `\n\n*Range:* ${definition.min || 0} - ${definition.max || '∞'} ${definition.unit || ''}`;
    }
    else if (definition.type === 'string' && definition.options) {
        constraints = `\n\n*Options:* ${definition.options.join(', ')}`;
    }
    return `⚙️ *${definition.name}*

${definition.description}

*Current Value:* ${valueDisplay}${constraints}`;
}
/**
 * Validate and parse setting value
 */
function validateSettingValue(definition, value) {
    if (definition.type === 'boolean') {
        const boolValue = value.toLowerCase() === 'true' || value === '1';
        return { valid: true, parsedValue: boolValue };
    }
    if (definition.type === 'number') {
        const numValue = parseFloat(value);
        if (isNaN(numValue)) {
            return { valid: false, error: 'Invalid number' };
        }
        if (definition.min !== undefined && numValue < definition.min) {
            return { valid: false, error: `Value must be at least ${definition.min}` };
        }
        if (definition.max !== undefined && numValue > definition.max) {
            return { valid: false, error: `Value must be at most ${definition.max}` };
        }
        return { valid: true, parsedValue: numValue };
    }
    if (definition.type === 'string') {
        if (definition.options && !definition.options.includes(value)) {
            return { valid: false, error: `Invalid option. Choose from: ${definition.options.join(', ')}` };
        }
        return { valid: true, parsedValue: value };
    }
    return { valid: false, error: 'Unknown setting type' };
}
/**
 * Get setting definition
 */
function getSettingDefinition(categoryKey, settingKey) {
    const category = exports.SETTING_CATEGORIES[categoryKey];
    if (!category)
        return null;
    return category.settings.find(s => s.key === settingKey) || null;
}
//# sourceMappingURL=interactiveSettings.js.map