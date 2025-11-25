import { PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { getAssociatedTokenAddress, createTransferInstruction, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { getUserWallet } from './userWallet';
import { getUserSettings } from './userSettings';
import { getConnection } from '../../src/utils/solana';
import { recordTransaction } from '../../src/utils/database';
import { sendNotification } from './notifications';
import logger from '../../src/utils/logger';

/**
 * ORB Auto-Transfer Utility
 *
 * Automatically transfers ORB tokens when balance reaches threshold
 */

const ORB_MINT = new PublicKey('orebyr4mDiPDVgnfqvF5xiu5gKnh94Szuz8dqgNqdJn');

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
export function validateRecipientAddress(address: string): { valid: boolean; error?: string } {
  if (!address || address.trim() === '') {
    return { valid: false, error: 'Address cannot be empty' };
  }

  try {
    const pubkey = new PublicKey(address);

    // Check if it's a valid base58 address (32 bytes)
    if (pubkey.toBytes().length !== 32) {
      return { valid: false, error: 'Invalid address format' };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: 'Invalid Solana address format' };
  }
}

/**
 * Get current ORB balance for a user
 */
async function getUserOrbBalance(telegramId: string): Promise<number> {
  try {
    const wallet = await getUserWallet(telegramId);
    if (!wallet) {
      return 0;
    }

    const connection = getConnection();
    const tokenAccounts = await connection.getTokenAccountsByOwner(
      wallet.publicKey,
      { mint: ORB_MINT }
    );

    if (tokenAccounts.value.length === 0) {
      return 0;
    }

    const balance = await connection.getTokenAccountBalance(tokenAccounts.value[0].pubkey);
    return parseFloat(balance.value.uiAmount?.toString() || '0');
  } catch (error) {
    logger.error(`[Auto-Transfer] Failed to get ORB balance for ${telegramId}:`, error);
    return 0;
  }
}

/**
 * Transfer ORB tokens to recipient address
 */
async function transferOrb(
  telegramId: string,
  recipientAddress: string,
  amount: number
): Promise<{ success: boolean; signature?: string; error?: string }> {
  try {
    const wallet = await getUserWallet(telegramId);
    if (!wallet) {
      return { success: false, error: 'Wallet not found' };
    }

    const connection = getConnection();
    const recipient = new PublicKey(recipientAddress);

    // Get source token account
    const sourceTokenAccount = await getAssociatedTokenAddress(
      ORB_MINT,
      wallet.publicKey
    );

    // Get or create destination token account
    const destinationTokenAccount = await getAssociatedTokenAddress(
      ORB_MINT,
      recipient
    );

    // Check if destination account exists
    const destinationAccountInfo = await connection.getAccountInfo(destinationTokenAccount);

    const transaction = new Transaction();

    // If destination account doesn't exist, we need to create it
    // Note: In production, you might want to use createAssociatedTokenAccountInstruction
    // For simplicity, we'll assume the recipient has an ORB token account

    // Create transfer instruction
    const transferInstruction = createTransferInstruction(
      sourceTokenAccount,
      destinationTokenAccount,
      wallet.publicKey,
      Math.floor(amount * 1e9), // Convert to lamports
      [],
      TOKEN_PROGRAM_ID
    );

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

    logger.info(`[Auto-Transfer] Transferred ${amount} ORB to ${recipientAddress} for ${telegramId}`);

    return { success: true, signature };
  } catch (error: any) {
    logger.error(`[Auto-Transfer] Transfer failed for ${telegramId}:`, error);
    return { success: false, error: error.message || 'Transfer failed' };
  }
}

/**
 * Check if auto-transfer conditions are met and execute if needed
 */
export async function checkAndExecuteOrbTransfer(telegramId: string): Promise<TransferResult> {
  try {
    // Get user settings
    const settings = await getUserSettings(telegramId);

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
    const transferResult = await transferOrb(
      telegramId,
      settings.transfer_recipient_address,
      transferAmount
    );

    if (!transferResult.success) {
      // Notify user of failure
      const { NotificationType } = await import('./notifications');
      await sendNotification(
        telegramId,
        NotificationType.TRANSACTION_FAILED,
        '❌ Auto-Transfer Failed',
        `Failed to transfer ${transferAmount.toFixed(2)} ORB\n\nError: ${transferResult.error}`
      );

      return {
        transferred: false,
        error: transferResult.error
      };
    }

    // Record transaction
    const wallet = await getUserWallet(telegramId);
    await recordTransaction({
      type: 'swap', // Using swap as closest match for transfer
      signature: transferResult.signature!,
      orbAmount: transferAmount,
      status: 'success',
      notes: `Auto-transfer ${transferAmount.toFixed(2)} ORB to ${settings.transfer_recipient_address} for user ${telegramId}`,
      walletAddress: wallet?.publicKey.toBase58(),
      telegramId,
    });

    // Notify user of success
    const { NotificationType } = await import('./notifications');
    await sendNotification(
      telegramId,
      NotificationType.TRANSACTION_SUCCESS,
      '✅ Auto-Transfer Completed',
      `Transferred ${transferAmount.toFixed(2)} ORB to:\n\`${settings.transfer_recipient_address}\`\n\nSignature: \`${transferResult.signature}\``
    );

    logger.info(`[Auto-Transfer] Successfully transferred ${transferAmount} ORB for ${telegramId}`);

    return {
      transferred: true,
      amount: transferAmount,
      signature: transferResult.signature
    };
  } catch (error: any) {
    logger.error(`[Auto-Transfer] Check failed for ${telegramId}:`, error);
    return {
      transferred: false,
      error: error.message || 'Unknown error'
    };
  }
}

/**
 * Manually trigger auto-transfer check (for testing or manual execution)
 */
export async function manualTriggerTransfer(telegramId: string): Promise<TransferResult> {
  logger.info(`[Auto-Transfer] Manual trigger for ${telegramId}`);
  return await checkAndExecuteOrbTransfer(telegramId);
}

/**
 * Get auto-transfer status for display
 */
export async function getAutoTransferStatus(telegramId: string): Promise<{
  enabled: boolean;
  threshold: number;
  recipientAddress: string | null;
  currentBalance: number;
  willTransfer: boolean;
}> {
  const settings = await getUserSettings(telegramId);
  const currentBalance = await getUserOrbBalance(telegramId);

  const willTransfer = !!(
    settings.auto_transfer_enabled &&
    settings.transfer_recipient_address &&
    validateRecipientAddress(settings.transfer_recipient_address).valid &&
    currentBalance >= settings.orb_transfer_threshold
  );

  return {
    enabled: settings.auto_transfer_enabled,
    threshold: settings.orb_transfer_threshold,
    recipientAddress: settings.transfer_recipient_address,
    currentBalance,
    willTransfer
  };
}
