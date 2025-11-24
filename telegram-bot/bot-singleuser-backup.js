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
const telegraf_1 = require("telegraf");
const config_1 = require("../src/utils/config");
const wallet_1 = require("../src/utils/wallet");
const automationControl_1 = require("../src/utils/automationControl");
const database_1 = require("../src/utils/database");
const jupiter_1 = require("../src/utils/jupiter");
const logger_1 = __importDefault(require("../src/utils/logger"));
const formatters_1 = require("./utils/formatters");
/**
 * Telegram Bot for ORB Mining
 * Multi-user bot - each user manages their own wallet
 */
class OrbMiningBot {
    bot;
    sessions = new Map();
    constructor(token) {
        this.bot = new telegraf_1.Telegraf(token);
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
     * Setup middleware for logging and error handling
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
     * Setup bot commands
     */
    setupCommands() {
        // Start command - show welcome and main menu
        this.bot.command('start', async (ctx) => {
            await this.handleStart(ctx);
        });
        // Help command
        this.bot.command('help', async (ctx) => {
            await ctx.reply(`📖 ORB Mining Bot Help

*Available Commands:*
/start - Show main menu
/status - View current status
/control - Control automation
/stats - Performance stats
/rewards - Claimable rewards
/history - Transaction history
/settings - Bot settings
/help - This help message

*Features:*
• Real-time balance monitoring
• Start/Stop automation control
• Transaction history tracking
• Performance analytics
• Price alerts

Need more help? Contact support.`, { parse_mode: 'Markdown' });
        });
        // Status command - show balances and mining state
        this.bot.command('status', async (ctx) => {
            await this.handleStatus(ctx);
        });
        // Control command - automation controls
        this.bot.command('control', async (ctx) => {
            await this.handleControl(ctx);
        });
        // Stats command - performance statistics
        this.bot.command('stats', async (ctx) => {
            await this.handleStats(ctx);
        });
        // Rewards command - claimable rewards
        this.bot.command('rewards', async (ctx) => {
            await this.handleRewards(ctx);
        });
        // History command - transaction history
        this.bot.command('history', async (ctx) => {
            await this.handleHistory(ctx);
        });
        // Settings command - view settings
        this.bot.command('settings', async (ctx) => {
            await this.handleSettings(ctx);
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
        this.bot.action('rewards', async (ctx) => {
            await ctx.answerCbQuery();
            await this.handleRewards(ctx, true);
        });
        this.bot.action('history', async (ctx) => {
            await ctx.answerCbQuery();
            await this.handleHistory(ctx, true);
        });
        this.bot.action('settings', async (ctx) => {
            await ctx.answerCbQuery();
            await this.handleSettings(ctx, true);
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
        // Refresh actions - edit existing message
        this.bot.action('refresh_status', async (ctx) => {
            await ctx.answerCbQuery('Refreshing...');
            await this.handleStatus(ctx, true);
        });
        this.bot.action('refresh_control', async (ctx) => {
            await ctx.answerCbQuery('Refreshing...');
            await this.handleControl(ctx, true);
        });
    }
    /**
     * Handle /start command - show main menu
     */
    async handleStart(ctx) {
        const message = `👋 Welcome to ORB Mining Bot!

I'll help you monitor and control your mining operations.

Available commands:
/status - View mining status and balances
/control - Start/Stop automation
/stats - View performance statistics
/rewards - Check claimable rewards
/history - View recent transactions
/settings - View bot settings
/help - Show this help message

Use the buttons below or type a command to get started.`;
        const keyboard = {
            inline_keyboard: [
                [
                    { text: '📊 Status', callback_data: 'status' },
                    { text: '🎮 Control', callback_data: 'control' },
                ],
                [
                    { text: '💰 Rewards', callback_data: 'rewards' },
                    { text: '📜 History', callback_data: 'history' },
                ],
                [
                    { text: '⚙️ Settings', callback_data: 'settings' },
                ],
            ],
        };
        try {
            if (ctx.callbackQuery && ctx.callbackQuery.message) {
                await ctx.editMessageText(message, {
                    reply_markup: keyboard,
                });
            }
            else {
                await ctx.reply(message, {
                    reply_markup: keyboard,
                });
            }
        }
        catch (error) {
            logger_1.default.error('[Telegram] Error in handleStart:', error);
            await ctx.reply(message, {
                reply_markup: keyboard,
            });
        }
    }
    /**
     * Handle /status command - show balances and mining state
     */
    async handleStatus(ctx, edit = false) {
        try {
            const balances = await (0, wallet_1.getBalances)();
            const { priceInUsd: orbPriceUsd } = await (0, jupiter_1.getOrbPrice)();
            // Get automation info
            const wallet = (0, wallet_1.getWallet)();
            const automationInfo = await getAutomationInfo(wallet.publicKey);
            const statusEmoji = automationInfo && automationInfo.balance > 0 ? '⛏️' : '⏹️';
            const statusText = automationInfo && automationInfo.balance > 0 ? 'Mining' : 'Stopped';
            const message = `${statusEmoji} *Mining Status*

*Wallet Balance:*
💎 ${(0, formatters_1.formatSOL)(balances.sol)}
🔮 ${(0, formatters_1.formatORB)(balances.orb)}

*ORB Price:*
💵 ${(0, formatters_1.formatUSD)(orbPriceUsd)}

*Automation:*
Status: ${(0, formatters_1.formatStatus)(statusText)}
${automationInfo && automationInfo.balance > 0 ? `Budget: ${(0, formatters_1.formatSOL)(automationInfo.balance / 1e9)}
Rounds Left: ~${Math.floor(automationInfo.balance / automationInfo.costPerRound)}` : 'Not running'}

Updated: ${new Date().toLocaleTimeString()}`;
            const keyboard = {
                inline_keyboard: [
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
        try {
            const wallet = (0, wallet_1.getWallet)();
            const automationInfo = await getAutomationInfo(wallet.publicKey);
            const isRunning = automationInfo && automationInfo.balance > 0;
            const message = isRunning
                ? `🎮 *Automation Control*

Status: ⛏️ Mining
Budget: ${(0, formatters_1.formatSOL)(automationInfo.balance / 1e9)}
Rounds Left: ~${Math.floor(automationInfo.balance / automationInfo.costPerRound)}

Click below to stop automation and reclaim SOL.`
                : `🎮 *Automation Control*

Status: ⏹️ Stopped

Click below to start automation and begin mining.`;
            const keyboard = {
                inline_keyboard: [
                    [
                        isRunning
                            ? { text: '⏹️ Stop Mining', callback_data: 'stop_automation' }
                            : { text: '▶️ Start Mining', callback_data: 'start_automation' },
                    ],
                    [{ text: '🔄 Refresh', callback_data: 'refresh_control' }],
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
            logger_1.default.error('[Telegram] Error in handleControl:', error);
            await ctx.reply('Failed to fetch control info. Please try again.');
        }
    }
    /**
     * Handle start automation action
     */
    async handleStartAutomation(ctx) {
        try {
            await ctx.reply('⏳ Starting automation...');
            const result = await (0, automationControl_1.createAutomationAccount)();
            if (result.success) {
                await ctx.reply(`✅ *Automation Started!*

Deposited: ${(0, formatters_1.formatSOL)(result.depositedSol)}
Target Rounds: ${result.targetRounds}

Mining will begin automatically.`, { parse_mode: 'Markdown' });
            }
            else {
                await ctx.reply(`❌ Failed to start automation:\n${result.error}`);
            }
            // Refresh control panel
            await this.handleControl(ctx);
        }
        catch (error) {
            logger_1.default.error('[Telegram] Error in handleStartAutomation:', error);
            await ctx.reply('Failed to start automation. Please try again.');
        }
    }
    /**
     * Handle stop automation action
     */
    async handleStopAutomation(ctx) {
        try {
            await ctx.reply('⏳ Stopping automation...');
            const result = await (0, automationControl_1.closeAutomationAccount)();
            if (result.success) {
                await ctx.reply(`✅ *Automation Stopped!*

Returned: ${(0, formatters_1.formatSOL)(result.returnedSol)}

SOL has been returned to your wallet.`, { parse_mode: 'Markdown' });
            }
            else {
                await ctx.reply(`❌ Failed to stop automation:\n${result.error}`);
            }
            // Refresh control panel
            await this.handleControl(ctx);
        }
        catch (error) {
            logger_1.default.error('[Telegram] Error in handleStopAutomation:', error);
            await ctx.reply('Failed to stop automation. Please try again.');
        }
    }
    /**
     * Handle /stats command - performance statistics
     */
    async handleStats(ctx, edit = false) {
        try {
            // Get transaction stats from last 7 days
            const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
            const stats = await (0, database_1.allQuery)(`SELECT
          type,
          COUNT(*) as count,
          COALESCE(SUM(sol_amount), 0) as total_sol,
          COALESCE(SUM(orb_amount), 0) as total_orb
        FROM transactions
        WHERE timestamp > ?
        GROUP BY type`, [sevenDaysAgo]);
            let message = `📊 *Performance Stats (7 Days)*\n\n`;
            for (const stat of stats) {
                message += `${(0, formatters_1.formatTransactionType)(stat.type)}\n`;
                message += `  Count: ${stat.count}\n`;
                if (stat.total_sol > 0)
                    message += `  SOL: ${(0, formatters_1.formatSOL)(stat.total_sol)}\n`;
                if (stat.total_orb > 0)
                    message += `  ORB: ${(0, formatters_1.formatORB)(stat.total_orb)}\n`;
                message += `\n`;
            }
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
            logger_1.default.error('[Telegram] Error in handleStats:', error);
            await ctx.reply('Failed to fetch stats. Please try again.');
        }
    }
    /**
     * Handle /rewards command - claimable rewards
     */
    async handleRewards(ctx, edit = false) {
        try {
            const balances = await (0, wallet_1.getBalances)();
            const message = `💰 *Wallet Balance*

💎 ${(0, formatters_1.formatSOL)(balances.sol)}
🔮 ${(0, formatters_1.formatORB)(balances.orb)}

Auto-claim is enabled. Rewards will be claimed automatically when thresholds are reached.`;
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
        try {
            const transactions = await (0, database_1.allQuery)(`SELECT type, timestamp, sol_amount, orb_amount, status
        FROM transactions
        ORDER BY timestamp DESC
        LIMIT 10`);
            let message = `📜 *Recent Transactions*\n\n`;
            for (const tx of transactions) {
                message += `${(0, formatters_1.formatTransactionType)(tx.type)}\n`;
                message += `  ${(0, formatters_1.formatTimestamp)(tx.timestamp * 1000)}\n`;
                if (tx.sol_amount > 0)
                    message += `  ${(0, formatters_1.formatSOL)(tx.sol_amount)}\n`;
                if (tx.orb_amount > 0)
                    message += `  ${(0, formatters_1.formatORB)(tx.orb_amount)}\n`;
                message += `\n`;
            }
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
            logger_1.default.error('[Telegram] Error in handleHistory:', error);
            await ctx.reply('Failed to fetch history. Please try again.');
        }
    }
    /**
     * Handle /settings command - view settings
     */
    async handleSettings(ctx, edit = false) {
        try {
            const config = (0, config_1.getConfig)();
            const message = `⚙️ *Bot Settings*

*Mining:*
SOL per Block: ${config.solPerBlock}
Blocks per Round: ${config.blocksPerRound}
Motherload Threshold: ${config.motherloadThreshold} ORB

*Automation:*
Budget: ${config.initialAutomationBudgetPct}% of wallet

*Auto-Claim:*
SOL Threshold: ${(0, formatters_1.formatSOL)(config.autoClaimSolThreshold)}
ORB Threshold: ${(0, formatters_1.formatORB)(config.autoClaimOrbThreshold)}

*Auto-Swap:*
Enabled: ${config.autoSwapEnabled ? 'Yes' : 'No'}
ORB Threshold: ${(0, formatters_1.formatORB)(config.walletOrbSwapThreshold)}
Min Price: ${(0, formatters_1.formatUSD)(config.minOrbPriceUsd)}

Use the web dashboard to modify settings.`;
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
            logger_1.default.error('[Telegram] Error in handleSettings:', error);
            await ctx.reply('Failed to fetch settings. Please try again.');
        }
    }
    /**
     * Start the bot
     */
    async start() {
        try {
            // Config should already be loaded by main bot
            await this.bot.launch();
            logger_1.default.info('[Telegram] Telegram bot connected!');
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
        await this.bot.stop(signal);
        process.exit(0);
    }
}
exports.OrbMiningBot = OrbMiningBot;
/**
 * Get automation info helper (reuse from accounts.ts logic)
 */
async function getAutomationInfo(userPublicKey) {
    const { getAutomationPDA } = await Promise.resolve().then(() => __importStar(require('../src/utils/accounts')));
    const { getConnection } = await Promise.resolve().then(() => __importStar(require('../src/utils/solana')));
    const connection = getConnection();
    const [automationPDA] = getAutomationPDA(userPublicKey);
    const accountInfo = await connection.getAccountInfo(automationPDA);
    if (!accountInfo || accountInfo.data.length < 112) {
        return null;
    }
    const data = accountInfo.data;
    const amountPerSquare = data.readBigUInt64LE(8);
    const balance = data.readBigUInt64LE(48);
    const mask = data.readBigUInt64LE(104);
    return {
        pda: automationPDA,
        amountPerSquare: Number(amountPerSquare),
        balance: Number(balance),
        mask: Number(mask),
        costPerRound: Number(amountPerSquare) * Number(mask),
    };
}
// Main execution
async function main() {
    try {
        logger_1.default.info('[Telegram] Initializing bot...');
        // Step 1: Initialize database
        const { initializeDatabase } = await Promise.resolve().then(() => __importStar(require('../src/utils/database')));
        await initializeDatabase();
        // Step 2: Initialize settings
        const { initializeDefaultSettings, loadSettingsFromDB, getSettingValue } = await Promise.resolve().then(() => __importStar(require('../src/utils/settingsLoader')));
        await initializeDefaultSettings();
        // Step 3: Manually load config without going through cache
        // (loadAndCacheConfig causes double-initialization issues)
        const { loadConfigWithDB } = await Promise.resolve().then(() => __importStar(require('../src/utils/config')));
        const cfg = await loadConfigWithDB();
        // Manually set cached config
        const configModule = await Promise.resolve().then(() => __importStar(require('../src/utils/config')));
        configModule.cachedConfig = cfg;
        // Step 4: Get bot token from database
        const dbSettings = await loadSettingsFromDB();
        const botToken = getSettingValue(dbSettings, 'TELEGRAM_BOT_TOKEN', '');
        if (!botToken) {
            logger_1.default.error('[Telegram] TELEGRAM_BOT_TOKEN not set in database. Please add it via settings.');
            logger_1.default.info('[Telegram] Use: npx tsx scripts/setup-telegram-bot.ts YOUR_BOT_TOKEN');
            process.exit(1);
        }
        // Step 5: Create and start bot
        const bot = new OrbMiningBot(botToken);
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
//# sourceMappingURL=bot-singleuser-backup.js.map