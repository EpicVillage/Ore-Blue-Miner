/**
 * Initialize the automation executor service
 */
export declare function initializeAutoExecutor(): void;
/**
 * Stop the automation executor service
 */
export declare function stopAutoExecutor(): void;
/**
 * Get executor service status
 */
export declare function getAutoExecutorStatus(): {
    running: boolean;
    lastRound: string | null;
};
/**
 * Manually trigger executor loop (for testing)
 */
export declare function manualTriggerAutoExecutor(): Promise<void>;
//# sourceMappingURL=autoExecutor.d.ts.map