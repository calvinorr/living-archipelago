/**
 * Shipping System Tests
 * Verify transport cost calculations (Track 02)
 */

import { describe, it, expect } from 'vitest';
import {
  calculateTransportCost,
  getDistanceBetweenIslands,
  updateShip,
  startVoyage,
  calculateCargoVolume,
} from '../../src/systems/shipping.js';
import { DEFAULT_CONFIG, MVP_GOODS, createGoodsMap } from '../../src/core/world.js';
import type { IslandState, ShipState, GoodDefinition } from '../../src/core/types.js';

/**
 * Create test islands at specific positions
 */
function createTestIslands(): Map<string, IslandState> {
  const islands = new Map<string, IslandState>();

  // Island at origin (0, 0)
  islands.set('island-a', {
    id: 'island-a',
    name: 'Island A',
    position: { x: 0, y: 0 },
    ecosystem: { fishStock: 500, forestBiomass: 500, soilFertility: 0.5 },
    ecosystemParams: {
      fishCapacity: 1000,
      fishRegenRate: 0.05,
      forestCapacity: 1000,
      forestRegenRate: 0.03,
      soilRegenBase: 0.01,
      soilDepletionRate: 0.01,
    },
    population: {
      size: 500,
      health: 0.8,
      labour: { fishing: 0.3, forestry: 0.2, farming: 0.2, industry: 0.15, services: 0.15 },
    },
    inventory: new Map(),
    market: {
      prices: new Map([['fish', 10], ['grain', 8]]),
      idealStock: new Map(),
      momentum: new Map(),
      consumptionVelocity: new Map(),
    },
    productionParams: {
      baseRate: new Map(),
      toolSensitivity: new Map(),
      ecosystemSensitivity: new Map(),
    },
  });

  // Island at (100, 0) - distance = 100
  islands.set('island-b', {
    id: 'island-b',
    name: 'Island B',
    position: { x: 100, y: 0 },
    ecosystem: { fishStock: 500, forestBiomass: 500, soilFertility: 0.5 },
    ecosystemParams: {
      fishCapacity: 1000,
      fishRegenRate: 0.05,
      forestCapacity: 1000,
      forestRegenRate: 0.03,
      soilRegenBase: 0.01,
      soilDepletionRate: 0.01,
    },
    population: {
      size: 500,
      health: 0.8,
      labour: { fishing: 0.3, forestry: 0.2, farming: 0.2, industry: 0.15, services: 0.15 },
    },
    inventory: new Map(),
    market: {
      prices: new Map([['fish', 15], ['grain', 6]]),
      idealStock: new Map(),
      momentum: new Map(),
      consumptionVelocity: new Map(),
    },
    productionParams: {
      baseRate: new Map(),
      toolSensitivity: new Map(),
      ecosystemSensitivity: new Map(),
    },
  });

  // Island at (0, 200) - distance from A = 200
  islands.set('island-c', {
    id: 'island-c',
    name: 'Island C',
    position: { x: 0, y: 200 },
    ecosystem: { fishStock: 500, forestBiomass: 500, soilFertility: 0.5 },
    ecosystemParams: {
      fishCapacity: 1000,
      fishRegenRate: 0.05,
      forestCapacity: 1000,
      forestRegenRate: 0.03,
      soilRegenBase: 0.01,
      soilDepletionRate: 0.01,
    },
    population: {
      size: 500,
      health: 0.8,
      labour: { fishing: 0.3, forestry: 0.2, farming: 0.2, industry: 0.15, services: 0.15 },
    },
    inventory: new Map(),
    market: {
      prices: new Map([['fish', 12], ['grain', 10]]),
      idealStock: new Map(),
      momentum: new Map(),
      consumptionVelocity: new Map(),
    },
    productionParams: {
      baseRate: new Map(),
      toolSensitivity: new Map(),
      ecosystemSensitivity: new Map(),
    },
  });

  return islands;
}

/**
 * Create a test ship
 */
function createTestShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    id: 'test-ship',
    name: 'Test Ship',
    ownerId: 'test-trader',
    capacity: 100,
    speed: 10,
    cash: 500,
    cargo: new Map(),
    location: { kind: 'at_island', islandId: 'island-a' },
    cumulativeTransportCosts: 0,
    crew: {
      count: 10,
      capacity: 20,
      morale: 0.8,
      wageRate: 0.5,
      unpaidTicks: 0,
    },
    condition: 1.0,
    totalDistanceTraveled: 0,
    ...overrides,
  };
}

describe('getDistanceBetweenIslands', () => {
  const islands = createTestIslands();

  it('should calculate horizontal distance correctly', () => {
    const dist = getDistanceBetweenIslands('island-a', 'island-b', islands);
    expect(dist).toBe(100);
  });

  it('should calculate vertical distance correctly', () => {
    const dist = getDistanceBetweenIslands('island-a', 'island-c', islands);
    expect(dist).toBe(200);
  });

  it('should return 0 for same island', () => {
    const dist = getDistanceBetweenIslands('island-a', 'island-a', islands);
    expect(dist).toBe(0);
  });

  it('should return 0 for non-existent islands', () => {
    const dist = getDistanceBetweenIslands('island-a', 'non-existent', islands);
    expect(dist).toBe(0);
  });

  it('should be symmetric (A to B = B to A)', () => {
    const distAB = getDistanceBetweenIslands('island-a', 'island-b', islands);
    const distBA = getDistanceBetweenIslands('island-b', 'island-a', islands);
    expect(distAB).toBe(distBA);
  });
});

describe('calculateTransportCost', () => {
  const islands = createTestIslands();
  const config = DEFAULT_CONFIG;

  it('should calculate fixed cost component', () => {
    const cost = calculateTransportCost('island-a', 'island-b', 0, islands, config);
    expect(cost.fixedCost).toBe(config.baseVoyageCost);
  });

  it('should calculate distance cost component', () => {
    const cost = calculateTransportCost('island-a', 'island-b', 0, islands, config);
    // Distance = 100, costPerDistanceUnit = 0.1
    expect(cost.distanceCost).toBe(100 * config.costPerDistanceUnit);
  });

  it('should calculate volume cost component', () => {
    const cargoVolume = 50;
    const cost = calculateTransportCost('island-a', 'island-b', cargoVolume, islands, config);
    expect(cost.volumeCost).toBe(cargoVolume * config.perVolumeHandlingCost);
  });

  it('should calculate return cost correctly', () => {
    const cost = calculateTransportCost('island-a', 'island-b', 0, islands, config);
    // Distance = 100, costPerDistanceUnit = 0.1, emptyReturnMultiplier = 0.5
    expect(cost.returnCost).toBe(100 * config.costPerDistanceUnit * config.emptyReturnMultiplier);
  });

  it('should calculate one-way cost correctly', () => {
    const cargoVolume = 50;
    const cost = calculateTransportCost('island-a', 'island-b', cargoVolume, islands, config);

    const expectedOneWay =
      config.baseVoyageCost +
      100 * config.costPerDistanceUnit +
      cargoVolume * config.perVolumeHandlingCost;

    expect(cost.oneWayCost).toBe(expectedOneWay);
  });

  it('should calculate round trip cost correctly', () => {
    const cargoVolume = 50;
    const cost = calculateTransportCost('island-a', 'island-b', cargoVolume, islands, config);

    expect(cost.totalRoundTrip).toBe(cost.oneWayCost + cost.returnCost);
  });

  it('should scale with distance', () => {
    const costShort = calculateTransportCost('island-a', 'island-b', 50, islands, config);
    const costLong = calculateTransportCost('island-a', 'island-c', 50, islands, config);

    // Distance A-B = 100, Distance A-C = 200
    expect(costLong.distanceCost).toBe(costShort.distanceCost * 2);
    expect(costLong.oneWayCost).toBeGreaterThan(costShort.oneWayCost);
  });

  it('should scale with cargo volume', () => {
    const costSmall = calculateTransportCost('island-a', 'island-b', 10, islands, config);
    const costLarge = calculateTransportCost('island-a', 'island-b', 100, islands, config);

    expect(costLarge.volumeCost).toBe(costSmall.volumeCost * 10);
  });

  describe('typical scenario (balanced config)', () => {
    it('should produce ~13-14% transport cost for typical cargo', () => {
      // Distance: 100 units, Cargo: 50 volume, Cargo value: ~200
      const cost = calculateTransportCost('island-a', 'island-b', 50, islands, config);

      // Expected: 10 + (100 × 0.1) + (50 × 0.05) = 22.5 one-way
      // Round trip: 22.5 + (100 × 0.1 × 0.5) = 27.5
      expect(cost.oneWayCost).toBeCloseTo(22.5, 2);
      expect(cost.totalRoundTrip).toBeCloseTo(27.5, 2);

      // For cargo worth 200, transport = 27.5/200 = 13.75%
      const cargoValue = 200;
      const transportPercentage = (cost.totalRoundTrip / cargoValue) * 100;
      expect(transportPercentage).toBeCloseTo(13.75, 1);
    });
  });
});

describe('updateShip with transport costs', () => {
  const islands = createTestIslands();
  const goods = createGoodsMap(MVP_GOODS);
  const config = DEFAULT_CONFIG;

  it('should deduct transport cost on voyage completion', () => {
    // Ship at sea, about to arrive
    const ship = createTestShip({
      cash: 500,
      cargo: new Map([['fish', 50]]),
      location: {
        kind: 'at_sea',
        position: { x: 99, y: 0 },
        route: {
          fromIslandId: 'island-a',
          toIslandId: 'island-b',
          etaHours: 0.1, // Almost there
          progress: 0.99,
        },
      },
    });

    const { newShip, arrived, transportCost } = updateShip(
      ship,
      islands,
      goods,
      [],
      1, // dt = 1, should complete voyage
      config
    );

    expect(arrived).toBe(true);
    expect(transportCost).toBeGreaterThan(0);
    expect(newShip.cash).toBeLessThan(ship.cash);
    expect(newShip.cash).toBe(ship.cash - transportCost);
    expect(newShip.lastVoyageCost).toBe(transportCost);
    expect(newShip.cumulativeTransportCosts).toBe(transportCost);
  });

  it('should not deduct cost when ship is at island', () => {
    const ship = createTestShip({
      cash: 500,
      location: { kind: 'at_island', islandId: 'island-a' },
    });

    const { newShip, arrived, transportCost } = updateShip(
      ship,
      islands,
      goods,
      [],
      1,
      config
    );

    expect(arrived).toBe(false);
    expect(transportCost).toBe(0);
    expect(newShip.cash).toBe(ship.cash);
  });

  it('should not deduct cost during voyage (only on arrival)', () => {
    const ship = createTestShip({
      cash: 500,
      location: {
        kind: 'at_sea',
        position: { x: 50, y: 0 },
        route: {
          fromIslandId: 'island-a',
          toIslandId: 'island-b',
          etaHours: 5, // Long way to go
          progress: 0.5,
        },
      },
    });

    const { newShip, arrived, transportCost } = updateShip(
      ship,
      islands,
      goods,
      [],
      1, // dt = 1, won't complete voyage
      config
    );

    expect(arrived).toBe(false);
    expect(transportCost).toBe(0);
    expect(newShip.cash).toBe(ship.cash);
  });

  it('should accumulate cumulative transport costs', () => {
    const ship = createTestShip({
      cash: 1000,
      cumulativeTransportCosts: 50, // Already had some costs
      location: {
        kind: 'at_sea',
        position: { x: 99, y: 0 },
        route: {
          fromIslandId: 'island-a',
          toIslandId: 'island-b',
          etaHours: 0.1,
          progress: 0.99,
        },
      },
    });

    const { newShip, transportCost } = updateShip(
      ship,
      islands,
      goods,
      [],
      1,
      config
    );

    expect(newShip.cumulativeTransportCosts).toBe(50 + transportCost);
  });

  it('should not allow negative cash (floor at 0)', () => {
    const ship = createTestShip({
      cash: 5, // Very low cash
      location: {
        kind: 'at_sea',
        position: { x: 99, y: 0 },
        route: {
          fromIslandId: 'island-a',
          toIslandId: 'island-b',
          etaHours: 0.1,
          progress: 0.99,
        },
      },
    });

    const { newShip, transportCost } = updateShip(
      ship,
      islands,
      goods,
      [],
      1,
      config
    );

    expect(transportCost).toBeGreaterThan(5); // Cost exceeds cash
    expect(newShip.cash).toBe(0); // Floored at 0
    expect(newShip.cumulativeTransportCosts).toBe(transportCost);
  });
});

describe('cargo volume calculation', () => {
  const goods = createGoodsMap(MVP_GOODS);

  it('should calculate volume based on bulkiness', () => {
    const cargo = new Map<string, number>([
      ['fish', 10], // bulkiness: 1
      ['timber', 5], // bulkiness: 2
    ]);

    const volume = calculateCargoVolume(cargo, goods);
    expect(volume).toBe(10 * 1 + 5 * 2); // 20
  });

  it('should return 0 for empty cargo', () => {
    const cargo = new Map<string, number>();
    const volume = calculateCargoVolume(cargo, goods);
    expect(volume).toBe(0);
  });
});

describe('transport cost impact on trade economics', () => {
  const islands = createTestIslands();
  const config = DEFAULT_CONFIG;

  it('short distance trade should have lower transport percentage', () => {
    // Short distance: 100 units
    const shortCost = calculateTransportCost('island-a', 'island-b', 50, islands, config);
    // Long distance: 200 units
    const longCost = calculateTransportCost('island-a', 'island-c', 50, islands, config);

    // Same cargo value, higher transport % for longer distance
    const cargoValue = 200;
    const shortPct = shortCost.totalRoundTrip / cargoValue;
    const longPct = longCost.totalRoundTrip / cargoValue;

    expect(longPct).toBeGreaterThan(shortPct);
  });

  it('larger cargo should have lower transport percentage per unit', () => {
    // Small cargo: 10 volume
    const smallCost = calculateTransportCost('island-a', 'island-b', 10, islands, config);
    // Large cargo: 100 volume
    const largeCost = calculateTransportCost('island-a', 'island-b', 100, islands, config);

    // Per-unit cost (assuming value proportional to volume)
    const smallPerUnit = smallCost.oneWayCost / 10;
    const largePerUnit = largeCost.oneWayCost / 100;

    // Fixed costs spread over more units = lower per-unit cost
    expect(largePerUnit).toBeLessThan(smallPerUnit);
  });
});

describe('ship maintenance system (Track 08)', () => {
  const islands = createTestIslands();
  const goods = createGoodsMap(MVP_GOODS);
  const config = DEFAULT_CONFIG;

  it('should apply wear during voyage', () => {
    const ship = createTestShip({
      condition: 1.0,
      location: {
        kind: 'at_sea',
        position: { x: 50, y: 0 },
        route: {
          fromIslandId: 'island-a',
          toIslandId: 'island-b',
          etaHours: 5,
          progress: 0.5,
        },
      },
    });

    const { newShip, wearApplied } = updateShip(ship, islands, goods, [], 1, config);

    expect(wearApplied).toBeGreaterThan(0);
    expect(newShip.condition).toBeLessThan(1.0);
    expect(newShip.totalDistanceTraveled).toBeGreaterThan(0);
  });

  it('should not apply wear when docked at island', () => {
    const ship = createTestShip({
      condition: 0.8,
      location: { kind: 'at_island', islandId: 'island-a' },
    });

    const { newShip, wearApplied } = updateShip(ship, islands, goods, [], 1, config);

    expect(wearApplied).toBe(0);
    expect(newShip.condition).toBe(0.8);
  });

  it('should reduce speed based on condition', () => {
    const goodShip = createTestShip({
      condition: 1.0,
      location: {
        kind: 'at_sea',
        position: { x: 0, y: 0 },
        route: {
          fromIslandId: 'island-a',
          toIslandId: 'island-b',
          etaHours: 10,
          progress: 0,
        },
      },
    });

    const damagedShip = createTestShip({
      condition: 0.0, // Worst condition
      location: {
        kind: 'at_sea',
        position: { x: 0, y: 0 },
        route: {
          fromIslandId: 'island-a',
          toIslandId: 'island-b',
          etaHours: 10,
          progress: 0,
        },
      },
    });

    const { newShip: goodResult } = updateShip(goodShip, islands, goods, [], 1, config);
    const { newShip: damagedResult } = updateShip(damagedShip, islands, goods, [], 1, config);

    // Damaged ship should make less progress due to speed penalty
    if (goodResult.location.kind === 'at_sea' && damagedResult.location.kind === 'at_sea') {
      expect(damagedResult.location.route.progress).toBeLessThan(
        goodResult.location.route.progress
      );
    }
  });

  it('should track cumulative distance traveled', () => {
    const ship = createTestShip({
      totalDistanceTraveled: 100,
      location: {
        kind: 'at_sea',
        position: { x: 50, y: 0 },
        route: {
          fromIslandId: 'island-a',
          toIslandId: 'island-b',
          etaHours: 5,
          progress: 0.5,
        },
      },
    });

    const { newShip } = updateShip(ship, islands, goods, [], 1, config);

    expect(newShip.totalDistanceTraveled).toBeGreaterThan(100);
  });
});
