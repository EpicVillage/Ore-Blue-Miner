"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = require("../src/utils/database");
const solana_1 = require("../src/utils/solana");
const accounts_1 = require("../src/utils/accounts");
const web3_js_1 = require("@solana/web3.js");
/**
 * Check automation status for all telegram users
 * This verifies that:
 * 1. Users with automation accounts are detected
 * 2. Automation accounts have balance
 * 3. Executor service should be monitoring these users
 */
async function checkAutomationStatus() {
    try {
        console.log('\n🔍 Checking Telegram Bot Automation Status...\n');
        await (0, database_1.initializeDatabase)();
        // Get all telegram users
        const users = await (0, database_1.allQuery)('SELECT telegram_id, public_key FROM telegram_users WHERE public_key IS NOT NULL');
        console.log(`Found ${users.length} telegram user(s) with wallets\n`);
        console.log('━'.repeat(80));
        const connection = (0, solana_1.getConnection)();
        let activeAutomationCount = 0;
        for (const user of users) {
            try {
                const userPublicKey = new web3_js_1.PublicKey(user.public_key);
                const [automationPDA] = (0, accounts_1.getAutomationPDA)(userPublicKey);
                const accountInfo = await connection.getAccountInfo(automationPDA);
                console.log(`\nUser: ${user.telegram_id}`);
                console.log(`Wallet: ${user.public_key}`);
                console.log(`Automation PDA: ${automationPDA.toBase58()}`);
                if (!accountInfo || accountInfo.data.length < 112) {
                    console.log(`Status: ❌ No automation account`);
                    continue;
                }
                const data = accountInfo.data;
                const amountPerSquare = data.readBigUInt64LE(8);
                const balance = data.readBigUInt64LE(48);
                const mask = data.readBigUInt64LE(104);
                const balanceSol = Number(balance) / 1e9;
                const costPerRound = (Number(amountPerSquare) * Number(mask)) / 1e9;
                const estimatedRounds = costPerRound > 0 ? Math.floor(balanceSol / costPerRound) : 0;
                if (balanceSol > 0) {
                    activeAutomationCount++;
                    console.log(`Status: ✅ ACTIVE`);
                    console.log(`Balance: ${balanceSol.toFixed(4)} SOL`);
                    console.log(`Cost per round: ${costPerRound.toFixed(4)} SOL`);
                    console.log(`Estimated rounds: ${estimatedRounds}`);
                    console.log(`Amount per square: ${(Number(amountPerSquare) / 1e9).toFixed(6)} SOL`);
                    console.log(`Squares (mask): ${mask.toString()}`);
                }
                else {
                    console.log(`Status: ⏸️  Created but depleted (balance: 0 SOL)`);
                }
            }
            catch (error) {
                console.log(`Error checking user ${user.telegram_id}:`, error);
            }
            console.log('━'.repeat(80));
        }
        console.log(`\n📊 Summary:`);
        console.log(`   Total users: ${users.length}`);
        console.log(`   Active automation accounts: ${activeAutomationCount}`);
        if (activeAutomationCount > 0) {
            console.log(`\n✅ The auto-executor service should be monitoring these ${activeAutomationCount} user(s)`);
            console.log(`   Each new round, the executor will:`);
            console.log(`   1. Check motherload threshold`);
            console.log(`   2. Checkpoint if needed`);
            console.log(`   3. Execute automation deployment`);
            console.log(`   4. Record transaction and round data\n`);
        }
        else {
            console.log(`\n⚠️  No active automation accounts found`);
            console.log(`   Users need to /control start automation first\n`);
        }
    }
    catch (error) {
        console.error('Failed to check automation status:', error);
        throw error;
    }
}
checkAutomationStatus()
    .then(() => {
    console.log('Done!');
    process.exit(0);
})
    .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
});
//# sourceMappingURL=check-automation-status.js.map