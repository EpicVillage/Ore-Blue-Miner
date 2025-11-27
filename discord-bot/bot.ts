import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  Collection,
  Events,
} from 'discord.js';
import { initializeDatabase } from '../src/utils/database';
import logger from '../src/utils/logger';
import {
  initializeLinkedAccountsTable,
  initializeDiscordUsersTable,
  initializeDiscordSettingsTable,
  getUser,
  saveUser,
  generateLinkCode,
  linkAccounts,
  getLinkedAccount,
  unlinkAccounts,
  getUserWallet,
  getUserBalances,
  registerWallet,
  generateAndRegisterWallet,
  getUserSettings,
  Platform,
} from '../shared';
import {
  formatWalletEmbed,
  formatStatusEmbed,
  formatLinkEmbed,
  formatErrorEmbed,
  formatSuccessEmbed,
} from './utils/embeds';
import { getOrbPrice } from '../src/utils/jupiter';
import { fetchMiner, fetchStake, fetchBoard, fetchRound } from '../src/utils/accounts';
import { loadAndCacheConfig } from '../src/utils/config';

/**
 * ORB Mining Discord Bot
 *
 * Multi-user bot using shared core infrastructure
 */

const PLATFORM: Platform = 'discord';

// Command definitions
const commands = [
  new SlashCommandBuilder()
    .setName('start')
    .setDescription('Get started with ORB Mining Bot'),

  new SlashCommandBuilder()
    .setName('wallet')
    .setDescription('View your wallet and balances'),

  new SlashCommandBuilder()
    .setName('status')
    .setDescription('View your mining status and rewards'),

  new SlashCommandBuilder()
    .setName('link')
    .setDescription('Link your Telegram account')
    .addStringOption(option =>
      option
        .setName('code')
        .setDescription('Link code from Telegram (leave empty to generate one)')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('settings')
    .setDescription('View your bot settings'),

  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show available commands'),
];

class OrbMiningDiscordBot {
  private client: Client;
  private rest: REST;

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.DirectMessages,
      ],
      partials: [
        Partials.Channel, // Required to receive DM events
      ],
    });

    this.rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN!);

    this.setupEventHandlers();
  }

  /**
   * Register slash commands with Discord
   */
  async registerCommands() {
    try {
      logger.info('[Discord] Registering slash commands...');

      await this.rest.put(
        Routes.applicationCommands(process.env.DISCORD_CLIENT_ID!),
        { body: commands.map(cmd => cmd.toJSON()) }
      );

      logger.info('[Discord] Slash commands registered successfully');
    } catch (error) {
      logger.error('[Discord] Failed to register commands:', error);
    }
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers() {
    // Ready event
    this.client.once(Events.ClientReady, (client) => {
      logger.info(`[Discord] Bot ready! Logged in as ${client.user.tag}`);
    });

    // Interaction handler
    this.client.on(Events.InteractionCreate, async (interaction) => {
      try {
        if (interaction.isChatInputCommand()) {
          await this.handleCommand(interaction);
        } else if (interaction.isButton()) {
          await this.handleButton(interaction);
        } else if (interaction.isModalSubmit()) {
          await this.handleModal(interaction);
        }
      } catch (error) {
        logger.error('[Discord] Interaction error:', error);

        const errorEmbed = formatErrorEmbed('An error occurred', 'Please try again later.');

        if (interaction.isRepliable()) {
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
          } else {
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
          }
        }
      }
    });
  }

  /**
   * Handle slash commands
   */
  private async handleCommand(interaction: ChatInputCommandInteraction) {
    const { commandName } = interaction;
    const discordId = interaction.user.id;

    logger.info(`[Discord] Command from ${interaction.user.username}: /${commandName}`);

    switch (commandName) {
      case 'start':
        await this.handleStart(interaction);
        break;
      case 'wallet':
        await this.handleWallet(interaction);
        break;
      case 'status':
        await this.handleStatus(interaction);
        break;
      case 'link':
        await this.handleLink(interaction);
        break;
      case 'settings':
        await this.handleSettings(interaction);
        break;
      case 'help':
        await this.handleHelp(interaction);
        break;
      default:
        await interaction.reply({
          embeds: [formatErrorEmbed('Unknown Command', 'This command is not recognized.')],
          ephemeral: true,
        });
    }
  }

  /**
   * Handle button interactions
   */
  private async handleButton(interaction: ButtonInteraction) {
    const [action, ...params] = interaction.customId.split(':');

    logger.info(`[Discord] Button from ${interaction.user.username}: ${action}`);

    switch (action) {
      case 'generate_wallet':
        await this.handleGenerateWallet(interaction);
        break;
      case 'import_wallet':
        await this.showImportWalletModal(interaction);
        break;
      case 'link_generate':
        await this.handleLinkGenerate(interaction);
        break;
      case 'link_unlink':
        await this.handleUnlink(interaction);
        break;
      case 'refresh_wallet':
        await this.handleWalletRefresh(interaction);
        break;
      case 'refresh_status':
        await this.handleStatusRefresh(interaction);
        break;
      case 'link_from_onboarding':
        await this.handleLinkFromOnboarding(interaction);
        break;
      default:
        await interaction.reply({
          content: 'Unknown action',
          ephemeral: true,
        });
    }
  }

  /**
   * Handle modal submissions
   */
  private async handleModal(interaction: ModalSubmitInteraction) {
    const [action, ...params] = interaction.customId.split(':');

    switch (action) {
      case 'import_wallet_modal':
        await this.handleImportWalletSubmit(interaction);
        break;
      default:
        await interaction.reply({
          content: 'Unknown modal',
          ephemeral: true,
        });
    }
  }

  /**
   * Check if user is registered
   */
  private async isUserRegistered(discordId: string): Promise<boolean> {
    // Check if user has their own wallet
    const user = await getUser(PLATFORM, discordId);
    if (user) return true;

    // Check if user is linked to a Telegram account
    const linked = await getLinkedAccount(PLATFORM, discordId);
    if (linked?.linked_at && linked?.telegram_id) {
      const telegramUser = await getUser('telegram', linked.telegram_id);
      return telegramUser !== null;
    }

    return false;
  }

  /**
   * Handle /start command
   */
  private async handleStart(interaction: ChatInputCommandInteraction) {
    const discordId = interaction.user.id;
    const isRegistered = await this.isUserRegistered(discordId);

    if (isRegistered) {
      // Show main menu
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🎮 ORB Mining Bot')
        .setDescription('Welcome back! Choose an option below.')
        .addFields(
          { name: '💼 Wallet', value: '`/wallet` - View balances', inline: true },
          { name: '📊 Status', value: '`/status` - Mining status', inline: true },
          { name: '⚙️ Settings', value: '`/settings` - Configure', inline: true },
          { name: '🔗 Link', value: '`/link` - Cross-platform', inline: true },
          { name: '❓ Help', value: '`/help` - All commands', inline: true },
        );

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('refresh_wallet')
          .setLabel('Quick Status')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('📊'),
      );

      await interaction.reply({ embeds: [embed], components: [row] });
    } else {
      // Show onboarding
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('👋 Welcome to ORB Mining Bot!')
        .setDescription(
          'To get started, you need to connect a Solana wallet.\n\n' +
          '**Options:**\n' +
          '🆕 **Generate New Wallet** - Create a fresh wallet\n' +
          '📥 **Import Wallet** - Use your existing private key\n' +
          '🔗 **Link Telegram** - Already use our Telegram bot? Link your account!'
        );

      const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('generate_wallet')
          .setLabel('Generate New Wallet')
          .setStyle(ButtonStyle.Success)
          .setEmoji('🆕'),
        new ButtonBuilder()
          .setCustomId('import_wallet')
          .setLabel('Import Wallet')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('📥'),
      );

      const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('link_from_onboarding')
          .setLabel('Link Telegram Account')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🔗'),
      );

      await interaction.reply({ embeds: [embed], components: [row1, row2], ephemeral: true });
    }
  }

  /**
   * Handle wallet generation
   */
  private async handleGenerateWallet(interaction: ButtonInteraction) {
    await interaction.deferReply({ ephemeral: true });

    const discordId = interaction.user.id;
    const username = interaction.user.username;

    try {
      const result = await generateAndRegisterWallet(PLATFORM, discordId, username);

      if (result.success) {
        const embed = new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('✅ Wallet Generated!')
          .setDescription(
            '**Your new wallet has been created.**\n\n' +
            '⚠️ **IMPORTANT: Save your private key!**\n' +
            'This is the ONLY time you will see it.\n\n' +
            `**Public Key:**\n\`${result.publicKey}\`\n\n` +
            `**Private Key:**\n||\`${result.privateKey}\`||\n` +
            '*(Click to reveal - keep this secret!)*'
          )
          .setFooter({ text: 'Store your private key safely. Never share it!' });

        await interaction.editReply({ embeds: [embed] });

        logger.info(`[Discord] Generated wallet for ${discordId}: ${result.publicKey}`);
      } else {
        await interaction.editReply({
          embeds: [formatErrorEmbed('Failed to Generate', result.error || 'Unknown error')],
        });
      }
    } catch (error) {
      logger.error('[Discord] Error generating wallet:', error);
      await interaction.editReply({
        embeds: [formatErrorEmbed('Error', 'Failed to generate wallet. Please try again.')],
      });
    }
  }

  /**
   * Show import wallet modal
   */
  private async showImportWalletModal(interaction: ButtonInteraction) {
    const modal = new ModalBuilder()
      .setCustomId('import_wallet_modal')
      .setTitle('Import Wallet');

    const privateKeyInput = new TextInputBuilder()
      .setCustomId('private_key')
      .setLabel('Private Key (Base58)')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Enter your Solana private key...')
      .setRequired(true);

    const row = new ActionRowBuilder<TextInputBuilder>().addComponents(privateKeyInput);
    modal.addComponents(row);

    await interaction.showModal(modal);
  }

  /**
   * Handle wallet import submission
   */
  private async handleImportWalletSubmit(interaction: ModalSubmitInteraction) {
    await interaction.deferReply({ ephemeral: true });

    const discordId = interaction.user.id;
    const username = interaction.user.username;
    const privateKey = interaction.fields.getTextInputValue('private_key').trim();

    try {
      const result = await registerWallet(PLATFORM, discordId, privateKey, username);

      if (result.success) {
        const embed = new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('✅ Wallet Connected!')
          .setDescription(
            `**Public Key:**\n\`${result.publicKey}\`\n\n` +
            'Your wallet has been encrypted and stored securely.\n\n' +
            'Use `/wallet` to view your balances.'
          );

        await interaction.editReply({ embeds: [embed] });

        logger.info(`[Discord] Imported wallet for ${discordId}: ${result.publicKey}`);
      } else {
        await interaction.editReply({
          embeds: [formatErrorEmbed('Invalid Private Key', result.error || 'Please check your key and try again.')],
        });
      }
    } catch (error) {
      logger.error('[Discord] Error importing wallet:', error);
      await interaction.editReply({
        embeds: [formatErrorEmbed('Error', 'Failed to import wallet. Please try again.')],
      });
    }
  }

  /**
   * Handle /wallet command
   */
  private async handleWallet(interaction: ChatInputCommandInteraction) {
    const discordId = interaction.user.id;

    if (!(await this.isUserRegistered(discordId))) {
      await interaction.reply({
        embeds: [formatErrorEmbed('Not Registered', 'Use `/start` to connect your wallet first.')],
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();

    try {
      const balances = await getUserBalances(PLATFORM, discordId);
      const orbPrice = await getOrbPrice();

      const embed = await formatWalletEmbed(balances, orbPrice);

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('refresh_wallet')
          .setLabel('Refresh')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🔄'),
      );

      await interaction.editReply({ embeds: [embed], components: [row] });
    } catch (error) {
      logger.error('[Discord] Error in wallet command:', error);
      await interaction.editReply({
        embeds: [formatErrorEmbed('Error', 'Failed to fetch wallet info.')],
      });
    }
  }

  /**
   * Handle wallet refresh button
   */
  private async handleWalletRefresh(interaction: ButtonInteraction) {
    const discordId = interaction.user.id;

    if (!(await this.isUserRegistered(discordId))) {
      await interaction.reply({
        embeds: [formatErrorEmbed('Not Registered', 'Use `/start` to connect your wallet first.')],
        ephemeral: true,
      });
      return;
    }

    await interaction.deferUpdate();

    try {
      const balances = await getUserBalances(PLATFORM, discordId);
      const orbPrice = await getOrbPrice();

      const embed = await formatWalletEmbed(balances, orbPrice);

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('refresh_wallet')
          .setLabel('Refresh')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🔄'),
      );

      await interaction.editReply({ embeds: [embed], components: [row] });
    } catch (error) {
      logger.error('[Discord] Error refreshing wallet:', error);
    }
  }

  /**
   * Handle /status command
   */
  private async handleStatus(interaction: ChatInputCommandInteraction) {
    const discordId = interaction.user.id;

    if (!(await this.isUserRegistered(discordId))) {
      await interaction.reply({
        embeds: [formatErrorEmbed('Not Registered', 'Use `/start` to connect your wallet first.')],
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();

    try {
      const wallet = await getUserWallet(PLATFORM, discordId);
      if (!wallet) {
        await interaction.editReply({
          embeds: [formatErrorEmbed('Error', 'Could not load wallet.')],
        });
        return;
      }

      const [miner, stake, board] = await Promise.all([
        fetchMiner(wallet.publicKey),
        fetchStake(wallet.publicKey),
        fetchBoard(),
      ]);

      const round = await fetchRound(board.roundId);

      const embed = await formatStatusEmbed(miner, stake, board, round);

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('refresh_status')
          .setLabel('Refresh')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🔄'),
      );

      await interaction.editReply({ embeds: [embed], components: [row] });
    } catch (error) {
      logger.error('[Discord] Error in status command:', error);
      await interaction.editReply({
        embeds: [formatErrorEmbed('Error', 'Failed to fetch status.')],
      });
    }
  }

  /**
   * Handle status refresh button
   */
  private async handleStatusRefresh(interaction: ButtonInteraction) {
    const discordId = interaction.user.id;

    if (!(await this.isUserRegistered(discordId))) {
      await interaction.reply({
        embeds: [formatErrorEmbed('Not Registered', 'Use `/start` first.')],
        ephemeral: true,
      });
      return;
    }

    await interaction.deferUpdate();

    try {
      const wallet = await getUserWallet(PLATFORM, discordId);
      if (!wallet) return;

      const [miner, stake, board] = await Promise.all([
        fetchMiner(wallet.publicKey),
        fetchStake(wallet.publicKey),
        fetchBoard(),
      ]);

      const round = await fetchRound(board.roundId);
      const embed = await formatStatusEmbed(miner, stake, board, round);

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('refresh_status')
          .setLabel('Refresh')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🔄'),
      );

      await interaction.editReply({ embeds: [embed], components: [row] });
    } catch (error) {
      logger.error('[Discord] Error refreshing status:', error);
    }
  }

  /**
   * Handle /link command
   */
  private async handleLink(interaction: ChatInputCommandInteraction) {
    const discordId = interaction.user.id;
    const codeInput = interaction.options.getString('code');

    // If code provided, try to link
    if (codeInput) {
      await interaction.deferReply({ ephemeral: true });

      try {
        const result = await linkAccounts(PLATFORM, discordId, codeInput);

        if (result.success) {
          const embed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('✅ Accounts Linked!')
            .setDescription(
              `Your Discord account is now linked to Telegram ID: \`${result.linkedTo}\`\n\n` +
              'You now share the same wallet and data across both platforms.'
            );

          await interaction.editReply({ embeds: [embed] });

          logger.info(`[Discord] Linked discord:${discordId} to telegram:${result.linkedTo}`);
        } else {
          await interaction.editReply({
            embeds: [formatErrorEmbed('Link Failed', result.error || 'Invalid or expired code.')],
          });
        }
      } catch (error) {
        logger.error('[Discord] Error linking accounts:', error);
        await interaction.editReply({
          embeds: [formatErrorEmbed('Error', 'Failed to link accounts.')],
        });
      }
      return;
    }

    // No code provided - show link status/options
    await interaction.deferReply();

    try {
      const linked = await getLinkedAccount(PLATFORM, discordId);
      const embed = await formatLinkEmbed(linked, PLATFORM);

      const buttons: ButtonBuilder[] = [];

      if (linked?.linked_at && linked?.telegram_id) {
        // Already linked
        buttons.push(
          new ButtonBuilder()
            .setCustomId('link_unlink')
            .setLabel('Unlink Accounts')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🔓')
        );
      } else {
        // Not linked
        buttons.push(
          new ButtonBuilder()
            .setCustomId('link_generate')
            .setLabel('Generate Link Code')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🔑')
        );
      }

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);

      await interaction.editReply({ embeds: [embed], components: [row] });
    } catch (error) {
      logger.error('[Discord] Error in link command:', error);
      await interaction.editReply({
        embeds: [formatErrorEmbed('Error', 'Failed to load link status.')],
      });
    }
  }

  /**
   * Handle link code generation
   */
  private async handleLinkGenerate(interaction: ButtonInteraction) {
    await interaction.deferReply({ ephemeral: true });

    const discordId = interaction.user.id;

    try {
      const linkCode = await generateLinkCode(PLATFORM, discordId);

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🔑 Link Code Generated')
        .setDescription(
          `Your link code: **\`${linkCode}\`**\n\n` +
          '⏱️ *Expires in 15 minutes*\n\n' +
          '**To link your Telegram account:**\n' +
          '1. Go to our Telegram bot\n' +
          `2. Use \`/link\` and click "Use Link Code"\n` +
          `3. Enter: \`${linkCode}\``
        )
        .setFooter({ text: 'The code is case-insensitive' });

      await interaction.editReply({ embeds: [embed] });

      logger.info(`[Discord] Generated link code for ${discordId}: ${linkCode}`);
    } catch (error) {
      logger.error('[Discord] Error generating link code:', error);
      await interaction.editReply({
        embeds: [formatErrorEmbed('Error', 'Failed to generate link code.')],
      });
    }
  }

  /**
   * Handle account unlinking
   */
  private async handleUnlink(interaction: ButtonInteraction) {
    await interaction.deferReply({ ephemeral: true });

    const discordId = interaction.user.id;

    try {
      const success = await unlinkAccounts(PLATFORM, discordId);

      if (success) {
        const embed = new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('🔓 Accounts Unlinked')
          .setDescription(
            'Your Discord and Telegram accounts are no longer linked.\n\n' +
            'Each platform now has its own separate wallet and data.'
          );

        await interaction.editReply({ embeds: [embed] });

        logger.info(`[Discord] Unlinked ${discordId}`);
      } else {
        await interaction.editReply({
          embeds: [formatErrorEmbed('Not Linked', 'Your accounts are not currently linked.')],
        });
      }
    } catch (error) {
      logger.error('[Discord] Error unlinking:', error);
      await interaction.editReply({
        embeds: [formatErrorEmbed('Error', 'Failed to unlink accounts.')],
      });
    }
  }

  /**
   * Handle link from onboarding button
   */
  private async handleLinkFromOnboarding(interaction: ButtonInteraction) {
    await interaction.deferReply({ ephemeral: true });

    const discordId = interaction.user.id;

    try {
      // Check if already linked
      const linked = await getLinkedAccount(PLATFORM, discordId);
      if (linked?.linked_at && linked?.telegram_id) {
        const embed = new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('✅ Already Linked')
          .setDescription(
            `Your account is already linked to Telegram ID: \`${linked.telegram_id}\`\n\n` +
            'Use `/link` to manage your linked account.'
          );

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Show linking options
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🔗 Link Telegram Account')
        .setDescription(
          'Link your Telegram account to share your wallet across platforms.\n\n' +
          '**Option 1: Generate code here**\n' +
          'Generate a code and use it in our Telegram bot.\n\n' +
          '**Option 2: Have a code from Telegram?**\n' +
          'Use `/link <code>` to link instantly.'
        );

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('link_generate')
          .setLabel('Generate Link Code')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🔑')
      );

      await interaction.editReply({ embeds: [embed], components: [row] });
    } catch (error) {
      logger.error('[Discord] Error in link from onboarding:', error);
      await interaction.editReply({
        embeds: [formatErrorEmbed('Error', 'Failed to start linking process.')],
      });
    }
  }

  /**
   * Handle /settings command
   */
  private async handleSettings(interaction: ChatInputCommandInteraction) {
    const discordId = interaction.user.id;

    if (!(await this.isUserRegistered(discordId))) {
      await interaction.reply({
        embeds: [formatErrorEmbed('Not Registered', 'Use `/start` to connect your wallet first.')],
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();

    try {
      const settings = await getUserSettings(PLATFORM, discordId);

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('⚙️ Your Settings')
        .addFields(
          {
            name: '⛏️ Mining',
            value:
              `Motherload Threshold: \`${settings.motherload_threshold} ORB\`\n` +
              `SOL per Block: \`${settings.sol_per_block} SOL\`\n` +
              `Blocks: \`${settings.num_blocks}\``,
            inline: true,
          },
          {
            name: '🤖 Automation',
            value:
              `Budget: \`${settings.automation_budget_percent}%\`\n` +
              `Auto-Claim SOL: \`${settings.auto_claim_sol_threshold} SOL\`\n` +
              `Auto-Claim ORB: \`${settings.auto_claim_orb_threshold} ORB\``,
            inline: true,
          },
          {
            name: '💱 Swap',
            value:
              `Auto-Swap: \`${settings.auto_swap_enabled ? 'ON' : 'OFF'}\`\n` +
              `Threshold: \`${settings.swap_threshold} ORB\`\n` +
              `Slippage: \`${settings.slippage_bps / 100}%\``,
            inline: true,
          },
        )
        .setFooter({ text: 'Use Telegram bot for full settings management' });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error('[Discord] Error in settings command:', error);
      await interaction.editReply({
        embeds: [formatErrorEmbed('Error', 'Failed to fetch settings.')],
      });
    }
  }

  /**
   * Handle /help command
   */
  private async handleHelp(interaction: ChatInputCommandInteraction) {
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('📖 ORB Mining Bot Help')
      .setDescription('Available commands:')
      .addFields(
        { name: '/start', value: 'Get started or view main menu', inline: true },
        { name: '/wallet', value: 'View wallet balances', inline: true },
        { name: '/status', value: 'View mining status', inline: true },
        { name: '/settings', value: 'View your settings', inline: true },
        { name: '/link', value: 'Link Telegram account', inline: true },
        { name: '/help', value: 'Show this help', inline: true },
      )
      .setFooter({ text: 'For full features, use our Telegram bot' });

    await interaction.reply({ embeds: [embed] });
  }

  /**
   * Start the bot
   */
  async start() {
    try {
      // Initialize database
      await initializeDatabase();
      await initializeLinkedAccountsTable();
      await initializeDiscordUsersTable();
      await initializeDiscordSettingsTable();
      logger.info('[Discord] Database initialized');

      // Load config
      await loadAndCacheConfig();
      logger.info('[Discord] Configuration loaded');

      // Register commands
      await this.registerCommands();

      // Login
      await this.client.login(process.env.DISCORD_BOT_TOKEN);

      logger.info('[Discord] Bot started successfully');
    } catch (error) {
      logger.error('[Discord] Failed to start bot:', error);
      throw error;
    }
  }

  /**
   * Stop the bot
   */
  async stop() {
    logger.info('[Discord] Shutting down...');
    this.client.destroy();
  }
}

// Main entry point
async function main() {
  const bot = new OrbMiningDiscordBot();

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    await bot.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await bot.stop();
    process.exit(0);
  });

  await bot.start();
}

main().catch((error) => {
  logger.error('[Discord] Fatal error:', error);
  process.exit(1);
});
