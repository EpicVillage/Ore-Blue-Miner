import 'dotenv/config';
import { Telegraf, Context } from 'telegraf';
import { loadAndCacheConfig } from '../src/utils/config';
import { getOrbPrice, getSwapQuote } from '../src/utils/jupiter';
import logger from '../src/utils/logger';
import { initializeDatabase, getQuery, allQuery } from '../src/utils/database';
import {
  formatSOL,
  formatORB,
  formatUSD,
} from './utils/formatters';
import {
  initializeTelegramUsersTable,
  getUser,
  saveUser,
  updateLastActive,
  deleteUser
} from './utils/userDatabase';
import { initializeUserSettingsTable } from './utils/userSettings';
import { initializeUserRoundsTable } from './utils/userRounds';
import { initializeUserBalanceHistoryTable } from './utils/userPnL';
import {
  getUserBalances,
  validatePrivateKey,
  getUserWallet
} from './utils/userWallet';
import {
  getUserAutomationStatus,
  createUserAutomation,
  closeUserAutomation
} from './utils/userAutomation';
import {
  getUserTransactions,
  getUserPerformanceStats,
  getUserMiningStats,
  getUserClaimStats,
  formatTransactionForDisplay
} from './utils/userStats';
import {
  getUserSettings,
  updateUserSetting,
  formatSettingsDisplay,
  resetUserSettings
} from './utils/userSettings';
import {
  getCategoryKeyboard,
  getCategorySettingsKeyboard,
  getSettingEditKeyboard,
  formatSettingMessage,
  validateSettingValue,
  getSettingDefinition
} from './utils/interactiveSettings';
import {
  calculateUserPnL,
  formatPnLDisplay
} from './utils/userPnL';
import {
  getUserStakingInfo,
  formatStakingDisplay
} from './utils/userStaking';
import {
  getUserRecentRounds,
  getUserRoundStats,
  getCurrentRoundInfo,
  formatRecentRoundsDisplay,
  formatRoundStatsDisplay,
  formatCurrentRoundDisplay
} from './utils/userRounds';
import {
  claimUserSol,
  claimUserOrb,
  claimUserStakingRewards,
  swapUserOrbToSol,
  deployUserSol,
  getUserClaimableRewards
} from './utils/userOperations';
import {
  initializeNotifications,
  notifyTransactionSuccess,
  notifyTransactionFailed
} from './utils/notifications';
import {
  validateRecipientAddress,
  getAutoTransferStatus
} from './utils/orbAutoTransfer';
import {
  initializeAutoClaim,
  stopAutoClaim
} from './utils/autoClaim';
import {
  initializeAutoSwap,
  stopAutoSwap
} from './utils/autoSwap';
import {
  initializeAutoStake,
  stopAutoStake
} from './utils/autoStake';
import {
  initializeAutoExecutor,
  stopAutoExecutor
} from './utils/autoExecutor';

interface BotContext extends Context {
  // Extend context if needed for session data
}

/**
 * Telegram Bot for ORB Mining
 * Multi-user bot - each user manages their own wallet
 */
interface SessionData {
  awaitingPrivateKey?: boolean;
  awaitingSwapAmount?: boolean;
  awaitingDeployAmount?: boolean;
  awaitingTransferRecipient?: boolean;
  awaitingSettingInput?: {
    categoryKey: string;
    settingKey: string;
  };
}

class OrbMiningBot {
  private bot: Telegraf<BotContext>;
  private sessions: Map<number, SessionData> = new Map();
  private lastRefreshTime: Map<number, number> = new Map(); // Track last refresh time per user
  private ownerId: string;

  constructor(token: string, _config: any) {
    this.bot = new Telegraf<BotContext>(token);
    this.ownerId = process.env.TELEGRAM_OWNER_ID || '';
    this.setupMiddleware();
    this.setupCommands();
    this.setupCallbackHandlers();
    this.setupTextHandlers();
  }

  /**
   * Get or create session for a user
   */
  private getSession(userId: number) {
    if (!this.sessions.has(userId)) {
      this.sessions.set(userId, {});
    }
    return this.sessions.get(userId)!;
  }

  /**
   * Clear user session state
   */
  private clearSession(userId: number) {
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
  private async isUserRegistered(telegramId: string): Promise<boolean> {
    const user = await getUser(telegramId);
    return user !== null;
  }

  /**
   * Check if user is the bot owner
   */
  private isOwner(telegramId: string): boolean {
    return telegramId === this.ownerId;
  }

  /**
   * Setup middleware for logging, error handling, and user authentication
   */
  private setupMiddleware() {
    // Log all incoming messages
    this.bot.use(async (ctx, next) => {
      const username = ctx.from?.username || ctx.from?.id || 'unknown';
      const messageText = 'text' in (ctx.message || {}) ? (ctx.message as any).text : undefined;
      const callbackData = 'data' in (ctx.callbackQuery || {}) ? (ctx.callbackQuery as any).data : undefined;
      logger.info(`[Telegram] Message from @${username}: ${messageText || callbackData || 'callback'}`);
      await next();
    });

    // Global error handler
    this.bot.catch((err, ctx) => {
      logger.error('[Telegram] Bot error:', err);
      ctx.reply('An error occurred. Please try again or contact support.');
    });
  }

  /**
   * Setup text message handlers
   */
  private setupTextHandlers() {
    // Handle text inputs (private key, swap amount, deploy amount)
    this.bot.on('text', async (ctx) => {
      const userId = ctx.from!.id;
      const telegramId = userId.toString();
      const session = this.getSession(userId);
      const text = (ctx.message as any).text;

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
          await ctx.reply(`⏳ Swapping ${formatORB(amount)} to SOL...`);

          const result = await swapUserOrbToSol(telegramId, amount);

          if (result.success) {
            const message = `✅ *Swap Successful!*\n\nSwapped: ${formatORB(result.orbSwapped!)}\nReceived: ${formatSOL(result.solReceived!)}\n\n[View on Solscan](https://solscan.io/tx/${result.signature})`;
            await ctx.reply(message, { parse_mode: 'Markdown', link_preview_options: { is_disabled: true } });
          } else {
            await ctx.reply(`❌ Swap failed: ${result.error}`);
            await notifyTransactionFailed(telegramId, 'Swap', result.error!);
          }
        } catch (error) {
          logger.error('[Telegram] Error processing swap:', error);
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
          await ctx.reply(`⏳ Deploying ${formatSOL(amount)} to current round...`);

          const result = await deployUserSol(telegramId, amount);

          if (result.success) {
            const message = `✅ *Deployment Successful!*\n\nDeployed: ${formatSOL(result.solDeployed!)}\nRound: #${result.roundId}\n\n[View on Solscan](https://solscan.io/tx/${result.signature})\n\nGood luck! 🍀`;
            await ctx.reply(message, { parse_mode: 'Markdown', link_preview_options: { is_disabled: true } });
          } else {
            await ctx.reply(`❌ Deployment failed: ${result.error}`);
            await notifyTransactionFailed(telegramId, 'Deploy', result.error!);
          }
        } catch (error) {
          logger.error('[Telegram] Error processing deployment:', error);
          await ctx.reply('Failed to process deployment. Please try again.');
        }
        return;
      }

      // Check if we're waiting for a transfer recipient address
      if (session.awaitingTransferRecipient) {
        try {
          const address = text.trim();

          // Validate the address
          const validation = validateRecipientAddress(address);

          if (!validation.valid) {
            const errorMsg = await ctx.reply(`❌ Invalid address: ${validation.error}\n\nPlease enter a valid Solana wallet address or use /cancel to abort.`);

            // Auto-delete error message after 10 seconds
            setTimeout(async () => {
              try {
                await ctx.deleteMessage(errorMsg.message_id);
              } catch (error) {
                // Ignore if message is already deleted
              }
            }, 10000);
            return;
          }

          session.awaitingTransferRecipient = false;

          // Save the recipient address
          await updateUserSetting(telegramId, 'transfer_recipient_address', address);

          // Delete the user's message
          try {
            await ctx.deleteMessage();
          } catch (error) {
            // Ignore if we can't delete (might not have permission)
          }

          const successMsg = await ctx.reply(
            `✅ *Transfer Recipient Set!*\n\nRecipient: \`${address}\`\n\nYou can now enable auto-transfer in your settings (/settings).`,
            { parse_mode: 'Markdown' }
          );

          // Auto-delete success message after 10 seconds
          setTimeout(async () => {
            try {
              await ctx.deleteMessage(successMsg.message_id);
            } catch (error) {
              // Ignore if message is already deleted
            }
          }, 10000);

          logger.info(`[Transfer] Set recipient address for ${telegramId}: ${address}`);
        } catch (error) {
          logger.error('[Telegram] Error setting transfer recipient:', error);
          await ctx.reply('Failed to set transfer recipient. Please try again.');
        }
        return;
      }

      // Check if we're waiting for a setting input
      if (session.awaitingSettingInput) {
        try {
          const { categoryKey, settingKey } = session.awaitingSettingInput;
          const value = text.trim();

          const definition = getSettingDefinition(categoryKey, settingKey);
          if (!definition) {
            await ctx.reply('Setting not found. Please try again.');
            session.awaitingSettingInput = undefined;
            return;
          }

          // Validate the value
          const validation = validateSettingValue(definition, value);
          if (!validation.valid) {
            const errorMsg = await ctx.reply(`❌ Invalid value: ${validation.error}\n\nPlease send a valid value, or use /cancel to abort.`);

            // Auto-delete error message after 10 seconds
            setTimeout(async () => {
              try {
                await ctx.deleteMessage(errorMsg.message_id);
              } catch (error) {
                // Ignore if message is already deleted
              }
            }, 10000);
            return;
          }

          // Update the setting
          await updateUserSetting(telegramId, definition.key, validation.parsedValue);

          // Delete the user's message
          try {
            await ctx.deleteMessage();
          } catch (error) {
            // Ignore if we can't delete (might not have permission)
          }

          // Show success message
          const successMsg = await ctx.reply(
            `✅ *${definition.name} Updated!*\n\nNew value: ${validation.parsedValue} ${definition.unit || ''}\n\nYou can continue configuring settings with /settings.`,
            { parse_mode: 'Markdown' }
          );

          // Auto-delete success message after 10 seconds
          setTimeout(async () => {
            try {
              await ctx.deleteMessage(successMsg.message_id);
            } catch (error) {
              // Ignore if message is already deleted
            }
          }, 10000);

          session.awaitingSettingInput = undefined;
          logger.info(`[Settings] Updated ${settingKey} = ${validation.parsedValue} for ${telegramId}`);
        } catch (error) {
          logger.error('[Telegram] Error updating setting from input:', error);
          await ctx.reply('Failed to update setting. Please try again.');
        }
        return;
      }
    });
  }

  /**
   * Handle private key submission during onboarding
   */
  private async handlePrivateKeySubmission(ctx: BotContext) {
    const userId = ctx.from!.id.toString();
    const username = ctx.from!.username;
    const privateKeyInput = ('text' in ctx.message!) ? (ctx.message as any).text : '';

    try {
      // Validate the private key
      const validation = validatePrivateKey(privateKeyInput);

      if (!validation.valid) {
        await ctx.reply(
          `❌ Invalid private key: ${validation.error}\n\nPlease try again or use /cancel to abort.`
        );
        return;
      }

      // Save the user with encrypted private key
      await saveUser(userId, privateKeyInput, validation.publicKey!, username);

      // Clear the awaiting flag
      const session = this.getSession(parseInt(userId));
      session.awaitingPrivateKey = false;

      // Delete the message containing the private key for security
      try {
        await ctx.deleteMessage();
      } catch (e) {
        // Ignore if we can't delete (might not have permission)
      }

      await ctx.reply(
        `✅ *Wallet Connected!*\n\nPublic Key: \`${validation.publicKey}\`\n\nYour private key has been encrypted and stored securely.`,
        { parse_mode: 'Markdown' }
      );

      // Show main menu
      await this.handleStart(ctx);
    } catch (error) {
      logger.error('[Telegram] Error saving user wallet:', error);
      await ctx.reply('Failed to save wallet. Please try again or contact support.');
    }
  }

  /**
   * Setup bot commands
   */
  private setupCommands() {
    // Start command - show welcome or onboarding
    this.bot.command('start', async (ctx) => {
      await this.handleStart(ctx);
    });

    // Cancel command - abort any operation
    this.bot.command('cancel', async (ctx) => {
      const userId = ctx.from!.id;
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
        await ctx.reply(
          `📖 <b>ORB Mining Bot Help</b>

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
/stake - View stake & rewards`,
          { parse_mode: 'HTML' }
        );
      } catch (error) {
        logger.error('[Telegram] Error in help command:', error);
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
  private setupCallbackHandlers() {
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
      const telegramId = ctx.from!.id.toString();

      try {
        await deleteUser(telegramId);
        this.sessions.delete(ctx.from!.id);

        await ctx.editMessageText(
          '✅ *Wallet Removed*\n\nYour previous wallet has been disconnected.\n\nLet\'s set up a new wallet!',
          { parse_mode: 'Markdown' }
        );

        // Show onboarding after a brief delay
        setTimeout(() => {
          this.showOnboarding(ctx);
        }, 1000);
      } catch (error) {
        logger.error('[Telegram] Error changing wallet:', error);
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
      const telegramId = ctx.from!.id.toString();

      try {
        await deleteUser(telegramId);
        this.sessions.delete(ctx.from!.id);

        await ctx.editMessageText(
          '✅ *Wallet Removed Successfully*\n\nYour wallet has been disconnected and all data has been deleted.\n\nUse /start whenever you want to connect a new wallet.',
          { parse_mode: 'Markdown' }
        );
      } catch (error) {
        logger.error('[Telegram] Error removing wallet:', error);
        await ctx.reply('Failed to remove wallet. Please try again.');
      }
    });

    // Refresh actions - edit existing message
    this.bot.action('refresh_status', async (ctx) => {
      const userId = ctx.from!.id;
      const now = Date.now();
      const lastRefresh = this.lastRefreshTime.get(userId) || 0;
      const cooldown = 5000; // 5 seconds cooldown

      // Check if user is still in cooldown
      if (now - lastRefresh < cooldown) {
        const remainingSeconds = Math.ceil((cooldown - (now - lastRefresh)) / 1000);
        await ctx.answerCbQuery(`Please wait ${remainingSeconds}s before refreshing again`, { show_alert: false });
        return;
      }

      // Update last refresh time
      this.lastRefreshTime.set(userId, now);

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
      const userId = ctx.from!.id;
      const now = Date.now();
      const lastRefresh = this.lastRefreshTime.get(userId) || 0;
      const cooldown = 5000; // 5 seconds cooldown

      // Check if user is still in cooldown
      if (now - lastRefresh < cooldown) {
        const remainingSeconds = Math.ceil((cooldown - (now - lastRefresh)) / 1000);
        await ctx.answerCbQuery(`Please wait ${remainingSeconds}s before refreshing again`, { show_alert: false });
        return;
      }

      // Update last refresh time
      this.lastRefreshTime.set(userId, now);

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
      } catch (error) {
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
      const keyboard = getCategoryKeyboard();
      await ctx.editMessageText(
        '⚙️ *Configure Settings*\n\nSelect a category to configure:',
        { parse_mode: 'Markdown', reply_markup: keyboard }
      );
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
        const telegramId = ctx.from!.id.toString();

        const settings = await getUserSettings(telegramId);
        const keyboard = getCategorySettingsKeyboard(categoryKey, settings);

        await ctx.editMessageText(
          `⚙️ *Settings - ${categoryKey.charAt(0).toUpperCase() + categoryKey.slice(1)}*\n\nSelect a setting to modify:`,
          { parse_mode: 'Markdown', reply_markup: keyboard }
        );
      } catch (error) {
        logger.error('[Telegram] Error in settings_cat handler:', error);
        await ctx.answerCbQuery('Error loading category');
      }
    });

    this.bot.action(/^settings_edit_(.+?)_(.+)$/, async (ctx) => {
      try {
        await ctx.answerCbQuery();
        const match = ctx.match;
        const categoryKey = match[1];
        const settingKey = match[2];
        const telegramId = ctx.from!.id.toString();

        const settings = await getUserSettings(telegramId);
        const definition = getSettingDefinition(categoryKey, settingKey);

        if (!definition) {
          await ctx.answerCbQuery('Setting not found');
          return;
        }

        const currentValue = settings[definition.key];
        const message = formatSettingMessage(categoryKey, settingKey, currentValue, definition);
        const keyboard = getSettingEditKeyboard(categoryKey, settingKey, currentValue, definition);

        await ctx.editMessageText(message, {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
      } catch (error) {
        logger.error('[Telegram] Error in settings_edit handler:', error);
        await ctx.answerCbQuery('Error loading setting');
      }
    });

    this.bot.action(/^settings_set_(.+?)_(.+)_(true|false|Low|Medium|High|Very High)$/, async (ctx) => {
      try {
        const match = ctx.match;
        const categoryKey = match[1];
        const settingKey = match[2];
        const valueStr = match[3];
        const telegramId = ctx.from!.id.toString();

        logger.info(`[Settings] Attempting to set ${categoryKey}/${settingKey} = ${valueStr}`);

        const definition = getSettingDefinition(categoryKey, settingKey);

        if (!definition) {
          logger.warn(`[Settings] Definition not found for ${categoryKey}/${settingKey}`);
          await ctx.answerCbQuery('Setting not found');
          return;
        }

        logger.info(`[Settings] Found definition for ${definition.key}`);

        const validation = validateSettingValue(definition, valueStr);

        if (!validation.valid) {
          logger.warn(`[Settings] Validation failed: ${validation.error}`);
          await ctx.answerCbQuery(`Error: ${validation.error}`);
          return;
        }

        logger.info(`[Settings] Validation passed, updating to: ${validation.parsedValue}`);

        await updateUserSetting(telegramId, definition.key, validation.parsedValue);
        await ctx.answerCbQuery('✅ Setting updated');

        logger.info(`[Settings] Setting updated successfully`);

        // Refresh the category view
        const settings = await getUserSettings(telegramId);
        const keyboard = getCategorySettingsKeyboard(categoryKey, settings);

        await ctx.editMessageText(
          `⚙️ *Settings - ${categoryKey.charAt(0).toUpperCase() + categoryKey.slice(1)}*\n\nSelect a setting to modify:`,
          { parse_mode: 'Markdown', reply_markup: keyboard }
        );
      } catch (error) {
        logger.error('[Telegram] Error in settings_set handler:', error);
        await ctx.answerCbQuery('Error updating setting');
      }
    });

    this.bot.action(/^settings_input_(.+?)_(.+)$/, async (ctx) => {
      await ctx.answerCbQuery();
      const match = ctx.match;
      const categoryKey = match[1];
      const settingKey = match[2];
      const userId = ctx.from!.id;
      const telegramId = userId.toString();

      const definition = getSettingDefinition(categoryKey, settingKey);
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

      const message = await ctx.reply(
        `📝 *${definition.name}*\n\n${definition.description}${rangeInfo}\n\nPlease send the new value, or use /cancel to abort.`,
        { parse_mode: 'Markdown' }
      );

      // Auto-delete after 20 seconds
      setTimeout(async () => {
        try {
          await ctx.deleteMessage(message.message_id);
        } catch (error) {
          // Ignore if message is already deleted
        }
      }, 20000);
    });

    this.bot.action('set_transfer_recipient_prompt', async (ctx) => {
      await ctx.answerCbQuery();
      const userId = ctx.from!.id;
      const telegramId = userId.toString();

      const session = this.getSession(userId);
      session.awaitingTransferRecipient = true;

      const message = await ctx.reply(
        `📤 *Set Transfer Recipient*\n\nPlease send the Solana wallet address where you want to transfer your ORB tokens.\n\nThe address will be validated before saving.\n\nUse /cancel to abort.`,
        { parse_mode: 'Markdown' }
      );

      // Auto-delete after 20 seconds
      setTimeout(async () => {
        try {
          await ctx.deleteMessage(message.message_id);
        } catch (error) {
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
      const telegramId = ctx.from!.id.toString();

      await resetUserSettings(telegramId);

      const keyboard = getCategoryKeyboard();
      await ctx.editMessageText(
        '✅ *Settings Reset*\n\nAll settings have been reset to defaults.\n\nSelect a category to configure:',
        { parse_mode: 'Markdown', reply_markup: keyboard }
      );
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
  private async handleStart(ctx: BotContext) {
    const telegramId = ctx.from!.id.toString();
    const isRegistered = await this.isUserRegistered(telegramId);

    if (!isRegistered) {
      // Show onboarding message
      await this.showOnboarding(ctx);
      return;
    }

    // Update last active
    await updateLastActive(telegramId);

    // Show main menu
    const user = await getUser(telegramId);
    const message = `👋 Welcome back to ORB Mining Bot!

*Your Wallet:* \`${user!.public_key.slice(0, 8)}...${user!.public_key.slice(-8)}\`

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
      } else {
        await ctx.reply(message, {
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        });
      }
    } catch (error) {
      logger.error('[Telegram] Error in handleStart:', error);
      await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      });
    }
  }

  /**
   * Show onboarding flow for new users
   */
  private async showOnboarding(ctx: BotContext) {
    const userId = ctx.from!.id;
    const session = this.getSession(userId);
    session.awaitingPrivateKey = true;

    await ctx.reply(
      `👋 *Welcome to ORB Mining Bot!*

This is a bot to help mine ore.blue tokens.

To get started, please send me your Solana wallet *private key*.

⚠️ *IMPORTANT Notes:*
• This bot is made as a casual project
• Use a FRESH wallet only - do NOT connect a wallet with other positions or significant funds
• Only use a wallet you're comfortable experimenting with
• You can remove your wallet anytime with /wallet

Send your private key now, or use /cancel to abort.`,
      { parse_mode: 'Markdown' }
    );
  }

  /**
   * Handle /wallet command - manage wallet
   */
  private async handleWallet(ctx: BotContext, edit: boolean = false) {
    const telegramId = ctx.from!.id.toString();
    const user = await getUser(telegramId);

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
      } else {
        await ctx.reply(message, {
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        });
      }
    } catch (error) {
      logger.error('[Telegram] Error in handleWallet:', error);
      await ctx.reply('Failed to fetch wallet info. Please try again.');
    }
  }

  /**
   * Handle /status command - show balances and mining state
   */
  private async handleStatus(ctx: BotContext, edit: boolean = false) {
    const telegramId = ctx.from!.id.toString();

    if (!(await this.isUserRegistered(telegramId))) {
      await ctx.reply('Please use /start to connect your wallet first.');
      return;
    }

    try {
      const balances = await getUserBalances(telegramId);
      const { priceInUsd: orbPriceUsd } = await getOrbPrice();
      const rewards = await getUserClaimableRewards(telegramId);
      await updateLastActive(telegramId);

      const hasClaimableRewards = rewards.totalSol > 0 || rewards.totalOrb > 0;

      let message = `💼 *Wallet Dashboard*

*Current Balance:*
💎 ${formatSOL(balances.sol)}
🔮 ${formatORB(balances.orb)}

*Claimable Rewards:*
${rewards.miningSol > 0 ? `⛏️ Mining SOL: ${formatSOL(rewards.miningSol)}` : ''}
${rewards.miningOrb > 0 ? `⛏️ Mining ORB: ${formatORB(rewards.miningOrb)}` : ''}
${rewards.stakingSol > 0 ? `📊 Staking SOL: ${formatSOL(rewards.stakingSol)}` : ''}
${rewards.stakingOrb > 0 ? `📊 Staking ORB: ${formatORB(rewards.stakingOrb)}` : ''}
${!hasClaimableRewards ? '✅ No pending rewards' : ''}
─────────────────────────
*ORB Price:*
💵 ${formatUSD(orbPriceUsd)}

*Portfolio Value:*
💰 ${formatUSD(balances.sol * 150 + balances.orb * orbPriceUsd)}

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
      } else {
        await ctx.reply(message, {
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        });
      }
    } catch (error: any) {
      // Ignore "message is not modified" error (happens when clicking refresh with no changes)
      if (error?.message?.includes('message is not modified')) {
        logger.debug('[Telegram] Status page unchanged, ignoring refresh');
        return;
      }

      logger.error('[Telegram] Error in handleStatus:', error);
      await ctx.reply('Failed to fetch status. Please try again.');
    }
  }

  /**
   * Handle /control command - automation controls
   */
  private async handleControl(ctx: BotContext, edit: boolean = false) {
    const telegramId = ctx.from!.id.toString();

    if (!(await this.isUserRegistered(telegramId))) {
      await ctx.reply('Please use /start to connect your wallet first.');
      return;
    }

    try {
      await updateLastActive(telegramId);
      const userWallet = await getUserWallet(telegramId);

      if (!userWallet) {
        await ctx.reply('Failed to load wallet. Please try /wallet to reconnect.');
        return;
      }

      const automationStatus = await getUserAutomationStatus(userWallet);

      let message: string;
      let keyboard;

      if (automationStatus.active) {
        message = `🎮 *Automation Control*

*Status:* ✅ Active

*Remaining Balance:* ${formatSOL(automationStatus.balance!)}
*Cost per Round:* ${formatSOL(automationStatus.costPerRound!)}
*Estimated Rounds:* ${automationStatus.estimatedRounds}

The automation will continue running until the balance is depleted.`;

        keyboard = {
          inline_keyboard: [
            [{ text: '⏹️ Stop Automation', callback_data: 'stop_automation' }],
            [{ text: '🔄 Refresh', callback_data: 'refresh_control' }],
            [{ text: '🏠 Main Menu', callback_data: 'start' }],
          ],
        };
      } else {
        const settings = await getUserSettings(telegramId);
        const balances = await getUserBalances(telegramId);
        const estimatedBudget = balances.sol * (settings.automation_budget_percent / 100);
        const solPerRound = settings.sol_per_block * settings.num_blocks;
        const estimatedRounds = Math.min(Math.floor(estimatedBudget / solPerRound), 1000);

        message = `🎮 *Automation Control*

*Status:* ⏸️ Inactive

*Your Balance:* ${formatSOL(balances.sol)}
*Estimated Budget:* ${formatSOL(estimatedBudget)} (${settings.automation_budget_percent}%)
*Cost per Round:* ${formatSOL(solPerRound)}
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
      } else {
        await ctx.reply(message, {
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        });
      }
    } catch (error: any) {
      // Ignore "message is not modified" error (happens when clicking refresh with no changes)
      if (error?.message?.includes('message is not modified')) {
        logger.debug('[Telegram] Control page unchanged, ignoring refresh');
        return;
      }

      logger.error('[Telegram] Error in handleControl:', error);
      await ctx.reply('Failed to fetch automation status. Please try again.');
    }
  }

  /**
   * Handle starting automation
   */
  private async handleStartAutomation(ctx: BotContext) {
    const telegramId = ctx.from!.id.toString();

    try {
      const userWallet = await getUserWallet(telegramId);
      if (!userWallet) {
        await ctx.reply('Failed to load wallet. Please try /wallet to reconnect.');
        return;
      }

      await ctx.editMessageText('⏳ Starting automation... This may take a moment.', {
        parse_mode: 'Markdown',
      });

      const result = await createUserAutomation(userWallet, telegramId);

      if (result.success) {
        const message = `✅ *Automation Started!*

*Deposited:* ${formatSOL(result.depositedSol!)}
*Target Rounds:* ${result.targetRounds}
*Transaction:* \`${result.signature}\`

Your automation is now active and will mine ORB for you automatically.`;

        await ctx.editMessageText(message, { parse_mode: 'Markdown' });

        // Refresh control panel after brief delay
        setTimeout(() => {
          this.handleControl(ctx, true);
        }, 2000);
      } else {
        await ctx.editMessageText(
          `❌ *Failed to Start Automation*\n\n${result.error}\n\nPlease try again or contact support.`,
          { parse_mode: 'Markdown' }
        );
      }
    } catch (error) {
      logger.error('[Telegram] Error starting automation:', error);
      await ctx.reply('Failed to start automation. Please try again.');
    }
  }

  /**
   * Handle stopping automation
   */
  private async handleStopAutomation(ctx: BotContext) {
    const telegramId = ctx.from!.id.toString();

    try {
      const userWallet = await getUserWallet(telegramId);
      if (!userWallet) {
        await ctx.reply('Failed to load wallet. Please try /wallet to reconnect.');
        return;
      }

      await ctx.editMessageText('⏳ Stopping automation... This may take a moment.', {
        parse_mode: 'Markdown',
      });

      const result = await closeUserAutomation(userWallet, telegramId);

      if (result.success) {
        const message = `✅ *Automation Stopped!*

*Returned SOL:* ${formatSOL(result.returnedSol!)}
*Transaction:* \`${result.signature}\`

Your automation has been stopped and remaining balance returned to your wallet.`;

        await ctx.editMessageText(message, { parse_mode: 'Markdown' });

        // Refresh control panel after brief delay
        setTimeout(() => {
          this.handleControl(ctx, true);
        }, 2000);
      } else {
        await ctx.editMessageText(
          `❌ *Failed to Stop Automation*\n\n${result.error}\n\nPlease try again or contact support.`,
          { parse_mode: 'Markdown' }
        );
      }
    } catch (error) {
      logger.error('[Telegram] Error stopping automation:', error);
      await ctx.reply('Failed to stop automation. Please try again.');
    }
  }

  /**
   * Handle /stats command - performance statistics
   */
  private async handleStats(ctx: BotContext, edit: boolean = false) {
    const telegramId = ctx.from!.id.toString();

    if (!(await this.isUserRegistered(telegramId))) {
      await ctx.reply('Please use /start to connect your wallet first.');
      return;
    }

    try {
      await updateLastActive(telegramId);
      const user = await getUser(telegramId);
      const walletAddress = user!.public_key;

      // Get all stats in parallel
      const [miningStats, claimStats, balances] = await Promise.all([
        getUserMiningStats(walletAddress),
        getUserClaimStats(walletAddress),
        getUserBalances(telegramId),
      ]);

      const message = `📊 *Complete Analytics*

*Account Info:*
Wallet: \`${walletAddress.slice(0, 8)}...${walletAddress.slice(-8)}\`
Active Since: ${new Date(user!.created_at).toLocaleDateString()}

*Current Holdings:*
💎 ${formatSOL(balances.sol)}
🔮 ${formatORB(balances.orb)}

*Mining Stats:*
• Total Deployments: ${miningStats.totalMines}
• Successful: ${miningStats.successfulMines}
• Total ORB Earned: ${formatORB(miningStats.totalOrbMined)}
• Avg per Deployment: ${formatORB(miningStats.avgOrbPerMine)}

*Total Claims:*
• SOL Claimed: ${formatSOL(claimStats.totalSolClaimed)}
• ORB Claimed: ${formatORB(claimStats.totalOrbClaimed)}
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
      } else {
        await ctx.reply(message, {
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        });
      }
    } catch (error) {
      logger.error('[Telegram] Error in handleStats:', error);
      await ctx.reply('Failed to fetch stats. Please try again.');
    }
  }

  /**
   * Handle /rewards command - claimable rewards
   */
  private async handleRewards(ctx: BotContext, edit: boolean = false) {
    const telegramId = ctx.from!.id.toString();

    if (!(await this.isUserRegistered(telegramId))) {
      await ctx.reply('Please use /start to connect your wallet first.');
      return;
    }

    try {
      const balances = await getUserBalances(telegramId);
      await updateLastActive(telegramId);

      const message = `💰 *Wallet Balance*

💎 ${formatSOL(balances.solBalance)}
🔮 ${formatORB(balances.orbBalance)}

Auto-claim features are coming soon for multi-user support.`;

      const keyboard = {
        inline_keyboard: [[{ text: '🏠 Main Menu', callback_data: 'start' }]],
      };

      if (edit && ctx.callbackQuery && ctx.callbackQuery.message) {
        await ctx.editMessageText(message, {
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        });
      } else {
        await ctx.reply(message, {
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        });
      }
    } catch (error) {
      logger.error('[Telegram] Error in handleRewards:', error);
      await ctx.reply('Failed to fetch rewards. Please try again.');
    }
  }

  /**
   * Handle /history command - recent transactions
   */
  private async handleHistory(ctx: BotContext, edit: boolean = false) {
    const telegramId = ctx.from!.id.toString();

    if (!(await this.isUserRegistered(telegramId))) {
      await ctx.reply('Please use /start to connect your wallet first.');
      return;
    }

    try {
      await updateLastActive(telegramId);
      const user = await getUser(telegramId);
      const walletAddress = user!.public_key;

      // Get recent transactions (limit to 10)
      const transactions = await getUserTransactions(walletAddress, 10);

      let message = `📜 *Transaction History*\n\n`;

      if (transactions.length === 0) {
        message += `No transactions found yet.\n\nStart using automation to see your transaction history here!`;
      } else {
        message += `*Last ${transactions.length} Transactions:*\n\n`;

        transactions.forEach((tx, index) => {
          message += formatTransactionForDisplay(tx);
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
      } else {
        await ctx.reply(message, {
          parse_mode: 'Markdown',
          reply_markup: keyboard,
          link_preview_options: { is_disabled: true },
        });
      }
    } catch (error: any) {
      logger.error('[Telegram] Error in handleHistory:', error);
      logger.error('[Telegram] History error details:', error.message || String(error));
      await ctx.reply('Failed to fetch history. Please try again.');
    }
  }

  /**
   * Handle /settings command - view settings
   */
  private async handleSettings(ctx: BotContext, edit: boolean = false) {
    const telegramId = ctx.from!.id.toString();

    if (!(await this.isUserRegistered(telegramId))) {
      await ctx.reply('Please use /start to connect your wallet first.');
      return;
    }

    try {
      await updateLastActive(telegramId);

      const settings = await getUserSettings(telegramId);
      const message = formatSettingsDisplay(settings) + '\n\n⚙️ *Select a category to configure:*';

      const keyboard = getCategoryKeyboard();

      if (edit && ctx.callbackQuery && ctx.callbackQuery.message) {
        await ctx.editMessageText(message, {
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        });
      } else {
        await ctx.reply(message, {
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        });
      }
    } catch (error) {
      logger.error('[Telegram] Error in handleSettings:', error);
      await ctx.reply('Failed to fetch settings. Please try again.');
    }
  }

  /**
   * Handle /pnl command - profit & loss display
   */
  private async handlePnL(ctx: BotContext, edit: boolean = false) {
    const telegramId = ctx.from!.id.toString();

    if (!(await this.isUserRegistered(telegramId))) {
      await ctx.reply('Please use /start to connect your wallet first.');
      return;
    }

    try {
      await updateLastActive(telegramId);

      const balances = await getUserBalances(telegramId);
      if (!balances) {
        await ctx.reply('Failed to fetch balances. Please try again.');
        return;
      }

      const user = await getUser(telegramId);
      const orbPrice = await getOrbPrice();

      const pnl = await calculateUserPnL(
        telegramId,
        user!.public_key,
        balances.orb,
        balances.sol,
        0, // automationSol - not available from getUserBalances
        0, // claimableSol - not available from getUserBalances
        0, // claimableOrb - not available from getUserBalances
        orbPrice.priceInUsd
      );

      const message = formatPnLDisplay(pnl);

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
      } else {
        await ctx.reply(message, {
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        });
      }
    } catch (error) {
      logger.error('[Telegram] Error in handlePnL:', error);
      await ctx.reply('Failed to calculate P/L. Please try again.');
    }
  }

  /**
   * Handle /stake command - staking operations
   */
  private async handleStake(ctx: BotContext, edit: boolean = false) {
    const telegramId = ctx.from!.id.toString();

    if (!(await this.isUserRegistered(telegramId))) {
      await ctx.reply('Please use /start to connect your wallet first.');
      return;
    }

    try {
      await updateLastActive(telegramId);

      const stakingInfo = await getUserStakingInfo(telegramId);
      const message = formatStakingDisplay(stakingInfo);

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
      } else {
        await ctx.reply(message, {
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        });
      }
    } catch (error) {
      logger.error('[Telegram] Error in handleStake:', error);
      await ctx.reply('Failed to fetch staking info. Please try again.');
    }
  }

  /**
   * Handle /round command - current round info
   */
  private async handleRound(ctx: BotContext, edit: boolean = false) {
    const telegramId = ctx.from!.id.toString();

    if (!(await this.isUserRegistered(telegramId))) {
      await ctx.reply('Please use /start to connect your wallet first.');
      return;
    }

    try {
      await updateLastActive(telegramId);

      const roundInfo = await getCurrentRoundInfo();
      const message = formatCurrentRoundDisplay(roundInfo);

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
      } else {
        await ctx.reply(message, {
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        });
      }
    } catch (error) {
      logger.error('[Telegram] Error in handleRound:', error);
      await ctx.reply('Failed to fetch round info. Please try again.');
    }
  }

  /**
   * Handle /rounds command - recent rounds view
   */
  private async handleRounds(ctx: BotContext, edit: boolean = false) {
    const telegramId = ctx.from!.id.toString();

    if (!(await this.isUserRegistered(telegramId))) {
      await ctx.reply('Please use /start to connect your wallet first.');
      return;
    }

    try {
      await updateLastActive(telegramId);

      const rounds = await getUserRecentRounds(telegramId, 10);
      const stats = await getUserRoundStats(telegramId);

      let message = formatRecentRoundsDisplay(rounds);
      message += '\n\n' + formatRoundStatsDisplay(stats);

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
      } else {
        await ctx.reply(message, {
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        });
      }
    } catch (error) {
      logger.error('[Telegram] Error in handleRounds:', error);
      await ctx.reply('Failed to fetch rounds. Please try again.');
    }
  }

  /**
   * Handle /deploy command - manual deployment
   */
  private async handleDeploy(ctx: BotContext) {
    const telegramId = ctx.from!.id.toString();

    if (!(await this.isUserRegistered(telegramId))) {
      await ctx.reply('Please use /start to connect your wallet first.');
      return;
    }

    try {
      await updateLastActive(telegramId);

      // Set session state to await deployment amount
      const session = this.getSession(ctx.from!.id);
      session.awaitingDeployAmount = true;

      await ctx.reply(
        '⚙️ *Manual Deployment*\n\nHow much SOL would you like to deploy to the current round?\n\nSend the amount (e.g., "0.5" for 0.5 SOL)\n\nOr use /cancel to abort.',
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      logger.error('[Telegram] Error in handleDeploy:', error);
      await ctx.reply('Failed to process deployment. Please try again.');
    }
  }

  /**
   * Handle /claim_sol command - claim SOL rewards
   */
  private async handleClaimSol(ctx: BotContext) {
    const telegramId = ctx.from!.id.toString();

    if (!(await this.isUserRegistered(telegramId))) {
      await ctx.reply('Please use /start to connect your wallet first.');
      return;
    }

    try {
      await updateLastActive(telegramId);

      await ctx.reply('⏳ Claiming SOL rewards...');

      const result = await claimUserSol(telegramId);

      if (result.success) {
        const message = `✅ *SOL Claimed Successfully!*\n\nAmount: ${formatSOL(result.solAmount!)}\n\n[View on Solscan](https://solscan.io/tx/${result.signature})`;
        await ctx.reply(message, { parse_mode: 'Markdown', link_preview_options: { is_disabled: true } });
      } else {
        await ctx.reply(`❌ Failed to claim SOL: ${result.error}`);
        await notifyTransactionFailed(telegramId, 'Claim SOL', result.error!);
      }
    } catch (error) {
      logger.error('[Telegram] Error in handleClaimSol:', error);
      await ctx.reply('Failed to claim SOL. Please try again.');
    }
  }

  /**
   * Handle /claim_orb command - claim ORB rewards
   */
  private async handleClaimOrb(ctx: BotContext) {
    const telegramId = ctx.from!.id.toString();

    if (!(await this.isUserRegistered(telegramId))) {
      await ctx.reply('Please use /start to connect your wallet first.');
      return;
    }

    try {
      await updateLastActive(telegramId);

      await ctx.reply('⏳ Claiming ORB rewards...');

      const result = await claimUserOrb(telegramId);

      if (result.success) {
        const message = `✅ *ORB Claimed Successfully!*\n\nAmount: ${formatORB(result.orbAmount!)}\n\n[View on Solscan](https://solscan.io/tx/${result.signature})`;
        await ctx.reply(message, { parse_mode: 'Markdown', link_preview_options: { is_disabled: true } });
      } else {
        await ctx.reply(`❌ Failed to claim ORB: ${result.error}`);
        await notifyTransactionFailed(telegramId, 'Claim ORB', result.error!);
      }
    } catch (error) {
      logger.error('[Telegram] Error in handleClaimOrb:', error);
      await ctx.reply('Failed to claim ORB. Please try again.');
    }
  }

  /**
   * Handle /claim_staking command - claim staking rewards
   */
  private async handleClaimStaking(ctx: BotContext) {
    const telegramId = ctx.from!.id.toString();

    if (!(await this.isUserRegistered(telegramId))) {
      await ctx.reply('Please use /start to connect your wallet first.');
      return;
    }

    try {
      await updateLastActive(telegramId);

      await ctx.reply('⏳ Claiming staking rewards...');

      const result = await claimUserStakingRewards(telegramId);

      if (result.success) {
        const message = `✅ *Staking Rewards Claimed!*\n\nSOL: ${formatSOL(result.solAmount || 0)}\nORB: ${formatORB(result.orbAmount || 0)}\n\n[View on Solscan](https://solscan.io/tx/${result.signature})`;
        await ctx.reply(message, { parse_mode: 'Markdown', link_preview_options: { is_disabled: true } });
      } else {
        await ctx.reply(`❌ Failed to claim staking rewards: ${result.error}`);
        await notifyTransactionFailed(telegramId, 'Claim Staking', result.error!);
      }
    } catch (error) {
      logger.error('[Telegram] Error in handleClaimStaking:', error);
      await ctx.reply('Failed to claim staking rewards. Please try again.');
    }
  }

  /**
   * Handle /swap command - swap ORB to SOL
   */
  private async handleSwap(ctx: BotContext) {
    const telegramId = ctx.from!.id.toString();

    if (!(await this.isUserRegistered(telegramId))) {
      await ctx.reply('Please use /start to connect your wallet first.');
      return;
    }

    try {
      await updateLastActive(telegramId);

      // Set session state to await swap amount
      const session = this.getSession(ctx.from!.id);
      session.awaitingSwapAmount = true;

      const balances = await getUserBalances(telegramId);

      // Get quote for 10 ORB to show current rate
      let rateInfo = '';
      try {
        const quote = await getSwapQuote(10, 300); // 10 ORB with 3% slippage
        if (quote) {
          const solAmount = Number(quote.outAmount) / 1e9;
          rateInfo = `\n💡 Current rate: 10 ORB ≈ ${formatSOL(solAmount)}`;
        }
      } catch (error) {
        logger.debug('[Swap] Failed to get quote for rate display:', error);
        // Continue without rate info if quote fails
      }

      const message = `💱 *Swap ORB to SOL*\n\nYour ORB Balance: ${formatORB(balances?.orb || 0)}${rateInfo}\n\nHow much ORB would you like to swap?\n\nSend the amount (e.g., "10" for 10 ORB)\n\nOr use /cancel to abort.`;

      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
      logger.error('[Telegram] Error in handleSwap:', error);
      await ctx.reply('Failed to initiate swap. Please try again.');
    }
  }

  /**
   * Handle /logs command - view recent logs
   */
  private async handleLogs(ctx: BotContext, page: number = 0) {
    const telegramId = ctx.from!.id.toString();

    // Owner-only command
    if (!this.isOwner(telegramId)) {
      await ctx.reply('⛔️ This command is only available to the bot owner.');
      return;
    }

    try {
      const fs = await import('fs');
      const path = await import('path');

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
      } else {
        await ctx.reply(message, {
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        });
      }
    } catch (error) {
      logger.error('[Telegram] Error in handleLogs:', error);
      await ctx.reply('Failed to fetch logs. Please try again.');
    }
  }

  /**
   * Handle /owner_stats command - show dev fee earnings (owner only)
   */
  private async handleOwnerStats(ctx: BotContext) {
    const telegramId = ctx.from!.id.toString();

    // Owner-only command
    if (!this.isOwner(telegramId)) {
      await ctx.reply('⛔️ This command is only available to the bot owner.');
      return;
    }

    try {
      // Get stats from transactions with tracked fees
      const feeStats = await getQuery<{
        total_dev_fees: number;
        total_tx_fees: number;
        total_transactions: number;
      }>(`
        SELECT
          COALESCE(SUM(dev_fee_sol), 0) as total_dev_fees,
          COALESCE(SUM(tx_fee_sol), 0) as total_tx_fees,
          COUNT(*) as total_transactions
        FROM transactions
        WHERE status = 'success' AND dev_fee_sol > 0
      `);

      // Get active wallets count
      const activeWallets = await getQuery<{ count: number }>(`
        SELECT COUNT(DISTINCT wallet_address) as count
        FROM transactions
        WHERE status = 'success' AND wallet_address IS NOT NULL
      `);

      // Get user count
      const userCount = await getQuery<{ count: number }>(`
        SELECT COUNT(*) as count FROM telegram_users
      `);

      // Get transaction breakdown by type (fee-tracked transactions only)
      const txBreakdown = await allQuery<{ type: string; count: number; total_sol: number }>(`
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
            return `• ${txType}: ${tx.count} (${formatSOL(tx.total_sol)})`;
          }).join('\n')
        : '• No transactions yet';

      const message = `
👑 *Owner Statistics* (Recent Activity)

*💰 Dev Fee Earnings (1% Service Fee):*
Service Fees: ${formatSOL(totalDevFees)}
TX Processing: ${formatSOL(totalTxFees)}
Total Earnings: ${formatSOL(totalFees)}

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
    } catch (error: any) {
      logger.error('[Telegram] Error in handleOwnerStats:', error);
      logger.error('[Telegram] Error details:', error.message || error);
      await ctx.reply(`Failed to fetch owner stats. Error: ${error.message || 'Unknown error'}`);
    }
  }

  /**
   * Handle /analytics command - analytics export
   */
  private async handleAnalytics(ctx: BotContext) {
    const telegramId = ctx.from!.id.toString();

    if (!(await this.isUserRegistered(telegramId))) {
      await ctx.reply('Please use /start to connect your wallet first.');
      return;
    }

    try {
      await updateLastActive(telegramId);

      const user = await getUser(telegramId);
      const stats = await getUserPerformanceStats(user?.public_key || '');
      const rounds = await getUserRoundStats(telegramId);
      const balances = await getUserBalances(telegramId);

      const analyticsReport = `
📊 *Analytics Report*
Generated: ${new Date().toLocaleString()}

*Account:*
Public Key: \`${user?.public_key.slice(0, 8)}...${user?.public_key.slice(-8)}\`
Active Since: ${new Date(user!.created_at).toLocaleDateString()}

*Current Balances:*
SOL: ${formatSOL(balances?.sol || 0)}
ORB: ${formatORB(balances?.orb || 0)}

*Performance:*
Total Transactions: ${stats.totalTransactions}
Successful: ${stats.successfulTransactions}
Success Rate: ${stats.successRate.toFixed(1)}%

*Mining:*
Total Rounds: ${rounds.totalRounds}
Total Deployed: ${formatSOL(rounds.totalDeployed)}
Win Rate: ${rounds.winRate.toFixed(1)}%

*Rewards:*
SOL Earned: ${formatSOL(rounds.totalRewardsSol)}
ORB Earned: ${formatORB(rounds.totalRewardsOrb)}

🚧 *Export Feature Coming Soon!*
Advanced analytics and chart export will be available in a future update.
`.trim();

      await ctx.reply(analyticsReport, { parse_mode: 'Markdown' });
    } catch (error) {
      logger.error('[Telegram] Error in handleAnalytics:', error);
      await ctx.reply('Failed to generate analytics. Please try again.');
    }
  }

  /**
   * Handle /set_transfer_recipient command - set transfer recipient address
   */
  private async handleSetTransferRecipient(ctx: BotContext) {
    const telegramId = ctx.from!.id.toString();
    const userId = ctx.from!.id;

    if (!(await this.isUserRegistered(telegramId))) {
      await ctx.reply('Please use /start to connect your wallet first.');
      return;
    }

    try {
      await updateLastActive(telegramId);

      // Set session state to await recipient address
      const session = this.getSession(userId);
      session.awaitingTransferRecipient = true;

      const message = await ctx.reply(
        `📤 *Set Transfer Recipient*\n\nPlease send the Solana wallet address where you want to transfer your ORB tokens.\n\nThe address will be validated before saving.\n\nUse /cancel to abort.`,
        { parse_mode: 'Markdown' }
      );

      // Auto-delete after 20 seconds
      setTimeout(async () => {
        try {
          await ctx.deleteMessage(message.message_id);
        } catch (error) {
          // Ignore if message is already deleted
        }
      }, 20000);
    } catch (error) {
      logger.error('[Telegram] Error in handleSetTransferRecipient:', error);
      await ctx.reply('Failed to initiate recipient setup. Please try again.');
    }
  }

  /**
   * Handle /transfer_status command - show transfer configuration
   */
  private async handleTransferStatus(ctx: BotContext) {
    const telegramId = ctx.from!.id.toString();

    if (!(await this.isUserRegistered(telegramId))) {
      await ctx.reply('Please use /start to connect your wallet first.');
      return;
    }

    try {
      await updateLastActive(telegramId);

      const status = await getAutoTransferStatus(telegramId);

      let recipientDisplay = 'Not set';
      if (status.recipientAddress) {
        recipientDisplay = `\`${status.recipientAddress.slice(0, 8)}...${status.recipientAddress.slice(-8)}\``;
      }

      const statusMessage = `
📤 *Auto-Transfer Status*

*Configuration:*
• Status: ${status.enabled ? '✅ Enabled' : '❌ Disabled'}
• Transfer Threshold: ${formatORB(status.threshold)}
• Recipient: ${recipientDisplay}

*Current Balance:*
• ORB Balance: ${formatORB(status.currentBalance)}
• Will Transfer: ${status.willTransfer ? '✅ Yes (conditions met)' : '❌ No'}

${!status.recipientAddress ? '\n⚠️ *Please set a recipient address first using /set_transfer_recipient*' : ''}

${!status.enabled && status.recipientAddress ? '\n💡 *Enable auto-transfer in /settings to activate*' : ''}

Transfers happen automatically when your ORB balance reaches the threshold.
`.trim();

      await ctx.reply(statusMessage, { parse_mode: 'Markdown' });
    } catch (error) {
      logger.error('[Telegram] Error in handleTransferStatus:', error);
      await ctx.reply('Failed to fetch transfer status. Please try again.');
    }
  }

  /**
   * Start the bot
   */
  async start() {
    try {
      // Initialize telegram users tables
      await initializeTelegramUsersTable();
      await initializeUserSettingsTable();
      await initializeUserRoundsTable();
      await initializeUserBalanceHistoryTable();
      logger.info('[Telegram] User database tables initialized');

      // Initialize notifications system
      initializeNotifications(this.bot);
      logger.info('[Telegram] Notifications system initialized');

      // Initialize auto-claim service
      initializeAutoClaim(this.bot);
      logger.info('[Telegram] Auto-claim service initialized');

      // Initialize auto-swap service
      initializeAutoSwap(this.bot);
      logger.info('[Telegram] Auto-swap service initialized');

      // Initialize auto-stake service
      initializeAutoStake(this.bot);
      logger.info('[Telegram] Auto-stake service initialized');

      // Initialize automation executor service
      initializeAutoExecutor();
      logger.info('[Telegram] Automation executor service initialized');

      // Config should already be loaded by main bot
      await this.bot.launch();

      logger.info('[Telegram] Telegram bot connected (multi-user mode)!');

      // Enable graceful stop
      process.once('SIGINT', () => this.stop('SIGINT'));
      process.once('SIGTERM', () => this.stop('SIGTERM'));
    } catch (error) {
      logger.error('[Telegram] Failed to start bot:', error);
      throw error;
    }
  }

  /**
   * Stop the bot gracefully
   */
  async stop(signal: string) {
    logger.info(`[Telegram] Received ${signal}, stopping bot...`);

    // Stop auto-claim service
    stopAutoClaim();
    logger.info('[Telegram] Auto-claim service stopped');

    // Stop auto-swap service
    stopAutoSwap();
    logger.info('[Telegram] Auto-swap service stopped');

    // Stop auto-stake service
    stopAutoStake();
    logger.info('[Telegram] Auto-stake service stopped');

    // Stop automation executor service
    stopAutoExecutor();
    logger.info('[Telegram] Automation executor service stopped');

    await this.bot.stop(signal);
    process.exit(0);
  }
}

// Main execution
async function main() {
  try {
    logger.info('[Telegram] Initializing multi-user bot...');

    // Explicitly initialize database first
    await initializeDatabase();
    logger.info('[Telegram] Database initialized');

    // Load and cache config (database is already initialized)
    const cfg = await loadAndCacheConfig();
    logger.info('[Telegram] Configuration loaded and cached');

    // Get bot token from .env
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    if (!botToken) {
      logger.error('[Telegram] TELEGRAM_BOT_TOKEN not set in .env file.');
      logger.info('[Telegram] Please add TELEGRAM_BOT_TOKEN=your_token_here to .env');
      process.exit(1);
    }

    // Create and start bot
    const bot = new OrbMiningBot(botToken, cfg);
    await bot.start();
  } catch (error) {
    logger.error('[Telegram] Fatal error:', error);
    process.exit(1);
  }
}

// Run bot if executed directly
if (require.main === module) {
  main();
}

export { OrbMiningBot };
