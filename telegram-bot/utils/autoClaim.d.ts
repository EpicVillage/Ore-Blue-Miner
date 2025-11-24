import { Telegraf } from 'telegraf';
/**
 * Initialize auto-claim service
 */
export declare function initializeAutoClaim(telegrafBot: Telegraf): void;
/**
 * Stop auto-claim service
 */
export declare function stopAutoClaim(): void;
/**
 * Manually trigger auto-claim check for a specific user
 */
export declare function manualTriggerAutoClaim(telegramId: string): Promise<void>;
/**
 * Get auto-claim status
 */
export declare function getAutoClaimStatus(): {
    running: boolean;
    interval: number;
    nextCheckIn?: number;
};
//# sourceMappingURL=autoClaim.d.ts.map