import { Telegraf } from 'telegraf';
/**
 * Notification system for telegram bot users
 * Sends real-time alerts for various events
 */
export declare enum NotificationType {
    MINING_STARTED = "mining_started",
    MINING_COMPLETED = "mining_completed",
    REWARDS_AVAILABLE = "rewards_available",
    MOTHERLOAD_THRESHOLD = "motherload_threshold",
    PRICE_ALERT = "price_alert",
    LOW_BALANCE = "low_balance",
    TRANSACTION_SUCCESS = "transaction_success",
    TRANSACTION_FAILED = "transaction_failed",
    ROUND_COMPLETED = "round_completed",
    AUTOMATION_ERROR = "automation_error"
}
export interface Notification {
    telegram_id: string;
    type: NotificationType;
    title: string;
    message: string;
    timestamp: number;
}
/**
 * Initialize notification system with bot instance
 */
export declare function initializeNotifications(bot: Telegraf): void;
/**
 * Send notification to a user
 */
export declare function sendNotification(telegramId: string, type: NotificationType, title: string, message: string): Promise<boolean>;
/**
 * Notify user about mining started
 */
export declare function notifyMiningStarted(telegramId: string, roundId: number, solDeployed: number): Promise<void>;
/**
 * Notify user about mining completed
 */
export declare function notifyMiningCompleted(telegramId: string, roundId: number, won: boolean, solRewards: number, orbRewards: number): Promise<void>;
/**
 * Notify user about claimable rewards
 */
export declare function notifyRewardsAvailable(telegramId: string, solRewards: number, orbRewards: number): Promise<void>;
/**
 * Notify user about motherload threshold reached
 */
export declare function notifyMotherloadThreshold(telegramId: string, motherload: number, threshold: number): Promise<void>;
/**
 * Notify user about price alert
 */
export declare function notifyPriceAlert(telegramId: string, currentPrice: number, alertType: 'low' | 'high'): Promise<void>;
/**
 * Notify user about low balance
 */
export declare function notifyLowBalance(telegramId: string, currentBalance: number, minBalance: number): Promise<void>;
/**
 * Notify user about transaction success
 */
export declare function notifyTransactionSuccess(telegramId: string, type: string, signature: string, details?: string): Promise<void>;
/**
 * Notify user about transaction failure
 */
export declare function notifyTransactionFailed(telegramId: string, type: string, error: string): Promise<void>;
/**
 * Notify user about round completion
 */
export declare function notifyRoundCompleted(telegramId: string, roundId: number, totalRewards: number): Promise<void>;
/**
 * Notify user about automation error
 */
export declare function notifyAutomationError(telegramId: string, error: string): Promise<void>;
/**
 * Get notification preferences for a user
 * TODO: Implement user-specific notification settings
 */
export declare function getUserNotificationPreferences(telegramId: string): Promise<{
    enabled: boolean;
    types: NotificationType[];
}>;
/**
 * Check if user has notifications enabled for a specific type
 */
export declare function isNotificationEnabled(telegramId: string, type: NotificationType): Promise<boolean>;
//# sourceMappingURL=notifications.d.ts.map