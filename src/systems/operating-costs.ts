/**
 * Operating Costs System
 * Handles ship operating expenses: crew wages, maintenance, and port fees
 * Part of Economic Model V2 - creates realistic cost pressure for traders
 */

import type {
  ShipState,
  SimulationConfig,
  CrewState,
} from '../core/types.js';

/**
 * Result of processing operating costs for a ship
 */
export interface OperatingCostsResult {
  newShip: ShipState;
  crewWagesPaid: number;
  maintenancePaid: number;
  portFeesPaid: number;
  totalCosts: number;
  // Tracking flags for diagnostics
  wagesFullyPaid: boolean;
  maintenanceFullyPaid: boolean;
  unpaidWages: number;
  unpaidMaintenance: number;
}

/**
 * Calculate crew wages owed per tick
 * Formula: crew.count * crew.wageRate
 */
function calculateCrewWages(crew: CrewState): number {
  return crew.count * crew.wageRate;
}

/**
 * Calculate maintenance cost per tick
 * Formula: capacity * maintenanceRate
 * Larger ships cost more to maintain
 */
function calculateMaintenanceCost(
  capacity: number,
  maintenanceRate: number
): number {
  return capacity * maintenanceRate;
}

/**
 * Process operating costs for a single ship
 *
 * Cost components:
 * 1. Crew Wages: Paid every tick based on crew count and wage rate
 *    - If ship can't pay, unpaidTicks increments
 *    - After unpaidWagesMoraleThreshold ticks, morale drops
 *
 * 2. Maintenance: Cost based on ship capacity
 *    - If not paid, ship condition degrades faster (applied elsewhere)
 *
 * 3. Port Fees: Flat fee when docked at an island
 *
 * @param ship The ship to process costs for
 * @param isDockedAtIsland Whether the ship is currently at an island
 * @param config Simulation configuration with operating costs settings
 * @param dt Time delta (usually 1)
 * @returns Result containing updated ship state and cost breakdown
 */
export function processOperatingCosts(
  ship: ShipState,
  isDockedAtIsland: boolean,
  config: SimulationConfig,
  dt: number = 1
): OperatingCostsResult {
  const opConfig = config.operatingCostsConfig;

  let cash = ship.cash;
  let crewWagesPaid = 0;
  let maintenancePaid = 0;
  let portFeesPaid = 0;
  let wagesFullyPaid = true;
  let maintenanceFullyPaid = true;
  let unpaidWages = 0;
  let unpaidMaintenance = 0;

  // =========================================================================
  // 1. Crew Wages
  // =========================================================================
  const wagesOwed = calculateCrewWages(ship.crew) * opConfig.crewWageMultiplier * dt;

  if (wagesOwed > 0) {
    if (cash >= wagesOwed) {
      // Full payment
      crewWagesPaid = wagesOwed;
      cash -= wagesOwed;
    } else {
      // Partial or no payment
      crewWagesPaid = Math.max(0, cash);
      unpaidWages = wagesOwed - crewWagesPaid;
      cash = Math.max(0, cash - crewWagesPaid);
      wagesFullyPaid = false;
    }
  }

  // =========================================================================
  // 2. Maintenance Costs
  // =========================================================================
  const maintenanceOwed = calculateMaintenanceCost(
    ship.capacity,
    opConfig.maintenanceRate
  ) * dt;

  if (maintenanceOwed > 0) {
    if (cash >= maintenanceOwed) {
      // Full payment
      maintenancePaid = maintenanceOwed;
      cash -= maintenanceOwed;
    } else {
      // Partial or no payment
      maintenancePaid = Math.max(0, cash);
      unpaidMaintenance = maintenanceOwed - maintenancePaid;
      cash = Math.max(0, cash - maintenancePaid);
      maintenanceFullyPaid = false;
    }
  }

  // =========================================================================
  // 3. Port Fees (only when docked)
  // =========================================================================
  if (isDockedAtIsland && opConfig.portFeePerTick > 0) {
    const portFeeOwed = opConfig.portFeePerTick * dt;

    if (cash >= portFeeOwed) {
      portFeesPaid = portFeeOwed;
      cash -= portFeeOwed;
    } else {
      // Port fees are optional - if can't pay, just don't pay
      // (Could add penalties later, like being unable to leave port)
      portFeesPaid = Math.max(0, cash);
      cash = Math.max(0, cash - portFeesPaid);
    }
  }

  // =========================================================================
  // Calculate crew state updates
  // =========================================================================
  let newUnpaidTicks = ship.crew.unpaidTicks;
  let newMorale = ship.crew.morale;

  if (!wagesFullyPaid) {
    // Increment unpaid ticks when wages not fully paid
    newUnpaidTicks += 1;

    // Apply morale penalty after threshold is exceeded
    if (newUnpaidTicks > opConfig.unpaidWagesMoraleThreshold) {
      // Morale drops 1% per tick of non-payment beyond threshold
      const moralePenalty = 0.01 * dt;
      newMorale = Math.max(0, newMorale - moralePenalty);
    }
  } else {
    // Reset unpaid ticks when fully paid
    newUnpaidTicks = 0;
  }

  // =========================================================================
  // Calculate condition degradation from unpaid maintenance
  // =========================================================================
  let newCondition = ship.condition;

  if (!maintenanceFullyPaid) {
    // Ship condition degrades faster when maintenance isn't paid
    // Base degradation: 0.1% per tick of unpaid maintenance
    const conditionPenalty = 0.001 * dt;
    newCondition = Math.max(0, newCondition - conditionPenalty);
  }

  // =========================================================================
  // Build updated ship state
  // =========================================================================
  const newCrew: CrewState = {
    ...ship.crew,
    unpaidTicks: newUnpaidTicks,
    morale: newMorale,
  };

  const newShip: ShipState = {
    ...ship,
    cash,
    crew: newCrew,
    condition: newCondition,
  };

  const totalCosts = crewWagesPaid + maintenancePaid + portFeesPaid;

  return {
    newShip,
    crewWagesPaid,
    maintenancePaid,
    portFeesPaid,
    totalCosts,
    wagesFullyPaid,
    maintenanceFullyPaid,
    unpaidWages,
    unpaidMaintenance,
  };
}

/**
 * Calculate total operating costs per tick for a ship (without applying them)
 * Useful for agents to estimate profitability
 */
export function estimateOperatingCosts(
  ship: ShipState,
  isDockedAtIsland: boolean,
  config: SimulationConfig
): {
  crewWages: number;
  maintenance: number;
  portFees: number;
  total: number;
} {
  const opConfig = config.operatingCostsConfig;

  const crewWages = calculateCrewWages(ship.crew) * opConfig.crewWageMultiplier;
  const maintenance = calculateMaintenanceCost(ship.capacity, opConfig.maintenanceRate);
  const portFees = isDockedAtIsland ? opConfig.portFeePerTick : 0;

  return {
    crewWages,
    maintenance,
    portFees,
    total: crewWages + maintenance + portFees,
  };
}

/**
 * Calculate daily operating costs for planning purposes
 * Assumes 24 ticks per day
 */
export function estimateDailyOperatingCosts(
  ship: ShipState,
  averageDockedRatio: number, // 0-1, fraction of time spent docked
  config: SimulationConfig
): {
  dailyCrewWages: number;
  dailyMaintenance: number;
  dailyPortFees: number;
  dailyTotal: number;
} {
  const opConfig = config.operatingCostsConfig;
  const ticksPerDay = 24;

  const dailyCrewWages = calculateCrewWages(ship.crew) * opConfig.crewWageMultiplier * ticksPerDay;
  const dailyMaintenance = calculateMaintenanceCost(ship.capacity, opConfig.maintenanceRate) * ticksPerDay;
  const dailyPortFees = opConfig.portFeePerTick * ticksPerDay * averageDockedRatio;

  return {
    dailyCrewWages,
    dailyMaintenance,
    dailyPortFees,
    dailyTotal: dailyCrewWages + dailyMaintenance + dailyPortFees,
  };
}

/**
 * Get operating cost status for UI/agents
 */
export function getOperatingCostStatus(
  ship: ShipState,
  isDockedAtIsland: boolean,
  config: SimulationConfig
): {
  perTickCosts: {
    crewWages: number;
    maintenance: number;
    portFees: number;
    total: number;
  };
  canAffordNextTick: boolean;
  ticksUntilBankrupt: number;
  unpaidWagesTicks: number;
  moraleAtRisk: boolean;
} {
  const costs = estimateOperatingCosts(ship, isDockedAtIsland, config);
  const opConfig = config.operatingCostsConfig;

  const canAffordNextTick = ship.cash >= costs.total;
  const ticksUntilBankrupt = costs.total > 0 ? Math.floor(ship.cash / costs.total) : Infinity;

  const moraleAtRisk = ship.crew.unpaidTicks > opConfig.unpaidWagesMoraleThreshold * 0.75;

  return {
    perTickCosts: costs,
    canAffordNextTick,
    ticksUntilBankrupt,
    unpaidWagesTicks: ship.crew.unpaidTicks,
    moraleAtRisk,
  };
}
