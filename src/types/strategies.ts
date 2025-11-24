/**
 * Strategy type definitions for deployment and claiming
 */

/**
 * Deployment Amount Strategies
 *
 * Controls how much SOL to deploy per round based on different approaches:
 * - ULTRA_CONSERVATIVE: Maximum ROI optimization (1554% avg, 0% risk)
 * - BALANCED: Moderate approach with good risk/reward
 * - AGGRESSIVE: Fewer rounds, larger bets for quick returns
 * - KELLY_OPTIMIZED: Kelly Criterion for mathematically optimal growth
 * - MANUAL: User specifies exact amount per round
 * - FIXED_ROUNDS: User specifies target number of rounds
 * - PERCENTAGE: User specifies percentage of budget per round
 */
export enum DeploymentAmountStrategy {
  ULTRA_CONSERVATIVE = 'ultra_conservative',
  BALANCED = 'balanced',
  AGGRESSIVE = 'aggressive',
  KELLY_OPTIMIZED = 'kelly_optimized',
  MANUAL = 'manual',
  FIXED_ROUNDS = 'fixed_rounds',
  PERCENTAGE = 'percentage',
}

/**
 * Claim Strategies
 *
 * Controls when to auto-claim rewards:
 * - AUTO: Threshold-based auto-claiming (original behavior)
 * - MANUAL: Never auto-claim, user triggers manually
 */
export enum ClaimStrategy {
  AUTO = 'auto',
  MANUAL = 'manual',
}

/**
 * Configuration for deployment amount calculation
 */
export interface DeploymentStrategyConfig {
  strategy: DeploymentAmountStrategy;
  usableBudget: number;
  motherloadOrb: number;

  // For MANUAL strategy
  manualAmountPerRound?: number;

  // For FIXED_ROUNDS strategy
  targetRounds?: number;

  // For PERCENTAGE strategy
  budgetPercentagePerRound?: number;

  // For custom tier configuration
  customAutoTiers?: Array<{
    motherloadThreshold: number;
    targetRounds: number;
  }>;
}

/**
 * Result of deployment amount calculation
 */
export interface DeploymentCalculation {
  solPerSquare: number;
  solPerRound: number;
  totalSquares: number;
  estimatedRounds: number;
  strategyUsed: DeploymentAmountStrategy;
  notes: string;
}

/**
 * Configuration for claim strategy
 */
export interface ClaimStrategyConfig {
  strategy: ClaimStrategy;

  // For AUTO strategy
  autoClaimSolThreshold?: number;
  autoClaimOrbThreshold?: number;
  autoClaimStakingOrbThreshold?: number;
}
