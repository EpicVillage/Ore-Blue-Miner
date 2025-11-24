"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationType = void 0;
exports.initializeNotifications = initializeNotifications;
exports.sendNotification = sendNotification;
exports.notifyMiningStarted = notifyMiningStarted;
exports.notifyMiningCompleted = notifyMiningCompleted;
exports.notifyRewardsAvailable = notifyRewardsAvailable;
exports.notifyMotherloadThreshold = notifyMotherloadThreshold;
exports.notifyPriceAlert = notifyPriceAlert;
exports.notifyLowBalance = notifyLowBalance;
exports.notifyTransactionSuccess = notifyTransactionSuccess;
exports.notifyTransactionFailed = notifyTransactionFailed;
exports.notifyRoundCompleted = notifyRoundCompleted;
exports.notifyAutomationError = notifyAutomationError;
exports.getUserNotificationPreferences = getUserNotificationPreferences;
exports.isNotificationEnabled = isNotificationEnabled;
const logger_1 = __importDefault(require("../../src/utils/logger"));
const formatters_1 = require("./formatters");
/**
 * Notification system for telegram bot users
 * Sends real-time alerts for various events
 */
var NotificationType;
(function (NotificationType) {
    NotificationType["MINING_STARTED"] = "mining_started";
    NotificationType["MINING_COMPLETED"] = "mining_completed";
    NotificationType["REWARDS_AVAILABLE"] = "rewards_available";
    NotificationType["MOTHERLOAD_THRESHOLD"] = "motherload_threshold";
    NotificationType["PRICE_ALERT"] = "price_alert";
    NotificationType["LOW_BALANCE"] = "low_balance";
    NotificationType["TRANSACTION_SUCCESS"] = "transaction_success";
    NotificationType["TRANSACTION_FAILED"] = "transaction_failed";
    NotificationType["ROUND_COMPLETED"] = "round_completed";
    NotificationType["AUTOMATION_ERROR"] = "automation_error";
})(NotificationType || (exports.NotificationType = NotificationType = {}));
let botInstance = null;
/**
 * Initialize notification system with bot instance
 */
function initializeNotifications(bot) {
    botInstance = bot;
    logger_1.default.info('[Notifications] Notification system initialized');
}
/**
 * Send notification to a user
 */
async function sendNotification(telegramId, type, title, message) {
    try {
        if (!botInstance) {
            logger_1.default.warn('[Notifications] Bot instance not initialized');
            return false;
        }
        const formattedMessage = `
🔔 *${title}*

${message}

_${new Date().toLocaleTimeString()}_
`.trim();
        await botInstance.telegram.sendMessage(telegramId, formattedMessage, {
            parse_mode: 'Markdown',
        });
        logger_1.default.info(`[Notifications] Sent ${type} notification to ${telegramId}`);
        return true;
    }
    catch (error) {
        logger_1.default.error(`[Notifications] Failed to send notification to ${telegramId}:`, error);
        return false;
    }
}
/**
 * Notify user about mining started
 */
async function notifyMiningStarted(telegramId, roundId, solDeployed) {
    await sendNotification(telegramId, NotificationType.MINING_STARTED, '⛏️ Mining Started', `Deployed ${(0, formatters_1.formatSOL)(solDeployed)} to Round #${roundId}\n\nGood luck! 🍀`);
}
/**
 * Notify user about mining completed
 */
async function notifyMiningCompleted(telegramId, roundId, won, solRewards, orbRewards) {
    const title = won ? '🎉 Mining Win!' : '💰 Mining Complete';
    const message = won
        ? `You won Round #${roundId}!\n\nRewards:\n• ${(0, formatters_1.formatSOL)(solRewards)}\n• ${(0, formatters_1.formatORB)(orbRewards)}\n\nCongratulations! 🎊`
        : `Round #${roundId} complete.\n\nRewards:\n• ${(0, formatters_1.formatSOL)(solRewards)}\n• ${(0, formatters_1.formatORB)(orbRewards)}`;
    await sendNotification(telegramId, NotificationType.MINING_COMPLETED, title, message);
}
/**
 * Notify user about claimable rewards
 */
async function notifyRewardsAvailable(telegramId, solRewards, orbRewards) {
    await sendNotification(telegramId, NotificationType.REWARDS_AVAILABLE, '💎 Rewards Ready to Claim', `You have unclaimed rewards:\n• ${(0, formatters_1.formatSOL)(solRewards)}\n• ${(0, formatters_1.formatORB)(orbRewards)}\n\nUse /rewards to claim them!`);
}
/**
 * Notify user about motherload threshold reached
 */
async function notifyMotherloadThreshold(telegramId, motherload, threshold) {
    await sendNotification(telegramId, NotificationType.MOTHERLOAD_THRESHOLD, '🚀 High Motherload Alert', `Current motherload: ${(0, formatters_1.formatORB)(motherload)}\n\nThis exceeds your threshold of ${(0, formatters_1.formatORB)(threshold)}!\n\nAutomation will deploy if enabled.`);
}
/**
 * Notify user about price alert
 */
async function notifyPriceAlert(telegramId, currentPrice, alertType) {
    const title = alertType === 'low' ? '📉 Low Price Alert' : '📈 High Price Alert';
    const message = `ORB price: ${(0, formatters_1.formatUSD)(currentPrice)}\n\n${alertType === 'low' ? '⚠️ Price is below your minimum threshold!' : '✨ Price is high - good time to swap!'}`;
    await sendNotification(telegramId, NotificationType.PRICE_ALERT, title, message);
}
/**
 * Notify user about low balance
 */
async function notifyLowBalance(telegramId, currentBalance, minBalance) {
    await sendNotification(telegramId, NotificationType.LOW_BALANCE, '⚠️ Low SOL Balance', `Your balance is ${(0, formatters_1.formatSOL)(currentBalance)}\n\nThis is below your minimum buffer of ${(0, formatters_1.formatSOL)(minBalance)}.\n\nPlease add more SOL to continue mining.`);
}
/**
 * Notify user about transaction success
 */
async function notifyTransactionSuccess(telegramId, type, signature, details) {
    await sendNotification(telegramId, NotificationType.TRANSACTION_SUCCESS, `✅ ${type} Successful`, `${details || 'Transaction completed successfully'}\n\nSignature: \`${signature.slice(0, 8)}...${signature.slice(-8)}\``);
}
/**
 * Notify user about transaction failure
 */
async function notifyTransactionFailed(telegramId, type, error) {
    await sendNotification(telegramId, NotificationType.TRANSACTION_FAILED, `❌ ${type} Failed`, `Transaction failed:\n\n${error}\n\nPlease try again or check your balance.`);
}
/**
 * Notify user about round completion
 */
async function notifyRoundCompleted(telegramId, roundId, totalRewards) {
    await sendNotification(telegramId, NotificationType.ROUND_COMPLETED, '🏁 Round Complete', `Round #${roundId} has ended.\n\nTotal rewards distributed: ${(0, formatters_1.formatORB)(totalRewards)}`);
}
/**
 * Notify user about automation error
 */
async function notifyAutomationError(telegramId, error) {
    await sendNotification(telegramId, NotificationType.AUTOMATION_ERROR, '⚠️ Automation Error', `Automation encountered an error:\n\n${error}\n\nPlease check your settings and balance.`);
}
/**
 * Get notification preferences for a user
 * TODO: Implement user-specific notification settings
 */
async function getUserNotificationPreferences(telegramId) {
    // For now, all notifications are enabled
    return {
        enabled: true,
        types: Object.values(NotificationType),
    };
}
/**
 * Check if user has notifications enabled for a specific type
 */
async function isNotificationEnabled(telegramId, type) {
    const prefs = await getUserNotificationPreferences(telegramId);
    return prefs.enabled && prefs.types.includes(type);
}
//# sourceMappingURL=notifications.js.map