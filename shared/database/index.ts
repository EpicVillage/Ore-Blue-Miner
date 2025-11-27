/**
 * Shared Database Exports
 *
 * Unified user management, wallet, and settings for all platforms
 */

// User management
export {
  Platform,
  PlatformUser,
  LinkedAccount,
  initializeLinkedAccountsTable,
  initializeDiscordUsersTable,
  getUser,
  saveUser,
  updateLastActive,
  deleteUser,
  getUserPrivateKey,
  generateLinkCode,
  linkAccounts,
  getLinkedAccount,
  unlinkAccounts,
  getLinkedPlatformId,
  getTotalUserCount,
  encryptPrivateKey,
  decryptPrivateKey,
} from './users';

// Wallet operations
export {
  WalletBalances,
  generateSolanaWallet,
  validatePrivateKey,
  getUserWallet,
  getUserBalances,
  registerWallet,
  generateAndRegisterWallet,
  hasWallet,
  getUserPublicKey,
} from './wallet';

// Settings management
export {
  UserSettings,
  initializeDiscordSettingsTable,
  getUserSettings,
  updateUserSetting,
  updateUserSettings,
  resetUserSettings,
  copySettings,
  getUsersWithSetting,
  getAllPlatformUsers,
} from './settings';

// Round tracking
export {
  DeployedSquare,
  UserRound,
  initializeUserRoundsTable,
  recordUserRound,
  updateRoundResult,
  updateAllRoundsResult,
  updateUserRoundRewards,
  getUserRecentRounds,
  getUserRoundStats,
  getUserRound,
  calculateWinningSquare,
} from './rounds';
