/**
 * Credit/Debt System
 * Allows ships to borrow funds when running low on cash
 * Part of Economic Model V2 - prevents ships from getting stuck without funds
 *
 * Key features:
 * - Ships can borrow up to their credit limit (based on ship value)
 * - Interest is charged each tick on outstanding debt
 * - Auto-borrow when cash falls below threshold
 * - Auto-repay when ship has excess cash
 * - Credit cut off when debt exceeds max ratio of ship value
 */

import type {
  ShipState,
  SimulationConfig,
  CreditConfig,
} from '../core/types.js';

/**
 * Result of processing credit/debt for a ship
 */
export interface CreditResult {
  newShip: ShipState;
  interestCharged: number;
  creditUsed: number;
  debtRepaid: number;
}

/**
 * Calculate the ship's total value for credit calculations
 * Value = capacity * baseValuePerCapacity
 */
function calculateShipValue(ship: ShipState, config: CreditConfig): number {
  return ship.capacity * config.baseValuePerCapacity;
}

/**
 * Calculate the credit limit for a ship based on its value
 * Credit limit = shipValue * baseCreditMultiplier
 */
export function calculateCreditLimit(ship: ShipState, config: CreditConfig): number {
  const shipValue = calculateShipValue(ship, config);
  return shipValue * config.baseCreditMultiplier;
}

/**
 * Get available credit for a ship
 * Available = creditLimit - currentDebt, but capped at 0 if debt ratio too high
 *
 * @param ship The ship to check credit for
 * @param config Credit configuration
 * @returns Amount of credit still available to borrow
 */
export function getAvailableCredit(ship: ShipState, config: CreditConfig): number {
  const shipValue = calculateShipValue(ship, config);
  const creditLimit = calculateCreditLimit(ship, config);
  const currentDebt = ship.debt;

  // Check debt-to-value ratio
  const debtRatio = currentDebt / shipValue;
  if (debtRatio >= config.maxDebtRatio) {
    // Credit cut off - too much debt relative to ship value
    return 0;
  }

  // Available credit is remaining credit line
  const available = creditLimit - currentDebt;
  return Math.max(0, available);
}

/**
 * Borrow funds (increases debt, increases cash)
 *
 * @param ship The ship borrowing funds
 * @param amount Amount to borrow
 * @param config Credit configuration
 * @returns Updated ship state with new debt and cash
 */
export function borrowFunds(
  ship: ShipState,
  amount: number,
  config: CreditConfig
): ShipState {
  if (amount <= 0) {
    return ship;
  }

  const available = getAvailableCredit(ship, config);
  const actualBorrow = Math.min(amount, available);

  if (actualBorrow <= 0) {
    return ship;
  }

  return {
    ...ship,
    cash: ship.cash + actualBorrow,
    debt: ship.debt + actualBorrow,
  };
}

/**
 * Repay debt (decreases cash, decreases debt)
 *
 * @param ship The ship repaying debt
 * @param amount Maximum amount to repay (will be capped at available cash and current debt)
 * @returns Updated ship state with reduced debt and cash
 */
export function repayDebt(ship: ShipState, amount: number): ShipState {
  if (amount <= 0 || ship.debt <= 0) {
    return ship;
  }

  // Can only repay up to what we owe and what we have
  const actualRepay = Math.min(amount, ship.debt, ship.cash);

  if (actualRepay <= 0) {
    return ship;
  }

  return {
    ...ship,
    cash: ship.cash - actualRepay,
    debt: ship.debt - actualRepay,
  };
}

/**
 * Process credit/debt for a ship each tick
 *
 * This function:
 * 1. Charges interest on outstanding debt
 * 2. Auto-borrows if cash is below minimum threshold
 * 3. Auto-repays debt if ship has excess cash
 *
 * @param ship The ship to process
 * @param config Simulation configuration with credit settings
 * @param dt Time delta (usually 1)
 * @returns Result containing updated ship and credit activity
 */
export function processCreditSystem(
  ship: ShipState,
  config: SimulationConfig,
  dt: number = 1
): CreditResult {
  const creditConfig = config.creditConfig;
  let currentShip = { ...ship };
  let interestCharged = 0;
  let creditUsed = 0;
  let debtRepaid = 0;

  // =========================================================================
  // 1. Charge interest on outstanding debt
  // =========================================================================
  if (currentShip.debt > 0) {
    // Interest = debt * interestRate * dt
    const interest = currentShip.debt * creditConfig.interestRatePerTick * dt;
    interestCharged = interest;

    // Interest adds to debt (compounding)
    currentShip = {
      ...currentShip,
      debt: currentShip.debt + interest,
      cumulativeInterestPaid: currentShip.cumulativeInterestPaid + interest,
    };
  }

  // =========================================================================
  // 2. Auto-borrow if cash is below minimum threshold
  // =========================================================================
  if (currentShip.cash < creditConfig.minCashThreshold) {
    const shortfall = creditConfig.minCashThreshold - currentShip.cash;
    // Try to borrow enough to reach the threshold plus a small buffer
    const borrowAmount = shortfall + (creditConfig.minCashThreshold * 0.5);
    const available = getAvailableCredit(currentShip, creditConfig);

    if (available > 0) {
      const actualBorrow = Math.min(borrowAmount, available);
      creditUsed = actualBorrow;
      currentShip = {
        ...currentShip,
        cash: currentShip.cash + actualBorrow,
        debt: currentShip.debt + actualBorrow,
      };
    }
  }

  // =========================================================================
  // 3. Auto-repay debt when ship has excess cash
  // =========================================================================
  // Only auto-repay if cash is significantly above the minimum threshold
  // This prevents constant borrow/repay cycles
  const excessCashThreshold = creditConfig.minCashThreshold * 3; // 3x the minimum
  if (currentShip.debt > 0 && currentShip.cash > excessCashThreshold) {
    // Repay up to half of the excess (keep some buffer)
    const excessCash = currentShip.cash - excessCashThreshold;
    const repayAmount = Math.min(excessCash * 0.5, currentShip.debt);

    if (repayAmount > 0) {
      debtRepaid = repayAmount;
      currentShip = {
        ...currentShip,
        cash: currentShip.cash - repayAmount,
        debt: currentShip.debt - repayAmount,
      };
    }
  }

  // =========================================================================
  // 4. Update credit limit (in case ship capacity changed)
  // =========================================================================
  const newCreditLimit = calculateCreditLimit(currentShip, creditConfig);
  currentShip = {
    ...currentShip,
    creditLimit: newCreditLimit,
    interestRate: creditConfig.interestRatePerTick,
  };

  return {
    newShip: currentShip,
    interestCharged,
    creditUsed,
    debtRepaid,
  };
}

/**
 * Get credit status for UI/agents
 * Provides a summary of the ship's credit situation
 */
export function getCreditStatus(
  ship: ShipState,
  config: SimulationConfig
): {
  debt: number;
  creditLimit: number;
  availableCredit: number;
  debtRatio: number;
  interestRate: number;
  estimatedDailyInterest: number;
  creditCutOff: boolean;
} {
  const creditConfig = config.creditConfig;
  const shipValue = calculateShipValue(ship, creditConfig);
  const creditLimit = calculateCreditLimit(ship, creditConfig);
  const availableCredit = getAvailableCredit(ship, creditConfig);
  const debtRatio = shipValue > 0 ? ship.debt / shipValue : 0;
  const creditCutOff = debtRatio >= creditConfig.maxDebtRatio;

  // Daily interest = debt * rate * 24 ticks
  const estimatedDailyInterest = ship.debt * creditConfig.interestRatePerTick * 24;

  return {
    debt: ship.debt,
    creditLimit,
    availableCredit,
    debtRatio,
    interestRate: creditConfig.interestRatePerTick,
    estimatedDailyInterest,
    creditCutOff,
  };
}

/**
 * Check if a ship can afford a purchase, potentially using credit
 *
 * @param ship The ship making the purchase
 * @param amount The purchase amount
 * @param config Simulation configuration
 * @returns Whether the ship can afford it (cash + available credit)
 */
export function canAffordWithCredit(
  ship: ShipState,
  amount: number,
  config: SimulationConfig
): boolean {
  const availableCredit = getAvailableCredit(ship, config.creditConfig);
  const totalFunds = ship.cash + availableCredit;
  return totalFunds >= amount;
}

/**
 * Calculate funds available for a ship (cash + available credit)
 */
export function getTotalAvailableFunds(
  ship: ShipState,
  config: SimulationConfig
): number {
  const availableCredit = getAvailableCredit(ship, config.creditConfig);
  return ship.cash + availableCredit;
}
