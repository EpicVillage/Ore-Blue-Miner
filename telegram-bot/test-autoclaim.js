"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = require("../src/utils/database");
const config_1 = require("../src/utils/config");
const autoClaim_1 = require("./utils/autoClaim");
async function testAutoClaim() {
    try {
        console.log('Testing Auto-Claim...\n');
        await (0, database_1.initializeDatabase)();
        await (0, config_1.loadAndCacheConfig)();
        // Trigger auto-claim for user
        const userId = '5119438373'; // Your telegram ID
        await (0, autoClaim_1.manualTriggerAutoClaim)(userId);
        console.log('\nAuto-claim test complete!');
        process.exit(0);
    }
    catch (error) {
        console.error('Auto-claim test failed:', error);
        process.exit(1);
    }
}
testAutoClaim();
//# sourceMappingURL=test-autoclaim.js.map