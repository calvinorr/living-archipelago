/**
 * Population System Tests
 * Verify population growth rate calculations (Track 04)
 * Verify wage-based labor allocation (Track 06)
 */

import { describe, it, expect } from 'vitest';
import {
  calculateGrowthMultiplier,
  calculateSectorWages,
  updatePopulation,
  getLaborMarketIndicators,
} from '../../src/systems/population.js';
import { DEFAULT_CONFIG, SECTORS } from '../../src/core/world.js';
import type { IslandState, Sector } from '../../src/core/types.js';

describe('calculateGrowthMultiplier', () => {
  const config = DEFAULT_CONFIG;

  describe('threshold boundaries', () => {
    it('should return -1.0 at crisis health (0.3)', () => {
      const multiplier = calculateGrowthMultiplier(0.3, config);
      expect(multiplier).toBe(-1.0);
    });

    it('should return -1.0 below crisis health', () => {
      expect(calculateGrowthMultiplier(0.0, config)).toBe(-1.0);
      expect(calculateGrowthMultiplier(0.1, config)).toBe(-1.0);
      expect(calculateGrowthMultiplier(0.2, config)).toBe(-1.0);
    });

    it('should return 0.0 at stable health (0.5)', () => {
      const multiplier = calculateGrowthMultiplier(0.5, config);
      expect(multiplier).toBe(0.0);
    });

    it('should return 1.0 at optimal health (0.9)', () => {
      const multiplier = calculateGrowthMultiplier(0.9, config);
      expect(multiplier).toBe(1.0);
    });

    it('should return 1.0 above optimal health', () => {
      expect(calculateGrowthMultiplier(0.95, config)).toBe(1.0);
      expect(calculateGrowthMultiplier(1.0, config)).toBe(1.0);
    });
  });

  describe('interpolation between thresholds', () => {
    it('should interpolate linearly between crisis (0.3) and stable (0.5)', () => {
      // At 0.4 (midpoint between 0.3 and 0.5), should be -0.5
      const multiplier = calculateGrowthMultiplier(0.4, config);
      expect(multiplier).toBeCloseTo(-0.5, 5);
    });

    it('should interpolate linearly between stable (0.5) and optimal (0.9)', () => {
      // At 0.7 (midpoint between 0.5 and 0.9), should be 0.5
      const multiplier = calculateGrowthMultiplier(0.7, config);
      expect(multiplier).toBeCloseTo(0.5, 5);
    });

    it('should produce continuous values with no jumps', () => {
      // Test that small changes in health produce small changes in multiplier
      const step = 0.01;
      for (let h = 0.1; h < 1.0; h += step) {
        const m1 = calculateGrowthMultiplier(h, config);
        const m2 = calculateGrowthMultiplier(h + step, config);
        // Change in multiplier should be small (no jumps)
        expect(Math.abs(m2 - m1)).toBeLessThan(0.15);
      }
    });
  });

  describe('curve shape', () => {
    it('should be monotonically increasing', () => {
      let prev = calculateGrowthMultiplier(0.0, config);
      for (let h = 0.05; h <= 1.0; h += 0.05) {
        const current = calculateGrowthMultiplier(h, config);
        expect(current).toBeGreaterThanOrEqual(prev);
        prev = current;
      }
    });

    it('should range from -1 to +1', () => {
      for (let h = 0.0; h <= 1.0; h += 0.1) {
        const multiplier = calculateGrowthMultiplier(h, config);
        expect(multiplier).toBeGreaterThanOrEqual(-1.0);
        expect(multiplier).toBeLessThanOrEqual(1.0);
      }
    });
  });
});

describe('Population Growth Rates', () => {
  const config = DEFAULT_CONFIG;
  const HOURS_PER_YEAR = 8760;

  /**
   * Calculate effective annual growth rate from multiplier
   */
  function calculateAnnualRate(multiplier: number): number {
    if (multiplier >= 0) {
      return config.maxGrowthRate * multiplier;
    } else {
      return config.maxDeclineRate * multiplier;
    }
  }

  /**
   * Simulate population change over one year (8760 hours)
   */
  function simulateYear(initialPop: number, health: number): number {
    const multiplier = calculateGrowthMultiplier(health, config);
    const annualRate = calculateAnnualRate(multiplier);
    const hourlyRate = Math.pow(1 + annualRate, 1 / HOURS_PER_YEAR) - 1;

    let pop = initialPop;
    for (let hour = 0; hour < HOURS_PER_YEAR; hour++) {
      pop = pop * (1 + hourlyRate);
    }
    return pop;
  }

  it('should produce ~0.5% annual growth at optimal health', () => {
    const initialPop = 1000;
    const finalPop = simulateYear(initialPop, 1.0);
    const growthRate = (finalPop - initialPop) / initialPop;

    // Should be approximately 0.5% (0.005)
    expect(growthRate).toBeCloseTo(0.005, 3);
  });

  it('should produce stable population at health = 0.5', () => {
    const initialPop = 1000;
    const finalPop = simulateYear(initialPop, 0.5);
    const growthRate = (finalPop - initialPop) / initialPop;

    // Should be approximately 0%
    expect(growthRate).toBeCloseTo(0, 5);
  });

  it('should produce ~2% annual decline at crisis health', () => {
    const initialPop = 1000;
    const finalPop = simulateYear(initialPop, 0.2); // Below crisis threshold

    const declineRate = (initialPop - finalPop) / initialPop;

    // Should be approximately 2% (0.02)
    expect(declineRate).toBeCloseTo(0.02, 3);
  });

  it('should take ~140 years to double population at optimal health', () => {
    // Doubling time = ln(2) / ln(1 + rate) ≈ 0.693 / 0.005 ≈ 139 years
    const doublingTime = Math.log(2) / Math.log(1 + config.maxGrowthRate);
    expect(doublingTime).toBeGreaterThan(130);
    expect(doublingTime).toBeLessThan(150);
  });

  it('should produce slower growth than before (was ~140% annual)', () => {
    // Old rate: 0.0001 per hour = (1.0001)^8760 - 1 ≈ 1.40 (140% annual)
    // New rate: 0.5% annual at optimal
    const initialPop = 1000;
    const finalPop = simulateYear(initialPop, 1.0);
    const growthRate = (finalPop - initialPop) / initialPop;

    // Should be WAY less than 140%
    expect(growthRate).toBeLessThan(0.01);
    // But still positive
    expect(growthRate).toBeGreaterThan(0);
  });
});

describe('Population Growth Edge Cases', () => {
  const config = DEFAULT_CONFIG;

  it('should handle health exactly at 0', () => {
    const multiplier = calculateGrowthMultiplier(0, config);
    expect(multiplier).toBe(-1.0);
    expect(Number.isFinite(multiplier)).toBe(true);
  });

  it('should handle health exactly at 1', () => {
    const multiplier = calculateGrowthMultiplier(1.0, config);
    expect(multiplier).toBe(1.0);
    expect(Number.isFinite(multiplier)).toBe(true);
  });

  it('should handle health slightly above thresholds', () => {
    const epsilon = 0.0001;

    // Just above crisis
    const aboveCrisis = calculateGrowthMultiplier(
      config.crisisHealthThreshold + epsilon,
      config
    );
    expect(aboveCrisis).toBeGreaterThan(-1.0);

    // Just above stable
    const aboveStable = calculateGrowthMultiplier(
      config.stableHealthThreshold + epsilon,
      config
    );
    expect(aboveStable).toBeGreaterThan(0);
  });
});

/**
 * Create a test island for wage-based labor tests
 */
function createWageTestIsland(priceOverrides: Record<string, number> = {}): IslandState {
  const prices = new Map<string, number>([
    ['fish', 10],
    ['grain', 8],
    ['timber', 12],
    ['tools', 25],
    ['luxuries', 30],
  ]);

  // Apply price overrides
  for (const [goodId, price] of Object.entries(priceOverrides)) {
    prices.set(goodId, price);
  }

  return {
    id: 'test-island',
    name: 'Test Island',
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
      labour: {
        fishing: 0.20,
        forestry: 0.15,
        farming: 0.25,
        industry: 0.15,
        services: 0.25,
      },
    },
    inventory: new Map([
      ['fish', 100],
      ['grain', 100],
      ['timber', 100],
      ['tools', 50],
      ['luxuries', 30],
    ]),
    market: {
      prices,
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
      ecosystemSensitivity: new Map(),
    },
  };
}

describe('Wage-Based Labor Allocation (Track 06)', () => {
  const config = DEFAULT_CONFIG;

  describe('calculateSectorWages', () => {
    it('should calculate wages for all sectors', () => {
      const island = createWageTestIsland();
      const wages = calculateSectorWages(island, config);

      for (const sector of SECTORS) {
        expect(wages[sector]).toBeGreaterThan(0);
        expect(Number.isFinite(wages[sector])).toBe(true);
      }
    });

    it('should increase fishing wage when fish price increases', () => {
      const normalIsland = createWageTestIsland({ fish: 10 });
      const highPriceIsland = createWageTestIsland({ fish: 20 });

      const normalWages = calculateSectorWages(normalIsland, config);
      const highPriceWages = calculateSectorWages(highPriceIsland, config);

      expect(highPriceWages.fishing).toBeGreaterThan(normalWages.fishing);
    });

    it('should increase forestry wage when timber price increases', () => {
      const normalIsland = createWageTestIsland({ timber: 12 });
      const highPriceIsland = createWageTestIsland({ timber: 24 });

      const normalWages = calculateSectorWages(normalIsland, config);
      const highPriceWages = calculateSectorWages(highPriceIsland, config);

      expect(highPriceWages.forestry).toBeGreaterThan(normalWages.forestry);
    });

    it('should increase industry wage when tools price increases', () => {
      const normalIsland = createWageTestIsland({ tools: 25 });
      const highPriceIsland = createWageTestIsland({ tools: 50 });

      const normalWages = calculateSectorWages(normalIsland, config);
      const highPriceWages = calculateSectorWages(highPriceIsland, config);

      expect(highPriceWages.industry).toBeGreaterThan(normalWages.industry);
    });
  });

  describe('labor reallocation response to prices', () => {
    it('should shift labor toward high-wage sectors over time', () => {
      // Create island with very high fish price
      const island = createWageTestIsland({ fish: 100 }); // 10x normal price

      const initialLabor = { ...island.population.labour };

      // Simulate multiple ticks
      let currentIsland = island;
      for (let i = 0; i < 100; i++) {
        const newPop = updatePopulation(
          currentIsland,
          { foodDeficit: 0, foodConsumed: 10, luxuryConsumed: 1, newInventory: currentIsland.inventory },
          config,
          1
        );
        currentIsland = { ...currentIsland, population: newPop };
      }

      // Fishing labor should have increased
      expect(currentIsland.population.labour.fishing).toBeGreaterThan(initialLabor.fishing);
    });

    it('should not exceed maxSectorShare', () => {
      // Create island with extremely high fish price
      const island = createWageTestIsland({ fish: 1000 });

      // Simulate many ticks
      let currentIsland = island;
      for (let i = 0; i < 1000; i++) {
        const newPop = updatePopulation(
          currentIsland,
          { foodDeficit: 0, foodConsumed: 10, luxuryConsumed: 1, newInventory: currentIsland.inventory },
          config,
          1
        );
        currentIsland = { ...currentIsland, population: newPop };
      }

      // No sector should exceed maxSectorShare
      for (const sector of SECTORS) {
        expect(currentIsland.population.labour[sector]).toBeLessThanOrEqual(
          config.laborConfig.maxSectorShare + 0.01 // Small tolerance for floating point
        );
      }
    });

    it('should not go below minSectorShare', () => {
      // Create island with very low prices for one good
      const island = createWageTestIsland({ timber: 0.1 });

      // Simulate many ticks
      let currentIsland = island;
      for (let i = 0; i < 1000; i++) {
        const newPop = updatePopulation(
          currentIsland,
          { foodDeficit: 0, foodConsumed: 10, luxuryConsumed: 1, newInventory: currentIsland.inventory },
          config,
          1
        );
        currentIsland = { ...currentIsland, population: newPop };
      }

      // No sector should go below minSectorShare
      for (const sector of SECTORS) {
        expect(currentIsland.population.labour[sector]).toBeGreaterThanOrEqual(
          config.laborConfig.minSectorShare - 0.01 // Small tolerance
        );
      }
    });

    it('should maintain labor shares summing to 1', () => {
      const island = createWageTestIsland({ fish: 50, timber: 5 });

      let currentIsland = island;
      for (let i = 0; i < 100; i++) {
        const newPop = updatePopulation(
          currentIsland,
          { foodDeficit: 0, foodConsumed: 10, luxuryConsumed: 1, newInventory: currentIsland.inventory },
          config,
          1
        );

        // Check sum = 1 (with small tolerance for floating point)
        const sum = SECTORS.reduce((s, sector) => s + newPop.labour[sector], 0);
        expect(sum).toBeCloseTo(1.0, 3);

        currentIsland = { ...currentIsland, population: newPop };
      }
    });
  });

  describe('getLaborMarketIndicators', () => {
    it('should identify highest wage sector', () => {
      const island = createWageTestIsland({ fish: 100 }); // Very high fish price

      const indicators = getLaborMarketIndicators(island, config);

      expect(indicators.highestWageSector).toBe('fishing');
    });

    it('should calculate wage spread', () => {
      const island = createWageTestIsland();

      const indicators = getLaborMarketIndicators(island, config);

      expect(indicators.wageSpread).toBeGreaterThan(0);
      expect(Number.isFinite(indicators.wageSpread)).toBe(true);
    });
  });

  describe('industry and services responsiveness', () => {
    it('should increase industry labor when tools price rises', () => {
      const island = createWageTestIsland({ tools: 100 }); // High tools price
      const initialIndustry = island.population.labour.industry;

      // Simulate ticks
      let currentIsland = island;
      for (let i = 0; i < 50; i++) {
        const newPop = updatePopulation(
          currentIsland,
          { foodDeficit: 0, foodConsumed: 10, luxuryConsumed: 1, newInventory: currentIsland.inventory },
          config,
          1
        );
        currentIsland = { ...currentIsland, population: newPop };
      }

      // Industry should have increased (no longer fixed at 10%)
      expect(currentIsland.population.labour.industry).toBeGreaterThan(initialIndustry);
    });
  });
});

describe('Wage Calculation Edge Cases', () => {
  const config = DEFAULT_CONFIG;

  it('should handle zero labor share gracefully', () => {
    const island = createWageTestIsland();
    island.population.labour.forestry = 0.001; // Nearly zero

    const wages = calculateSectorWages(island, config);

    expect(Number.isFinite(wages.forestry)).toBe(true);
    expect(wages.forestry).toBeGreaterThan(0);
  });

  it('should handle very small population', () => {
    const island = createWageTestIsland();
    island.population.size = 10;

    const wages = calculateSectorWages(island, config);

    for (const sector of SECTORS) {
      expect(Number.isFinite(wages[sector])).toBe(true);
    }
  });
});
