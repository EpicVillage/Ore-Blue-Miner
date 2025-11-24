import 'dotenv/config';
declare class OrbMiningBot {
    private bot;
    private sessions;
    private ownerId;
    constructor(token: string, _config: any);
    /**
     * Get or create session for a user
     */
    private getSession;
    /**
     * Clear user session state
     */
    private clearSession;
    /**
     * Check if user is registered
     */
    private isUserRegistered;
    /**
     * Check if user is the bot owner
     */
    private isOwner;
    /**
     * Setup middleware for logging, error handling, and user authentication
     */
    private setupMiddleware;
    /**
     * Setup text message handlers
     */
    private setupTextHandlers;
    /**
     * Handle private key submission during onboarding
     */
    private handlePrivateKeySubmission;
    /**
     * Setup bot commands
     */
    private setupCommands;
    /**
     * Setup callback query handlers for inline buttons
     */
    private setupCallbackHandlers;
    /**
     * Handle /start command - show onboarding or main menu
     */
    private handleStart;
    /**
     * Show onboarding flow for new users
     */
    private showOnboarding;
    /**
     * Handle /wallet command - manage wallet
     */
    private handleWallet;
    /**
     * Handle /status command - show balances and mining state
     */
    private handleStatus;
    /**
     * Handle /control command - automation controls
     */
    private handleControl;
    /**
     * Handle starting automation
     */
    private handleStartAutomation;
    /**
     * Handle stopping automation
     */
    private handleStopAutomation;
    /**
     * Handle /stats command - performance statistics
     */
    private handleStats;
    /**
     * Handle /rewards command - claimable rewards
     */
    private handleRewards;
    /**
     * Handle /history command - recent transactions
     */
    private handleHistory;
    /**
     * Handle /settings command - view settings
     */
    private handleSettings;
    /**
     * Handle /pnl command - profit & loss display
     */
    private handlePnL;
    /**
     * Handle /stake command - staking operations
     */
    private handleStake;
    /**
     * Handle /round command - current round info
     */
    private handleRound;
    /**
     * Handle /rounds command - recent rounds view
     */
    private handleRounds;
    /**
     * Handle /deploy command - manual deployment
     */
    private handleDeploy;
    /**
     * Handle /claim_sol command - claim SOL rewards
     */
    private handleClaimSol;
    /**
     * Handle /claim_orb command - claim ORB rewards
     */
    private handleClaimOrb;
    /**
     * Handle /claim_staking command - claim staking rewards
     */
    private handleClaimStaking;
    /**
     * Handle /swap command - swap ORB to SOL
     */
    private handleSwap;
    /**
     * Handle /logs command - view recent logs
     */
    private handleLogs;
    /**
     * Handle /owner_stats command - show dev fee earnings (owner only)
     */
    private handleOwnerStats;
    /**
     * Handle /analytics command - analytics export
     */
    private handleAnalytics;
    /**
     * Handle /set_transfer_recipient command - set transfer recipient address
     */
    private handleSetTransferRecipient;
    /**
     * Handle /transfer_status command - show transfer configuration
     */
    private handleTransferStatus;
    /**
     * Start the bot
     */
    start(): Promise<void>;
    /**
     * Stop the bot gracefully
     */
    stop(signal: string): Promise<void>;
}
export { OrbMiningBot };
//# sourceMappingURL=bot.d.ts.map