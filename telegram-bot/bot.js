"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrbMiningBot = void 0;
require("dotenv/config");
const telegraf_1 = require("telegraf");
const config_1 = require("../src/utils/config");
const jupiter_1 = require("../src/utils/jupiter");
const logger_1 = __importDefault(require("../src/utils/logger"));
const database_1 = require("../src/utils/database");
const settingsLoader_1 = require("../src/utils/settingsLoader");
const formatters_1 = require("./utils/formatters");
const userDatabase_1 = require("./utils/userDatabase");
const userWallet_1 = require("./utils/userWallet");
const userAutomation_1 = require("./utils/userAutomation");
const userStats_1 = require("./utils/userStats");
const userSettings_1 = require("./utils/userSettings");
const interactiveSettings_1 = require("./utils/interactiveSettings");
const userPnL_1 = require("./utils/userPnL");
const userStaking_1 = require("./utils/userStaking");
const userRounds_1 = require("./utils/userRounds");
const userOperations_1 = require("./utils/userOperations");
const notifications_1 = require("./utils/notifications");
const orbAutoTransfer_1 = require("./utils/orbAutoTransfer");
const autoClaim_1 = require("./utils/autoClaim");
const autoExecutor_1 = require("./utils/autoExecutor");
class OrbMiningBot {
    bot;
    sessions = new Map();
    ownerId;
    constructor(token, _config) {
        this.bot = new telegraf_1.Telegraf(token);
        this.ownerId = process.env.TELEGRAM_OWNER_ID || '';
        this.setupMiddleware();
        this.setupCommands();
        this.setupCallbackHandlers();
        this.setupTextHandlers();
    }
    /**
     * Get or create session for a user
     */
    getSession(userId) {
        if (!this.sessions.has(userId)) {
            this.sessions.set(userId, {});
        }
        return this.sessions.get(userId);
    }
    /**
     * Clear user session state
     */
    clearSession(userId) {
        const session = this.getSession(userId);
        session.awaitingPrivateKey = false;
        session.awaitingSwapAmount = false;
        session.awaitingDeployAmount = false;
        session.awaitingTransferRecipient = false;
        session.awaitingSettingInput = undefined;
    }
    /**
     * Check if user is registered
     */
    async isUserRegistered(telegramId) {
        const user = await (0, userDatabase_1.getUser)(telegramId);
        return user !== null;
    }
    /**
     * Check if user is the bot owner
     */
    isOwner(telegramId) {
        return telegramId === this.ownerId;
    }
    /**
     * Setup middleware for logging, error handling, and user authentication
     */
    setupMiddleware() {
        // Log all incoming messages
        this.bot.use(async (ctx, next) => {
            const username = ctx.from?.username || ctx.from?.id || 'unknown';
            const messageText = 'text' in (ctx.message || {}) ? ctx.message.text : undefined;
            const callbackData = 'data' in (ctx.callbackQuery || {}) ? ctx.callbackQuery.data : undefined;
            logger_1.default.info(`[Telegram] Message from @${username}: ${messageText || callbackData || 'callback'}`);
            await next();
        });
        // Global error handler
        this.bot.catch((err, ctx) => {
            logger_1.default.error('[Telegram] Bot error:', err);
            ctx.reply('An error occurred. Please try again or contact support.');
        });
    }
    /**
     * Setup text message handlers
     */
    setupTextHandlers() {
        // Handle text inputs (private key, swap amount, deploy amount)
        this.bot.on('text', async (ctx) => {
            const userId = ctx.from.id;
            const telegramId = userId.toString();
            const session = this.getSession(userId);
            const text = ctx.message.text;
            // Check if we're waiting for a private key
            if (session.awaitingPrivateKey) {
                await this.handlePrivateKeySubmission(ctx);
                return;
            }
            // Check if we're waiting for a swap amount
            if (session.awaitingSwapAmount) {
                try {
                    const amount = parseFloat(text);
                    if (isNaN(amount) || amount <= 0) {
                        await ctx.reply('❌ Invalid amount. Please enter a valid number greater than 0.');
                        return;
                    }
                    session.awaitingSwapAmount = false;
                    await ctx.reply(`⏳ Swapping ${(0, formatters_1.formatORB)(amount)} to SOL...`);
                    const result = await (0, userOperations_1.swapUserOrbToSol)(telegramId, amount);
                    if (result.success) {
                        const message = `✅ *Swap Successful!*\n\nSwapped: ${(0, formatters_1.formatORB)(result.orbSwapped)}\nReceived: ${(0, formatters_1.formatSOL)(result.solReceived)}\n\nSignature: \`${result.signature.slice(0, 8)}...${result.signature.slice(-8)}\``;
                        await ctx.reply(message, { parse_mode: 'Markdown' });
                        await (0, notifications_1.notifyTransactionSuccess)(telegramId, 'Swap', result.signature, `${(0, formatters_1.formatORB)(result.orbSwapped)} → ${(0, formatters_1.formatSOL)(result.solReceived)}`);
                    }
                    else {
                        await ctx.reply(`❌ Swap failed: ${result.error}`);
                        await (0, notifications_1.notifyTransactionFailed)(telegramId, 'Swap', result.error);
                    }
                }
                catch (error) {
                    logger_1.default.error('[Telegram] Error processing swap:', error);
                    await ctx.reply('Failed to process swap. Please try again.');
                }
                return;
            }
            // Check if we're waiting for a deploy amount
            if (session.awaitingDeployAmount) {
                try {
                    const amount = parseFloat(text);
                    if (isNaN(amount) || amount <= 0) {
                        await ctx.reply('❌ Invalid amount. Please enter a valid number greater than 0.');
                        return;
                    }
                    session.awaitingDeployAmount = false;
                    await ctx.reply(`⏳ Deploying ${(0, formatters_1.formatSOL)(amount)} to current round...`);
                    const result = await (0, userOperations_1.deployUserSol)(telegramId, amount);
                    if (result.success) {
                        const message = `✅ *Deployment Successful!*\n\nDeployed: ${(0, formatters_1.formatSOL)(result.solDeployed)}\nRound: #${result.roundId}\n\nSignature: \`${result.signature.slice(0, 8)}...${result.signature.slice(-8)}\`\n\nGood luck! 🍀`;
                        await ctx.reply(message, { parse_mode: 'Markdown' });
                        await (0, notifications_1.notifyTransactionSuccess)(telegramId, 'Deploy', result.signature, `Deployed ${(0, formatters_1.formatSOL)(result.solDeployed)} to Round #${result.roundId}`);
                    }
                    else {
                        await ctx.reply(`❌ Deployment failed: ${result.error}`);
                        await (0, notifications_1.notifyTransactionFailed)(telegramId, 'Deploy', result.error);
                    }
                }
                catch (error) {
                    logger_1.default.error('[Telegram] Error processing deployment:', error);
                    await ctx.reply('Failed to process deployment. Please try again.');
                }
                return;
            }
            // Check if we're waiting for a transfer recipient address
            if (session.awaitingTransferRecipient) {
                try {
                    const address = text.trim();
                    // Validate the address
                    const validation = (0, orbAutoTransfer_1.validateRecipientAddress)(address);
                    if (!validation.valid) {
                        const errorMsg = await ctx.reply(`❌ Invalid address: ${validation.error}\n\nPlease enter a valid Solana wallet address or use /cancel to abort.`);
                        // Auto-delete error message after 10 seconds
                        setTimeout(async () => {
                            try {
                                await ctx.deleteMessage(errorMsg.message_id);
                            }
                            catch (error) {
                                // Ignore if message is already deleted
                            }
                        }, 10000);
                        return;
                    }
                    session.awaitingTransferRecipient = false;
                    // Save the recipient address
                    await (0, userSettings_1.updateUserSetting)(telegramId, 'transfer_recipient_address', address);
                    // Delete the user's message
                    try {
                        await ctx.deleteMessage();
                    }
                    catch (error) {
                        // Ignore if we can't delete (might not have permission)
                    }
                    const successMsg = await ctx.reply(`✅ *Transfer Recipient Set!*\n\nRecipient: \`${address}\`\n\nYou can now enable auto-transfer in your settings (/settings).`, { parse_mode: 'Markdown' });
                    // Auto-delete success message after 10 seconds
                    setTimeout(async () => {
                        try {
                            await ctx.deleteMessage(successMsg.message_id);
                        }
                        catch (error) {
                            // Ignore if message is already deleted
                        }
                    }, 10000);
                    logger_1.default.info(`[Transfer] Set recipient address for ${telegramId}: ${address}`);
                }
                catch (error) {
                    logger_1.default.error('[Telegram] Error setting transfer recipient:', error);
                    await ctx.reply('Failed to set transfer recipient. Please try again.');
                }
                return;
            }
            // Check if we're waiting for a setting input
            if (session.awaitingSettingInput) {
                try {
                    const { categoryKey, settingKey } = session.awaitingSettingInput;
                    const value = text.trim();
                    const definition = (0, interactiveSettings_1.getSettingDefinition)(categoryKey, settingKey);
                    if (!definition) {
                        await ctx.reply('Setting not found. Please try again.');
                        session.awaitingSettingInput = undefined;
                        return;
                    }
                    // Validate the value
                    const validation = (0, interactiveSettings_1.validateSettingValue)(definition, value);
                    if (!validation.valid) {
                        const errorMsg = await ctx.reply(`❌ Invalid value: ${validation.error}\n\nPlease send a valid value, or use /cancel to abort.`);
                        // Auto-delete error message after 10 seconds
                        setTimeout(async () => {
                            try {
                                await ctx.deleteMessage(errorMsg.message_id);
                            }
                            catch (error) {
                                // Ignore if message is already deleted
                            }
                        }, 10000);
                        return;
                    }
                    // Update the setting
                    await (0, userSettings_1.updateUserSetting)(telegramId, definition.key, validation.parsedValue);
                    // Delete the user's message
                    try {
                        await ctx.deleteMessage();
                    }
                    catch (error) {
                        // Ignore if we can't delete (might not have permission)
                    }
                    // Show success message
                    const successMsg = await ctx.reply(`✅ *${definition.name} Updated!*\n\nNew value: ${validation.parsedValue} ${definition.unit || ''}\n\nYou can continue configuring settings with /settings.`, { parse_mode: 'Markdown' });
                    // Auto-delete success message after 10 seconds
                    setTimeout(async () => {
                        try {
                            await ctx.deleteMessage(successMsg.message_id);
                        }
                        catch (error) {
                            // Ignore if message is already deleted
                        }
                    }, 10000);
                    session.awaitingSettingInput = undefined;
                    logger_1.default.info(`[Settings] Updated ${settingKey} = ${validation.parsedValue} for ${telegramId}`);
                }
                catch (error) {
                    logger_1.default.error('[Telegram] Error updating setting from input:', error);
                    await ctx.reply('Failed to update setting. Please try again.');
                }
                return;
            }
        });
    }
    /**
     * Handle private key submission during onboarding
     */
    async handlePrivateKeySubmission(ctx) {
        const userId = ctx.from.id.toString();
        const username = ctx.from.username;
        const privateKeyInput = ('text' in ctx.message) ? ctx.message.text : '';
        try {
            // Validate the private key
            const validation = (0, userWallet_1.validatePrivateKey)(privateKeyInput);
            if (!validation.valid) {
                await ctx.reply(`❌ Invalid private key: ${validation.error}\n\nPlease try again or use /cancel to abort.`);
                return;
            }
            // Save the user with encrypted private key
            await (0, userDatabase_1.saveUser)(userId, privateKeyInput, validation.publicKey, username);
            // Clear the awaiting flag
            const session = this.getSession(parseInt(userId));
            session.awaitingPrivateKey = false;
            // Delete the message containing the private key for security
            try {
                await ctx.deleteMessage();
            }
            catch (e) {
                // Ignore if we can't delete (might not have permission)
            }
            await ctx.reply(`✅ *Wallet Connected!*\n\nPublic Key: \`${validation.publicKey}\`\n\nYour private key has been encrypted and stored securely.`, { parse_mode: 'Markdown' });
            // Show main menu
            await this.handleStart(ctx);
        }
        catch (error) {
            logger_1.default.error('[Telegram] Error saving user wallet:', error);
            await ctx.reply('Failed to save wallet. Please try again or contact support.');
        }
    }
    /**
     * Setup bot commands
     */
    setupCommands() {
        // Start command - show welcome or onboarding
        this.bot.command('start', async (ctx) => {
            await this.handleStart(ctx);
        });
        // Cancel command - abort any operation
        this.bot.command('cancel', async (ctx) => {
            const userId = ctx.from.id;
            this.clearSession(userId);
            await ctx.reply('Operation cancelled. Use /start to see the main menu.');
        });
        // Wallet command - manage wallet
        this.bot.command('wallet', async (ctx) => {
            await this.handleWallet(ctx);
        });
        // Help command
        this.bot.command('help', async (ctx) => {
            try {
                await ctx.reply(`📖 <b>ORB Mining Bot Help</b>

<b>💼 Wallet & Status:</b>
/start - Show main menu
/wallet - Manage your wallet
/status - Wallet dashboard
/pnl - Profit & Loss summary

<b>💰 Manual Operations:</b>
/claim_sol - Claim SOL rewards
/claim_orb - Claim ORB rewards
/claim_staking - Claim staking rewards
/swap - Swap ORB to SOL
/deploy - Deploy to current round

<b>⚙️ Automation & Control:</b>
/control - Control automation
/settings - Configure your settings

<b>📊 Analytics & History:</b>
/stats - Complete analytics
/history - Transaction history

<b>🏦 Staking:</b>
/stake - View stake & rewards`, { parse_mode: 'HTML' });
            }
            catch (error) {
                logger_1.default.error('[Telegram] Error in help command:', error);
                await ctx.reply('Help menu temporarily unavailable. Please try again.');
            }
        });
        // Status command - show balances and mining state
        this.bot.command('status', async (ctx) => {
            await this.handleStatus(ctx);
        });
        // Control command - automation controls
        this.bot.command('control', async (ctx) => {
            await this.handleControl(ctx);
        });
        // Stats command - complete analytics
        this.bot.command('stats', async (ctx) => {
            await this.handleStats(ctx);
        });
        // History command - transaction history
        this.bot.command('history', async (ctx) => {
            await this.handleHistory(ctx);
        });
        // Settings command - view settings
        this.bot.command('settings', async (ctx) => {
            await this.handleSettings(ctx);
        });
        // PnL command - profit/loss display
        this.bot.command('pnl', async (ctx) => {
            await this.handlePnL(ctx);
        });
        // Stake command - staking operations
        this.bot.command('stake', async (ctx) => {
            await this.handleStake(ctx);
        });
        // Deploy command - manual deployment
        this.bot.command('deploy', async (ctx) => {
            await this.handleDeploy(ctx);
        });
        // Logs command - view recent logs (owner only)
        this.bot.command('logs', async (ctx) => {
            await this.handleLogs(ctx);
        });
        // Owner stats command - view dev fee earnings (owner only)
        this.bot.command('owner_stats', async (ctx) => {
            await this.handleOwnerStats(ctx);
        });
        // Claim commands
        this.bot.command('claim_sol', async (ctx) => {
            await this.handleClaimSol(ctx);
        });
        this.bot.command('claim_orb', async (ctx) => {
            await this.handleClaimOrb(ctx);
        });
        this.bot.command('claim_staking', async (ctx) => {
            await this.handleClaimStaking(ctx);
        });
        // Swap command
        this.bot.command('swap', async (ctx) => {
            await this.handleSwap(ctx);
        });
        // Transfer recipient setup command
        this.bot.command('set_transfer_recipient', async (ctx) => {
            await this.handleSetTransferRecipient(ctx);
        });
        // Transfer status command
        this.bot.command('transfer_status', async (ctx) => {
            await this.handleTransferStatus(ctx);
        });
    }
    /**
     * Setup callback query handlers for inline buttons
     */
    setupCallbackHandlers() {
        // Main menu
        this.bot.action('start', async (ctx) => {
            await ctx.answerCbQuery();
            await this.handleStart(ctx);
        });
        // All button actions edit the message
        this.bot.action('status', async (ctx) => {
            await ctx.answerCbQuery();
            await this.handleStatus(ctx, true);
        });
        this.bot.action('control', async (ctx) => {
            await ctx.answerCbQuery();
            await this.handleControl(ctx, true);
        });
        this.bot.action('stats', async (ctx) => {
            await ctx.answerCbQuery();
            await this.handleStats(ctx, true);
        });
        this.bot.action('history', async (ctx) => {
            await ctx.answerCbQuery();
            await this.handleHistory(ctx, true);
        });
        this.bot.action('settings', async (ctx) => {
            await ctx.answerCbQuery();
            await this.handleSettings(ctx, true);
        });
        // New command callbacks
        this.bot.action('pnl', async (ctx) => {
            await ctx.answerCbQuery();
            await this.handlePnL(ctx, true);
        });
        this.bot.action('stake', async (ctx) => {
            await ctx.answerCbQuery();
            await this.handleStake(ctx, true);
        });
        // Wallet management
        this.bot.action('wallet', async (ctx) => {
            await ctx.answerCbQuery();
            await this.handleWallet(ctx, true);
        });
        // Change wallet - delete current and restart onboarding
        this.bot.action('change_wallet', async (ctx) => {
            await ctx.answerCbQuery();
            const telegramId = ctx.from.id.toString();
            try {
                await (0, userDatabase_1.deleteUser)(telegramId);
                this.sessions.delete(ctx.from.id);
                await ctx.editMessageText('✅ *Wallet Removed*\n\nYour previous wallet has been disconnected.\n\nLet\'s set up a new wallet!', { parse_mode: 'Markdown' });
                // Show onboarding after a brief delay
                setTimeout(() => {
                    this.showOnboarding(ctx);
                }, 1000);
            }
            catch (error) {
                logger_1.default.error('[Telegram] Error changing wallet:', error);
                await ctx.reply('Failed to change wallet. Please try again.');
            }
        });
        // Remove wallet - show confirmation first
        this.bot.action('remove_wallet', async (ctx) => {
            await ctx.answerCbQuery();
            const confirmMessage = `⚠️ *Confirm Wallet Removal*

Are you sure you want to remove your wallet?

This will:
• Delete your encrypted private key from our database
• You'll need to set up again with /start

This action cannot be undone.`;
            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '❌ Cancel', callback_data: 'wallet' },
                        { text: '✅ Confirm Removal', callback_data: 'confirm_remove_wallet' }
                    ]
                ],
            };
            await ctx.editMessageText(confirmMessage, {
                parse_mode: 'Markdown',
                reply_markup: keyboard,
            });
        });
        // Confirm wallet removal
        this.bot.action('confirm_remove_wallet', async (ctx) => {
            await ctx.answerCbQuery();
            const telegramId = ctx.from.id.toString();
            try {
                await (0, userDatabase_1.deleteUser)(telegramId);
                this.sessions.delete(ctx.from.id);
                await ctx.editMessageText('✅ *Wallet Removed Successfully*\n\nYour wallet has been disconnected and all data has been deleted.\n\nUse /start whenever you want to connect a new wallet.', { parse_mode: 'Markdown' });
            }
            catch (error) {
                logger_1.default.error('[Telegram] Error removing wallet:', error);
                await ctx.reply('Failed to remove wallet. Please try again.');
            }
        });
        // Refresh actions - edit existing message
        this.bot.action('refresh_status', async (ctx) => {
            await ctx.answerCbQuery('Refreshing...');
            await this.handleStatus(ctx, true);
        });
        // Quick claim actions from status page
        this.bot.action('claim_sol_quick', async (ctx) => {
            await ctx.answerCbQuery();
            await this.handleClaimSol(ctx);
            // Refresh status after claim
            setTimeout(() => this.handleStatus(ctx, true), 2000);
        });
        this.bot.action('claim_orb_quick', async (ctx) => {
            await ctx.answerCbQuery();
            await this.handleClaimOrb(ctx);
            // Refresh status after claim
            setTimeout(() => this.handleStatus(ctx, true), 2000);
        });
        this.bot.action('refresh_control', async (ctx) => {
            await ctx.answerCbQuery('Refreshing...');
            await this.handleControl(ctx, true);
        });
        // Logs pagination handlers
        this.bot.action(/^logs_page_(\d+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const match = ctx.match;
            const page = parseInt(match[1]);
            await this.handleLogs(ctx, page);
        });
        this.bot.action('close_logs', async (ctx) => {
            await ctx.answerCbQuery();
            try {
                await ctx.deleteMessage();
            }
            catch (error) {
                // Ignore error if message is already deleted
            }
        });
        // Automation control actions
        this.bot.action('start_automation', async (ctx) => {
            await ctx.answerCbQuery();
            await this.handleStartAutomation(ctx);
        });
        this.bot.action('stop_automation', async (ctx) => {
            await ctx.answerCbQuery();
            await this.handleStopAutomation(ctx);
        });
        // Interactive settings handlers
        this.bot.action('configure_settings', async (ctx) => {
            await ctx.answerCbQuery();
            const keyboard = (0, interactiveSettings_1.getCategoryKeyboard)();
            await ctx.editMessageText('⚙️ *Configure Settings*\n\nSelect a category to configure:', { parse_mode: 'Markdown', reply_markup: keyboard });
        });
        this.bot.action('settings_menu', async (ctx) => {
            await ctx.answerCbQuery();
            await this.handleSettings(ctx, true);
        });
        this.bot.action(/^settings_cat_(.+)$/, async (ctx) => {
            try {
                await ctx.answerCbQuery();
                const match = ctx.match;
                const categoryKey = match[1];
                const telegramId = ctx.from.id.toString();
                const settings = await (0, userSettings_1.getUserSettings)(telegramId);
                const keyboard = (0, interactiveSettings_1.getCategorySettingsKeyboard)(categoryKey, settings);
                await ctx.editMessageText(`⚙️ *Settings - ${categoryKey.charAt(0).toUpperCase() + categoryKey.slice(1)}*\n\nSelect a setting to modify:`, { parse_mode: 'Markdown', reply_markup: keyboard });
            }
            catch (error) {
                logger_1.default.error('[Telegram] Error in settings_cat handler:', error);
                await ctx.answerCbQuery('Error loading category');
            }
        });
        this.bot.action(/^settings_edit_(.+?)_(.+)$/, async (ctx) => {
            try {
                await ctx.answerCbQuery();
                const match = ctx.match;
                const categoryKey = match[1];
                const settingKey = match[2];
                const telegramId = ctx.from.id.toString();
                const settings = await (0, userSettings_1.getUserSettings)(telegramId);
                const definition = (0, interactiveSettings_1.getSettingDefinition)(categoryKey, settingKey);
                if (!definition) {
                    await ctx.answerCbQuery('Setting not found');
                    return;
                }
                const currentValue = settings[definition.key];
                const message = (0, interactiveSettings_1.formatSettingMessage)(categoryKey, settingKey, currentValue, definition);
                const keyboard = (0, interactiveSettings_1.getSettingEditKeyboard)(categoryKey, settingKey, currentValue, definition);
                await ctx.editMessageText(message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            }
            catch (error) {
                logger_1.default.error('[Telegram] Error in settings_edit handler:', error);
                await ctx.answerCbQuery('Error loading setting');
            }
        });
        this.bot.action(/^settings_set_(.+?)_(.+)_(true|false|Low|Medium|High|Very High)$/, async (ctx) => {
            try {
                const match = ctx.match;
                const categoryKey = match[1];
                const settingKey = match[2];
                const valueStr = match[3];
                const telegramId = ctx.from.id.toString();
                logger_1.default.info(`[Settings] Attempting to set ${categoryKey}/${settingKey} = ${valueStr}`);
                const definition = (0, interactiveSettings_1.getSettingDefinition)(categoryKey, settingKey);
                if (!definition) {
                    logger_1.default.warn(`[Settings] Definition not found for ${categoryKey}/${settingKey}`);
                    await ctx.answerCbQuery('Setting not found');
                    return;
                }
                logger_1.default.info(`[Settings] Found definition for ${definition.key}`);
                const validation = (0, interactiveSettings_1.validateSettingValue)(definition, valueStr);
                if (!validation.valid) {
                    logger_1.default.warn(`[Settings] Validation failed: ${validation.error}`);
                    await ctx.answerCbQuery(`Error: ${validation.error}`);
                    return;
                }
                logger_1.default.info(`[Settings] Validation passed, updating to: ${validation.parsedValue}`);
                await (0, userSettings_1.updateUserSetting)(telegramId, definition.key, validation.parsedValue);
                await ctx.answerCbQuery('✅ Setting updated');
                logger_1.default.info(`[Settings] Setting updated successfully`);
                // Refresh the category view
                const settings = await (0, userSettings_1.getUserSettings)(telegramId);
                const keyboard = (0, interactiveSettings_1.getCategorySettingsKeyboard)(categoryKey, settings);
                await ctx.editMessageText(`⚙️ *Settings - ${categoryKey.charAt(0).toUpperCase() + categoryKey.slice(1)}*\n\nSelect a setting to modify:`, { parse_mode: 'Markdown', reply_markup: keyboard });
            }
            catch (error) {
                logger_1.default.error('[Telegram] Error in settings_set handler:', error);
                await ctx.answerCbQuery('Error updating setting');
            }
        });
        this.bot.action(/^settings_input_(.+?)_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const match = ctx.match;
            const categoryKey = match[1];
            const settingKey = match[2];
            const userId = ctx.from.id;
            const telegramId = userId.toString();
            const definition = (0, interactiveSettings_1.getSettingDefinition)(categoryKey, settingKey);
            if (!definition) {
                await ctx.answerCbQuery('Setting not found');
                return;
            }
            // Set session to await input
            const session = this.getSession(userId);
            session.awaitingSettingInput = { categoryKey, settingKey };
            let rangeInfo = '';
            if (definition.min !== undefined || definition.max !== undefined) {
                rangeInfo = `\n\n*Valid range:* ${definition.min || 0} - ${definition.max || '∞'} ${definition.unit || ''}`;
            }
            const message = await ctx.reply(`📝 *${definition.name}*\n\n${definition.description}${rangeInfo}\n\nPlease send the new value, or use /cancel to abort.`, { parse_mode: 'Markdown' });
            // Auto-delete after 20 seconds
            setTimeout(async () => {
                try {
                    await ctx.deleteMessage(message.message_id);
                }
                catch (error) {
                    // Ignore if message is already deleted
                }
            }, 20000);
        });
        this.bot.action('set_transfer_recipient_prompt', async (ctx) => {
            await ctx.answerCbQuery();
            const userId = ctx.from.id;
            const telegramId = userId.toString();
            const session = this.getSession(userId);
            session.awaitingTransferRecipient = true;
            const message = await ctx.reply(`📤 *Set Transfer Recipient*\n\nPlease send the Solana wallet address where you want to transfer your ORB tokens.\n\nThe address will be validated before saving.\n\nUse /cancel to abort.`, { parse_mode: 'Markdown' });
            // Auto-delete after 20 seconds
            setTimeout(async () => {
                try {
                    await ctx.deleteMessage(message.message_id);
                }
                catch (error) {
                    // Ignore if message is already deleted
                }
            }, 20000);
        });
        this.bot.action('settings_reset', async (ctx) => {
            await ctx.answerCbQuery();
            const confirmMessage = `⚠️ *Confirm Settings Reset*\n\nAre you sure you want to reset all settings to defaults?\n\nThis action cannot be undone.`;
            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '✅ Yes, Reset', callback_data: 'confirm_reset_settings' },
                        { text: '❌ Cancel', callback_data: 'settings_menu' }
                    ]
                ]
            };
            await ctx.editMessageText(confirmMessage, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        });
        this.bot.action('confirm_reset_settings', async (ctx) => {
            await ctx.answerCbQuery('Resetting settings...');
            const telegramId = ctx.from.id.toString();
            await (0, userSettings_1.resetUserSettings)(telegramId);
            const keyboard = (0, interactiveSettings_1.getCategoryKeyboard)();
            await ctx.editMessageText('✅ *Settings Reset*\n\nAll settings have been reset to defaults.\n\nSelect a category to configure:', { parse_mode: 'Markdown', reply_markup: keyboard });
        });
        this.bot.action('reset_settings', async (ctx) => {
            await ctx.answerCbQuery();
            const confirmMessage = `⚠️ *Confirm Settings Reset*\n\nAre you sure you want to reset all settings to defaults?\n\nThis action cannot be undone.`;
            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '✅ Yes, Reset', callback_data: 'confirm_reset_settings' },
                        { text: '❌ Cancel', callback_data: 'settings' }
                    ]
                ]
            };
            await ctx.editMessageText(confirmMessage, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        });
    }
    /**
     * Handle /start command - show onboarding or main menu
     */
    async handleStart(ctx) {
        const telegramId = ctx.from.id.toString();
        const isRegistered = await this.isUserRegistered(telegramId);
        if (!isRegistered) {
            // Show onboarding message
            await this.showOnboarding(ctx);
            return;
        }
        // Update last active
        await (0, userDatabase_1.updateLastActive)(telegramId);
        // Show main menu
        const user = await (0, userDatabase_1.getUser)(telegramId);
        const message = `👋 Welcome back to ORB Mining Bot!

*Your Wallet:* \`${user.public_key.slice(0, 8)}...${user.public_key.slice(-8)}\`

Available commands:
/status - Wallet dashboard
/control - Start/Stop automation
/stats - Complete analytics
/wallet - Manage your wallet
/history - View recent transactions
/settings - View bot settings
/help - Show help message

Use the buttons below or type a command to get started.`;
        const keyboard = {
            inline_keyboard: [
                [
                    { text: '💼 Dashboard', callback_data: 'status' },
                    { text: '🎮 Control', callback_data: 'control' },
                ],
                [
                    { text: '📊 Analytics', callback_data: 'stats' },
                    { text: '📜 History', callback_data: 'history' },
                ],
                [
                    { text: '👛 Wallet', callback_data: 'wallet' },
                    { text: '⚙️ Settings', callback_data: 'settings' },
                ],
            ],
        };
        try {
            if (ctx.callbackQuery && ctx.callbackQuery.message) {
                await ctx.editMessageText(message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard,
                });
            }
            else {
                await ctx.reply(message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard,
                });
            }
        }
        catch (error) {
            logger_1.default.error('[Telegram] Error in handleStart:', error);
            await ctx.reply(message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard,
            });
        }
    }
    /**
     * Show onboarding flow for new users
     */
    async showOnboarding(ctx) {
        const userId = ctx.from.id;
        const session = this.getSession(userId);
        session.awaitingPrivateKey = true;
        await ctx.reply(`👋 *Welcome to ORB Mining Bot!*

This is a bot to help mine ore.blue tokens.

To get started, please send me your Solana wallet *private key*.

⚠️ *IMPORTANT Notes:*
• This bot is made as a casual project
• Use a FRESH wallet only - do NOT connect a wallet with other positions or significant funds
• Only use a wallet you're comfortable experimenting with
• You can remove your wallet anytime with /wallet

Send your private key now, or use /cancel to abort.`, { parse_mode: 'Markdown' });
    }
    /**
     * Handle /wallet command - manage wallet
     */
    async handleWallet(ctx, edit = false) {
        const telegramId = ctx.from.id.toString();
        const user = await (0, userDatabase_1.getUser)(telegramId);
        if (!user) {
            await ctx.reply('You haven\' t connected a wallet yet. Use /start to begin.');
            return;
        }
        const message = `👛 *Your Wallet*

*Public Key:*
\`${user.public_key}\`

*Connected:* ${new Date(user.created_at).toLocaleDateString()}
*Last Active:* ${new Date(user.last_active).toLocaleDateString()}

Use the buttons below to manage your wallet.`;
        const keyboard = {
            inline_keyboard: [
                [{ text: '🔄 Change Wallet', callback_data: 'change_wallet' }],
                [{ text: '🗑️ Remove Wallet', callback_data: 'remove_wallet' }],
                [{ text: '🏠 Main Menu', callback_data: 'start' }]
            ],
        };
        try {
            if (edit && ctx.callbackQuery && ctx.callbackQuery.message) {
                await ctx.editMessageText(message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard,
                });
            }
            else {
                await ctx.reply(message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard,
                });
            }
        }
        catch (error) {
            logger_1.default.error('[Telegram] Error in handleWallet:', error);
            await ctx.reply('Failed to fetch wallet info. Please try again.');
        }
    }
    /**
     * Handle /status command - show balances and mining state
     */
    async handleStatus(ctx, edit = false) {
        const telegramId = ctx.from.id.toString();
        if (!(await this.isUserRegistered(telegramId))) {
            await ctx.reply('Please use /start to connect your wallet first.');
            return;
        }
        try {
            const balances = await (0, userWallet_1.getUserBalances)(telegramId);
            const { priceInUsd: orbPriceUsd } = await (0, jupiter_1.getOrbPrice)();
            const rewards = await (0, userOperations_1.getUserClaimableRewards)(telegramId);
            await (0, userDatabase_1.updateLastActive)(telegramId);
            const hasClaimableRewards = rewards.totalSol > 0 || rewards.totalOrb > 0;
            let message = `💼 *Wallet Dashboard*

*Current Balance:*
💎 ${(0, formatters_1.formatSOL)(balances.sol)}
🔮 ${(0, formatters_1.formatORB)(balances.orb)}

*Claimable Rewards:*
${rewards.miningSol > 0 ? `⛏️ Mining SOL: ${(0, formatters_1.formatSOL)(rewards.miningSol)}` : ''}
${rewards.miningOrb > 0 ? `⛏️ Mining ORB: ${(0, formatters_1.formatORB)(rewards.miningOrb)}` : ''}
${rewards.stakingSol > 0 ? `📊 Staking SOL: ${(0, formatters_1.formatSOL)(rewards.stakingSol)}` : ''}
${rewards.stakingOrb > 0 ? `📊 Staking ORB: ${(0, formatters_1.formatORB)(rewards.stakingOrb)}` : ''}
${!hasClaimableRewards ? '✅ No pending rewards' : ''}
─────────────────────────
*ORB Price:*
💵 ${(0, formatters_1.formatUSD)(orbPriceUsd)}

*Portfolio Value:*
💰 ${(0, formatters_1.formatUSD)(balances.sol * 150 + balances.orb * orbPriceUsd)}

Updated: ${new Date().toLocaleTimeString()}`;
            const keyboard = {
                inline_keyboard: [
                    ...(rewards.miningSol > 0 ? [[{ text: '💰 Claim SOL', callback_data: 'claim_sol_quick' }]] : []),
                    ...(rewards.miningOrb > 0 ? [[{ text: '🔮 Claim ORB', callback_data: 'claim_orb_quick' }]] : []),
                    [
                        { text: '🔄 Swap', callback_data: 'swap' },
                        { text: '🚀 Deploy', callback_data: 'deploy' }
                    ],
                    [{ text: '🔄 Refresh', callback_data: 'refresh_status' }],
                    [{ text: '🏠 Main Menu', callback_data: 'start' }],
                ],
            };
            if (edit && ctx.callbackQuery && ctx.callbackQuery.message) {
                await ctx.editMessageText(message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard,
                });
            }
            else {
                await ctx.reply(message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard,
                });
            }
        }
        catch (error) {
            logger_1.default.error('[Telegram] Error in handleStatus:', error);
            await ctx.reply('Failed to fetch status. Please try again.');
        }
    }
    /**
     * Handle /control command - automation controls
     */
    async handleControl(ctx, edit = false) {
        const telegramId = ctx.from.id.toString();
        if (!(await this.isUserRegistered(telegramId))) {
            await ctx.reply('Please use /start to connect your wallet first.');
            return;
        }
        try {
            await (0, userDatabase_1.updateLastActive)(telegramId);
            const userWallet = await (0, userWallet_1.getUserWallet)(telegramId);
            if (!userWallet) {
                await ctx.reply('Failed to load wallet. Please try /wallet to reconnect.');
                return;
            }
            const automationStatus = await (0, userAutomation_1.getUserAutomationStatus)(userWallet);
            let message;
            let keyboard;
            if (automationStatus.active) {
                message = `🎮 *Automation Control*

*Status:* ✅ Active

*Remaining Balance:* ${(0, formatters_1.formatSOL)(automationStatus.balance)}
*Cost per Round:* ${(0, formatters_1.formatSOL)(automationStatus.costPerRound)}
*Estimated Rounds:* ${automationStatus.estimatedRounds}

The automation will continue running until the balance is depleted.`;
                keyboard = {
                    inline_keyboard: [
                        [{ text: '⏹️ Stop Automation', callback_data: 'stop_automation' }],
                        [{ text: '🔄 Refresh', callback_data: 'refresh_control' }],
                        [{ text: '🏠 Main Menu', callback_data: 'start' }],
                    ],
                };
            }
            else {
                const settings = await (0, userSettings_1.getUserSettings)(telegramId);
                const balances = await (0, userWallet_1.getUserBalances)(telegramId);
                const estimatedBudget = balances.sol * (settings.automation_budget_percent / 100);
                const solPerRound = settings.sol_per_block * settings.num_blocks;
                const estimatedRounds = Math.min(Math.floor(estimatedBudget / solPerRound), 1000);
                message = `🎮 *Automation Control*

*Status:* ⏸️ Inactive

*Your Balance:* ${(0, formatters_1.formatSOL)(balances.sol)}
*Estimated Budget:* ${(0, formatters_1.formatSOL)(estimatedBudget)} (${settings.automation_budget_percent}%)
*Cost per Round:* ${(0, formatters_1.formatSOL)(solPerRound)}
*Estimated Rounds:* ${estimatedRounds}

Start automation to let the bot mine ORB for you automatically.`;
                keyboard = {
                    inline_keyboard: [
                        [{ text: '▶️ Start Automation', callback_data: 'start_automation' }],
                        [{ text: '🔄 Refresh', callback_data: 'refresh_control' }],
                        [{ text: '🏠 Main Menu', callback_data: 'start' }],
                    ],
                };
            }
            if (edit && ctx.callbackQuery && ctx.callbackQuery.message) {
                await ctx.editMessageText(message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard,
                });
            }
            else {
                await ctx.reply(message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard,
                });
            }
        }
        catch (error) {
            // Ignore "message is not modified" error (happens when clicking refresh with no changes)
            if (error?.message?.includes('message is not modified')) {
                logger_1.default.debug('[Telegram] Control page unchanged, ignoring refresh');
                return;
            }
            logger_1.default.error('[Telegram] Error in handleControl:', error);
            await ctx.reply('Failed to fetch automation status. Please try again.');
        }
    }
    /**
     * Handle starting automation
     */
    async handleStartAutomation(ctx) {
        const telegramId = ctx.from.id.toString();
        try {
            const userWallet = await (0, userWallet_1.getUserWallet)(telegramId);
            if (!userWallet) {
                await ctx.reply('Failed to load wallet. Please try /wallet to reconnect.');
                return;
            }
            await ctx.editMessageText('⏳ Starting automation... This may take a moment.', {
                parse_mode: 'Markdown',
            });
            const result = await (0, userAutomation_1.createUserAutomation)(userWallet, telegramId);
            if (result.success) {
                const message = `✅ *Automation Started!*

*Deposited:* ${(0, formatters_1.formatSOL)(result.depositedSol)}
*Target Rounds:* ${result.targetRounds}
*Transaction:* \`${result.signature}\`

Your automation is now active and will mine ORB for you automatically.`;
                await ctx.editMessageText(message, { parse_mode: 'Markdown' });
                // Refresh control panel after brief delay
                setTimeout(() => {
                    this.handleControl(ctx, true);
                }, 2000);
            }
            else {
                await ctx.editMessageText(`❌ *Failed to Start Automation*\n\n${result.error}\n\nPlease try again or contact support.`, { parse_mode: 'Markdown' });
            }
        }
        catch (error) {
            logger_1.default.error('[Telegram] Error starting automation:', error);
            await ctx.reply('Failed to start automation. Please try again.');
        }
    }
    /**
     * Handle stopping automation
     */
    async handleStopAutomation(ctx) {
        const telegramId = ctx.from.id.toString();
        try {
            const userWallet = await (0, userWallet_1.getUserWallet)(telegramId);
            if (!userWallet) {
                await ctx.reply('Failed to load wallet. Please try /wallet to reconnect.');
                return;
            }
            await ctx.editMessageText('⏳ Stopping automation... This may take a moment.', {
                parse_mode: 'Markdown',
            });
            const result = await (0, userAutomation_1.closeUserAutomation)(userWallet, telegramId);
            if (result.success) {
                const message = `✅ *Automation Stopped!*

*Returned SOL:* ${(0, formatters_1.formatSOL)(result.returnedSol)}
*Transaction:* \`${result.signature}\`

Your automation has been stopped and remaining balance returned to your wallet.`;
                await ctx.editMessageText(message, { parse_mode: 'Markdown' });
                // Refresh control panel after brief delay
                setTimeout(() => {
                    this.handleControl(ctx, true);
                }, 2000);
            }
            else {
                await ctx.editMessageText(`❌ *Failed to Stop Automation*\n\n${result.error}\n\nPlease try again or contact support.`, { parse_mode: 'Markdown' });
            }
        }
        catch (error) {
            logger_1.default.error('[Telegram] Error stopping automation:', error);
            await ctx.reply('Failed to stop automation. Please try again.');
        }
    }
    /**
     * Handle /stats command - performance statistics
     */
    async handleStats(ctx, edit = false) {
        const telegramId = ctx.from.id.toString();
        if (!(await this.isUserRegistered(telegramId))) {
            await ctx.reply('Please use /start to connect your wallet first.');
            return;
        }
        try {
            await (0, userDatabase_1.updateLastActive)(telegramId);
            const user = await (0, userDatabase_1.getUser)(telegramId);
            const walletAddress = user.public_key;
            // Get all stats in parallel
            const [miningStats, claimStats, balances] = await Promise.all([
                (0, userStats_1.getUserMiningStats)(walletAddress),
                (0, userStats_1.getUserClaimStats)(walletAddress),
                (0, userWallet_1.getUserBalances)(telegramId),
            ]);
            const message = `📊 *Complete Analytics*

*Account Info:*
Wallet: \`${walletAddress.slice(0, 8)}...${walletAddress.slice(-8)}\`
Active Since: ${new Date(user.created_at).toLocaleDateString()}

*Current Holdings:*
💎 ${(0, formatters_1.formatSOL)(balances.sol)}
🔮 ${(0, formatters_1.formatORB)(balances.orb)}

*Mining Stats:*
• Total Mines: ${miningStats.totalMines}
• Successful: ${miningStats.successfulMines}
• Total ORB Mined: ${(0, formatters_1.formatORB)(miningStats.totalOrbMined)}
• Avg per Mine: ${(0, formatters_1.formatORB)(miningStats.avgOrbPerMine)}

*Total Earnings (Claims):*
• SOL Claimed: ${(0, formatters_1.formatSOL)(claimStats.totalSolClaimed)}
• ORB Claimed: ${(0, formatters_1.formatORB)(claimStats.totalOrbClaimed)}
• Total Claims: ${claimStats.totalClaims}

Generated: ${new Date().toLocaleString()}`;
            const keyboard = {
                inline_keyboard: [
                    [{ text: '📜 Transaction History', callback_data: 'history' }],
                    [{ text: '🏠 Main Menu', callback_data: 'start' }]
                ],
            };
            if (edit && ctx.callbackQuery && ctx.callbackQuery.message) {
                await ctx.editMessageText(message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard,
                });
            }
            else {
                await ctx.reply(message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard,
                });
            }
        }
        catch (error) {
            logger_1.default.error('[Telegram] Error in handleStats:', error);
            await ctx.reply('Failed to fetch stats. Please try again.');
        }
    }
    /**
     * Handle /rewards command - claimable rewards
     */
    async handleRewards(ctx, edit = false) {
        const telegramId = ctx.from.id.toString();
        if (!(await this.isUserRegistered(telegramId))) {
            await ctx.reply('Please use /start to connect your wallet first.');
            return;
        }
        try {
            const balances = await (0, userWallet_1.getUserBalances)(telegramId);
            await (0, userDatabase_1.updateLastActive)(telegramId);
            const message = `💰 *Wallet Balance*

💎 ${(0, formatters_1.formatSOL)(balances.solBalance)}
🔮 ${(0, formatters_1.formatORB)(balances.orbBalance)}

Auto-claim features are coming soon for multi-user support.`;
            const keyboard = {
                inline_keyboard: [[{ text: '🏠 Main Menu', callback_data: 'start' }]],
            };
            if (edit && ctx.callbackQuery && ctx.callbackQuery.message) {
                await ctx.editMessageText(message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard,
                });
            }
            else {
                await ctx.reply(message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard,
                });
            }
        }
        catch (error) {
            logger_1.default.error('[Telegram] Error in handleRewards:', error);
            await ctx.reply('Failed to fetch rewards. Please try again.');
        }
    }
    /**
     * Handle /history command - recent transactions
     */
    async handleHistory(ctx, edit = false) {
        const telegramId = ctx.from.id.toString();
        if (!(await this.isUserRegistered(telegramId))) {
            await ctx.reply('Please use /start to connect your wallet first.');
            return;
        }
        try {
            await (0, userDatabase_1.updateLastActive)(telegramId);
            const user = await (0, userDatabase_1.getUser)(telegramId);
            const walletAddress = user.public_key;
            // Get recent transactions (limit to 10)
            const transactions = await (0, userStats_1.getUserTransactions)(walletAddress, 10);
            let message = `📜 *Transaction History*\n\n`;
            if (transactions.length === 0) {
                message += `No transactions found yet.\n\nStart using automation to see your transaction history here!`;
            }
            else {
                message += `*Last ${transactions.length} Transactions:*\n\n`;
                transactions.forEach((tx, index) => {
                    message += (0, userStats_1.formatTransactionForDisplay)(tx);
                    if (index < transactions.length - 1) {
                        message += '\n\n';
                    }
                });
                message += `\n\nShowing most recent ${transactions.length} transactions`;
            }
            const keyboard = {
                inline_keyboard: [
                    [{ text: '📊 Stats', callback_data: 'stats' }],
                    [{ text: '🏠 Main Menu', callback_data: 'start' }]
                ],
            };
            if (edit && ctx.callbackQuery && ctx.callbackQuery.message) {
                await ctx.editMessageText(message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard,
                    link_preview_options: { is_disabled: true },
                });
            }
            else {
                await ctx.reply(message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard,
                    link_preview_options: { is_disabled: true },
                });
            }
        }
        catch (error) {
            logger_1.default.error('[Telegram] Error in handleHistory:', error);
            logger_1.default.error('[Telegram] History error details:', error.message || String(error));
            await ctx.reply('Failed to fetch history. Please try again.');
        }
    }
    /**
     * Handle /settings command - view settings
     */
    async handleSettings(ctx, edit = false) {
        const telegramId = ctx.from.id.toString();
        if (!(await this.isUserRegistered(telegramId))) {
            await ctx.reply('Please use /start to connect your wallet first.');
            return;
        }
        try {
            await (0, userDatabase_1.updateLastActive)(telegramId);
            const settings = await (0, userSettings_1.getUserSettings)(telegramId);
            const message = (0, userSettings_1.formatSettingsDisplay)(settings) + '\n\n⚙️ *Select a category to configure:*';
            const keyboard = (0, interactiveSettings_1.getCategoryKeyboard)();
            if (edit && ctx.callbackQuery && ctx.callbackQuery.message) {
                await ctx.editMessageText(message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard,
                });
            }
            else {
                await ctx.reply(message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard,
                });
            }
        }
        catch (error) {
            logger_1.default.error('[Telegram] Error in handleSettings:', error);
            await ctx.reply('Failed to fetch settings. Please try again.');
        }
    }
    /**
     * Handle /pnl command - profit & loss display
     */
    async handlePnL(ctx, edit = false) {
        const telegramId = ctx.from.id.toString();
        if (!(await this.isUserRegistered(telegramId))) {
            await ctx.reply('Please use /start to connect your wallet first.');
            return;
        }
        try {
            await (0, userDatabase_1.updateLastActive)(telegramId);
            const balances = await (0, userWallet_1.getUserBalances)(telegramId);
            if (!balances) {
                await ctx.reply('Failed to fetch balances. Please try again.');
                return;
            }
            const user = await (0, userDatabase_1.getUser)(telegramId);
            const orbPrice = await (0, jupiter_1.getOrbPrice)();
            const pnl = await (0, userPnL_1.calculateUserPnL)(telegramId, user.public_key, balances.orb, balances.sol, 0, // automationSol - not available from getUserBalances
            0, // claimableSol - not available from getUserBalances
            0, // claimableOrb - not available from getUserBalances
            orbPrice.priceInUsd);
            const message = (0, userPnL_1.formatPnLDisplay)(pnl);
            const keyboard = {
                inline_keyboard: [
                    [{ text: '🔄 Refresh', callback_data: 'pnl' }],
                    [{ text: '🏠 Main Menu', callback_data: 'start' }],
                ],
            };
            if (edit && ctx.callbackQuery && ctx.callbackQuery.message) {
                await ctx.editMessageText(message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard,
                });
            }
            else {
                await ctx.reply(message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard,
                });
            }
        }
        catch (error) {
            logger_1.default.error('[Telegram] Error in handlePnL:', error);
            await ctx.reply('Failed to calculate P/L. Please try again.');
        }
    }
    /**
     * Handle /stake command - staking operations
     */
    async handleStake(ctx, edit = false) {
        const telegramId = ctx.from.id.toString();
        if (!(await this.isUserRegistered(telegramId))) {
            await ctx.reply('Please use /start to connect your wallet first.');
            return;
        }
        try {
            await (0, userDatabase_1.updateLastActive)(telegramId);
            const stakingInfo = await (0, userStaking_1.getUserStakingInfo)(telegramId);
            const message = (0, userStaking_1.formatStakingDisplay)(stakingInfo);
            const keyboard = {
                inline_keyboard: [
                    [{ text: '➕ Stake ORB', callback_data: 'stake_orb' }],
                    stakingInfo && stakingInfo.accrued_rewards > 0
                        ? [{ text: '💰 Claim Rewards', callback_data: 'claim_staking_rewards' }]
                        : [],
                    [{ text: '🔄 Refresh', callback_data: 'stake' }],
                    [{ text: '🏠 Main Menu', callback_data: 'start' }],
                ].filter(row => row.length > 0),
            };
            if (edit && ctx.callbackQuery && ctx.callbackQuery.message) {
                await ctx.editMessageText(message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard,
                });
            }
            else {
                await ctx.reply(message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard,
                });
            }
        }
        catch (error) {
            logger_1.default.error('[Telegram] Error in handleStake:', error);
            await ctx.reply('Failed to fetch staking info. Please try again.');
        }
    }
    /**
     * Handle /round command - current round info
     */
    async handleRound(ctx, edit = false) {
        const telegramId = ctx.from.id.toString();
        if (!(await this.isUserRegistered(telegramId))) {
            await ctx.reply('Please use /start to connect your wallet first.');
            return;
        }
        try {
            await (0, userDatabase_1.updateLastActive)(telegramId);
            const roundInfo = await (0, userRounds_1.getCurrentRoundInfo)();
            const message = (0, userRounds_1.formatCurrentRoundDisplay)(roundInfo);
            const keyboard = {
                inline_keyboard: [
                    [{ text: '🔄 Refresh', callback_data: 'round' }],
                    [{ text: '📜 Recent Rounds', callback_data: 'rounds' }],
                    [{ text: '🏠 Main Menu', callback_data: 'start' }],
                ],
            };
            if (edit && ctx.callbackQuery && ctx.callbackQuery.message) {
                await ctx.editMessageText(message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard,
                });
            }
            else {
                await ctx.reply(message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard,
                });
            }
        }
        catch (error) {
            logger_1.default.error('[Telegram] Error in handleRound:', error);
            await ctx.reply('Failed to fetch round info. Please try again.');
        }
    }
    /**
     * Handle /rounds command - recent rounds view
     */
    async handleRounds(ctx, edit = false) {
        const telegramId = ctx.from.id.toString();
        if (!(await this.isUserRegistered(telegramId))) {
            await ctx.reply('Please use /start to connect your wallet first.');
            return;
        }
        try {
            await (0, userDatabase_1.updateLastActive)(telegramId);
            const rounds = await (0, userRounds_1.getUserRecentRounds)(telegramId, 10);
            const stats = await (0, userRounds_1.getUserRoundStats)(telegramId);
            let message = (0, userRounds_1.formatRecentRoundsDisplay)(rounds);
            message += '\n\n' + (0, userRounds_1.formatRoundStatsDisplay)(stats);
            const keyboard = {
                inline_keyboard: [
                    [{ text: '🔄 Refresh', callback_data: 'rounds' }],
                    [{ text: '🎯 Current Round', callback_data: 'round' }],
                    [{ text: '🏠 Main Menu', callback_data: 'start' }],
                ],
            };
            if (edit && ctx.callbackQuery && ctx.callbackQuery.message) {
                await ctx.editMessageText(message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard,
                });
            }
            else {
                await ctx.reply(message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard,
                });
            }
        }
        catch (error) {
            logger_1.default.error('[Telegram] Error in handleRounds:', error);
            await ctx.reply('Failed to fetch rounds. Please try again.');
        }
    }
    /**
     * Handle /deploy command - manual deployment
     */
    async handleDeploy(ctx) {
        const telegramId = ctx.from.id.toString();
        if (!(await this.isUserRegistered(telegramId))) {
            await ctx.reply('Please use /start to connect your wallet first.');
            return;
        }
        try {
            await (0, userDatabase_1.updateLastActive)(telegramId);
            // Set session state to await deployment amount
            const session = this.getSession(ctx.from.id);
            session.awaitingDeployAmount = true;
            await ctx.reply('⚙️ *Manual Deployment*\n\nHow much SOL would you like to deploy to the current round?\n\nSend the amount (e.g., "0.5" for 0.5 SOL)\n\nOr use /cancel to abort.', { parse_mode: 'Markdown' });
        }
        catch (error) {
            logger_1.default.error('[Telegram] Error in handleDeploy:', error);
            await ctx.reply('Failed to process deployment. Please try again.');
        }
    }
    /**
     * Handle /claim_sol command - claim SOL rewards
     */
    async handleClaimSol(ctx) {
        const telegramId = ctx.from.id.toString();
        if (!(await this.isUserRegistered(telegramId))) {
            await ctx.reply('Please use /start to connect your wallet first.');
            return;
        }
        try {
            await (0, userDatabase_1.updateLastActive)(telegramId);
            await ctx.reply('⏳ Claiming SOL rewards...');
            const result = await (0, userOperations_1.claimUserSol)(telegramId);
            if (result.success) {
                const message = `✅ *SOL Claimed Successfully!*\n\nAmount: ${(0, formatters_1.formatSOL)(result.solAmount)}\n\nSignature: \`${result.signature.slice(0, 8)}...${result.signature.slice(-8)}\``;
                await ctx.reply(message, { parse_mode: 'Markdown' });
                // Send notification
                await (0, notifications_1.notifyTransactionSuccess)(telegramId, 'Claim SOL', result.signature, `Claimed ${(0, formatters_1.formatSOL)(result.solAmount)}`);
            }
            else {
                await ctx.reply(`❌ Failed to claim SOL: ${result.error}`);
                await (0, notifications_1.notifyTransactionFailed)(telegramId, 'Claim SOL', result.error);
            }
        }
        catch (error) {
            logger_1.default.error('[Telegram] Error in handleClaimSol:', error);
            await ctx.reply('Failed to claim SOL. Please try again.');
        }
    }
    /**
     * Handle /claim_orb command - claim ORB rewards
     */
    async handleClaimOrb(ctx) {
        const telegramId = ctx.from.id.toString();
        if (!(await this.isUserRegistered(telegramId))) {
            await ctx.reply('Please use /start to connect your wallet first.');
            return;
        }
        try {
            await (0, userDatabase_1.updateLastActive)(telegramId);
            await ctx.reply('⏳ Claiming ORB rewards...');
            const result = await (0, userOperations_1.claimUserOrb)(telegramId);
            if (result.success) {
                const message = `✅ *ORB Claimed Successfully!*\n\nAmount: ${(0, formatters_1.formatORB)(result.orbAmount)}\n\nSignature: \`${result.signature.slice(0, 8)}...${result.signature.slice(-8)}\``;
                await ctx.reply(message, { parse_mode: 'Markdown' });
                // Send notification
                await (0, notifications_1.notifyTransactionSuccess)(telegramId, 'Claim ORB', result.signature, `Claimed ${(0, formatters_1.formatORB)(result.orbAmount)}`);
            }
            else {
                await ctx.reply(`❌ Failed to claim ORB: ${result.error}`);
                await (0, notifications_1.notifyTransactionFailed)(telegramId, 'Claim ORB', result.error);
            }
        }
        catch (error) {
            logger_1.default.error('[Telegram] Error in handleClaimOrb:', error);
            await ctx.reply('Failed to claim ORB. Please try again.');
        }
    }
    /**
     * Handle /claim_staking command - claim staking rewards
     */
    async handleClaimStaking(ctx) {
        const telegramId = ctx.from.id.toString();
        if (!(await this.isUserRegistered(telegramId))) {
            await ctx.reply('Please use /start to connect your wallet first.');
            return;
        }
        try {
            await (0, userDatabase_1.updateLastActive)(telegramId);
            await ctx.reply('⏳ Claiming staking rewards...');
            const result = await (0, userOperations_1.claimUserStakingRewards)(telegramId);
            if (result.success) {
                const message = `✅ *Staking Rewards Claimed!*\n\nSOL: ${(0, formatters_1.formatSOL)(result.solAmount || 0)}\nORB: ${(0, formatters_1.formatORB)(result.orbAmount || 0)}\n\nSignature: \`${result.signature.slice(0, 8)}...${result.signature.slice(-8)}\``;
                await ctx.reply(message, { parse_mode: 'Markdown' });
                // Send notification
                await (0, notifications_1.notifyTransactionSuccess)(telegramId, 'Claim Staking', result.signature, `Claimed ${(0, formatters_1.formatSOL)(result.solAmount || 0)} + ${(0, formatters_1.formatORB)(result.orbAmount || 0)}`);
            }
            else {
                await ctx.reply(`❌ Failed to claim staking rewards: ${result.error}`);
                await (0, notifications_1.notifyTransactionFailed)(telegramId, 'Claim Staking', result.error);
            }
        }
        catch (error) {
            logger_1.default.error('[Telegram] Error in handleClaimStaking:', error);
            await ctx.reply('Failed to claim staking rewards. Please try again.');
        }
    }
    /**
     * Handle /swap command - swap ORB to SOL
     */
    async handleSwap(ctx) {
        const telegramId = ctx.from.id.toString();
        if (!(await this.isUserRegistered(telegramId))) {
            await ctx.reply('Please use /start to connect your wallet first.');
            return;
        }
        try {
            await (0, userDatabase_1.updateLastActive)(telegramId);
            // Set session state to await swap amount
            const session = this.getSession(ctx.from.id);
            session.awaitingSwapAmount = true;
            const balances = await (0, userWallet_1.getUserBalances)(telegramId);
            const message = `💱 *Swap ORB to SOL*\n\nYour ORB Balance: ${(0, formatters_1.formatORB)(balances?.orb || 0)}\n\nHow much ORB would you like to swap?\n\nSend the amount (e.g., "10" for 10 ORB)\n\nOr use /cancel to abort.`;
            await ctx.reply(message, { parse_mode: 'Markdown' });
        }
        catch (error) {
            logger_1.default.error('[Telegram] Error in handleSwap:', error);
            await ctx.reply('Failed to initiate swap. Please try again.');
        }
    }
    /**
     * Handle /logs command - view recent logs
     */
    async handleLogs(ctx, page = 0) {
        const telegramId = ctx.from.id.toString();
        // Owner-only command
        if (!this.isOwner(telegramId)) {
            await ctx.reply('⛔️ This command is only available to the bot owner.');
            return;
        }
        try {
            const fs = await Promise.resolve().then(() => __importStar(require('fs')));
            const path = await Promise.resolve().then(() => __importStar(require('path')));
            const logPath = path.join(process.cwd(), 'telegram-bot.log');
            if (!fs.existsSync(logPath)) {
                await ctx.reply('📋 *System Logs*\n\nNo log file found.', {
                    parse_mode: 'Markdown',
                });
                return;
            }
            // Read log file and get all lines
            const logContent = fs.readFileSync(logPath, 'utf-8');
            const allLines = logContent.split('\n').filter(line => line.trim());
            // Pagination: 30 lines per page
            const linesPerPage = 30;
            const totalPages = Math.ceil(allLines.length / linesPerPage);
            const currentPage = Math.max(0, Math.min(page, totalPages - 1));
            // Get lines for current page (from end, most recent first)
            const startIdx = allLines.length - (currentPage + 1) * linesPerPage;
            const endIdx = allLines.length - currentPage * linesPerPage;
            const pageLines = allLines.slice(Math.max(0, startIdx), endIdx);
            // Format lines (simple format, no escaping for code block)
            const formattedLogs = pageLines.map((line, index) => {
                const truncated = line.length > 120 ? line.substring(0, 117) + '...' : line;
                return truncated;
            }).join('\n');
            const message = `📋 *System Logs*\nPage ${currentPage + 1}/${totalPages} • Total: ${allLines.length} lines\n\n\`\`\`\n${formattedLogs}\n\`\`\``;
            // Pagination buttons
            const buttons = [];
            if (currentPage > 0) {
                buttons.push({ text: '◀️ Previous', callback_data: `logs_page_${currentPage - 1}` });
            }
            if (currentPage < totalPages - 1) {
                buttons.push({ text: 'Next ▶️', callback_data: `logs_page_${currentPage + 1}` });
            }
            const keyboard = {
                inline_keyboard: [
                    buttons.length > 0 ? buttons : [],
                    [{ text: '🔄 Refresh', callback_data: `logs_page_${currentPage}` }],
                    [{ text: '🏠 Close', callback_data: 'close_logs' }],
                ].filter(row => row.length > 0),
            };
            if (ctx.callbackQuery && ctx.callbackQuery.message) {
                await ctx.editMessageText(message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard,
                });
            }
            else {
                await ctx.reply(message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard,
                });
            }
        }
        catch (error) {
            logger_1.default.error('[Telegram] Error in handleLogs:', error);
            await ctx.reply('Failed to fetch logs. Please try again.');
        }
    }
    /**
     * Handle /owner_stats command - show dev fee earnings (owner only)
     */
    async handleOwnerStats(ctx) {
        const telegramId = ctx.from.id.toString();
        // Owner-only command
        if (!this.isOwner(telegramId)) {
            await ctx.reply('⛔️ This command is only available to the bot owner.');
            return;
        }
        try {
            // Get stats from NEW transactions only (where dev_fee_sol is tracked)
            const feeStats = await (0, database_1.getQuery)(`
        SELECT
          COALESCE(SUM(dev_fee_sol), 0) as total_dev_fees,
          COALESCE(SUM(tx_fee_sol), 0) as total_tx_fees,
          COUNT(*) as total_transactions
        FROM transactions
        WHERE status = 'success' AND dev_fee_sol > 0
      `);
            // Get active wallets count
            const activeWallets = await (0, database_1.getQuery)(`
        SELECT COUNT(DISTINCT wallet_address) as count
        FROM transactions
        WHERE status = 'success' AND wallet_address IS NOT NULL
      `);
            // Get user count
            const userCount = await (0, database_1.getQuery)(`
        SELECT COUNT(*) as count FROM telegram_users
      `);
            // Get transaction breakdown by type (NEW transactions only)
            const txBreakdown = await (0, database_1.allQuery)(`
        SELECT
          type,
          COUNT(*) as count,
          COALESCE(SUM(sol_amount), 0) as total_sol
        FROM transactions
        WHERE status = 'success' AND dev_fee_sol > 0
        GROUP BY type
        ORDER BY count DESC
        LIMIT 10
      `);
            // Calculate total fees
            const totalDevFees = feeStats?.total_dev_fees || 0;
            const totalTxFees = feeStats?.total_tx_fees || 0;
            const totalFees = totalDevFees + totalTxFees;
            // Format transaction breakdown with escaped underscores
            const breakdownText = txBreakdown && txBreakdown.length > 0
                ? txBreakdown.map(tx => {
                    const txType = tx.type.replace(/_/g, '\\_'); // Escape underscores
                    return `• ${txType}: ${tx.count} (${(0, formatters_1.formatSOL)(tx.total_sol)})`;
                }).join('\n')
                : '• No transactions yet';
            const message = `
👑 *Owner Statistics* (Recent Activity)

*💰 Dev Fee Earnings (1% Service Fee):*
Service Fees: ${(0, formatters_1.formatSOL)(totalDevFees)}
TX Processing: ${(0, formatters_1.formatSOL)(totalTxFees)}
Total Earnings: ${(0, formatters_1.formatSOL)(totalFees)}

*📊 Platform Stats:*
• Total Users: ${userCount?.count || 0}
• Active Wallets: ${activeWallets?.count || 0}
• Tracked Transactions: ${feeStats?.total_transactions || 0}

*📈 Transaction Breakdown:*
${breakdownText}

_Note: Stats from fee-tracked transactions only_
Generated: ${new Date().toLocaleString()}
`.trim();
            await ctx.reply(message, { parse_mode: 'Markdown' });
        }
        catch (error) {
            logger_1.default.error('[Telegram] Error in handleOwnerStats:', error);
            logger_1.default.error('[Telegram] Error details:', error.message || error);
            await ctx.reply(`Failed to fetch owner stats. Error: ${error.message || 'Unknown error'}`);
        }
    }
    /**
     * Handle /analytics command - analytics export
     */
    async handleAnalytics(ctx) {
        const telegramId = ctx.from.id.toString();
        if (!(await this.isUserRegistered(telegramId))) {
            await ctx.reply('Please use /start to connect your wallet first.');
            return;
        }
        try {
            await (0, userDatabase_1.updateLastActive)(telegramId);
            const user = await (0, userDatabase_1.getUser)(telegramId);
            const stats = await (0, userStats_1.getUserPerformanceStats)(user?.public_key || '');
            const rounds = await (0, userRounds_1.getUserRoundStats)(telegramId);
            const balances = await (0, userWallet_1.getUserBalances)(telegramId);
            const analyticsReport = `
📊 *Analytics Report*
Generated: ${new Date().toLocaleString()}

*Account:*
Public Key: \`${user?.public_key.slice(0, 8)}...${user?.public_key.slice(-8)}\`
Active Since: ${new Date(user.created_at).toLocaleDateString()}

*Current Balances:*
SOL: ${(0, formatters_1.formatSOL)(balances?.sol || 0)}
ORB: ${(0, formatters_1.formatORB)(balances?.orb || 0)}

*Performance:*
Total Transactions: ${stats.totalTransactions}
Successful: ${stats.successfulTransactions}
Success Rate: ${stats.successRate.toFixed(1)}%

*Mining:*
Total Rounds: ${rounds.totalRounds}
Total Deployed: ${(0, formatters_1.formatSOL)(rounds.totalDeployed)}
Win Rate: ${rounds.winRate.toFixed(1)}%

*Rewards:*
SOL Earned: ${(0, formatters_1.formatSOL)(rounds.totalRewardsSol)}
ORB Earned: ${(0, formatters_1.formatORB)(rounds.totalRewardsOrb)}

🚧 *Export Feature Coming Soon!*
Advanced analytics and chart export will be available in a future update.
`.trim();
            await ctx.reply(analyticsReport, { parse_mode: 'Markdown' });
        }
        catch (error) {
            logger_1.default.error('[Telegram] Error in handleAnalytics:', error);
            await ctx.reply('Failed to generate analytics. Please try again.');
        }
    }
    /**
     * Handle /set_transfer_recipient command - set transfer recipient address
     */
    async handleSetTransferRecipient(ctx) {
        const telegramId = ctx.from.id.toString();
        const userId = ctx.from.id;
        if (!(await this.isUserRegistered(telegramId))) {
            await ctx.reply('Please use /start to connect your wallet first.');
            return;
        }
        try {
            await (0, userDatabase_1.updateLastActive)(telegramId);
            // Set session state to await recipient address
            const session = this.getSession(userId);
            session.awaitingTransferRecipient = true;
            const message = await ctx.reply(`📤 *Set Transfer Recipient*\n\nPlease send the Solana wallet address where you want to transfer your ORB tokens.\n\nThe address will be validated before saving.\n\nUse /cancel to abort.`, { parse_mode: 'Markdown' });
            // Auto-delete after 20 seconds
            setTimeout(async () => {
                try {
                    await ctx.deleteMessage(message.message_id);
                }
                catch (error) {
                    // Ignore if message is already deleted
                }
            }, 20000);
        }
        catch (error) {
            logger_1.default.error('[Telegram] Error in handleSetTransferRecipient:', error);
            await ctx.reply('Failed to initiate recipient setup. Please try again.');
        }
    }
    /**
     * Handle /transfer_status command - show transfer configuration
     */
    async handleTransferStatus(ctx) {
        const telegramId = ctx.from.id.toString();
        if (!(await this.isUserRegistered(telegramId))) {
            await ctx.reply('Please use /start to connect your wallet first.');
            return;
        }
        try {
            await (0, userDatabase_1.updateLastActive)(telegramId);
            const status = await (0, orbAutoTransfer_1.getAutoTransferStatus)(telegramId);
            let recipientDisplay = 'Not set';
            if (status.recipientAddress) {
                recipientDisplay = `\`${status.recipientAddress.slice(0, 8)}...${status.recipientAddress.slice(-8)}\``;
            }
            const statusMessage = `
📤 *Auto-Transfer Status*

*Configuration:*
• Status: ${status.enabled ? '✅ Enabled' : '❌ Disabled'}
• Transfer Threshold: ${(0, formatters_1.formatORB)(status.threshold)}
• Recipient: ${recipientDisplay}

*Current Balance:*
• ORB Balance: ${(0, formatters_1.formatORB)(status.currentBalance)}
• Will Transfer: ${status.willTransfer ? '✅ Yes (conditions met)' : '❌ No'}

${!status.recipientAddress ? '\n⚠️ *Please set a recipient address first using /set_transfer_recipient*' : ''}

${!status.enabled && status.recipientAddress ? '\n💡 *Enable auto-transfer in /settings to activate*' : ''}

Transfers happen automatically when your ORB balance reaches the threshold.
`.trim();
            await ctx.reply(statusMessage, { parse_mode: 'Markdown' });
        }
        catch (error) {
            logger_1.default.error('[Telegram] Error in handleTransferStatus:', error);
            await ctx.reply('Failed to fetch transfer status. Please try again.');
        }
    }
    /**
     * Start the bot
     */
    async start() {
        try {
            // Initialize telegram users table
            await (0, userDatabase_1.initializeTelegramUsersTable)();
            logger_1.default.info('[Telegram] User database initialized');
            // Initialize notifications system
            (0, notifications_1.initializeNotifications)(this.bot);
            logger_1.default.info('[Telegram] Notifications system initialized');
            // Initialize auto-claim service
            (0, autoClaim_1.initializeAutoClaim)(this.bot);
            logger_1.default.info('[Telegram] Auto-claim service initialized');
            // Initialize automation executor service
            (0, autoExecutor_1.initializeAutoExecutor)();
            logger_1.default.info('[Telegram] Automation executor service initialized');
            // Config should already be loaded by main bot
            await this.bot.launch();
            logger_1.default.info('[Telegram] Telegram bot connected (multi-user mode)!');
            // Enable graceful stop
            process.once('SIGINT', () => this.stop('SIGINT'));
            process.once('SIGTERM', () => this.stop('SIGTERM'));
        }
        catch (error) {
            logger_1.default.error('[Telegram] Failed to start bot:', error);
            throw error;
        }
    }
    /**
     * Stop the bot gracefully
     */
    async stop(signal) {
        logger_1.default.info(`[Telegram] Received ${signal}, stopping bot...`);
        // Stop auto-claim service
        (0, autoClaim_1.stopAutoClaim)();
        logger_1.default.info('[Telegram] Auto-claim service stopped');
        // Stop automation executor service
        (0, autoExecutor_1.stopAutoExecutor)();
        logger_1.default.info('[Telegram] Automation executor service stopped');
        await this.bot.stop(signal);
        process.exit(0);
    }
}
exports.OrbMiningBot = OrbMiningBot;
// Main execution
async function main() {
    try {
        logger_1.default.info('[Telegram] Initializing multi-user bot...');
        // Explicitly initialize database first
        await (0, database_1.initializeDatabase)();
        logger_1.default.info('[Telegram] Database initialized');
        // Load config (database is already initialized)
        const cfg = await (0, config_1.loadConfigWithDB)();
        logger_1.default.info('[Telegram] Configuration loaded');
        // Get bot token from database
        const dbSettings = await (0, settingsLoader_1.loadSettingsFromDB)();
        const botToken = (0, settingsLoader_1.getSettingValue)(dbSettings, 'TELEGRAM_BOT_TOKEN', '');
        if (!botToken) {
            logger_1.default.error('[Telegram] TELEGRAM_BOT_TOKEN not set in database. Please add it via settings.');
            logger_1.default.info('[Telegram] Use: npx tsx scripts/setup-telegram-bot.ts YOUR_BOT_TOKEN');
            process.exit(1);
        }
        // Create and start bot
        const bot = new OrbMiningBot(botToken, cfg);
        await bot.start();
    }
    catch (error) {
        logger_1.default.error('[Telegram] Fatal error:', error);
        process.exit(1);
    }
}
// Run bot if executed directly
if (require.main === module) {
    main();
}
//# sourceMappingURL=bot.js.map