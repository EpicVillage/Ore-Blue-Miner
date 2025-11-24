export interface TransferResult {
    transferred: boolean;
    amount?: number;
    signature?: string;
    error?: string;
    reason?: string;
}
/**
 * Validate Solana wallet address
 */
export declare function validateRecipientAddress(address: string): {
    valid: boolean;
    error?: string;
};
/**
 * Check if auto-transfer conditions are met and execute if needed
 */
export declare function checkAndExecuteOrbTransfer(telegramId: string): Promise<TransferResult>;
/**
 * Manually trigger auto-transfer check (for testing or manual execution)
 */
export declare function manualTriggerTransfer(telegramId: string): Promise<TransferResult>;
/**
 * Get auto-transfer status for display
 */
export declare function getAutoTransferStatus(telegramId: string): Promise<{
    enabled: boolean;
    threshold: number;
    recipientAddress: string | null;
    currentBalance: number;
    willTransfer: boolean;
}>;
//# sourceMappingURL=orbAutoTransfer.d.ts.map