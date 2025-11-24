"use strict";
/**
 * Message formatting utilities for Telegram bot
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatSOL = formatSOL;
exports.formatORB = formatORB;
exports.formatUSD = formatUSD;
exports.formatPercent = formatPercent;
exports.formatStatus = formatStatus;
exports.formatTimestamp = formatTimestamp;
exports.escapeMarkdown = escapeMarkdown;
exports.formatTransactionType = formatTransactionType;
function formatSOL(amount) {
    return `${amount.toFixed(4)} SOL`;
}
function formatORB(amount) {
    return `${amount.toFixed(2)} ORB`;
}
function formatUSD(amount) {
    return `$${amount.toFixed(2)}`;
}
function formatPercent(percent) {
    const sign = percent >= 0 ? '+' : '';
    return `${sign}${percent.toFixed(2)}%`;
}
function formatStatus(status) {
    const statusEmojis = {
        mining: '⛏️ Mining',
        paused: '⏸️ Paused',
        stopped: '⏹️ Stopped',
        starting: '🔄 Starting',
        error: '❌ Error',
    };
    return statusEmojis[status] || status;
}
function formatTimestamp(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0)
        return `${days}d ago`;
    if (hours > 0)
        return `${hours}h ago`;
    if (minutes > 0)
        return `${minutes}m ago`;
    return `${seconds}s ago`;
}
function escapeMarkdown(text) {
    // Escape special Markdown characters
    return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}
function formatTransactionType(type) {
    const typeEmojis = {
        deploy: '🔵 Deploy',
        claim_sol: '💰 Claim SOL',
        claim_orb: '🔮 Claim ORB',
        swap: '🔄 Swap',
        stake: '📊 Stake',
        automation_setup: '🤖 Auto Setup',
        automation_close: '⏹️ Auto Close',
    };
    return typeEmojis[type] || type;
}
//# sourceMappingURL=formatters.js.map