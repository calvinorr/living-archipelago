/**
 * Ecology System Tests
 * Verify yield curve, harvest-production coupling (Track 03)
 * and ecosystem collapse thresholds (Track 07)
 */

import { describe, it, expect } from 'vitest';
import {
  calculateYieldMultiplier,
  calculateRecoveryMultiplier,
  classifyEcosystemHealth,
  updateEcology,
  type HarvestData,
} from '../../src/systems/ecology.js';
import { updateProduction } from '../../src/systems/production.js';
import { DEFAULT_CONFIG } from '../../src/core/world.js';
import type { IslandState, WorldEvent } from '../../src/core/types.js';

/**
 * Create a minimal island state for testing
 */
function createTestIsland(overrides: Partial<{
  fishStock: number;
  fishCapacity: number;
  forestBiomass: number;
  forestCapacity: number;
  soilFertility: number;
  populationSize: number;
  health: number;
  fishingLabor: number;
  forestryLabor: number;
  farmingLabor: number;
}> = {}): IslandState {
  const {
    fishStock = 800,
    fishCapacity = 1000,
    forestBiomass = 800,
    forestCapacity = 1000,
    soilFertility = 0.8,
    populationSize = 500,
    health = 0.8,
    fishingLabor = 0.3,
    forestryLabor = 0.2,
    farmingLabor = 0.2,
  } = overrides;

  return {
    id: 'test-island',
    name: 'Test Island',
    position: { x: 0, y: 0 },
    ecosystem: {
      fishStock,
      forestBiomass,
      soilFertility,
    },
    ecosystemParams: {
      fishCapacity,
      fishRegenRate: 0.05,
      forestCapacity,
      forestRegenRate: 0.03,
      soilRegenBase: 0.01,
      soilDepletionRate: 0.01,
    },
    population: {
      size: populationSize,
      health,
      labour: {
        fishing: fishingLabor,
        forestry: forestryLabor,
        farming: farmingLabor,
        industry: 0.15,
        services: 0.15,
      },
    },
    inventory: new Map([
      ['fish', 200],
      ['grain', 200],
      ['timber', 100],
      ['tools', 50],
      ['luxuries', 20],
    ]),
    market: {
      prices: new Map([
        ['fish', 8],
        ['grain', 6],
        ['timber', 10],
        ['tools', 25],
        ['luxuries', 30],
      ]),
      idealStock: new Map(),
      momentum: new Map(),
      consumptionVelocity: new Map(),
    },
    productionParams: {
      baseRate: new Map([
        ['fish', 15],
        ['grain', 10],
        ['timber', 12],
        ['tools', 2],
        ['luxuries', 1],
      ]),
      toolSensitivity: new Map(),
      ecosystemSensitivity: new Map([
        ['fish', 0.8],
        ['grain', 0.8],
        ['timber', 0.8],
        ['tools', 0.2],
        ['luxuries', 0.2],
      ]),
    },
  };
}

describe('classifyEcosystemHealth (Track 07)', () => {
  const config = DEFAULT_CONFIG;

  it('should classify healthy (>60%)', () => {
    expect(classifyEcosystemHealth(700, 1000, config)).toBe('healthy');
    expect(classifyEcosystemHealth(1000, 1000, config)).toBe('healthy');
  });

  it('should classify stressed (30-60%)', () => {
    expect(classifyEcosystemHealth(500, 1000, config)).toBe('stressed');
    expect(classifyEcosystemHealth(350, 1000, config)).toBe('stressed');
  });

  it('should classify degraded (10-30%)', () => {
    expect(classifyEcosystemHealth(200, 1000, config)).toBe('degraded');
    expect(classifyEcosystemHealth(150, 1000, config)).toBe('degraded');
  });

  it('should classify collapsed (2-10%)', () => {
    expect(classifyEcosystemHealth(80, 1000, config)).toBe('collapsed');
    expect(classifyEcosystemHealth(30, 1000, config)).toBe('collapsed');
  });

  it('should classify dead (<2%)', () => {
    expect(classifyEcosystemHealth(15, 1000, config)).toBe('dead');
    expect(classifyEcosystemHealth(0, 1000, config)).toBe('dead');
  });
});

describe('calculateRecoveryMultiplier (Track 07)', () => {
  const config = DEFAULT_CONFIG;

  it('should return 1.0 for healthy ecosystems', () => {
    expect(calculateRecoveryMultiplier(800, 1000, config)).toBe(1.0);
  });

  it('should return 1.0 for stressed ecosystems', () => {
    expect(calculateRecoveryMultiplier(400, 1000, config)).toBe(1.0);
  });

  it('should return impairedRecoveryMultiplier for degraded ecosystems', () => {
    expect(calculateRecoveryMultiplier(200, 1000, config)).toBe(config.impairedRecoveryMultiplier);
  });

  it('should return collapsedRecoveryMultiplier for collapsed ecosystems', () => {
    expect(calculateRecoveryMultiplier(50, 1000, config)).toBe(config.collapsedRecoveryMultiplier);
  });

  it('should return 0 for dead ecosystems', () => {
    expect(calculateRecoveryMultiplier(10, 1000, config)).toBe(0);
  });
});

describe('calculateYieldMultiplier', () => {
  const config = DEFAULT_CONFIG;

  describe('threshold boundaries (Track 07)', () => {
    it('should return 0 in dead zone (<2%)', () => {
      expect(calculateYieldMultiplier(10, 1000, config)).toBe(0);
      expect(calculateYieldMultiplier(0, 1000, config)).toBe(0);
    });

    it('should scale from 0 to collapseFloor in collapse zone (2-10%)', () => {
      // At 2% (deadThreshold), yield should be 0
      const atDead = calculateYieldMultiplier(20, 1000, config);
      expect(atDead).toBeCloseTo(0, 2);

      // At 10% (collapseThreshold), yield should approach collapseFloor
      const atCollapse = calculateYieldMultiplier(100, 1000, config);
      expect(atCollapse).toBeCloseTo(config.collapseFloor, 2);
    });

    it('should return 1.0 at and above healthy threshold (60%)', () => {
      expect(calculateYieldMultiplier(600, 1000, config)).toBeCloseTo(1.0, 2);
      expect(calculateYieldMultiplier(800, 1000, config)).toBe(1.0);
      expect(calculateYieldMultiplier(1000, 1000, config)).toBe(1.0);
    });
  });

  describe('interpolation zones', () => {
    it('should use quadratic curve in degraded zone (10-30%)', () => {
      const mult = calculateYieldMultiplier(200, 1000, config);
      expect(mult).toBeGreaterThan(config.collapseFloor);
      expect(mult).toBeLessThan(config.criticalThreshold);
    });

    it('should use linear scaling in stressed zone (30-60%)', () => {
      // At 45% (midpoint of 30-60%)
      const mult = calculateYieldMultiplier(450, 1000, config);
      expect(mult).toBeGreaterThan(config.criticalThreshold);
      expect(mult).toBeLessThan(1.0);
    });
  });

  describe('curve properties', () => {
    it('should be monotonically increasing', () => {
      let prev = calculateYieldMultiplier(0, 1000, config);
      for (let stock = 50; stock <= 1000; stock += 50) {
        const current = calculateYieldMultiplier(stock, 1000, config);
        expect(current).toBeGreaterThanOrEqual(prev);
        prev = current;
      }
    });

    it('should produce continuous values (no jumps)', () => {
      const step = 10;
      for (let stock = 0; stock < 1000; stock += step) {
        const m1 = calculateYieldMultiplier(stock, 1000, config);
        const m2 = calculateYieldMultiplier(stock + step, 1000, config);
        expect(Math.abs(m2 - m1)).toBeLessThan(0.1);
      }
    });

    it('should handle zero capacity gracefully', () => {
      const mult = calculateYieldMultiplier(100, 0, config);
      expect(mult).toBe(0);
    });
  });
});

describe('Production-Harvest Coupling', () => {
  const config = DEFAULT_CONFIG;
  const noEvents: WorldEvent[] = [];
  const dt = 1;

  it('should produce harvest data for extractive goods', () => {
    const island = createTestIsland({ fishStock: 800, forestBiomass: 800 });
    const goodIds = ['fish', 'grain', 'timber', 'tools', 'luxuries'];

    const result = updateProduction(island, goodIds, config, noEvents, dt);

    expect(result.harvested.get('fish')).toBeGreaterThan(0);
    expect(result.harvested.get('timber')).toBeGreaterThan(0);
    expect(result.harvested.get('grain')).toBe(0);
    expect(result.harvested.get('tools')).toBe(0);
  });

  it('should constrain production when stock is low', () => {
    const healthyIsland = createTestIsland({ fishStock: 800 });
    const depletedIsland = createTestIsland({ fishStock: 100 });

    const healthyResult = updateProduction(healthyIsland, ['fish'], config, noEvents, dt);
    const depletedResult = updateProduction(depletedIsland, ['fish'], config, noEvents, dt);

    const healthyFish = healthyResult.produced.get('fish') ?? 0;
    const depletedFish = depletedResult.produced.get('fish') ?? 0;

    expect(depletedFish).toBeLessThan(healthyFish * 0.5);
    expect(depletedResult.constrained.get('fish')).toBe(true);
  });

  it('should produce zero in dead zone', () => {
    const deadIsland = createTestIsland({ fishStock: 10 }); // 1% stock

    const result = updateProduction(deadIsland, ['fish'], config, noEvents, dt);

    expect(result.produced.get('fish')).toBe(0);
    expect(result.constrained.get('fish')).toBe(true);
  });
});

describe('Ecology-Production Integration', () => {
  const config = DEFAULT_CONFIG;
  const noEvents: WorldEvent[] = [];
  const dt = 1;

  it('should drain ecosystem when harvesting', () => {
    const island = createTestIsland({ fishStock: 800 });
    const initialFish = island.ecosystem.fishStock;

    const productionResult = updateProduction(island, ['fish'], config, noEvents, dt);
    const fishHarvested = productionResult.harvested.get('fish') ?? 0;

    const harvestData: HarvestData = { fish: fishHarvested, timber: 0 };
    const newEcosystem = updateEcology(island, harvestData, config, noEvents, dt);

    expect(newEcosystem.fishStock).toBeLessThan(initialFish);
  });

  it('should allow recovery when harvest stops', () => {
    const depletedIsland = createTestIsland({ fishStock: 300 });

    const harvestData: HarvestData = { fish: 0, timber: 0 };
    const newEcosystem = updateEcology(depletedIsland, harvestData, config, noEvents, dt);

    expect(newEcosystem.fishStock).toBeGreaterThan(depletedIsland.ecosystem.fishStock);
  });

  it('should have impaired recovery in degraded state', () => {
    const healthyIsland = createTestIsland({ fishStock: 500 }); // stressed
    const degradedIsland = createTestIsland({ fishStock: 150 }); // degraded

    const harvestData: HarvestData = { fish: 0, timber: 0 };

    const healthyRecovery = updateEcology(healthyIsland, harvestData, config, noEvents, dt);
    const degradedRecovery = updateEcology(degradedIsland, harvestData, config, noEvents, dt);

    const healthyGain = healthyRecovery.fishStock - healthyIsland.ecosystem.fishStock;
    const degradedGain = degradedRecovery.fishStock - degradedIsland.ecosystem.fishStock;

    // Degraded should recover slower relative to its logistic potential
    // (accounting for different stock levels)
    expect(degradedGain / degradedIsland.ecosystem.fishStock).toBeLessThan(
      healthyGain / healthyIsland.ecosystem.fishStock
    );
  });
});

describe('Collapse Dynamics (Track 07)', () => {
  const config = DEFAULT_CONFIG;
  const noEvents: WorldEvent[] = [];
  const dt = 1;

  it('should have no production in dead zone', () => {
    const deadIsland = createTestIsland({ fishStock: 15 }); // 1.5% - dead

    const yieldMult = calculateYieldMultiplier(15, 1000, config);
    expect(yieldMult).toBe(0);

    const result = updateProduction(deadIsland, ['fish'], config, noEvents, dt);
    expect(result.produced.get('fish')).toBe(0);
  });

  it('should have no natural recovery in dead zone', () => {
    const deadIsland = createTestIsland({ fishStock: 10 }); // 1% - dead

    const harvestData: HarvestData = { fish: 0, timber: 0 };
    const newEcosystem = updateEcology(deadIsland, harvestData, config, noEvents, dt);

    // With deadRecoveryRate = 0, dead ecosystems don't recover
    expect(newEcosystem.fishStock).toBe(deadIsland.ecosystem.fishStock);
  });

  it('should show accelerating decline in degraded zone', () => {
    const at15 = calculateYieldMultiplier(150, 1000, config);
    const at20 = calculateYieldMultiplier(200, 1000, config);
    const at25 = calculateYieldMultiplier(250, 1000, config);

    // Due to quadratic curve, gain from 20->25 should be > gain from 15->20
    const gain1 = at20 - at15;
    const gain2 = at25 - at20;

    expect(gain2).toBeGreaterThan(gain1);
  });

  it('should have very slow recovery in collapsed state', () => {
    const collapsedIsland = createTestIsland({ fishStock: 50 }); // 5% - collapsed

    const harvestData: HarvestData = { fish: 0, timber: 0 };
    const newEcosystem = updateEcology(collapsedIsland, harvestData, config, noEvents, dt);

    // Should recover, but very slowly (10% of normal rate)
    const gain = newEcosystem.fishStock - collapsedIsland.ecosystem.fishStock;
    expect(gain).toBeGreaterThan(0);
    expect(gain).toBeLessThan(1); // Very small gain
  });
});

describe('Hysteresis (Track 07)', () => {
  const config = DEFAULT_CONFIG;

  it('should have different recovery rates for same stock level based on direction', () => {
    // This tests the concept - recovery multiplier is based on current state
    const at15percent = calculateRecoveryMultiplier(150, 1000, config);
    const at35percent = calculateRecoveryMultiplier(350, 1000, config);

    // 15% is degraded (impaired recovery)
    expect(at15percent).toBe(config.impairedRecoveryMultiplier);
    // 35% is stressed (normal recovery)
    expect(at35percent).toBe(1.0);
  });

  it('should take longer to recover than to degrade', () => {
    // Degradation: harvest reduces stock directly
    // Recovery: regeneration * recoveryMultiplier
    // In degraded state, recovery is at 50% rate, so recovery takes ~2x longer
    expect(config.impairedRecoveryMultiplier).toBeLessThan(1.0);
    expect(config.collapsedRecoveryMultiplier).toBeLessThan(config.impairedRecoveryMultiplier);
  });
});

describe('Harvest Efficiency', () => {
  const noEvents: WorldEvent[] = [];
  const dt = 1;

  it('should use harvest efficiency for ecosystem drain', () => {
    const perfectConfig = { ...DEFAULT_CONFIG, harvestEfficiency: 1.0 };
    const island = createTestIsland({ fishStock: 800 });

    const result = updateProduction(island, ['fish'], perfectConfig, noEvents, dt);

    const produced = result.produced.get('fish') ?? 0;
    const harvested = result.harvested.get('fish') ?? 0;

    expect(harvested).toBeCloseTo(produced, 5);
  });

  it('should drain more from ecosystem with lower efficiency', () => {
    const inefficientConfig = { ...DEFAULT_CONFIG, harvestEfficiency: 0.5 };
    const island = createTestIsland({ fishStock: 800 });

    const result = updateProduction(island, ['fish'], inefficientConfig, noEvents, dt);

    const produced = result.produced.get('fish') ?? 0;
    const harvested = result.harvested.get('fish') ?? 0;

    expect(harvested).toBeCloseTo(produced * 2, 5);
  });
});
