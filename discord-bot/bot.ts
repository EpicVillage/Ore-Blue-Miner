import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
  ChatInputCommandInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  EmbedBuilder,
  Events,
} from 'discord.js';
import { initializeDatabase } from '../src/utils/database';
import logger from '../src/utils/logger';
import {
  initializeLinkedAccountsTable,
  initializeDiscordUsersTable,
  initializeDiscordSettingsTable,
  getUser,
  generateLinkCode,
  linkAccounts,
  getLinkedAccount,
  unlinkAccounts,
  getUserWallet,
  getUserBalances,
  registerWallet,
  generateAndRegisterWallet,
  getUserSettings,
  updateUserSetting,
  Platform,
  claimSol,
  claimOrb,
  swapOrbToSolForUser,
  deploySol,
  getClaimableRewards,
  getAutomationStatus,
  startAutomation,
  stopAutomation,
} from '../shared';
import {
  formatWalletEmbed,
  formatStatusEmbed,
  formatLinkEmbed,
  formatErrorEmbed,
  formatSuccessEmbed,
  formatSOL,
  formatORB,
  formatUSD,
} from './utils/embeds';
import { getOrbPrice } from '../src/utils/jupiter';
import { fetchMiner, fetchStake, fetchBoard, fetchRound } from '../src/utils/accounts';
import { loadAndCacheConfig } from '../src/utils/config';

const PLATFORM: Platform = 'discord';

// Command definitions with subcommands
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
    .setName('claim')
    .setDescription('Claim your rewards')
    .addSubcommand(sub =>
      sub.setName('sol').setDescription('Claim SOL rewards from mining')
    )
    .addSubcommand(sub =>
      sub.setName('orb').setDescription('Claim ORB rewards from mining')
    )
    .addSubcommand(sub =>
      sub.setName('all').setDescription('Claim all available rewards')
    ),

  new SlashCommandBuilder()
    .setName('automation')
    .setDescription('Control mining automation')
    .addSubcommand(sub =>
      sub.setName('status').setDescription('Check automation status')
    )
    .addSubcommand(sub =>
      sub.setName('start').setDescription('Start mining automation')
    )
    .addSubcommand(sub =>
      sub.setName('stop').setDescription('Stop mining automation')
    ),

  new SlashCommandBuilder()
    .setName('deploy')
    .setDescription('Deploy SOL to current mining round')
    .addNumberOption(opt =>
      opt.setName('amount').setDescription('Amount of SOL to deploy').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('swap')
    .setDescription('Swap ORB to SOL')
    .addNumberOption(opt =>
      opt.setName('amount').setDescription('Amount of ORB to swap').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('settings')
    .setDescription('View and manage your settings')
    .addSubcommand(sub =>
      sub.setName('view').setDescription('View your current settings')
    )
    .addSubcommand(sub =>
      sub.setName('mining').setDescription('Configure mining & claim settings')
    )
    .addSubcommand(sub =>
      sub.setName('automation').setDescription('Configure swap, stake & transfer settings')
    ),

  new SlashCommandBuilder()
    .setName('settings2')
    .setDescription('[TEST] Interactive settings with buttons & dropdowns'),

  new SlashCommandBuilder()
    .setName('link')
    .setDescription('Link your Telegram account')
    .addStringOption(opt =>
      opt.setName('code').setDescription('Link code from Telegram').setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show all available commands'),
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
      partials: [Partials.Channel],
    });

    this.rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN!);
    this.setupEventHandlers();
  }

  async registerCommands() {
    try {
      logger.info('[Discord] Registering slash commands...');

      const commandsJson = commands.map(cmd => cmd.toJSON());

      // If DISCORD_GUILD_ID is set, register to that guild (instant updates for testing)
      // Otherwise register globally (takes up to 1 hour to propagate)
      if (process.env.DISCORD_GUILD_ID) {
        await this.rest.put(
          Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID!, process.env.DISCORD_GUILD_ID),
          { body: commandsJson }
        );
        logger.info(`[Discord] Slash commands registered to guild ${process.env.DISCORD_GUILD_ID}`);
      } else {
        await this.rest.put(
          Routes.applicationCommands(process.env.DISCORD_CLIENT_ID!),
          { body: commandsJson }
        );
        logger.info('[Discord] Slash commands registered globally (may take up to 1 hour)');
      }
    } catch (error) {
      logger.error('[Discord] Failed to register commands:', error);
    }
  }

  private setupEventHandlers() {
    this.client.once(Events.ClientReady, (client) => {
      logger.info(`[Discord] Bot ready! Logged in as ${client.user.tag}`);
    });

    this.client.on(Events.InteractionCreate, async (interaction) => {
      try {
        if (interaction.isChatInputCommand()) {
          await this.handleCommand(interaction);
        } else if (interaction.isButton()) {
          await this.handleButton(interaction);
        } else if (interaction.isModalSubmit()) {
          await this.handleModal(interaction);
        } else if (interaction.isStringSelectMenu()) {
          await this.handleSelectMenu(interaction);
        }
      } catch (error) {
        logger.error('[Discord] Interaction error:', error);
        const errorEmbed = formatErrorEmbed('Error', 'An error occurred. Please try again.');
        if (interaction.isRepliable()) {
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ embeds: [errorEmbed], ephemeral: true }).catch(() => {});
          } else {
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true }).catch(() => {});
          }
        }
      }
    });
  }

  private async handleCommand(interaction: ChatInputCommandInteraction) {
    const { commandName } = interaction;
    const discordId = interaction.user.id;

    logger.info(`[Discord] Command from ${interaction.user.username}: /${commandName}`);

    switch (commandName) {
      case 'start': await this.handleStart(interaction); break;
      case 'wallet': await this.handleWallet(interaction); break;
      case 'status': await this.handleStatus(interaction); break;
      case 'claim': await this.handleClaim(interaction); break;
      case 'automation': await this.handleAutomation(interaction); break;
      case 'deploy': await this.handleDeploy(interaction); break;
      case 'swap': await this.handleSwap(interaction); break;
      case 'settings': await this.handleSettings(interaction); break;
      case 'settings2': await this.handleSettings2(interaction); break;
      case 'link': await this.handleLink(interaction); break;
      case 'help': await this.handleHelp(interaction); break;
      default:
        await interaction.reply({
          embeds: [formatErrorEmbed('Unknown Command', 'This command is not recognized.')],
          ephemeral: true,
        });
    }
  }

  private async handleButton(interaction: ButtonInteraction) {
    const [action, ...params] = interaction.customId.split(':');
    logger.info(`[Discord] Button from ${interaction.user.username}: ${action}`);

    switch (action) {
      case 'generate_wallet': await this.handleGenerateWallet(interaction); break;
      case 'import_wallet': await this.showImportWalletModal(interaction); break;
      case 'link_generate': await this.handleLinkGenerate(interaction); break;
      case 'link_unlink': await this.handleUnlink(interaction); break;
      case 'link_from_onboarding': await this.handleLinkFromOnboarding(interaction); break;
      case 'refresh_wallet': await this.handleWalletRefresh(interaction); break;
      case 'refresh_status': await this.handleStatusRefresh(interaction); break;
      case 'claim_sol': await this.handleClaimSolButton(interaction); break;
      case 'claim_orb': await this.handleClaimOrbButton(interaction); break;
      case 'automation_start': await this.handleAutomationStartButton(interaction); break;
      case 'automation_stop': await this.handleAutomationStopButton(interaction); break;
      case 'settings_mining': await this.showMiningSettingsModal(interaction); break;
      case 'settings_automation': await this.showAutomationSettingsModal(interaction); break;
      // Settings2 interactive UI buttons
      case 's2_cat_swap': await this.handleSettings2Category(interaction, 'swap'); break;
      case 's2_cat_stake': await this.handleSettings2Category(interaction, 'stake'); break;
      case 's2_cat_transfer': await this.handleSettings2Category(interaction, 'transfer'); break;
      case 's2_cat_mining': await this.handleSettings2Category(interaction, 'mining'); break;
      case 's2_back': await this.handleSettings2Back(interaction); break;
      case 's2_toggle': await this.handleSettings2Toggle(interaction, params.join(':')); break;
      case 's2_custom': await this.showSettings2CustomModal(interaction, params.join(':')); break;
      default:
        await interaction.reply({ content: 'Unknown action', ephemeral: true });
    }
  }

  private async handleModal(interaction: ModalSubmitInteraction) {
    const [action, ...params] = interaction.customId.split(':');

    switch (action) {
      case 'import_wallet_modal': await this.handleImportWalletSubmit(interaction); break;
      case 'mining_settings_modal': await this.handleMiningSettingsSubmit(interaction); break;
      case 'automation_settings_modal': await this.handleAutomationSettingsSubmit(interaction); break;
      case 's2_custom_modal': await this.handleSettings2CustomSubmit(interaction); break;
      default:
        await interaction.reply({ content: 'Unknown modal', ephemeral: true });
    }
  }

  private async handleSelectMenu(interaction: StringSelectMenuInteraction) {
    const [action, ...params] = interaction.customId.split(':');

    switch (action) {
      case 's2_select':
        await this.handleSettings2Select(interaction, params[0], interaction.values[0]);
        break;
      default:
        await interaction.reply({ content: 'Selection received', ephemeral: true });
    }
  }

  private async isUserRegistered(discordId: string): Promise<boolean> {
    const user = await getUser(PLATFORM, discordId);
    if (user) return true;

    const linked = await getLinkedAccount(PLATFORM, discordId);
    if (linked?.linked_at && linked?.telegram_id) {
      const telegramUser = await getUser('telegram', linked.telegram_id);
      return telegramUser !== null;
    }
    return false;
  }

  // ==================== START ====================
  private async handleStart(interaction: ChatInputCommandInteraction) {
    const discordId = interaction.user.id;
    const isRegistered = await this.isUserRegistered(discordId);

    if (isRegistered) {
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('ORB Mining Bot')
        .setDescription('Welcome back! Use the commands below to manage your mining.')
        .addFields(
          { name: '/wallet', value: 'View balances', inline: true },
          { name: '/status', value: 'Mining status', inline: true },
          { name: '/claim', value: 'Claim rewards', inline: true },
          { name: '/automation', value: 'Control mining', inline: true },
          { name: '/deploy', value: 'Manual deploy', inline: true },
          { name: '/swap', value: 'Swap ORB to SOL', inline: true },
          { name: '/settings', value: 'Configure bot', inline: true },
          { name: '/link', value: 'Link Telegram', inline: true },
          { name: '/help', value: 'All commands', inline: true },
        );

      await interaction.reply({ embeds: [embed] });
    } else {
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('Welcome to ORB Mining Bot!')
        .setDescription(
          'To get started, you need a Solana wallet.\n\n' +
          '**Options:**\n' +
          '**Generate New** - Create a fresh wallet\n' +
          '**Import Wallet** - Use existing private key\n' +
          '**Link Telegram** - Already use our Telegram bot? Link it!'
        );

      const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('generate_wallet')
          .setLabel('Generate New Wallet')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('import_wallet')
          .setLabel('Import Wallet')
          .setStyle(ButtonStyle.Secondary),
      );

      const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('link_from_onboarding')
          .setLabel('Link Telegram Account')
          .setStyle(ButtonStyle.Primary),
      );

      await interaction.reply({ embeds: [embed], components: [row1, row2], ephemeral: true });
    }
  }

  // ==================== WALLET ====================
  private async handleWallet(interaction: ChatInputCommandInteraction) {
    const discordId = interaction.user.id;
    if (!(await this.isUserRegistered(discordId))) {
      return interaction.reply({
        embeds: [formatErrorEmbed('Not Registered', 'Use `/start` to connect your wallet.')],
        ephemeral: true,
      });
    }

    await interaction.deferReply();

    try {
      const [balances, orbPrice, rewards] = await Promise.all([
        getUserBalances(PLATFORM, discordId),
        getOrbPrice(),
        getClaimableRewards(PLATFORM, discordId),
      ]);

      const embed = await formatWalletEmbed(balances, orbPrice);

      // Add claimable rewards info
      if (rewards.totalSol > 0 || rewards.totalOrb > 0) {
        embed.addFields({
          name: 'Claimable Rewards',
          value: `SOL: \`${formatSOL(rewards.totalSol)}\`\nORB: \`${formatORB(rewards.totalOrb)}\``,
          inline: false,
        });
      }

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('refresh_wallet')
          .setLabel('Refresh')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('claim_sol')
          .setLabel('Claim SOL')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(rewards.totalSol <= 0),
        new ButtonBuilder()
          .setCustomId('claim_orb')
          .setLabel('Claim ORB')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(rewards.totalOrb <= 0),
      );

      await interaction.editReply({ embeds: [embed], components: [row] });
    } catch (error) {
      logger.error('[Discord] Error in wallet:', error);
      await interaction.editReply({ embeds: [formatErrorEmbed('Error', 'Failed to fetch wallet info.')] });
    }
  }

  private async handleWalletRefresh(interaction: ButtonInteraction) {
    const discordId = interaction.user.id;
    if (!(await this.isUserRegistered(discordId))) {
      return interaction.reply({
        embeds: [formatErrorEmbed('Not Registered', 'Use `/start` first.')],
        ephemeral: true,
      });
    }

    await interaction.deferUpdate();

    try {
      const [balances, orbPrice, rewards] = await Promise.all([
        getUserBalances(PLATFORM, discordId),
        getOrbPrice(),
        getClaimableRewards(PLATFORM, discordId),
      ]);

      const embed = await formatWalletEmbed(balances, orbPrice);

      if (rewards.totalSol > 0 || rewards.totalOrb > 0) {
        embed.addFields({
          name: 'Claimable Rewards',
          value: `SOL: \`${formatSOL(rewards.totalSol)}\`\nORB: \`${formatORB(rewards.totalOrb)}\``,
          inline: false,
        });
      }

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('refresh_wallet')
          .setLabel('Refresh')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('claim_sol')
          .setLabel('Claim SOL')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(rewards.totalSol <= 0),
        new ButtonBuilder()
          .setCustomId('claim_orb')
          .setLabel('Claim ORB')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(rewards.totalOrb <= 0),
      );

      await interaction.editReply({ embeds: [embed], components: [row] });
    } catch (error) {
      logger.error('[Discord] Error refreshing wallet:', error);
    }
  }

  // ==================== STATUS ====================
  private async handleStatus(interaction: ChatInputCommandInteraction) {
    const discordId = interaction.user.id;
    if (!(await this.isUserRegistered(discordId))) {
      return interaction.reply({
        embeds: [formatErrorEmbed('Not Registered', 'Use `/start` first.')],
        ephemeral: true,
      });
    }

    await interaction.deferReply();

    try {
      const wallet = await getUserWallet(PLATFORM, discordId);
      if (!wallet) {
        return interaction.editReply({ embeds: [formatErrorEmbed('Error', 'Could not load wallet.')] });
      }

      const [miner, stake, board, automationStatus] = await Promise.all([
        fetchMiner(wallet.publicKey),
        fetchStake(wallet.publicKey),
        fetchBoard(),
        getAutomationStatus(PLATFORM, discordId),
      ]);

      const round = await fetchRound(board.roundId);
      const embed = await formatStatusEmbed(miner, stake, board, round);

      // Add automation status
      if (automationStatus.active) {
        embed.addFields({
          name: 'Automation',
          value: `Status: \`ACTIVE\`\nBalance: \`${formatSOL(automationStatus.balance || 0)}\`\nRounds Left: \`${automationStatus.estimatedRounds || 0}\``,
          inline: true,
        });
      } else {
        embed.addFields({
          name: 'Automation',
          value: 'Status: `INACTIVE`',
          inline: true,
        });
      }

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('refresh_status')
          .setLabel('Refresh')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(automationStatus.active ? 'automation_stop' : 'automation_start')
          .setLabel(automationStatus.active ? 'Stop Automation' : 'Start Automation')
          .setStyle(automationStatus.active ? ButtonStyle.Danger : ButtonStyle.Success),
      );

      await interaction.editReply({ embeds: [embed], components: [row] });
    } catch (error) {
      logger.error('[Discord] Error in status:', error);
      await interaction.editReply({ embeds: [formatErrorEmbed('Error', 'Failed to fetch status.')] });
    }
  }

  private async handleStatusRefresh(interaction: ButtonInteraction) {
    const discordId = interaction.user.id;
    if (!(await this.isUserRegistered(discordId))) {
      return interaction.reply({
        embeds: [formatErrorEmbed('Not Registered', 'Use `/start` first.')],
        ephemeral: true,
      });
    }

    await interaction.deferUpdate();

    try {
      const wallet = await getUserWallet(PLATFORM, discordId);
      if (!wallet) return;

      const [miner, stake, board, automationStatus] = await Promise.all([
        fetchMiner(wallet.publicKey),
        fetchStake(wallet.publicKey),
        fetchBoard(),
        getAutomationStatus(PLATFORM, discordId),
      ]);

      const round = await fetchRound(board.roundId);
      const embed = await formatStatusEmbed(miner, stake, board, round);

      if (automationStatus.active) {
        embed.addFields({
          name: 'Automation',
          value: `Status: \`ACTIVE\`\nBalance: \`${formatSOL(automationStatus.balance || 0)}\`\nRounds Left: \`${automationStatus.estimatedRounds || 0}\``,
          inline: true,
        });
      } else {
        embed.addFields({
          name: 'Automation',
          value: 'Status: `INACTIVE`',
          inline: true,
        });
      }

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('refresh_status')
          .setLabel('Refresh')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(automationStatus.active ? 'automation_stop' : 'automation_start')
          .setLabel(automationStatus.active ? 'Stop Automation' : 'Start Automation')
          .setStyle(automationStatus.active ? ButtonStyle.Danger : ButtonStyle.Success),
      );

      await interaction.editReply({ embeds: [embed], components: [row] });
    } catch (error) {
      logger.error('[Discord] Error refreshing status:', error);
    }
  }

  // ==================== CLAIM ====================
  private async handleClaim(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();
    const discordId = interaction.user.id;

    if (!(await this.isUserRegistered(discordId))) {
      return interaction.reply({
        embeds: [formatErrorEmbed('Not Registered', 'Use `/start` first.')],
        ephemeral: true,
      });
    }

    await interaction.deferReply();

    try {
      if (subcommand === 'sol') {
        const result = await claimSol(PLATFORM, discordId);
        if (result.success) {
          await interaction.editReply({
            embeds: [formatSuccessEmbed('SOL Claimed', `Claimed **${formatSOL(result.solAmount || 0)}**\n\n[View Transaction](https://solscan.io/tx/${result.signature})`)],
          });
        } else {
          await interaction.editReply({
            embeds: [formatErrorEmbed('Claim Failed', result.error || 'Unknown error')],
          });
        }
      } else if (subcommand === 'orb') {
        const result = await claimOrb(PLATFORM, discordId);
        if (result.success) {
          await interaction.editReply({
            embeds: [formatSuccessEmbed('ORB Claimed', `Claimed **${formatORB(result.orbAmount || 0)}**\n\n[View Transaction](https://solscan.io/tx/${result.signature})`)],
          });
        } else {
          await interaction.editReply({
            embeds: [formatErrorEmbed('Claim Failed', result.error || 'Unknown error')],
          });
        }
      } else if (subcommand === 'all') {
        const [solResult, orbResult] = await Promise.all([
          claimSol(PLATFORM, discordId),
          claimOrb(PLATFORM, discordId),
        ]);

        const messages: string[] = [];
        if (solResult.success) messages.push(`SOL: **${formatSOL(solResult.solAmount || 0)}**`);
        if (orbResult.success) messages.push(`ORB: **${formatORB(orbResult.orbAmount || 0)}**`);

        if (messages.length > 0) {
          await interaction.editReply({
            embeds: [formatSuccessEmbed('Rewards Claimed', messages.join('\n'))],
          });
        } else {
          await interaction.editReply({
            embeds: [formatErrorEmbed('No Rewards', 'No rewards available to claim.')],
          });
        }
      }
    } catch (error) {
      logger.error('[Discord] Error in claim:', error);
      await interaction.editReply({ embeds: [formatErrorEmbed('Error', 'Failed to claim rewards.')] });
    }
  }

  private async handleClaimSolButton(interaction: ButtonInteraction) {
    const discordId = interaction.user.id;
    await interaction.deferReply({ ephemeral: true });

    try {
      const result = await claimSol(PLATFORM, discordId);
      if (result.success) {
        await interaction.editReply({
          embeds: [formatSuccessEmbed('SOL Claimed', `Claimed **${formatSOL(result.solAmount || 0)}**`)],
        });
      } else {
        await interaction.editReply({
          embeds: [formatErrorEmbed('Claim Failed', result.error || 'Unknown error')],
        });
      }
    } catch (error) {
      await interaction.editReply({ embeds: [formatErrorEmbed('Error', 'Failed to claim SOL.')] });
    }
  }

  private async handleClaimOrbButton(interaction: ButtonInteraction) {
    const discordId = interaction.user.id;
    await interaction.deferReply({ ephemeral: true });

    try {
      const result = await claimOrb(PLATFORM, discordId);
      if (result.success) {
        await interaction.editReply({
          embeds: [formatSuccessEmbed('ORB Claimed', `Claimed **${formatORB(result.orbAmount || 0)}**`)],
        });
      } else {
        await interaction.editReply({
          embeds: [formatErrorEmbed('Claim Failed', result.error || 'Unknown error')],
        });
      }
    } catch (error) {
      await interaction.editReply({ embeds: [formatErrorEmbed('Error', 'Failed to claim ORB.')] });
    }
  }

  // ==================== AUTOMATION ====================
  private async handleAutomation(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();
    const discordId = interaction.user.id;

    if (!(await this.isUserRegistered(discordId))) {
      return interaction.reply({
        embeds: [formatErrorEmbed('Not Registered', 'Use `/start` first.')],
        ephemeral: true,
      });
    }

    await interaction.deferReply();

    try {
      if (subcommand === 'status') {
        const status = await getAutomationStatus(PLATFORM, discordId);

        if (status.active) {
          const embed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('Automation Status')
            .addFields(
              { name: 'Status', value: '`ACTIVE`', inline: true },
              { name: 'Balance', value: `\`${formatSOL(status.balance || 0)}\``, inline: true },
              { name: 'Cost/Round', value: `\`${formatSOL(status.costPerRound || 0)}\``, inline: true },
              { name: 'Rounds Left', value: `\`${status.estimatedRounds || 0}\``, inline: true },
            );

          const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId('automation_stop')
              .setLabel('Stop Automation')
              .setStyle(ButtonStyle.Danger),
          );

          await interaction.editReply({ embeds: [embed], components: [row] });
        } else {
          const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('Automation Status')
            .setDescription('Automation is currently **inactive**.\n\nStart automation to automatically deploy SOL each round.');

          const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId('automation_start')
              .setLabel('Start Automation')
              .setStyle(ButtonStyle.Success),
          );

          await interaction.editReply({ embeds: [embed], components: [row] });
        }
      } else if (subcommand === 'start') {
        const result = await startAutomation(PLATFORM, discordId);
        if (result.success) {
          await interaction.editReply({
            embeds: [formatSuccessEmbed('Automation Started',
              `Deposited **${formatSOL(result.depositedSol || 0)}**\n` +
              `Target Rounds: **${result.targetRounds}**\n\n` +
              `[View Transaction](https://solscan.io/tx/${result.signature})`
            )],
          });
        } else {
          await interaction.editReply({
            embeds: [formatErrorEmbed('Failed to Start', result.error || 'Unknown error')],
          });
        }
      } else if (subcommand === 'stop') {
        const result = await stopAutomation(PLATFORM, discordId);
        if (result.success) {
          await interaction.editReply({
            embeds: [formatSuccessEmbed('Automation Stopped',
              `Returned **${formatSOL(result.returnedSol || 0)}** to your wallet\n\n` +
              `[View Transaction](https://solscan.io/tx/${result.signature})`
            )],
          });
        } else {
          await interaction.editReply({
            embeds: [formatErrorEmbed('Failed to Stop', result.error || 'Unknown error')],
          });
        }
      }
    } catch (error) {
      logger.error('[Discord] Error in automation:', error);
      await interaction.editReply({ embeds: [formatErrorEmbed('Error', 'Failed to process automation command.')] });
    }
  }

  private async handleAutomationStartButton(interaction: ButtonInteraction) {
    const discordId = interaction.user.id;
    await interaction.deferReply({ ephemeral: true });

    try {
      const result = await startAutomation(PLATFORM, discordId);
      if (result.success) {
        await interaction.editReply({
          embeds: [formatSuccessEmbed('Automation Started',
            `Deposited **${formatSOL(result.depositedSol || 0)}**\nTarget Rounds: **${result.targetRounds}**`
          )],
        });
      } else {
        await interaction.editReply({
          embeds: [formatErrorEmbed('Failed to Start', result.error || 'Unknown error')],
        });
      }
    } catch (error) {
      await interaction.editReply({ embeds: [formatErrorEmbed('Error', 'Failed to start automation.')] });
    }
  }

  private async handleAutomationStopButton(interaction: ButtonInteraction) {
    const discordId = interaction.user.id;
    await interaction.deferReply({ ephemeral: true });

    try {
      const result = await stopAutomation(PLATFORM, discordId);
      if (result.success) {
        await interaction.editReply({
          embeds: [formatSuccessEmbed('Automation Stopped',
            `Returned **${formatSOL(result.returnedSol || 0)}** to your wallet`
          )],
        });
      } else {
        await interaction.editReply({
          embeds: [formatErrorEmbed('Failed to Stop', result.error || 'Unknown error')],
        });
      }
    } catch (error) {
      await interaction.editReply({ embeds: [formatErrorEmbed('Error', 'Failed to stop automation.')] });
    }
  }

  // ==================== DEPLOY ====================
  private async handleDeploy(interaction: ChatInputCommandInteraction) {
    const discordId = interaction.user.id;
    const amount = interaction.options.getNumber('amount', true);

    if (!(await this.isUserRegistered(discordId))) {
      return interaction.reply({
        embeds: [formatErrorEmbed('Not Registered', 'Use `/start` first.')],
        ephemeral: true,
      });
    }

    await interaction.deferReply();

    try {
      const result = await deploySol(PLATFORM, discordId, amount);
      if (result.success) {
        await interaction.editReply({
          embeds: [formatSuccessEmbed('Deployed Successfully',
            `Deployed **${formatSOL(result.solDeployed || 0)}** to Round #${result.roundId}\n\n` +
            `[View Transaction](https://solscan.io/tx/${result.signature})`
          )],
        });
      } else {
        await interaction.editReply({
          embeds: [formatErrorEmbed('Deploy Failed', result.error || 'Unknown error')],
        });
      }
    } catch (error) {
      logger.error('[Discord] Error in deploy:', error);
      await interaction.editReply({ embeds: [formatErrorEmbed('Error', 'Failed to deploy.')] });
    }
  }

  // ==================== SWAP ====================
  private async handleSwap(interaction: ChatInputCommandInteraction) {
    const discordId = interaction.user.id;
    const amount = interaction.options.getNumber('amount', true);

    if (!(await this.isUserRegistered(discordId))) {
      return interaction.reply({
        embeds: [formatErrorEmbed('Not Registered', 'Use `/start` first.')],
        ephemeral: true,
      });
    }

    await interaction.deferReply();

    try {
      const result = await swapOrbToSolForUser(PLATFORM, discordId, amount);
      if (result.success) {
        await interaction.editReply({
          embeds: [formatSuccessEmbed('Swap Successful',
            `Swapped **${formatORB(result.orbSwapped || 0)}** for **${formatSOL(result.solReceived || 0)}**\n\n` +
            `[View Transaction](https://solscan.io/tx/${result.signature})`
          )],
        });
      } else {
        await interaction.editReply({
          embeds: [formatErrorEmbed('Swap Failed', result.error || 'Unknown error')],
        });
      }
    } catch (error) {
      logger.error('[Discord] Error in swap:', error);
      await interaction.editReply({ embeds: [formatErrorEmbed('Error', 'Failed to swap.')] });
    }
  }

  // ==================== SETTINGS ====================
  private async handleSettings(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();
    const discordId = interaction.user.id;

    if (!(await this.isUserRegistered(discordId))) {
      return interaction.reply({
        embeds: [formatErrorEmbed('Not Registered', 'Use `/start` first.')],
        ephemeral: true,
      });
    }

    if (subcommand === 'view') {
      await interaction.deferReply();
      try {
        const settings = await getUserSettings(PLATFORM, discordId);
        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('Your Settings')
          .addFields(
            {
              name: 'Mining & Claims',
              value:
                `Motherload: \`${settings.motherload_threshold} ORB\`\n` +
                `SOL/Block: \`${settings.sol_per_block}\` | Blocks: \`${settings.num_blocks}\`\n` +
                `Budget: \`${settings.automation_budget_percent}%\`\n` +
                `Claim SOL: \`${settings.auto_claim_sol_threshold}\` | ORB: \`${settings.auto_claim_orb_threshold}\``,
              inline: true,
            },
            {
              name: 'Swap, Stake & Transfer',
              value:
                `Auto-Swap: \`${settings.auto_swap_enabled ? 'ON' : 'OFF'}\` @ \`${settings.swap_threshold} ORB\`\n` +
                `Slippage: \`${settings.slippage_bps / 100}%\`\n` +
                `Auto-Stake: \`${settings.auto_stake_enabled ? 'ON' : 'OFF'}\` @ \`${settings.stake_threshold} ORB\`\n` +
                `Auto-Transfer: \`${settings.auto_transfer_enabled ? 'ON' : 'OFF'}\``,
              inline: true,
            },
          );

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('settings_mining')
            .setLabel('Mining & Claims')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('settings_automation')
            .setLabel('Swap & Stake')
            .setStyle(ButtonStyle.Secondary),
        );

        await interaction.editReply({ embeds: [embed], components: [row] });
      } catch (error) {
        await interaction.editReply({ embeds: [formatErrorEmbed('Error', 'Failed to load settings.')] });
      }
    } else if (subcommand === 'mining') {
      await this.showMiningSettingsModal(interaction as any);
    } else if (subcommand === 'automation') {
      await this.showAutomationSettingsModal(interaction as any);
    }
  }

  private async showMiningSettingsModal(interaction: ButtonInteraction | ChatInputCommandInteraction) {
    const discordId = interaction.user.id;
    const settings = await getUserSettings(PLATFORM, discordId);

    const modal = new ModalBuilder()
      .setCustomId('mining_settings_modal')
      .setTitle('Mining & Claim Settings');

    const motherloadInput = new TextInputBuilder()
      .setCustomId('motherload_threshold')
      .setLabel('Motherload Threshold (ORB)')
      .setStyle(TextInputStyle.Short)
      .setValue(String(settings.motherload_threshold))
      .setRequired(true);

    const miningInput = new TextInputBuilder()
      .setCustomId('mining_config')
      .setLabel('SOL per Block, Number of Blocks (comma sep)')
      .setStyle(TextInputStyle.Short)
      .setValue(`${settings.sol_per_block}, ${settings.num_blocks}`)
      .setPlaceholder('0.001, 10')
      .setRequired(true);

    const budgetInput = new TextInputBuilder()
      .setCustomId('automation_budget_percent')
      .setLabel('Automation Budget (%)')
      .setStyle(TextInputStyle.Short)
      .setValue(String(settings.automation_budget_percent))
      .setRequired(true);

    const autoClaimSolInput = new TextInputBuilder()
      .setCustomId('auto_claim_sol_threshold')
      .setLabel('Auto-Claim SOL Threshold')
      .setStyle(TextInputStyle.Short)
      .setValue(String(settings.auto_claim_sol_threshold))
      .setRequired(true);

    const autoClaimOrbInput = new TextInputBuilder()
      .setCustomId('auto_claim_orb_threshold')
      .setLabel('Auto-Claim ORB Threshold')
      .setStyle(TextInputStyle.Short)
      .setValue(String(settings.auto_claim_orb_threshold))
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(motherloadInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(miningInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(budgetInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(autoClaimSolInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(autoClaimOrbInput),
    );

    await interaction.showModal(modal);
  }

  private async handleMiningSettingsSubmit(interaction: ModalSubmitInteraction) {
    await interaction.deferReply({ ephemeral: true });
    const discordId = interaction.user.id;

    try {
      const motherload = parseFloat(interaction.fields.getTextInputValue('motherload_threshold'));
      const miningConfig = interaction.fields.getTextInputValue('mining_config').split(',').map(s => s.trim());
      const solPerBlock = parseFloat(miningConfig[0] || '0.001');
      const numBlocks = parseInt(miningConfig[1] || '10');
      const budget = parseFloat(interaction.fields.getTextInputValue('automation_budget_percent'));
      const autoClaimSol = parseFloat(interaction.fields.getTextInputValue('auto_claim_sol_threshold'));
      const autoClaimOrb = parseFloat(interaction.fields.getTextInputValue('auto_claim_orb_threshold'));

      await updateUserSetting(PLATFORM, discordId, 'motherload_threshold', motherload);
      await updateUserSetting(PLATFORM, discordId, 'sol_per_block', solPerBlock);
      await updateUserSetting(PLATFORM, discordId, 'num_blocks', numBlocks);
      await updateUserSetting(PLATFORM, discordId, 'automation_budget_percent', budget);
      await updateUserSetting(PLATFORM, discordId, 'auto_claim_sol_threshold', autoClaimSol);
      await updateUserSetting(PLATFORM, discordId, 'auto_claim_orb_threshold', autoClaimOrb);

      await interaction.editReply({
        embeds: [formatSuccessEmbed('Settings Updated',
          `Motherload: ${motherload} ORB\n` +
          `Mining: ${solPerBlock} SOL x ${numBlocks} blocks\n` +
          `Budget: ${budget}%\n` +
          `Auto-Claim: ${autoClaimSol} SOL, ${autoClaimOrb} ORB`
        )],
      });
    } catch (error) {
      await interaction.editReply({ embeds: [formatErrorEmbed('Error', 'Failed to save settings.')] });
    }
  }

  private async showAutomationSettingsModal(interaction: ButtonInteraction | ChatInputCommandInteraction) {
    const discordId = interaction.user.id;
    const settings = await getUserSettings(PLATFORM, discordId);

    const modal = new ModalBuilder()
      .setCustomId('automation_settings_modal')
      .setTitle('Swap, Stake & Transfer Settings');

    const swapInput = new TextInputBuilder()
      .setCustomId('swap_config')
      .setLabel('Auto-Swap: enabled (1/0), threshold, slippage bps')
      .setStyle(TextInputStyle.Short)
      .setValue(`${settings.auto_swap_enabled ? '1' : '0'}, ${settings.swap_threshold}, ${settings.slippage_bps}`)
      .setPlaceholder('1, 100, 300')
      .setRequired(true);

    const stakeInput = new TextInputBuilder()
      .setCustomId('stake_config')
      .setLabel('Auto-Stake: enabled (1/0), threshold ORB')
      .setStyle(TextInputStyle.Short)
      .setValue(`${settings.auto_stake_enabled ? '1' : '0'}, ${settings.stake_threshold}`)
      .setPlaceholder('0, 50')
      .setRequired(true);

    const transferInput = new TextInputBuilder()
      .setCustomId('transfer_config')
      .setLabel('Auto-Transfer: enabled (1/0), threshold ORB')
      .setStyle(TextInputStyle.Short)
      .setValue(`${settings.auto_transfer_enabled ? '1' : '0'}, ${settings.orb_transfer_threshold}`)
      .setPlaceholder('0, 100')
      .setRequired(true);

    const minOrbInput = new TextInputBuilder()
      .setCustomId('min_orb_to_keep')
      .setLabel('Minimum ORB to Keep (for swaps)')
      .setStyle(TextInputStyle.Short)
      .setValue(String(settings.min_orb_to_keep))
      .setRequired(true);

    const minPriceInput = new TextInputBuilder()
      .setCustomId('min_orb_price')
      .setLabel('Minimum ORB Price for Swap ($)')
      .setStyle(TextInputStyle.Short)
      .setValue(String(settings.min_orb_price))
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(swapInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(stakeInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(transferInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(minOrbInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(minPriceInput),
    );

    await interaction.showModal(modal);
  }

  private async handleAutomationSettingsSubmit(interaction: ModalSubmitInteraction) {
    await interaction.deferReply({ ephemeral: true });
    const discordId = interaction.user.id;

    try {
      // Parse swap config
      const swapConfig = interaction.fields.getTextInputValue('swap_config').split(',').map(s => s.trim());
      const autoSwap = swapConfig[0] === '1' ? 1 : 0;
      const swapThreshold = parseFloat(swapConfig[1] || '100');
      const slippage = parseInt(swapConfig[2] || '300');

      // Parse stake config
      const stakeConfig = interaction.fields.getTextInputValue('stake_config').split(',').map(s => s.trim());
      const autoStake = stakeConfig[0] === '1' ? 1 : 0;
      const stakeThreshold = parseFloat(stakeConfig[1] || '50');

      // Parse transfer config
      const transferConfig = interaction.fields.getTextInputValue('transfer_config').split(',').map(s => s.trim());
      const autoTransfer = transferConfig[0] === '1' ? 1 : 0;
      const transferThreshold = parseFloat(transferConfig[1] || '100');

      const minOrbToKeep = parseFloat(interaction.fields.getTextInputValue('min_orb_to_keep'));
      const minOrbPrice = parseFloat(interaction.fields.getTextInputValue('min_orb_price'));

      await updateUserSetting(PLATFORM, discordId, 'auto_swap_enabled', autoSwap);
      await updateUserSetting(PLATFORM, discordId, 'swap_threshold', swapThreshold);
      await updateUserSetting(PLATFORM, discordId, 'slippage_bps', slippage);
      await updateUserSetting(PLATFORM, discordId, 'auto_stake_enabled', autoStake);
      await updateUserSetting(PLATFORM, discordId, 'stake_threshold', stakeThreshold);
      await updateUserSetting(PLATFORM, discordId, 'auto_transfer_enabled', autoTransfer);
      await updateUserSetting(PLATFORM, discordId, 'orb_transfer_threshold', transferThreshold);
      await updateUserSetting(PLATFORM, discordId, 'min_orb_to_keep', minOrbToKeep);
      await updateUserSetting(PLATFORM, discordId, 'min_orb_price', minOrbPrice);

      await interaction.editReply({
        embeds: [formatSuccessEmbed('Settings Updated',
          `Auto-Swap: ${autoSwap ? 'ON' : 'OFF'} @ ${swapThreshold} ORB (${slippage/100}% slip)\n` +
          `Auto-Stake: ${autoStake ? 'ON' : 'OFF'} @ ${stakeThreshold} ORB\n` +
          `Auto-Transfer: ${autoTransfer ? 'ON' : 'OFF'} @ ${transferThreshold} ORB\n` +
          `Min Keep: ${minOrbToKeep} ORB | Min Price: $${minOrbPrice}`
        )],
      });
    } catch (error) {
      await interaction.editReply({ embeds: [formatErrorEmbed('Error', 'Failed to save settings.')] });
    }
  }

  // ==================== SETTINGS2 INTERACTIVE UI ====================
  private async handleSettings2(interaction: ChatInputCommandInteraction) {
    const discordId = interaction.user.id;
    if (!(await this.isUserRegistered(discordId))) {
      return interaction.reply({
        embeds: [formatErrorEmbed('Not Registered', 'Use `/start` first.')],
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const settings = await getUserSettings(PLATFORM, discordId);
      const embed = this.buildSettings2MainEmbed(settings);
      const components = this.buildSettings2MainComponents();

      await interaction.editReply({ embeds: [embed], components });
    } catch (error) {
      await interaction.editReply({ embeds: [formatErrorEmbed('Error', 'Failed to load settings.')] });
    }
  }

  private buildSettings2MainEmbed(settings: any): EmbedBuilder {
    return new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('Settings (Interactive Mode)')
      .setDescription('Select a category to configure:')
      .addFields(
        {
          name: 'Swap',
          value: `Auto-Swap: \`${settings.auto_swap_enabled ? 'ON' : 'OFF'}\` @ \`${settings.swap_threshold} ORB\``,
          inline: true,
        },
        {
          name: 'Stake',
          value: `Auto-Stake: \`${settings.auto_stake_enabled ? 'ON' : 'OFF'}\` @ \`${settings.stake_threshold} ORB\``,
          inline: true,
        },
        {
          name: 'Transfer',
          value: `Auto-Transfer: \`${settings.auto_transfer_enabled ? 'ON' : 'OFF'}\``,
          inline: true,
        },
        {
          name: 'Mining',
          value: `Motherload: \`${settings.motherload_threshold} ORB\` | Budget: \`${settings.automation_budget_percent}%\``,
          inline: true,
        },
      )
      .setFooter({ text: 'Click a button below to configure that category' });
  }

  private buildSettings2MainComponents(): ActionRowBuilder<ButtonBuilder>[] {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('s2_cat_swap')
        .setLabel('Swap')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('s2_cat_stake')
        .setLabel('Stake')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('s2_cat_transfer')
        .setLabel('Transfer')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('s2_cat_mining')
        .setLabel('Mining')
        .setStyle(ButtonStyle.Primary),
    );
    return [row];
  }

  private async handleSettings2Category(interaction: ButtonInteraction, category: string) {
    const discordId = interaction.user.id;
    await interaction.deferUpdate();

    try {
      const settings = await getUserSettings(PLATFORM, discordId);

      let embed: EmbedBuilder;
      let components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[];

      switch (category) {
        case 'swap':
          embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('Swap Settings')
            .addFields(
              { name: 'Auto-Swap', value: settings.auto_swap_enabled ? '`ON`' : '`OFF`', inline: true },
              { name: 'Threshold', value: `\`${settings.swap_threshold} ORB\``, inline: true },
              { name: 'Slippage', value: `\`${settings.slippage_bps / 100}%\``, inline: true },
              { name: 'Min Price', value: `\`$${settings.min_orb_price}\``, inline: true },
              { name: 'Min Keep', value: `\`${settings.min_orb_to_keep} ORB\``, inline: true },
            );

          components = [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId('s2_toggle:auto_swap_enabled')
                .setLabel(settings.auto_swap_enabled ? 'Turn OFF' : 'Turn ON')
                .setStyle(settings.auto_swap_enabled ? ButtonStyle.Danger : ButtonStyle.Success),
            ),
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId('s2_select:swap_threshold')
                .setPlaceholder('Swap Threshold')
                .addOptions([
                  { label: '10 ORB', value: '10', description: 'Swap when 10+ ORB accumulated' },
                  { label: '50 ORB', value: '50', description: 'Swap when 50+ ORB accumulated' },
                  { label: '100 ORB', value: '100', description: 'Swap when 100+ ORB accumulated' },
                  { label: 'Custom...', value: 'custom', description: 'Enter a specific amount' },
                ]),
            ),
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId('s2_select:slippage_bps')
                .setPlaceholder('Slippage Tolerance')
                .addOptions([
                  { label: '0.5%', value: '50', description: 'Low slippage (may fail more)' },
                  { label: '1%', value: '100', description: 'Standard slippage' },
                  { label: '3%', value: '300', description: 'Higher slippage (better success)' },
                  { label: '5%', value: '500', description: 'Maximum slippage' },
                ]),
            ),
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId('s2_back')
                .setLabel('← Back')
                .setStyle(ButtonStyle.Secondary),
              new ButtonBuilder()
                .setCustomId('s2_custom:min_orb_price')
                .setLabel('Set Min Price')
                .setStyle(ButtonStyle.Secondary),
              new ButtonBuilder()
                .setCustomId('s2_custom:min_orb_to_keep')
                .setLabel('Set Min Keep')
                .setStyle(ButtonStyle.Secondary),
            ),
          ];
          break;

        case 'stake':
          embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('Stake Settings')
            .addFields(
              { name: 'Auto-Stake', value: settings.auto_stake_enabled ? '`ON`' : '`OFF`', inline: true },
              { name: 'Threshold', value: `\`${settings.stake_threshold} ORB\``, inline: true },
            );

          components = [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId('s2_toggle:auto_stake_enabled')
                .setLabel(settings.auto_stake_enabled ? 'Turn OFF' : 'Turn ON')
                .setStyle(settings.auto_stake_enabled ? ButtonStyle.Danger : ButtonStyle.Success),
            ),
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId('s2_select:stake_threshold')
                .setPlaceholder('Stake Threshold')
                .addOptions([
                  { label: '10 ORB', value: '10', description: 'Stake when 10+ ORB accumulated' },
                  { label: '25 ORB', value: '25', description: 'Stake when 25+ ORB accumulated' },
                  { label: '50 ORB', value: '50', description: 'Stake when 50+ ORB accumulated' },
                  { label: '100 ORB', value: '100', description: 'Stake when 100+ ORB accumulated' },
                  { label: 'Custom...', value: 'custom', description: 'Enter a specific amount' },
                ]),
            ),
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId('s2_back')
                .setLabel('← Back')
                .setStyle(ButtonStyle.Secondary),
            ),
          ];
          break;

        case 'transfer':
          embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('Transfer Settings')
            .addFields(
              { name: 'Auto-Transfer', value: settings.auto_transfer_enabled ? '`ON`' : '`OFF`', inline: true },
              { name: 'Threshold', value: `\`${settings.orb_transfer_threshold} ORB\``, inline: true },
            );

          components = [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId('s2_toggle:auto_transfer_enabled')
                .setLabel(settings.auto_transfer_enabled ? 'Turn OFF' : 'Turn ON')
                .setStyle(settings.auto_transfer_enabled ? ButtonStyle.Danger : ButtonStyle.Success),
            ),
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId('s2_select:orb_transfer_threshold')
                .setPlaceholder('Transfer Threshold')
                .addOptions([
                  { label: '50 ORB', value: '50', description: 'Transfer when 50+ ORB accumulated' },
                  { label: '100 ORB', value: '100', description: 'Transfer when 100+ ORB accumulated' },
                  { label: '250 ORB', value: '250', description: 'Transfer when 250+ ORB accumulated' },
                  { label: '500 ORB', value: '500', description: 'Transfer when 500+ ORB accumulated' },
                  { label: 'Custom...', value: 'custom', description: 'Enter a specific amount' },
                ]),
            ),
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId('s2_back')
                .setLabel('← Back')
                .setStyle(ButtonStyle.Secondary),
            ),
          ];
          break;

        case 'mining':
          embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('Mining Settings')
            .addFields(
              { name: 'Motherload Threshold', value: `\`${settings.motherload_threshold} ORB\``, inline: true },
              { name: 'SOL per Block', value: `\`${settings.sol_per_block}\``, inline: true },
              { name: 'Blocks per Round', value: `\`${settings.num_blocks}\``, inline: true },
              { name: 'Budget Allocation', value: `\`${settings.automation_budget_percent}%\``, inline: true },
              { name: 'Auto-Claim SOL', value: `\`${settings.auto_claim_sol_threshold}\``, inline: true },
              { name: 'Auto-Claim ORB', value: `\`${settings.auto_claim_orb_threshold}\``, inline: true },
            );

          components = [
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId('s2_select:motherload_threshold')
                .setPlaceholder('Motherload Threshold')
                .addOptions([
                  { label: '50 ORB', value: '50', description: 'Mine when motherload ≥ 50 ORB' },
                  { label: '100 ORB', value: '100', description: 'Mine when motherload ≥ 100 ORB' },
                  { label: '200 ORB', value: '200', description: 'Mine when motherload ≥ 200 ORB' },
                  { label: '500 ORB', value: '500', description: 'Mine when motherload ≥ 500 ORB' },
                  { label: 'Custom...', value: 'custom', description: 'Enter a specific amount' },
                ]),
            ),
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId('s2_select:automation_budget_percent')
                .setPlaceholder('Budget Allocation')
                .addOptions([
                  { label: '50%', value: '50', description: 'Use 50% of balance for automation' },
                  { label: '75%', value: '75', description: 'Use 75% of balance for automation' },
                  { label: '90%', value: '90', description: 'Use 90% of balance for automation' },
                  { label: '100%', value: '100', description: 'Use all balance for automation' },
                  { label: 'Custom...', value: 'custom', description: 'Enter a specific percentage' },
                ]),
            ),
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId('s2_back')
                .setLabel('← Back')
                .setStyle(ButtonStyle.Secondary),
              new ButtonBuilder()
                .setCustomId('s2_custom:sol_per_block')
                .setLabel('SOL/Block')
                .setStyle(ButtonStyle.Secondary),
              new ButtonBuilder()
                .setCustomId('s2_custom:num_blocks')
                .setLabel('Blocks')
                .setStyle(ButtonStyle.Secondary),
              new ButtonBuilder()
                .setCustomId('s2_custom:auto_claim_thresholds')
                .setLabel('Claim Thresholds')
                .setStyle(ButtonStyle.Secondary),
            ),
          ];
          break;

        default:
          return;
      }

      await interaction.editReply({ embeds: [embed], components: components as any });
    } catch (error) {
      logger.error('[Discord] Error in settings2 category:', error);
    }
  }

  private async handleSettings2Back(interaction: ButtonInteraction) {
    const discordId = interaction.user.id;
    await interaction.deferUpdate();

    try {
      const settings = await getUserSettings(PLATFORM, discordId);
      const embed = this.buildSettings2MainEmbed(settings);
      const components = this.buildSettings2MainComponents();

      await interaction.editReply({ embeds: [embed], components });
    } catch (error) {
      logger.error('[Discord] Error going back to settings2:', error);
    }
  }

  private async handleSettings2Toggle(interaction: ButtonInteraction, setting: string) {
    const discordId = interaction.user.id;
    await interaction.deferUpdate();

    try {
      const settings = await getUserSettings(PLATFORM, discordId);

      let currentValue: boolean;
      let category: string;

      switch (setting) {
        case 'auto_swap_enabled':
          currentValue = settings.auto_swap_enabled;
          category = 'swap';
          break;
        case 'auto_stake_enabled':
          currentValue = settings.auto_stake_enabled;
          category = 'stake';
          break;
        case 'auto_transfer_enabled':
          currentValue = settings.auto_transfer_enabled;
          category = 'transfer';
          break;
        default:
          return;
      }

      // Toggle the value
      await updateUserSetting(PLATFORM, discordId, setting, currentValue ? 0 : 1);

      // Refresh the category view
      const updatedSettings = await getUserSettings(PLATFORM, discordId);
      await this.refreshCategoryView(interaction, category, updatedSettings);
    } catch (error) {
      logger.error('[Discord] Error toggling setting:', error);
    }
  }

  private async handleSettings2Select(interaction: StringSelectMenuInteraction, setting: string, value: string) {
    const discordId = interaction.user.id;

    if (value === 'custom') {
      // Show custom input modal
      await this.showSettings2CustomModal(interaction, setting);
      return;
    }

    await interaction.deferUpdate();

    try {
      const numValue = parseFloat(value);
      await updateUserSetting(PLATFORM, discordId, setting, numValue);

      // Determine category and refresh
      const category = this.getSettingCategory(setting);
      const settings = await getUserSettings(PLATFORM, discordId);
      await this.refreshCategoryView(interaction, category, settings);
    } catch (error) {
      logger.error('[Discord] Error updating setting:', error);
    }
  }

  private getSettingCategory(setting: string): string {
    const swapSettings = ['swap_threshold', 'slippage_bps', 'min_orb_price', 'min_orb_to_keep'];
    const stakeSettings = ['stake_threshold'];
    const transferSettings = ['orb_transfer_threshold'];

    if (swapSettings.includes(setting)) return 'swap';
    if (stakeSettings.includes(setting)) return 'stake';
    if (transferSettings.includes(setting)) return 'transfer';
    return 'mining';
  }

  private async refreshCategoryView(
    interaction: ButtonInteraction | StringSelectMenuInteraction,
    category: string,
    settings: any
  ) {
    // Rebuild the category embed and components
    let embed: EmbedBuilder;
    let components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[];

    switch (category) {
      case 'swap':
        embed = new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('Swap Settings ✓')
          .setDescription('Setting updated!')
          .addFields(
            { name: 'Auto-Swap', value: settings.auto_swap_enabled ? '`ON`' : '`OFF`', inline: true },
            { name: 'Threshold', value: `\`${settings.swap_threshold} ORB\``, inline: true },
            { name: 'Slippage', value: `\`${settings.slippage_bps / 100}%\``, inline: true },
            { name: 'Min Price', value: `\`$${settings.min_orb_price}\``, inline: true },
            { name: 'Min Keep', value: `\`${settings.min_orb_to_keep} ORB\``, inline: true },
          );

        components = [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId('s2_toggle:auto_swap_enabled')
              .setLabel(settings.auto_swap_enabled ? 'Turn OFF' : 'Turn ON')
              .setStyle(settings.auto_swap_enabled ? ButtonStyle.Danger : ButtonStyle.Success),
          ),
          new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId('s2_select:swap_threshold')
              .setPlaceholder('Swap Threshold')
              .addOptions([
                { label: '10 ORB', value: '10' },
                { label: '50 ORB', value: '50' },
                { label: '100 ORB', value: '100' },
                { label: 'Custom...', value: 'custom' },
              ]),
          ),
          new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId('s2_select:slippage_bps')
              .setPlaceholder('Slippage Tolerance')
              .addOptions([
                { label: '0.5%', value: '50' },
                { label: '1%', value: '100' },
                { label: '3%', value: '300' },
                { label: '5%', value: '500' },
              ]),
          ),
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId('s2_back')
              .setLabel('← Back')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId('s2_custom:min_orb_price')
              .setLabel('Set Min Price')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId('s2_custom:min_orb_to_keep')
              .setLabel('Set Min Keep')
              .setStyle(ButtonStyle.Secondary),
          ),
        ];
        break;

      case 'stake':
        embed = new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('Stake Settings ✓')
          .setDescription('Setting updated!')
          .addFields(
            { name: 'Auto-Stake', value: settings.auto_stake_enabled ? '`ON`' : '`OFF`', inline: true },
            { name: 'Threshold', value: `\`${settings.stake_threshold} ORB\``, inline: true },
          );

        components = [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId('s2_toggle:auto_stake_enabled')
              .setLabel(settings.auto_stake_enabled ? 'Turn OFF' : 'Turn ON')
              .setStyle(settings.auto_stake_enabled ? ButtonStyle.Danger : ButtonStyle.Success),
          ),
          new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId('s2_select:stake_threshold')
              .setPlaceholder('Stake Threshold')
              .addOptions([
                { label: '10 ORB', value: '10' },
                { label: '25 ORB', value: '25' },
                { label: '50 ORB', value: '50' },
                { label: '100 ORB', value: '100' },
                { label: 'Custom...', value: 'custom' },
              ]),
          ),
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId('s2_back')
              .setLabel('← Back')
              .setStyle(ButtonStyle.Secondary),
          ),
        ];
        break;

      case 'transfer':
        embed = new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('Transfer Settings ✓')
          .setDescription('Setting updated!')
          .addFields(
            { name: 'Auto-Transfer', value: settings.auto_transfer_enabled ? '`ON`' : '`OFF`', inline: true },
            { name: 'Threshold', value: `\`${settings.orb_transfer_threshold} ORB\``, inline: true },
          );

        components = [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId('s2_toggle:auto_transfer_enabled')
              .setLabel(settings.auto_transfer_enabled ? 'Turn OFF' : 'Turn ON')
              .setStyle(settings.auto_transfer_enabled ? ButtonStyle.Danger : ButtonStyle.Success),
          ),
          new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId('s2_select:orb_transfer_threshold')
              .setPlaceholder('Transfer Threshold')
              .addOptions([
                { label: '50 ORB', value: '50' },
                { label: '100 ORB', value: '100' },
                { label: '250 ORB', value: '250' },
                { label: '500 ORB', value: '500' },
                { label: 'Custom...', value: 'custom' },
              ]),
          ),
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId('s2_back')
              .setLabel('← Back')
              .setStyle(ButtonStyle.Secondary),
          ),
        ];
        break;

      case 'mining':
        embed = new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('Mining Settings ✓')
          .setDescription('Setting updated!')
          .addFields(
            { name: 'Motherload Threshold', value: `\`${settings.motherload_threshold} ORB\``, inline: true },
            { name: 'SOL per Block', value: `\`${settings.sol_per_block}\``, inline: true },
            { name: 'Blocks per Round', value: `\`${settings.num_blocks}\``, inline: true },
            { name: 'Budget Allocation', value: `\`${settings.automation_budget_percent}%\``, inline: true },
            { name: 'Auto-Claim SOL', value: `\`${settings.auto_claim_sol_threshold}\``, inline: true },
            { name: 'Auto-Claim ORB', value: `\`${settings.auto_claim_orb_threshold}\``, inline: true },
          );

        components = [
          new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId('s2_select:motherload_threshold')
              .setPlaceholder('Motherload Threshold')
              .addOptions([
                { label: '50 ORB', value: '50' },
                { label: '100 ORB', value: '100' },
                { label: '200 ORB', value: '200' },
                { label: '500 ORB', value: '500' },
                { label: 'Custom...', value: 'custom' },
              ]),
          ),
          new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId('s2_select:automation_budget_percent')
              .setPlaceholder('Budget Allocation')
              .addOptions([
                { label: '50%', value: '50' },
                { label: '75%', value: '75' },
                { label: '90%', value: '90' },
                { label: '100%', value: '100' },
                { label: 'Custom...', value: 'custom' },
              ]),
          ),
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId('s2_back')
              .setLabel('← Back')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId('s2_custom:sol_per_block')
              .setLabel('SOL/Block')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId('s2_custom:num_blocks')
              .setLabel('Blocks')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId('s2_custom:auto_claim_thresholds')
              .setLabel('Claim Thresholds')
              .setStyle(ButtonStyle.Secondary),
          ),
        ];
        break;

      default:
        return;
    }

    await interaction.editReply({ embeds: [embed], components: components as any });
  }

  private async showSettings2CustomModal(
    interaction: ButtonInteraction | StringSelectMenuInteraction,
    setting: string
  ) {
    const modal = new ModalBuilder()
      .setCustomId(`s2_custom_modal:${setting}`)
      .setTitle('Custom Value');

    let label: string;
    let placeholder: string;

    switch (setting) {
      case 'swap_threshold':
        label = 'Swap Threshold (ORB)';
        placeholder = '100';
        break;
      case 'stake_threshold':
        label = 'Stake Threshold (ORB)';
        placeholder = '50';
        break;
      case 'orb_transfer_threshold':
        label = 'Transfer Threshold (ORB)';
        placeholder = '100';
        break;
      case 'motherload_threshold':
        label = 'Motherload Threshold (ORB)';
        placeholder = '100';
        break;
      case 'automation_budget_percent':
        label = 'Budget Allocation (%)';
        placeholder = '90';
        break;
      case 'min_orb_price':
        label = 'Minimum ORB Price ($)';
        placeholder = '30';
        break;
      case 'min_orb_to_keep':
        label = 'Minimum ORB to Keep';
        placeholder = '0';
        break;
      case 'sol_per_block':
        label = 'SOL per Block';
        placeholder = '0.001';
        break;
      case 'num_blocks':
        label = 'Number of Blocks';
        placeholder = '10';
        break;
      case 'auto_claim_thresholds':
        label = 'SOL Threshold, ORB Threshold (comma sep)';
        placeholder = '0.1, 1.0';
        break;
      default:
        label = 'Value';
        placeholder = '0';
    }

    const valueInput = new TextInputBuilder()
      .setCustomId('value')
      .setLabel(label)
      .setStyle(TextInputStyle.Short)
      .setPlaceholder(placeholder)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(valueInput));
    await interaction.showModal(modal);
  }

  private async handleSettings2CustomSubmit(interaction: ModalSubmitInteraction) {
    await interaction.deferUpdate();
    const discordId = interaction.user.id;
    const setting = interaction.customId.split(':')[1];
    const value = interaction.fields.getTextInputValue('value');

    try {
      if (setting === 'auto_claim_thresholds') {
        // Handle compound setting
        const [solThreshold, orbThreshold] = value.split(',').map(s => parseFloat(s.trim()));
        await updateUserSetting(PLATFORM, discordId, 'auto_claim_sol_threshold', solThreshold || 0.1);
        await updateUserSetting(PLATFORM, discordId, 'auto_claim_orb_threshold', orbThreshold || 1.0);
      } else {
        const numValue = parseFloat(value);
        await updateUserSetting(PLATFORM, discordId, setting, numValue);
      }

      const category = this.getSettingCategory(setting);
      const settings = await getUserSettings(PLATFORM, discordId);
      await this.refreshCategoryView(interaction as any, category, settings);
    } catch (error) {
      logger.error('[Discord] Error saving custom setting:', error);
    }
  }

  // ==================== WALLET GENERATION/IMPORT ====================
  private async handleGenerateWallet(interaction: ButtonInteraction) {
    await interaction.deferReply({ ephemeral: true });
    const discordId = interaction.user.id;
    const username = interaction.user.username;

    try {
      const result = await generateAndRegisterWallet(PLATFORM, discordId, username);
      if (result.success) {
        const embed = new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('Wallet Generated!')
          .setDescription(
            '**Your new wallet has been created.**\n\n' +
            '**IMPORTANT: Save your private key!**\n' +
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
          embeds: [formatErrorEmbed('Failed', result.error || 'Unknown error')],
        });
      }
    } catch (error) {
      logger.error('[Discord] Error generating wallet:', error);
      await interaction.editReply({ embeds: [formatErrorEmbed('Error', 'Failed to generate wallet.')] });
    }
  }

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

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(privateKeyInput));
    await interaction.showModal(modal);
  }

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
          .setTitle('Wallet Connected!')
          .setDescription(
            `**Public Key:**\n\`${result.publicKey}\`\n\n` +
            'Your wallet has been encrypted and stored securely.\n' +
            'Use `/wallet` to view your balances.'
          );

        await interaction.editReply({ embeds: [embed] });
        logger.info(`[Discord] Imported wallet for ${discordId}: ${result.publicKey}`);
      } else {
        await interaction.editReply({
          embeds: [formatErrorEmbed('Invalid Private Key', result.error || 'Please check your key.')],
        });
      }
    } catch (error) {
      logger.error('[Discord] Error importing wallet:', error);
      await interaction.editReply({ embeds: [formatErrorEmbed('Error', 'Failed to import wallet.')] });
    }
  }

  // ==================== LINK ====================
  private async handleLink(interaction: ChatInputCommandInteraction) {
    const discordId = interaction.user.id;
    const codeInput = interaction.options.getString('code');

    if (codeInput) {
      await interaction.deferReply({ ephemeral: true });
      try {
        const result = await linkAccounts(PLATFORM, discordId, codeInput);
        if (result.success) {
          const embed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('Accounts Linked!')
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
        await interaction.editReply({ embeds: [formatErrorEmbed('Error', 'Failed to link accounts.')] });
      }
      return;
    }

    await interaction.deferReply();
    try {
      const linked = await getLinkedAccount(PLATFORM, discordId);
      const embed = await formatLinkEmbed(linked, PLATFORM);

      const buttons: ButtonBuilder[] = [];
      if (linked?.linked_at && linked?.telegram_id) {
        buttons.push(
          new ButtonBuilder()
            .setCustomId('link_unlink')
            .setLabel('Unlink Accounts')
            .setStyle(ButtonStyle.Danger)
        );
      } else {
        buttons.push(
          new ButtonBuilder()
            .setCustomId('link_generate')
            .setLabel('Generate Link Code')
            .setStyle(ButtonStyle.Primary)
        );
      }

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
      await interaction.editReply({ embeds: [embed], components: [row] });
    } catch (error) {
      await interaction.editReply({ embeds: [formatErrorEmbed('Error', 'Failed to load link status.')] });
    }
  }

  private async handleLinkGenerate(interaction: ButtonInteraction) {
    await interaction.deferReply({ ephemeral: true });
    const discordId = interaction.user.id;

    try {
      const linkCode = await generateLinkCode(PLATFORM, discordId);
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('Link Code Generated')
        .setDescription(
          `Your link code: **\`${linkCode}\`**\n\n` +
          '*Expires in 15 minutes*\n\n' +
          '**To link your Telegram account:**\n' +
          '1. Go to our Telegram bot\n' +
          '2. Use `/link` and click "Use Link Code"\n' +
          `3. Enter: \`${linkCode}\``
        );
      await interaction.editReply({ embeds: [embed] });
      logger.info(`[Discord] Generated link code for ${discordId}: ${linkCode}`);
    } catch (error) {
      await interaction.editReply({ embeds: [formatErrorEmbed('Error', 'Failed to generate link code.')] });
    }
  }

  private async handleUnlink(interaction: ButtonInteraction) {
    await interaction.deferReply({ ephemeral: true });
    const discordId = interaction.user.id;

    try {
      const success = await unlinkAccounts(PLATFORM, discordId);
      if (success) {
        const embed = new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('Accounts Unlinked')
          .setDescription('Your Discord and Telegram accounts are no longer linked.');
        await interaction.editReply({ embeds: [embed] });
        logger.info(`[Discord] Unlinked ${discordId}`);
      } else {
        await interaction.editReply({
          embeds: [formatErrorEmbed('Not Linked', 'Your accounts are not currently linked.')],
        });
      }
    } catch (error) {
      await interaction.editReply({ embeds: [formatErrorEmbed('Error', 'Failed to unlink accounts.')] });
    }
  }

  private async handleLinkFromOnboarding(interaction: ButtonInteraction) {
    await interaction.deferReply({ ephemeral: true });
    const discordId = interaction.user.id;

    try {
      const linked = await getLinkedAccount(PLATFORM, discordId);
      if (linked?.linked_at && linked?.telegram_id) {
        const embed = new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('Already Linked')
          .setDescription(`Your account is already linked to Telegram ID: \`${linked.telegram_id}\``);
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('Link Telegram Account')
        .setDescription(
          'Link your Telegram account to share your wallet across platforms.\n\n' +
          '**Option 1:** Generate a code here and use it in Telegram.\n' +
          '**Option 2:** Have a code from Telegram? Use `/link <code>`'
        );

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('link_generate')
          .setLabel('Generate Link Code')
          .setStyle(ButtonStyle.Primary)
      );

      await interaction.editReply({ embeds: [embed], components: [row] });
    } catch (error) {
      await interaction.editReply({ embeds: [formatErrorEmbed('Error', 'Failed to start linking.')] });
    }
  }

  // ==================== HELP ====================
  private async handleHelp(interaction: ChatInputCommandInteraction) {
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('ORB Mining Bot - Commands')
      .setDescription('Available commands:')
      .addFields(
        { name: '/start', value: 'Get started or view main menu', inline: true },
        { name: '/wallet', value: 'View wallet and balances', inline: true },
        { name: '/status', value: 'View mining status', inline: true },
        { name: '/claim sol|orb|all', value: 'Claim rewards', inline: true },
        { name: '/automation start|stop|status', value: 'Control automation', inline: true },
        { name: '/deploy <amount>', value: 'Deploy SOL manually', inline: true },
        { name: '/swap <amount>', value: 'Swap ORB to SOL', inline: true },
        { name: '/settings view|mining|automation|swap', value: 'Manage settings', inline: true },
        { name: '/link [code]', value: 'Link Telegram account', inline: true },
        { name: '/help', value: 'Show this help', inline: true },
      );

    await interaction.reply({ embeds: [embed] });
  }

  // ==================== LIFECYCLE ====================
  async start() {
    try {
      await initializeDatabase();
      await initializeLinkedAccountsTable();
      await initializeDiscordUsersTable();
      await initializeDiscordSettingsTable();
      logger.info('[Discord] Database initialized');

      await loadAndCacheConfig();
      logger.info('[Discord] Configuration loaded');

      await this.registerCommands();
      await this.client.login(process.env.DISCORD_BOT_TOKEN);

      logger.info('[Discord] Bot started successfully');
    } catch (error) {
      logger.error('[Discord] Failed to start bot:', error);
      throw error;
    }
  }

  async stop() {
    logger.info('[Discord] Shutting down...');
    this.client.destroy();
  }
}

async function main() {
  const bot = new OrbMiningDiscordBot();

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
