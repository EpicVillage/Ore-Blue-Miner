/**
 * Telegram Bot for ORB Mining
 * Multi-user bot - each user manages their own wallet
 */
declare class OrbMiningBot {
    private bot;
    private sessions;
    constructor(token: string);
    /**
     * Get or create session for a user
     */
    private getSession;
    /**
     * Setup middleware for logging and error handling
     */
    private setupMiddleware;
    /**
     * Setup bot commands
     */
    private setupCommands;
    /**
     * Setup callback query handlers for inline buttons
     */
    private setupCallbackHandlers;
    /**
     * Handle /start command - show main menu
     */
    private handleStart;
    /**
     * Handle /status command - show balances and mining state
     */
    private handleStatus;
    /**
     * Handle /control command - automation controls
     */
    private handleControl;
    /**
     * Handle start automation action
     */
    private handleStartAutomation;
    /**
     * Handle stop automation action
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
     * Start the bot
     */
    start(): Promise<void>;
    /**
     * Stop the bot gracefully
     */
    stop(signal: string): Promise<void>;
}
export { OrbMiningBot };
//# sourceMappingURL=bot-singleuser-backup.d.ts.map