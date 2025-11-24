"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateRecipientAddress = validateRecipientAddress;
exports.checkAndExecuteOrbTransfer = checkAndExecuteOrbTransfer;
exports.manualTriggerTransfer = manualTriggerTransfer;
exports.getAutoTransferStatus = getAutoTransferStatus;
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const userWallet_1 = require("./userWallet");
const userSettings_1 = require("./userSettings");
const solana_1 = require("../../src/utils/solana");
const database_1 = require("../../src/utils/database");
const notifications_1 = require("./notifications");
const logger_1 = __importDefault(require("../../src/utils/logger"));
/**
 * ORB Auto-Transfer Utility
 *
 * Automatically transfers ORB tokens when balance reaches threshold
 */
const ORB_MINT = new web3_js_1.PublicKey('orebyr4mDiPDVgnfqvF5xiu5gKnh94Szuz8dqgNqdJn');
/**
 * Validate Solana wallet address
 */
function validateRecipientAddress(address) {
    if (!address || address.trim() === '') {
        return { valid: false, error: 'Address cannot be empty' };
    }
    try {
        const pubkey = new web3_js_1.PublicKey(address);
        // Check if it's a valid base58 address (32 bytes)
        if (pubkey.toBytes().length !== 32) {
            return { valid: false, error: 'Invalid address format' };
        }
        return { valid: true };
    }
    catch (error) {
        return { valid: false, error: 'Invalid Solana address format' };
    }
}
/**
 * Get current ORB balance for a user
 */
async function getUserOrbBalance(telegramId) {
    try {
        const wallet = await (0, userWallet_1.getUserWallet)(telegramId);
        if (!wallet) {
            return 0;
        }
        const connection = (0, solana_1.getConnection)();
        const tokenAccounts = await connection.getTokenAccountsByOwner(wallet.publicKey, { mint: ORB_MINT });
        if (tokenAccounts.value.length === 0) {
            return 0;
        }
        const balance = await connection.getTokenAccountBalance(tokenAccounts.value[0].pubkey);
        return parseFloat(balance.value.uiAmount?.toString() || '0');
    }
    catch (error) {
        logger_1.default.error(`[Auto-Transfer] Failed to get ORB balance for ${telegramId}:`, error);
        return 0;
    }
}
/**
 * Transfer ORB tokens to recipient address
 */
async function transferOrb(telegramId, recipientAddress, amount) {
    try {
        const wallet = await (0, userWallet_1.getUserWallet)(telegramId);
        if (!wallet) {
            return { success: false, error: 'Wallet not found' };
        }
        const connection = (0, solana_1.getConnection)();
        const recipient = new web3_js_1.PublicKey(recipientAddress);
        // Get source token account
        const sourceTokenAccount = await (0, spl_token_1.getAssociatedTokenAddress)(ORB_MINT, wallet.publicKey);
        // Get or create destination token account
        const destinationTokenAccount = await (0, spl_token_1.getAssociatedTokenAddress)(ORB_MINT, recipient);
        // Check if destination account exists
        const destinationAccountInfo = await connection.getAccountInfo(destinationTokenAccount);
        const transaction = new web3_js_1.Transaction();
        // If destination account doesn't exist, we need to create it
        // Note: In production, you might want to use createAssociatedTokenAccountInstruction
        // For simplicity, we'll assume the recipient has an ORB token account
        // Create transfer instruction
        const transferInstruction = (0, spl_token_1.createTransferInstruction)(sourceTokenAccount, destinationTokenAccount, wallet.publicKey, Math.floor(amount * 1e9), // Convert to lamports
        [], spl_token_1.TOKEN_PROGRAM_ID);
        transaction.add(transferInstruction);
        // Get recent blockhash
        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = wallet.publicKey;
        // Sign and send transaction
        transaction.sign(wallet);
        const signature = await connection.sendRawTransaction(transaction.serialize());
        // Confirm transaction
        await connection.confirmTransaction(signature, 'confirmed');
        logger_1.default.info(`[Auto-Transfer] Transferred ${amount} ORB to ${recipientAddress} for ${telegramId}`);
        return { success: true, signature };
    }
    catch (error) {
        logger_1.default.error(`[Auto-Transfer] Transfer failed for ${telegramId}:`, error);
        return { success: false, error: error.message || 'Transfer failed' };
    }
}
/**
 * Check if auto-transfer conditions are met and execute if needed
 */
async function checkAndExecuteOrbTransfer(telegramId) {
    try {
        // Get user settings
        const settings = await (0, userSettings_1.getUserSettings)(telegramId);
        // Check if auto-transfer is enabled
        if (!settings.auto_transfer_enabled) {
            return {
                transferred: false,
                reason: 'Auto-transfer is disabled'
            };
        }
        // Check if recipient address is set
        if (!settings.transfer_recipient_address) {
            return {
                transferred: false,
                reason: 'No recipient address configured'
            };
        }
        // Validate recipient address
        const validation = validateRecipientAddress(settings.transfer_recipient_address);
        if (!validation.valid) {
            return {
                transferred: false,
                error: `Invalid recipient address: ${validation.error}`
            };
        }
        // Get current ORB balance
        const currentBalance = await getUserOrbBalance(telegramId);
        // Check if balance meets threshold
        if (currentBalance < settings.orb_transfer_threshold) {
            return {
                transferred: false,
                reason: `Balance (${currentBalance.toFixed(2)} ORB) below threshold (${settings.orb_transfer_threshold} ORB)`
            };
        }
        // Calculate amount to transfer (all ORB above 0 to clear the balance)
        const transferAmount = currentBalance;
        // Execute transfer
        const transferResult = await transferOrb(telegramId, settings.transfer_recipient_address, transferAmount);
        if (!transferResult.success) {
            // Notify user of failure
            await (0, notifications_1.sendNotification)(telegramId, 'TRANSACTION_FAILED', '❌ Auto-Transfer Failed', `Failed to transfer ${transferAmount.toFixed(2)} ORB\n\nError: ${transferResult.error}`);
            return {
                transferred: false,
                error: transferResult.error
            };
        }
        // Record transaction
        const wallet = await (0, userWallet_1.getUserWallet)(telegramId);
        if (wallet) {
            await (0, database_1.recordTransaction)({
                telegramId,
                walletAddress: wallet.publicKey.toBase58(),
                type: 'auto_transfer',
                amount: transferAmount,
                token: 'ORB',
                signature: transferResult.signature,
                status: 'success',
                timestamp: Date.now()
            });
        }
        // Notify user of success
        await (0, notifications_1.sendNotification)(telegramId, 'TRANSACTION_SUCCESS', '✅ Auto-Transfer Completed', `Transferred ${transferAmount.toFixed(2)} ORB to:\n\`${settings.transfer_recipient_address}\`\n\nSignature: \`${transferResult.signature}\``);
        logger_1.default.info(`[Auto-Transfer] Successfully transferred ${transferAmount} ORB for ${telegramId}`);
        return {
            transferred: true,
            amount: transferAmount,
            signature: transferResult.signature
        };
    }
    catch (error) {
        logger_1.default.error(`[Auto-Transfer] Check failed for ${telegramId}:`, error);
        return {
            transferred: false,
            error: error.message || 'Unknown error'
        };
    }
}
/**
 * Manually trigger auto-transfer check (for testing or manual execution)
 */
async function manualTriggerTransfer(telegramId) {
    logger_1.default.info(`[Auto-Transfer] Manual trigger for ${telegramId}`);
    return await checkAndExecuteOrbTransfer(telegramId);
}
/**
 * Get auto-transfer status for display
 */
async function getAutoTransferStatus(telegramId) {
    const settings = await (0, userSettings_1.getUserSettings)(telegramId);
    const currentBalance = await getUserOrbBalance(telegramId);
    const willTransfer = !!(settings.auto_transfer_enabled &&
        settings.transfer_recipient_address &&
        validateRecipientAddress(settings.transfer_recipient_address).valid &&
        currentBalance >= settings.orb_transfer_threshold);
    return {
        enabled: settings.auto_transfer_enabled,
        threshold: settings.orb_transfer_threshold,
        recipientAddress: settings.transfer_recipient_address,
        currentBalance,
        willTransfer
    };
}
//# sourceMappingURL=orbAutoTransfer.js.map