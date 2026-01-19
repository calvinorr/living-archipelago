/**
 * Crew System
 * Handles ship crew management: hiring, wages, morale, and desertion
 */

import type {
  ShipState,
  IslandState,
  CrewState,
  CrewConfig,
  SimulationConfig,
} from '../core/types.js';

/**
 * Result of a crew hiring operation
 */
export interface HireCrewResult {
  newShip: ShipState;
  newIsland: IslandState;
  hired: number;
  cost: number;
  success: boolean;
  reason?: string;
}

/**
 * Result of paying crew wages
 */
export interface PayCrewResult {
  newShip: ShipState;
  wagesPaid: number;
  fullyPaid: boolean;
}

/**
 * Result of morale update
 */
export interface MoraleUpdateResult {
  newMorale: number;
  moraleChange: number;
  isLow: boolean;
}

/**
 * Result of desertion processing
 */
export interface DesertionResult {
  newShip: ShipState;
  newIsland: IslandState | null; // Island where crew deserted to (if at island)
  deserted: number;
  reason: string | null;
}

/**
 * Result of a complete crew update tick
 */
export interface CrewUpdateResult {
  newShip: ShipState;
  newIsland: IslandState | null;
  wagesPaid: number;
  deserted: number;
  moraleChange: number;
}

/**
 * Default crew configuration
 */
export const DEFAULT_CREW_CONFIG: CrewConfig = {
  minCrewRatio: 0.3, // Need at least 30% of capacity to operate
  baseWageRate: 0.5, // 0.5 coins per crew per tick
  moraleDecayRate: 0.01, // 1% decay per tick when conditions are bad
  moraleRecoveryRate: 0.005, // 0.5% recovery per tick when conditions are good
  desertionMoraleThreshold: 0.2, // Crew desert when morale below 20%
  desertionRate: 0.1, // 10% of crew desert per tick when conditions are met
  unpaidDesertionThreshold: 24, // 24 ticks (1 game day) without pay triggers desertion
  speedMoraleBonus: 0.2, // +20% speed at high morale
  speedMoralePenalty: 0.3, // -30% speed at low morale
  atSeaMoralePenalty: 0.005, // Additional 0.5% morale decay at sea
  lowCrewMoralePenalty: 0.02, // 2% morale decay when understaffed
};

/**
 * Clamp value between 0 and 1
 */
function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Get the minimum crew needed to operate the ship
 */
export function getMinimumCrew(ship: ShipState, config: CrewConfig): number {
  return Math.ceil(ship.crew.capacity * config.minCrewRatio);
}

/**
 * Check if ship has enough crew to operate
 */
export function canOperate(ship: ShipState, config: CrewConfig): boolean {
  return ship.crew.count >= getMinimumCrew(ship, config);
}

/**
 * Get the crew efficiency factor (affects ship speed)
 * Returns a multiplier based on crew count and morale
 */
export function getCrewEfficiency(ship: ShipState, config: CrewConfig): number {
  const minCrew = getMinimumCrew(ship, config);
  const morale = ship.crew.morale;

  // Base efficiency from crew ratio (0.5 at minimum crew, 1.0 at full crew)
  let efficiency = 0.5 + 0.5 * ((ship.crew.count - minCrew) / Math.max(ship.crew.capacity - minCrew, 1));
  efficiency = Math.min(1, efficiency);

  // Morale modifier: high morale gives bonus, low morale gives penalty
  if (morale > 0.7) {
    // Bonus for high morale (0.7-1.0 maps to 0-20% bonus)
    const bonusRatio = (morale - 0.7) / 0.3;
    efficiency *= 1 + config.speedMoraleBonus * bonusRatio;
  } else if (morale < 0.4) {
    // Penalty for low morale (0.4-0 maps to 0-30% penalty)
    const penaltyRatio = (0.4 - morale) / 0.4;
    efficiency *= 1 - config.speedMoralePenalty * penaltyRatio;
  }

  // Cannot operate below minimum crew
  if (ship.crew.count < minCrew) {
    efficiency = 0;
  }

  return Math.max(0, efficiency);
}

/**
 * Hire crew from an island's population
 *
 * @param ship The ship hiring crew
 * @param island The island to hire from
 * @param count Number of crew to hire
 * @param config Crew configuration
 * @returns Result containing updated ship and island states
 */
export function hireCrew(
  ship: ShipState,
  island: IslandState,
  count: number,
  config: CrewConfig
): HireCrewResult {
  // Validate ship is at this island
  if (ship.location.kind !== 'at_island' || ship.location.islandId !== island.id) {
    return {
      newShip: ship,
      newIsland: island,
      hired: 0,
      cost: 0,
      success: false,
      reason: 'Ship must be at the island to hire crew',
    };
  }

  // Calculate available slots on ship
  const availableSlots = ship.crew.capacity - ship.crew.count;
  if (availableSlots <= 0) {
    return {
      newShip: ship,
      newIsland: island,
      hired: 0,
      cost: 0,
      success: false,
      reason: 'Ship crew is at capacity',
    };
  }

  // Calculate available workers from island (max 10% of population can be hired at once)
  const maxHirable = Math.floor(island.population.size * 0.1);
  if (maxHirable <= 0) {
    return {
      newShip: ship,
      newIsland: island,
      hired: 0,
      cost: 0,
      success: false,
      reason: 'Island population too low to hire crew',
    };
  }

  // Determine actual hire count
  const actualHire = Math.min(count, availableSlots, maxHirable);

  // Calculate hiring cost (signing bonus = 10x base wage per crew member)
  const hiringCostPerCrew = config.baseWageRate * 10;
  const totalCost = actualHire * hiringCostPerCrew;

  // Check if ship has enough cash
  if (ship.cash < totalCost) {
    // Hire as many as we can afford
    const affordableHire = Math.floor(ship.cash / hiringCostPerCrew);
    if (affordableHire <= 0) {
      return {
        newShip: ship,
        newIsland: island,
        hired: 0,
        cost: 0,
        success: false,
        reason: 'Insufficient funds to hire crew',
      };
    }
    // Recursively call with affordable amount
    return hireCrew(ship, island, affordableHire, config);
  }

  // Create new ship state with updated crew
  const newCrew: CrewState = {
    ...ship.crew,
    count: ship.crew.count + actualHire,
    // New crew slightly lowers average morale (they need to integrate)
    morale: (ship.crew.morale * ship.crew.count + 0.6 * actualHire) / (ship.crew.count + actualHire),
  };

  const newShip: ShipState = {
    ...ship,
    cash: ship.cash - totalCost,
    crew: newCrew,
  };

  // Create new island state with reduced population
  const newIsland: IslandState = {
    ...island,
    population: {
      ...island.population,
      size: island.population.size - actualHire,
    },
  };

  return {
    newShip,
    newIsland,
    hired: actualHire,
    cost: totalCost,
    success: true,
  };
}

/**
 * Pay crew wages
 * Deducts wages from ship cash and resets unpaid counter
 *
 * @param ship The ship paying wages
 * @returns Result containing updated ship state and payment info
 */
export function payCrew(ship: ShipState): PayCrewResult {
  if (ship.crew.count <= 0) {
    return {
      newShip: ship,
      wagesPaid: 0,
      fullyPaid: true,
    };
  }

  const wagesOwed = ship.crew.count * ship.crew.wageRate;
  const canPay = Math.min(wagesOwed, ship.cash);
  const fullyPaid = canPay >= wagesOwed;

  const newCrew: CrewState = {
    ...ship.crew,
    unpaidTicks: fullyPaid ? 0 : ship.crew.unpaidTicks + 1,
  };

  const newShip: ShipState = {
    ...ship,
    cash: ship.cash - canPay,
    crew: newCrew,
  };

  return {
    newShip,
    wagesPaid: canPay,
    fullyPaid,
  };
}

/**
 * Update crew morale based on conditions
 *
 * @param ship The ship to update morale for
 * @param config Crew configuration
 * @param dt Time delta
 * @returns Result containing new morale value and change
 */
export function updateMorale(
  ship: ShipState,
  config: CrewConfig,
  dt: number
): MoraleUpdateResult {
  if (ship.crew.count <= 0) {
    return {
      newMorale: ship.crew.morale,
      moraleChange: 0,
      isLow: false,
    };
  }

  let moraleChange = 0;

  // Check payment status
  if (ship.crew.unpaidTicks > 0) {
    // Morale decays when unpaid
    moraleChange -= config.moraleDecayRate * dt;
    // Accelerated decay after threshold
    if (ship.crew.unpaidTicks > config.unpaidDesertionThreshold / 2) {
      moraleChange -= config.moraleDecayRate * dt;
    }
  } else {
    // Morale recovers when paid
    moraleChange += config.moraleRecoveryRate * dt;
  }

  // At sea penalty
  if (ship.location.kind === 'at_sea') {
    moraleChange -= config.atSeaMoralePenalty * dt;
  }

  // Understaffed penalty
  const minCrew = getMinimumCrew(ship, config);
  if (ship.crew.count < ship.crew.capacity * 0.5) {
    moraleChange -= config.lowCrewMoralePenalty * dt;
  }

  // Cannot operate penalty (severe)
  if (ship.crew.count < minCrew) {
    moraleChange -= config.moraleDecayRate * 2 * dt;
  }

  // At island bonus (crew gets shore leave)
  if (ship.location.kind === 'at_island' && ship.crew.unpaidTicks === 0) {
    moraleChange += config.moraleRecoveryRate * 0.5 * dt;
  }

  const newMorale = clamp01(ship.crew.morale + moraleChange);

  return {
    newMorale,
    moraleChange,
    isLow: newMorale < config.desertionMoraleThreshold,
  };
}

/**
 * Process crew desertion
 * Crew desert when morale is too low or they haven't been paid
 *
 * @param ship The ship to process desertion for
 * @param island The island the ship is at (or null if at sea)
 * @param config Crew configuration
 * @param dt Time delta
 * @returns Result containing updated states and desertion info
 */
export function processDesertion(
  ship: ShipState,
  island: IslandState | null,
  config: CrewConfig,
  dt: number
): DesertionResult {
  if (ship.crew.count <= 0) {
    return {
      newShip: ship,
      newIsland: island,
      deserted: 0,
      reason: null,
    };
  }

  let desertionReason: string | null = null;
  let desertionMultiplier = 0;

  // Check desertion conditions
  if (ship.crew.morale < config.desertionMoraleThreshold) {
    desertionReason = 'Low morale';
    desertionMultiplier = 1;
  }

  if (ship.crew.unpaidTicks >= config.unpaidDesertionThreshold) {
    desertionReason = desertionReason ? `${desertionReason}, unpaid wages` : 'Unpaid wages';
    desertionMultiplier += 1;
  }

  if (desertionMultiplier === 0) {
    return {
      newShip: ship,
      newIsland: island,
      deserted: 0,
      reason: null,
    };
  }

  // Calculate deserters
  const baseDeserters = Math.floor(ship.crew.count * config.desertionRate * desertionMultiplier * dt);
  const deserted = Math.min(baseDeserters, ship.crew.count);

  if (deserted <= 0) {
    return {
      newShip: ship,
      newIsland: island,
      deserted: 0,
      reason: null,
    };
  }

  // Update ship crew
  const newCrew: CrewState = {
    ...ship.crew,
    count: ship.crew.count - deserted,
  };

  const newShip: ShipState = {
    ...ship,
    crew: newCrew,
  };

  // If at island, deserters return to population
  let newIsland: IslandState | null = island;
  if (ship.location.kind === 'at_island' && island) {
    newIsland = {
      ...island,
      population: {
        ...island.population,
        size: island.population.size + deserted,
      },
    };
  }
  // If at sea, crew are lost (could add rescue mechanic later)

  return {
    newShip,
    newIsland,
    deserted,
    reason: desertionReason,
  };
}

/**
 * Complete crew update for a single tick
 * Processes wages, morale, and desertion in order
 *
 * @param ship The ship to update
 * @param island The island the ship is at (or null if at sea)
 * @param config Simulation configuration
 * @param dt Time delta
 * @returns Complete update result
 */
export function updateCrew(
  ship: ShipState,
  island: IslandState | null,
  config: SimulationConfig,
  dt: number
): CrewUpdateResult {
  const crewConfig = config.crewConfig;

  // Step 1: Pay wages
  const payResult = payCrew(ship);
  let currentShip = payResult.newShip;

  // Step 2: Update morale
  const moraleResult = updateMorale(currentShip, crewConfig, dt);
  currentShip = {
    ...currentShip,
    crew: {
      ...currentShip.crew,
      morale: moraleResult.newMorale,
    },
  };

  // Step 3: Process desertion
  const desertionResult = processDesertion(currentShip, island, crewConfig, dt);

  return {
    newShip: desertionResult.newShip,
    newIsland: desertionResult.newIsland,
    wagesPaid: payResult.wagesPaid,
    deserted: desertionResult.deserted,
    moraleChange: moraleResult.moraleChange,
  };
}

/**
 * Get crew status for UI/agents
 */
export function getCrewStatus(
  ship: ShipState,
  config: CrewConfig
): {
  count: number;
  capacity: number;
  morale: number;
  moraleStatus: 'high' | 'normal' | 'low' | 'critical';
  canOperate: boolean;
  efficiency: number;
  unpaidTicks: number;
  wageRate: number;
  ticklyWageCost: number;
} {
  const efficiency = getCrewEfficiency(ship, config);
  const canOp = canOperate(ship, config);

  let moraleStatus: 'high' | 'normal' | 'low' | 'critical';
  if (ship.crew.morale >= 0.7) {
    moraleStatus = 'high';
  } else if (ship.crew.morale >= 0.4) {
    moraleStatus = 'normal';
  } else if (ship.crew.morale >= config.desertionMoraleThreshold) {
    moraleStatus = 'low';
  } else {
    moraleStatus = 'critical';
  }

  return {
    count: ship.crew.count,
    capacity: ship.crew.capacity,
    morale: ship.crew.morale,
    moraleStatus,
    canOperate: canOp,
    efficiency,
    unpaidTicks: ship.crew.unpaidTicks,
    wageRate: ship.crew.wageRate,
    ticklyWageCost: ship.crew.count * ship.crew.wageRate,
  };
}

/**
 * Create initial crew state for a new ship
 */
export function createCrewState(
  capacity: number,
  initialCount: number,
  wageRate: number
): CrewState {
  return {
    count: initialCount,
    capacity,
    morale: 0.7, // Start with decent morale
    wageRate,
    unpaidTicks: 0,
  };
}
