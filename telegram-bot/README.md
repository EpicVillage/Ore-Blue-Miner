# ORB Mining Telegram Bot

Mobile-friendly Telegram bot for monitoring and controlling your ORB mining operations.

## Features

- **Real-time Status**: View wallet balances, mining status, and automation state
- **Control Panel**: Start/Stop automation directly from Telegram
- **Performance Stats**: Track mining performance and transaction history
- **Rewards Monitoring**: Check claimable SOL and ORB rewards
- **Transaction History**: View recent mining, claim, and swap transactions
- **Settings View**: Check current bot configuration

## Setup

### 1. Create Your Telegram Bot

1. Open Telegram and search for [@BotFather](https://t.me/BotFather)
2. Send `/newbot` to create a new bot
3. Choose a name (e.g., "My ORB Mining Bot")
4. Choose a username (must end in 'bot', e.g., "myorb_mining_bot")
5. BotFather will give you a **bot token** that looks like:
   ```
   123456789:ABCdefGHIjklMNOpqrsTUVwxyz
   ```
6. **Copy this token** - you'll need it in the next step

### 2. Configure Bot Token

Run the setup script with your bot token:

```bash
npx tsx scripts/setup-telegram-bot.ts YOUR_BOT_TOKEN
```

Example:
```bash
npx tsx scripts/setup-telegram-bot.ts 123456789:ABCdefGHIjklMNOpqrsTUVwxyz
```

### 3. Start the Bot

```bash
npx tsx telegram-bot/bot.ts
```

The bot will start and connect to Telegram.

### 4. Use Your Bot

1. Open Telegram and search for your bot (using the username you chose)
2. Click "Start" or send `/start`
3. Use the menu buttons or type commands

## Available Commands

| Command | Description |
|---------|-------------|
| `/start` | Show welcome message and main menu |
| `/status` | View current mining status and balances |
| `/control` | Start/Stop automation control panel |
| `/stats` | View performance statistics (7 days) |
| `/rewards` | Check claimable mining and staking rewards |
| `/history` | View recent transactions (last 10) |
| `/settings` | View current bot settings |
| `/help` | Show help message |

## Interactive Features

The bot uses inline keyboards for easy navigation:

- **Status Screen**: Real-time balance and automation info with refresh button
- **Control Panel**: One-tap Start/Stop automation with confirmation
- **Main Menu**: Quick access to all features
- **Navigation**: Return to main menu from any screen

## Example Usage

### Check Status
```
/status
```
Shows:
- Wallet SOL and ORB balance
- ORB price in USD
- Automation status and budget
- Unclaimed mining rewards
- Unclaimed staking rewards

### Start Mining
```
/control
```
Then click "▶️ Start Mining" to:
- Create automation account
- Deposit SOL based on budget percentage
- Begin mining automatically

### Stop Mining
```
/control
```
Then click "⏹️ Stop Mining" to:
- Close automation account
- Return remaining SOL to wallet
- Stop mining

### View Stats
```
/stats
```
Shows transaction breakdown by type:
- Deploy transactions
- Claim SOL/ORB
- Swaps
- Stake operations
- Automation setup/close

## Architecture

```
telegram-bot/
├── bot.ts              # Main bot file with Telegraf setup
├── utils/
│   └── formatters.ts   # Message formatting utilities
├── commands/           # (Future) Command handlers
├── handlers/           # (Future) Callback handlers
└── menus/              # (Future) Menu builders
```

## Integration

The bot integrates with existing mining bot utilities:

- **Config**: Uses `src/utils/config.ts` for settings
- **Database**: Queries `src/utils/database.ts` for transactions
- **Wallet**: Checks balances via `src/utils/wallet.ts`
- **Automation**: Controls mining via `src/utils/automationControl.ts`
- **Jupiter**: Fetches ORB price from `src/utils/jupiter.ts`

## Security

- Bot token stored in database (can be encrypted)
- No authentication required (add user ID whitelist for production)
- All operations use existing wallet/config security
- No sensitive data displayed in messages (uses incognito mode setting)

## Troubleshooting

### Bot doesn't respond
- Check that bot token is correct: `npx tsx scripts/setup-telegram-bot.ts`
- Ensure bot is running: `npx tsx telegram-bot/bot.ts`
- Check logs for errors

### "Configuration not loaded" error
- Bot automatically loads config on startup
- Ensure database exists and has settings
- Run wizard if needed: `npm start`

### Commands don't work
- Make sure you sent `/start` first
- Check that wallet is configured
- Verify RPC connection is working

## Future Enhancements

**Phase 2** (Notifications):
- Real-time mining notifications
- Reward claim alerts
- Motherload threshold alerts
- Price alerts

**Phase 3** (Advanced):
- Settings configuration via Telegram
- Manual claim/swap commands
- Multi-wallet support
- Analytics dashboard

## Running in Production

For production deployment, consider:

1. **Process Manager**: Use PM2 or systemd
   ```bash
   pm2 start telegram-bot/bot.ts --name orb-telegram-bot
   ```

2. **User Authentication**: Add user ID whitelist
3. **Rate Limiting**: Prevent command spam
4. **Error Monitoring**: Set up error notifications
5. **Logging**: Configure production log levels

## Support

For issues or questions:
- Check logs in console output
- Verify settings in database
- Test with web dashboard first
- Report bugs in project repository
