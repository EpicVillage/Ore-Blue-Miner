"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserWallet = getUserWallet;
exports.getUserSolBalance = getUserSolBalance;
exports.getUserOrbBalance = getUserOrbBalance;
exports.getUserBalances = getUserBalances;
exports.validatePrivateKey = validatePrivateKey;
const web3_js_1 = require("@solana/web3.js");
const bs58_1 = __importDefault(require("bs58"));
const userDatabase_1 = require("./userDatabase");
const solana_1 = require("../../src/utils/solana");
const logger_1 = __importDefault(require("../../src/utils/logger"));
/**
 * User Wallet Utilities
 *
 * Provides wallet operations for specific Telegram users
 */
/**
 * Get wallet keypair for a user
 */
async function getUserWallet(telegramId) {
    const privateKey = await (0, userDatabase_1.getUserPrivateKey)(telegramId);
    if (!privateKey) {
        return null;
    }
    try {
        // Support both base58 and array formats
        let secretKey;
        if (privateKey.startsWith('[')) {
            // Array format: [1,2,3,...]
            const numbers = JSON.parse(privateKey);
            secretKey = new Uint8Array(numbers);
        }
        else {
            // Base58 format
            secretKey = bs58_1.default.decode(privateKey);
        }
        return web3_js_1.Keypair.fromSecretKey(secretKey);
    }
    catch (error) {
        logger_1.default.error(`[User Wallet] Failed to load wallet for ${telegramId}:`, error);
        return null;
    }
}
/**
 * Get SOL balance for a user's wallet
 */
async function getUserSolBalance(telegramId) {
    const wallet = await getUserWallet(telegramId);
    if (!wallet) {
        return 0;
    }
    try {
        const connection = (0, solana_1.getConnection)();
        const balance = await connection.getBalance(wallet.publicKey);
        return balance / 1e9;
    }
    catch (error) {
        logger_1.default.error(`[User Wallet] Failed to get SOL balance for ${telegramId}:`, error);
        return 0;
    }
}
/**
 * Get ORB balance for a user's wallet
 */
async function getUserOrbBalance(telegramId) {
    const wallet = await getUserWallet(telegramId);
    if (!wallet) {
        return 0;
    }
    try {
        // Temporarily set the wallet context to get ORB balance
        // This is a workaround - ideally we'd refactor getOrbBalance to accept a public key
        const connection = (0, solana_1.getConnection)();
        const tokenAccounts = await connection.getTokenAccountsByOwner(wallet.publicKey, { mint: new web3_js_1.PublicKey('orebyr4mDiPDVgnfqvF5xiu5gKnh94Szuz8dqgNqdJn') } // ORB mint
        );
        if (tokenAccounts.value.length === 0) {
            return 0;
        }
        const balance = await connection.getTokenAccountBalance(tokenAccounts.value[0].pubkey);
        return parseFloat(balance.value.uiAmount?.toString() || '0');
    }
    catch (error) {
        logger_1.default.error(`[User Wallet] Failed to get ORB balance for ${telegramId}:`, error);
        return 0;
    }
}
/**
 * Get both SOL and ORB balances for a user
 */
async function getUserBalances(telegramId) {
    const [sol, orb] = await Promise.all([
        getUserSolBalance(telegramId),
        getUserOrbBalance(telegramId),
    ]);
    return {
        sol,
        orb,
        solBalance: sol, // Legacy compatibility
        orbBalance: orb, // Legacy compatibility
    };
}
/**
 * Validate a private key and return public key if valid
 */
function validatePrivateKey(privateKey) {
    try {
        let secretKey;
        if (privateKey.startsWith('[')) {
            // Array format: [1,2,3,...]
            const numbers = JSON.parse(privateKey);
            if (!Array.isArray(numbers) || numbers.length !== 64) {
                return { valid: false, error: 'Invalid array format. Must be 64 numbers.' };
            }
            secretKey = new Uint8Array(numbers);
        }
        else {
            // Base58 format
            secretKey = bs58_1.default.decode(privateKey);
            if (secretKey.length !== 64) {
                return { valid: false, error: 'Invalid private key length. Must be 64 bytes.' };
            }
        }
        const keypair = web3_js_1.Keypair.fromSecretKey(secretKey);
        return {
            valid: true,
            publicKey: keypair.publicKey.toBase58(),
        };
    }
    catch (error) {
        return {
            valid: false,
            error: error instanceof Error ? error.message : 'Invalid private key format',
        };
    }
}
//# sourceMappingURL=userWallet.js.map