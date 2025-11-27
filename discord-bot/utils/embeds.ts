import { EmbedBuilder } from 'discord.js';
import { WalletBalances, LinkedAccount, Platform } from '../../shared';

/**
 * Discord Embed Formatters
 *
 * Rich embed formatting for Discord messages
 */

/**
 * Format SOL amount
 */
export function formatSOL(amount: number): string {
  return `${amount.toFixed(4)} SOL`;
}

/**
 * Format ORB amount
 */
export function formatORB(amount: number): string {
  return `${amount.toFixed(2)} ORB`;
}

/**
 * Format USD amount
 */
export function formatUSD(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/**
 * Format wallet embed
 */
export async function formatWalletEmbed(
  balances: WalletBalances | null,
  orbPrice: { priceInSol: number; priceInUsd: number }
): Promise<EmbedBuilder> {
  if (!balances) {
    return new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle('❌ Wallet Error')
      .setDescription('Could not load wallet balances.');
  }

  const orbValueUsd = balances.orb * orbPrice.priceInUsd;
  const totalValueUsd = (balances.sol * (orbPrice.priceInUsd / orbPrice.priceInSol)) + orbValueUsd;

  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('💼 Wallet')
    .setDescription(`\`${balances.publicKey}\``)
    .addFields(
      {
        name: '💰 SOL Balance',
        value: `\`${formatSOL(balances.sol)}\``,
        inline: true,
      },
      {
        name: '🔮 ORB Balance',
        value: `\`${formatORB(balances.orb)}\`\n≈ ${formatUSD(orbValueUsd)}`,
        inline: true,
      },
      {
        name: '📈 ORB Price',
        value: `${formatUSD(orbPrice.priceInUsd)}`,
        inline: true,
      },
    )
    .setFooter({ text: `Total Value: ~${formatUSD(totalValueUsd)}` })
    .setTimestamp();
}

/**
 * Format status embed with mining info
 */
export async function formatStatusEmbed(
  miner: any | null,
  stake: any | null,
  board: any,
  round: any
): Promise<EmbedBuilder> {
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('📊 Mining Status')
    .setTimestamp();

  // Current round info
  const roundId = Number(board.roundId);
  const motherload = Number(round.motherload) / 1e9;

  embed.addFields({
    name: '🎯 Current Round',
    value: `Round #${roundId}\nMotherlode: \`${formatORB(motherload)}\``,
    inline: false,
  });

  // Mining rewards
  if (miner) {
    const miningSol = Number(miner.rewardsSol) / 1e9;
    const miningOrb = Number(miner.rewardsOre) / 1e9;

    embed.addFields({
      name: '⛏️ Mining Rewards',
      value:
        `SOL: \`${formatSOL(miningSol)}\`\n` +
        `ORB: \`${formatORB(miningOrb)}\``,
      inline: true,
    });

    // Deployed this round
    const totalDeployed = miner.deployed.reduce(
      (sum: number, amount: any) => sum + Number(amount) / 1e9,
      0
    );

    if (totalDeployed > 0) {
      const deployedSquares = miner.deployed
        .map((amount: any, index: number) => ({ index, amount: Number(amount) / 1e9 }))
        .filter((s: any) => s.amount > 0)
        .map((s: any) => `Sq ${s.index + 1}: ${s.amount.toFixed(4)}`)
        .join('\n');

      embed.addFields({
        name: '🎲 Deployed',
        value: `Total: \`${formatSOL(totalDeployed)}\`\n${deployedSquares}`,
        inline: true,
      });
    }
  } else {
    embed.addFields({
      name: '⛏️ Mining',
      value: 'No miner account found',
      inline: true,
    });
  }

  // Staking rewards
  if (stake) {
    const stakingSol = Number(stake.rewardsSol) / 1e9;
    const stakingOrb = Number(stake.rewardsOre) / 1e9;
    const stakedAmount = Number(stake.amount) / 1e9;

    embed.addFields({
      name: '🏦 Staking',
      value:
        `Staked: \`${formatORB(stakedAmount)}\`\n` +
        `Rewards SOL: \`${formatSOL(stakingSol)}\`\n` +
        `Rewards ORB: \`${formatORB(stakingOrb)}\``,
      inline: true,
    });
  }

  return embed;
}

/**
 * Format link status embed
 */
export async function formatLinkEmbed(
  linked: LinkedAccount | null,
  currentPlatform: Platform
): Promise<EmbedBuilder> {
  const isLinked = linked?.linked_at && (currentPlatform === 'discord' ? linked.telegram_id : linked.discord_id);

  if (isLinked) {
    const linkedPlatformId = currentPlatform === 'discord' ? linked!.telegram_id : linked!.discord_id;
    const linkedPlatform = currentPlatform === 'discord' ? 'Telegram' : 'Discord';

    return new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('🔗 Account Linked')
      .setDescription(
        `✅ Your account is linked!\n\n` +
        `**Linked ${linkedPlatform} ID:** \`${linkedPlatformId}\`\n` +
        `**Linked On:** ${new Date(linked!.linked_at!).toLocaleDateString()}\n\n` +
        `Your ${linkedPlatform} account shares the same wallet and data.`
      );
  } else {
    return new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🔗 Account Linking')
      .setDescription(
        'Link your Telegram and Discord accounts to share the same wallet and settings.\n\n' +
        '**How to link:**\n' +
        '1️⃣ Generate a link code here\n' +
        '2️⃣ Use the code on our Telegram bot with `/link`\n\n' +
        '**Or if you have a code from Telegram:**\n' +
        '• Use `/link <code>` to link instantly'
      );
  }
}

/**
 * Format error embed
 */
export function formatErrorEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xED4245)
    .setTitle(`❌ ${title}`)
    .setDescription(description);
}

/**
 * Format success embed
 */
export function formatSuccessEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle(`✅ ${title}`)
    .setDescription(description);
}
