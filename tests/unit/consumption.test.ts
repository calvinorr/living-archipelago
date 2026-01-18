/**
 * Consumption System Tests
 * Verify price-elastic demand calculations (Track 01)
 */

import { describe, it, expect } from 'vitest';
import { calculateFoodDemand, updateConsumption } from '../../src/systems/consumption.js';
import { DEFAULT_CONFIG } from '../../src/core/world.js';
import type { IslandState, WorldEvent } from '../../src/core/types.js';

/**
 * Create a minimal island state for testing
 */
function createTestIsland(overrides: Partial<{
  populationSize: number;
  health: number;
  grainPrice: number;
  fishPrice: number;
  luxuryPrice: number;
  grainStock: number;
  fishStock: number;
  luxuryStock: number;
}> = {}): IslandState {
  const {
    populationSize = 1000,
    health = 1.0,
    grainPrice = 6, // base price
    fishPrice = 8, // base price
    luxuryPrice = 30, // base price
    grainStock = 500,
    fishStock = 500,
    luxuryStock = 100,
  } = overrides;

  return {
    id: 'test-island',
    name: 'Test Island',
    position: { x: 0, y: 0 },
    ecosystem: {
      fishStock: 500,
      forestBiomass: 500,
      soilFertility: 0.8,
    },
    ecosystemParams: {
      fishCapacity: 1000,
      fishRegenRate: 0.05,
      forestCapacity: 1000,
      forestRegenRate: 0.03,
      soilRegenBase: 0.01,
      soilDepletionRate: 0.01,
    },
    population: {
      size: populationSize,
      health,
      labour: { fishing: 0.2, forestry: 0.2, farming: 0.2, industry: 0.2, services: 0.2 },
    },
    inventory: new Map([
      ['grain', grainStock],
      ['fish', fishStock],
      ['luxuries', luxuryStock],
      ['timber', 100],
      ['tools', 50],
    ]),
    market: {
      prices: new Map([
        ['grain', grainPrice],
        ['fish', fishPrice],
        ['luxuries', luxuryPrice],
        ['timber', 10],
        ['tools', 25],
      ]),
      idealStock: new Map(),
      momentum: new Map(),
      consumptionVelocity: new Map(),
    },
    productionParams: {
      baseRate: new Map(),
      toolSensitivity: new Map(),
      ecosystemSensitivity: new Map(),
    },
  };
}

describe('calculateFoodDemand', () => {
  const config = DEFAULT_CONFIG;
  const noEvents: WorldEvent[] = [];
  const dt = 1; // 1 hour

  describe('base demand calculation', () => {
    it('should calculate base demand proportional to population', () => {
      const island1 = createTestIsland({ populationSize: 1000 });
      const island2 = createTestIsland({ populationSize: 2000 });

      const demand1 = calculateFoodDemand(island1, config, noEvents, dt);
      const demand2 = calculateFoodDemand(island2, config, noEvents, dt);

      // Double population should roughly double demand
      expect(demand2.totalDemand).toBeCloseTo(demand1.totalDemand * 2, 1);
    });

    it('should produce positive demand for healthy population', () => {
      const island = createTestIsland({ populationSize: 1000, health: 1.0 });
      const demand = calculateFoodDemand(island, config, noEvents, dt);

      expect(demand.totalDemand).toBeGreaterThan(0);
      expect(demand.grainDemand).toBeGreaterThan(0);
      expect(demand.fishDemand).toBeGreaterThan(0);
    });
  });

  describe('health factor', () => {
    it('should reduce demand when population health is low', () => {
      const healthyIsland = createTestIsland({ health: 1.0 });
      const sickIsland = createTestIsland({ health: 0.0 });

      const healthyDemand = calculateFoodDemand(healthyIsland, config, noEvents, dt);
      const sickDemand = calculateFoodDemand(sickIsland, config, noEvents, dt);

      // Sick population should consume less (rationing)
      expect(sickDemand.totalDemand).toBeLessThan(healthyDemand.totalDemand);
    });

    it('should reduce demand by healthConsumptionFactor at 0 health', () => {
      const healthyIsland = createTestIsland({ health: 1.0 });
      const sickIsland = createTestIsland({ health: 0.0 });

      const healthyDemand = calculateFoodDemand(healthyIsland, config, noEvents, dt);
      const sickDemand = calculateFoodDemand(sickIsland, config, noEvents, dt);

      // At 0 health, demand should be (1 - healthConsumptionFactor) of full demand
      // Default healthConsumptionFactor = 0.3, so sick demand ≈ 0.7 * healthy
      const expectedRatio = 1 - config.healthConsumptionFactor;
      const actualRatio = sickDemand.totalDemand / healthyDemand.totalDemand;

      expect(actualRatio).toBeCloseTo(expectedRatio, 2);
    });
  });

  describe('price elasticity', () => {
    it('should reduce grain demand when grain price increases', () => {
      const normalIsland = createTestIsland({ grainPrice: 6 }); // base price
      const expensiveIsland = createTestIsland({ grainPrice: 12 }); // 2x base price

      const normalDemand = calculateFoodDemand(normalIsland, config, noEvents, dt);
      const expensiveDemand = calculateFoodDemand(expensiveIsland, config, noEvents, dt);

      // Higher grain price should reduce grain demand
      expect(expensiveDemand.grainDemand).toBeLessThan(normalDemand.grainDemand);
    });

    it('should reduce fish demand when fish price increases', () => {
      const normalIsland = createTestIsland({ fishPrice: 8 }); // base price
      const expensiveIsland = createTestIsland({ fishPrice: 16 }); // 2x base price

      const normalDemand = calculateFoodDemand(normalIsland, config, noEvents, dt);
      const expensiveDemand = calculateFoodDemand(expensiveIsland, config, noEvents, dt);

      // Higher fish price should reduce fish demand
      expect(expensiveDemand.fishDemand).toBeLessThan(normalDemand.fishDemand);
    });

    it('should have moderate elasticity for food (not too responsive)', () => {
      const normalIsland = createTestIsland({ grainPrice: 6 });
      const doubledIsland = createTestIsland({ grainPrice: 12 }); // 2x price

      const normalDemand = calculateFoodDemand(normalIsland, config, noEvents, dt);
      const doubledDemand = calculateFoodDemand(doubledIsland, config, noEvents, dt);

      // With elasticity of -0.3, doubling price should reduce demand to ~0.81x
      // (2^-0.3 ≈ 0.812)
      const expectedReduction = Math.pow(2, config.foodPriceElasticity);
      const actualRatio = doubledDemand.grainDemand / normalDemand.grainDemand;

      // Allow for substitution effects to slightly modify this
      expect(actualRatio).toBeGreaterThan(expectedReduction * 0.8);
      expect(actualRatio).toBeLessThan(1.0);
    });
  });

  describe('food substitution', () => {
    it('should increase grain share when fish is expensive', () => {
      // Fish at 2x base, grain at base
      const island = createTestIsland({ fishPrice: 16, grainPrice: 6 });
      const demand = calculateFoodDemand(island, config, noEvents, dt);

      // Grain should be more than half of total (substitution toward cheaper food)
      expect(demand.grainDemand).toBeGreaterThan(demand.fishDemand);
    });

    it('should increase fish share when grain is expensive', () => {
      // Grain at 2x base, fish at base
      const island = createTestIsland({ grainPrice: 12, fishPrice: 8 });
      const demand = calculateFoodDemand(island, config, noEvents, dt);

      // Fish should be more than half of total (substitution toward cheaper food)
      expect(demand.fishDemand).toBeGreaterThan(demand.grainDemand);
    });

    it('should have roughly equal shares at base prices', () => {
      const island = createTestIsland({ grainPrice: 6, fishPrice: 8 }); // base prices
      const demand = calculateFoodDemand(island, config, noEvents, dt);

      // Shares should be roughly equal (within bounds)
      const grainShare = demand.grainDemand / demand.totalDemand;
      expect(grainShare).toBeGreaterThan(0.3);
      expect(grainShare).toBeLessThan(0.7);
    });
  });
});

describe('updateConsumption', () => {
  const config = DEFAULT_CONFIG;
  const noEvents: WorldEvent[] = [];
  const dt = 1;

  it('should reduce inventory when consuming food', () => {
    const island = createTestIsland({ grainStock: 500, fishStock: 500 });
    const initialGrain = island.inventory.get('grain')!;
    const initialFish = island.inventory.get('fish')!;

    const result = updateConsumption(island, config, noEvents, dt);

    const finalGrain = result.newInventory.get('grain')!;
    const finalFish = result.newInventory.get('fish')!;

    expect(finalGrain).toBeLessThan(initialGrain);
    expect(finalFish).toBeLessThan(initialFish);
    expect(result.foodConsumed).toBeGreaterThan(0);
  });

  it('should report deficit when food is insufficient', () => {
    const island = createTestIsland({
      populationSize: 10000,
      grainStock: 10,
      fishStock: 10,
    });

    const result = updateConsumption(island, config, noEvents, dt);

    expect(result.foodDeficit).toBeGreaterThan(0);
    expect(result.foodConsumed).toBeLessThanOrEqual(20); // Max available
  });

  it('should consume luxuries when available', () => {
    const island = createTestIsland({ luxuryStock: 100 });
    const initialLuxuries = island.inventory.get('luxuries')!;

    const result = updateConsumption(island, config, noEvents, dt);

    const finalLuxuries = result.newInventory.get('luxuries')!;
    expect(finalLuxuries).toBeLessThan(initialLuxuries);
    expect(result.luxuryConsumed).toBeGreaterThan(0);
  });

  it('should reduce luxury consumption when prices are high', () => {
    const normalIsland = createTestIsland({ luxuryPrice: 30 });
    const expensiveIsland = createTestIsland({ luxuryPrice: 90 }); // 3x price

    const normalResult = updateConsumption(normalIsland, config, noEvents, dt);
    const expensiveResult = updateConsumption(expensiveIsland, config, noEvents, dt);

    // Higher luxury prices should reduce luxury consumption
    expect(expensiveResult.luxuryConsumed).toBeLessThan(normalResult.luxuryConsumed);
  });

  it('should substitute food when one type is unavailable', () => {
    // Only grain available
    const grainOnlyIsland = createTestIsland({ grainStock: 500, fishStock: 0 });
    const result = updateConsumption(grainOnlyIsland, config, noEvents, dt);

    // Should still consume food (from grain)
    expect(result.foodConsumed).toBeGreaterThan(0);
    // Deficit should be less than total demand (substitution helped)
    const demand = calculateFoodDemand(grainOnlyIsland, config, noEvents, dt);
    expect(result.foodDeficit).toBeLessThan(demand.totalDemand);
  });
});

describe('Price Elasticity Behavior', () => {
  const config = DEFAULT_CONFIG;
  const noEvents: WorldEvent[] = [];
  const dt = 1;

  it('should create market feedback loop: high prices reduce demand', () => {
    // Simulate price shock scenario
    const normalIsland = createTestIsland({ grainPrice: 6, fishPrice: 8 });
    const shockIsland = createTestIsland({ grainPrice: 15, fishPrice: 20 }); // ~2.5x prices

    const normalDemand = calculateFoodDemand(normalIsland, config, noEvents, dt);
    const shockDemand = calculateFoodDemand(shockIsland, config, noEvents, dt);

    // Demand should drop significantly but not collapse
    const demandRatio = shockDemand.totalDemand / normalDemand.totalDemand;
    expect(demandRatio).toBeLessThan(1.0); // Demand reduced
    expect(demandRatio).toBeGreaterThan(0.5); // But not collapsed (food is inelastic)
  });

  it('should make luxuries highly price-responsive', () => {
    const normalIsland = createTestIsland({ luxuryPrice: 30 });
    const expensiveIsland = createTestIsland({ luxuryPrice: 60 }); // 2x price

    const normalResult = updateConsumption(normalIsland, config, noEvents, 1);
    const expensiveResult = updateConsumption(expensiveIsland, config, noEvents, 1);

    // Luxury demand should drop more than food would
    // With elasticity of -1.2, doubling price reduces demand to ~0.43x
    const luxuryRatio = expensiveResult.luxuryConsumed / normalResult.luxuryConsumed;
    expect(luxuryRatio).toBeLessThan(0.6);
  });
});
