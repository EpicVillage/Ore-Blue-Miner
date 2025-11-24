# ORB Mining Bot - Multi-User Telegram Bot

A fully automated, multi-user Telegram bot for ORB/Ore.blue mining on Solana. Each user manages their own wallet with encrypted storage, automated mining, auto-claim, auto-transfer, and comprehensive analytics.

## Features

### 🔐 Multi-User Support
- **Separate wallets per user** - Each Telegram user has their own encrypted wallet
- **AES-256-GCM encryption** - All private keys encrypted in database
- **Easy wallet management** - Create new wallets or import existing ones via Telegram

### ⚡ Automated Mining
- **Auto-deploy** - Automatically deploy SOL to mining rounds
- **Auto-claim** - Claim rewards every 5 minutes (SOL, ORB, and staking)
- **Auto-transfer** - Automatically transfer ORB tokens when threshold reached
- **Customizable settings** - Each user controls their own automation parameters

### 📊 Analytics & Tracking
- **Real-time stats** - Mining performance, claims, earnings
- **Transaction history** - Complete record with Solscan links
- **PnL tracking** - Profit & loss analysis
- **Owner stats** - Track dev fee earnings (1% service fee)

### 💰 Wallet Operations
- **Balance checking** - View SOL and ORB balances
- **Swap ORB → SOL** - Integrated Jupiter DEX swaps
- **Manual operations** - Deploy, claim, stake on-demand
- **Status dashboard** - Current round, claimable rewards, prices

## Installation

### Prerequisites
- Node.js 18+ and npm
- Telegram Bot Token (from [@BotFather](https://t.me/botfather))
- Solana RPC endpoint (default: public RPC)

### Setup

1. **Clone and install**:
   ```bash
   git clone <your-repo>
   cd "MagicSwap Farming"
   npm install
   ```

2. **Configure environment**:
   Create a `.env` file:
   ```env
   # Required
   TELEGRAM_BOT_TOKEN=your_bot_token_here

   # Optional
   RPC_ENDPOINT=https://api.mainnet-beta.solana.com
   OWNER_TELEGRAM_ID=your_telegram_id
   ```

3. **Start the bot**:
   ```bash
   npm start
   ```

## Usage

### User Commands

**Wallet & Status:**
- `/start` - Setup wallet (create new or import existing)
- `/wallet` - Manage your wallet
- `/status` - View dashboard with balances, rewards, and round info

**Manual Operations:**
- `/claim_sol` - Claim SOL mining rewards
- `/claim_orb` - Claim ORB mining rewards
- `/claim_staking` - Claim staking rewards
- `/swap` - Swap ORB to SOL (Jupiter DEX)
- `/deploy` - Manually deploy to current round

**Automation:**
- `/control` - Control automation (start/stop)
- `/settings` - Configure auto-deploy, auto-claim, auto-transfer settings

**Analytics:**
- `/stats` - Complete analytics (mining stats, earnings, claims)
- `/history` - Transaction history with Solscan links
- `/pnl` - Profit & loss summary

**Staking:**
- `/stake` - View staking info and rewards

**Help:**
- `/help` - Show all available commands

### Owner Commands

- `/ownerstats` - View dev fee earnings and transaction breakdown

## Architecture

```
MagicSwap Farming/
├── src/                    # Main bot logic
│   ├── commands/          # CLI commands (pnl, baseline)
│   ├── utils/             # Core utilities (database, accounts, program, Jupiter)
│   └── index.ts           # Entry point
├── telegram-bot/          # Telegram bot
│   ├── bot.ts            # Main bot handler
│   └── utils/            # Bot utilities (user operations, stats, automation)
├── scripts/              # Utility scripts
├── data/                 # SQLite database
└── logs/                 # Application logs
```

## Database

SQLite database stores:
- **users** - Telegram users with encrypted wallets
- **transactions** - All mining/claim/swap transactions
- **settings** - Per-user configuration (auto-deploy, auto-claim, auto-transfer)
- **user_rounds** - Round participation tracking

## Automation Services

### Auto-Claim (5 min interval)
- Claims SOL mining rewards
- Claims ORB mining rewards
- Claims staking rewards
- Executes auto-transfer if threshold met

### Auto-Executor (15 sec interval)
- Monitors current mining round
- Auto-deploys for users with automation enabled
- Checkpoints completed rounds

## Security

- **Encrypted storage** - All private keys encrypted with AES-256-GCM
- **Machine-specific keys** - Encryption uses machine hostname + private key
- **No key exposure** - Private keys never logged or displayed
- **User isolation** - Each user's data completely separate

## Dev Fees

- **1% service fee** on deploy/auto-deploy transactions
- Collected to: `HCDWS5pe2sAUmagXqDbpvCW7HHyxgcGrJXr1aSxBRRPZ`
- Track earnings with `/ownerstats` command

## Configuration

Users can customize via `/settings`:
- **Auto-Deploy**: Enable/disable, rounds count, SOL per round
- **Auto-Claim**: Enable/disable (5 min interval)
- **Auto-Transfer**: Enable/disable, threshold amount, destination address

## Tech Stack

- **TypeScript** - Type-safe development
- **Telegraf** - Telegram Bot Framework
- **@solana/web3.js** - Solana blockchain interaction
- **@coral-xyz/anchor** - Solana program interaction
- **Jupiter API** - DEX aggregator for swaps
- **SQLite3** - Local database
- **Winston** - Logging

## Troubleshooting

**Bot not responding:**
- Check `TELEGRAM_BOT_TOKEN` is set correctly
- Ensure bot is running: `npm start`
- Check logs in `telegram-bot.log`

**Transactions failing:**
- Ensure wallet has SOL for fees (minimum ~0.01 SOL)
- Check RPC endpoint is working
- View transaction errors in `/history`

**Auto-claim not working:**
- Enable via `/settings` → Auto-Claim
- Check automation status in `/control`
- Verify in logs: `grep Auto-Claim telegram-bot.log`

## License

MIT

## Support

For issues or questions, check the logs or contact the developer.
