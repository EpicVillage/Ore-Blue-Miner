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
      sub.setName('mining').setDescription('Configure mining settings')
    )
    .addSubcommand(sub =>
      sub.setName('automation').setDescription('Configure automation settings')
    )
    .addSubcommand(sub =>
      sub.setName('swap').setDescription('Configure swap settings')
    ),

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
      await this.rest.put(
        Routes.applicationCommands(process.env.DISCORD_CLIENT_ID!),
        { body: commands.map(cmd => cmd.toJSON()) }
      );
      logger.info('[Discord] Slash commands registered successfully');
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
      case 'settings_swap': await this.showSwapSettingsModal(interaction); break;
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
      case 'swap_settings_modal': await this.handleSwapSettingsSubmit(interaction); break;
      default:
        await interaction.reply({ content: 'Unknown modal', ephemeral: true });
    }
  }

  private async handleSelectMenu(interaction: StringSelectMenuInteraction) {
    // For future select menu interactions
    await interaction.reply({ content: 'Selection received', ephemeral: true });
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
              name: 'Mining',
              value:
                `Motherload Threshold: \`${settings.motherload_threshold} ORB\`\n` +
                `SOL per Block: \`${settings.sol_per_block} SOL\`\n` +
                `Blocks per Round: \`${settings.num_blocks}\``,
              inline: true,
            },
            {
              name: 'Automation',
              value:
                `Budget: \`${settings.automation_budget_percent}%\`\n` +
                `Auto-Claim SOL: \`${settings.auto_claim_sol_threshold} SOL\`\n` +
                `Auto-Claim ORB: \`${settings.auto_claim_orb_threshold} ORB\``,
              inline: true,
            },
            {
              name: 'Swap',
              value:
                `Auto-Swap: \`${settings.auto_swap_enabled ? 'ON' : 'OFF'}\`\n` +
                `Threshold: \`${settings.swap_threshold} ORB\`\n` +
                `Slippage: \`${settings.slippage_bps / 100}%\``,
              inline: true,
            },
          );

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('settings_mining')
            .setLabel('Mining')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('settings_automation')
            .setLabel('Automation')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('settings_swap')
            .setLabel('Swap')
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
    } else if (subcommand === 'swap') {
      await this.showSwapSettingsModal(interaction as any);
    }
  }

  private async showMiningSettingsModal(interaction: ButtonInteraction | ChatInputCommandInteraction) {
    const discordId = interaction.user.id;
    const settings = await getUserSettings(PLATFORM, discordId);

    const modal = new ModalBuilder()
      .setCustomId('mining_settings_modal')
      .setTitle('Mining Settings');

    const motherloadInput = new TextInputBuilder()
      .setCustomId('motherload_threshold')
      .setLabel('Motherload Threshold (ORB)')
      .setStyle(TextInputStyle.Short)
      .setValue(String(settings.motherload_threshold))
      .setRequired(true);

    const solPerBlockInput = new TextInputBuilder()
      .setCustomId('sol_per_block')
      .setLabel('SOL per Block')
      .setStyle(TextInputStyle.Short)
      .setValue(String(settings.sol_per_block))
      .setRequired(true);

    const numBlocksInput = new TextInputBuilder()
      .setCustomId('num_blocks')
      .setLabel('Number of Blocks per Round')
      .setStyle(TextInputStyle.Short)
      .setValue(String(settings.num_blocks))
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(motherloadInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(solPerBlockInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(numBlocksInput),
    );

    await interaction.showModal(modal);
  }

  private async handleMiningSettingsSubmit(interaction: ModalSubmitInteraction) {
    await interaction.deferReply({ ephemeral: true });
    const discordId = interaction.user.id;

    try {
      const motherload = parseFloat(interaction.fields.getTextInputValue('motherload_threshold'));
      const solPerBlock = parseFloat(interaction.fields.getTextInputValue('sol_per_block'));
      const numBlocks = parseInt(interaction.fields.getTextInputValue('num_blocks'));

      await updateUserSetting(PLATFORM, discordId, 'motherload_threshold', motherload);
      await updateUserSetting(PLATFORM, discordId, 'sol_per_block', solPerBlock);
      await updateUserSetting(PLATFORM, discordId, 'num_blocks', numBlocks);

      await interaction.editReply({
        embeds: [formatSuccessEmbed('Settings Updated', 'Mining settings have been saved.')],
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
      .setTitle('Automation Settings');

    const budgetInput = new TextInputBuilder()
      .setCustomId('automation_budget_percent')
      .setLabel('Budget Percentage (%)')
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
      new ActionRowBuilder<TextInputBuilder>().addComponents(budgetInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(autoClaimSolInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(autoClaimOrbInput),
    );

    await interaction.showModal(modal);
  }

  private async handleAutomationSettingsSubmit(interaction: ModalSubmitInteraction) {
    await interaction.deferReply({ ephemeral: true });
    const discordId = interaction.user.id;

    try {
      const budget = parseFloat(interaction.fields.getTextInputValue('automation_budget_percent'));
      const autoClaimSol = parseFloat(interaction.fields.getTextInputValue('auto_claim_sol_threshold'));
      const autoClaimOrb = parseFloat(interaction.fields.getTextInputValue('auto_claim_orb_threshold'));

      await updateUserSetting(PLATFORM, discordId, 'automation_budget_percent', budget);
      await updateUserSetting(PLATFORM, discordId, 'auto_claim_sol_threshold', autoClaimSol);
      await updateUserSetting(PLATFORM, discordId, 'auto_claim_orb_threshold', autoClaimOrb);

      await interaction.editReply({
        embeds: [formatSuccessEmbed('Settings Updated', 'Automation settings have been saved.')],
      });
    } catch (error) {
      await interaction.editReply({ embeds: [formatErrorEmbed('Error', 'Failed to save settings.')] });
    }
  }

  private async showSwapSettingsModal(interaction: ButtonInteraction | ChatInputCommandInteraction) {
    const discordId = interaction.user.id;
    const settings = await getUserSettings(PLATFORM, discordId);

    const modal = new ModalBuilder()
      .setCustomId('swap_settings_modal')
      .setTitle('Swap Settings');

    const autoSwapInput = new TextInputBuilder()
      .setCustomId('auto_swap_enabled')
      .setLabel('Auto-Swap Enabled (1 = yes, 0 = no)')
      .setStyle(TextInputStyle.Short)
      .setValue(settings.auto_swap_enabled ? '1' : '0')
      .setRequired(true);

    const thresholdInput = new TextInputBuilder()
      .setCustomId('swap_threshold')
      .setLabel('Swap Threshold (ORB)')
      .setStyle(TextInputStyle.Short)
      .setValue(String(settings.swap_threshold))
      .setRequired(true);

    const slippageInput = new TextInputBuilder()
      .setCustomId('slippage_bps')
      .setLabel('Slippage (bps, e.g. 300 = 3%)')
      .setStyle(TextInputStyle.Short)
      .setValue(String(settings.slippage_bps))
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(autoSwapInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(thresholdInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(slippageInput),
    );

    await interaction.showModal(modal);
  }

  private async handleSwapSettingsSubmit(interaction: ModalSubmitInteraction) {
    await interaction.deferReply({ ephemeral: true });
    const discordId = interaction.user.id;

    try {
      const autoSwap = interaction.fields.getTextInputValue('auto_swap_enabled') === '1' ? 1 : 0;
      const threshold = parseFloat(interaction.fields.getTextInputValue('swap_threshold'));
      const slippage = parseInt(interaction.fields.getTextInputValue('slippage_bps'));

      await updateUserSetting(PLATFORM, discordId, 'auto_swap_enabled', autoSwap);
      await updateUserSetting(PLATFORM, discordId, 'swap_threshold', threshold);
      await updateUserSetting(PLATFORM, discordId, 'slippage_bps', slippage);

      await interaction.editReply({
        embeds: [formatSuccessEmbed('Settings Updated', 'Swap settings have been saved.')],
      });
    } catch (error) {
      await interaction.editReply({ embeds: [formatErrorEmbed('Error', 'Failed to save settings.')] });
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
