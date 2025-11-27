# ORB Mining Bot

A fully automated, multi-user bot for ORB/Ore.blue mining on Solana. Each user manages their own wallet with encrypted storage, automated mining, auto-claim, auto-transfer, and comprehensive analytics.

[![Discord Bot](https://img.shields.io/badge/Discord-Bot-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.com/oauth2/authorize?client_id=1443440072673329233&permissions=2147567616&integration_type=1&scope=bot+applications.commands)
[![Telegram Bot](https://img.shields.io/badge/Telegram-Bot-26A5E4?style=for-the-badge&logo=telegram&logoColor=white)](https://t.me/blueore_bot)

## Features

### 🔐 Security
- **HMAC-SHA256 encryption** - All private keys encrypted in database with tamper detection
- **User isolation** - Each user's wallet and data completely separate
- **No key exposure** - Private keys never logged or displayed in plain text

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
- `/start` - Setup wallet (import private key)
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

## Dev Fees

- **1% service fee** on all deploy/auto-deploy transactions
- Helps support continued development and maintenance of this community tool

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

## Credits

Inspired by [CryptoGnome's orb_miner](https://github.com/CryptoGnome/orb_miner).

## ⚠️ DISCLAIMER

**USE AT YOUR OWN RISK**

This software handles cryptocurrency transactions on the Solana blockchain.

- 🚫 **NOT FINANCIAL ADVICE** - This is a tool, not investment advice
- 🧪 **TEST FIRST** - Start with small amounts to understand how it works
- 🔐 **USE A FRESH WALLET** - We strongly recommend creating a new wallet specifically for this bot to protect your main funds from potential bugs or vulnerabilities
- 💰 **1% DEV FEE** - All deployment transactions include a 1% service fee

By using this bot, you acknowledge and accept these risks.

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For issues or questions, contact the developer:
- Discord: **epicvillage**
