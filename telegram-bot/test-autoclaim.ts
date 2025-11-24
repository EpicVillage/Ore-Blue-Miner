import { initializeDatabase } from '../src/utils/database';
import { loadAndCacheConfig } from '../src/utils/config';
import { manualTriggerAutoClaim } from './utils/autoClaim';
import logger from '../src/utils/logger';

async function testAutoClaim() {
  try {
    console.log('Testing Auto-Claim...\n');

    await initializeDatabase();
    await loadAndCacheConfig();

    // Trigger auto-claim for user
    const userId = '5119438373'; // Your telegram ID
    await manualTriggerAutoClaim(userId);

    console.log('\nAuto-claim test complete!');
    process.exit(0);
  } catch (error) {
    console.error('Auto-claim test failed:', error);
    process.exit(1);
  }
}

testAutoClaim();
