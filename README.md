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

### 💰 Wallet Operations
- **Balance checking** - View SOL and ORB balances
- **Swap ORB → SOL** - Integrated Jupiter DEX swaps
- **Manual operations** - Deploy, claim, stake on-demand
- **Status dashboard** - Current round, claimable rewards, prices

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

## Architecture

```
Ore-Blue-Miner/
├── src/
│   ├── utils/             # Core utilities (database, accounts, program, Jupiter)
│   └── types/             # TypeScript type definitions
├── telegram-bot/          # Telegram bot
│   ├── bot.ts            # Main bot handler
│   └── utils/            # Bot utilities (user operations, stats, automation)
├── data/                 # SQLite database
└── .env                  # Configuration (bot token, encryption key)
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

## Support

For issues or questions, contact the developer.
