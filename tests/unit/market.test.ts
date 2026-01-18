/**
 * Market System Tests
 * Verify good-specific price elasticity (Track 05)
 */

import { describe, it, expect } from 'vitest';
import { updateMarket, getPriceBreakdown } from '../../src/systems/market.js';
import { DEFAULT_CONFIG, MVP_GOODS, createGoodsMap } from '../../src/core/world.js';
import type { IslandState, GoodDefinition, SimulationConfig } from '../../src/core/types.js';

/**
 * Create a test island with configurable inventory
 */
function createTestIsland(inventoryOverrides: Record<string, number> = {}): IslandState {
  const inventory = new Map<string, number>([
    ['fish', 100],
    ['grain', 100],
    ['timber', 100],
    ['tools', 100],
    ['luxuries', 100],
  ]);

  // Apply overrides
  for (const [goodId, amount] of Object.entries(inventoryOverrides)) {
    inventory.set(goodId, amount);
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
      labour: { fishing: 0.3, forestry: 0.2, farming: 0.2, industry: 0.15, services: 0.15 },
    },
    inventory,
    market: {
      prices: new Map([
        ['fish', 8],
        ['grain', 6],
        ['timber', 10],
        ['tools', 25],
        ['luxuries', 30],
      ]),
      idealStock: new Map([
        ['fish', 100],
        ['grain', 100],
        ['timber', 100],
        ['tools', 100],
        ['luxuries', 100],
      ]),
      momentum: new Map(),
      consumptionVelocity: new Map([
        ['fish', 1],
        ['grain', 1],
        ['timber', 1],
        ['tools', 1],
        ['luxuries', 1],
      ]),
    },
    productionParams: {
      baseRate: new Map(),
      toolSensitivity: new Map(),
      ecosystemSensitivity: new Map(),
    },
  };
}

describe('Good-Specific Price Elasticity (Track 05)', () => {
  const goods = createGoodsMap(MVP_GOODS);
  const config = DEFAULT_CONFIG;

  describe('elasticity configuration', () => {
    it('should have different elasticities for each category', () => {
      const { goodMarketConfigs } = config;

      expect(goodMarketConfigs.food.priceElasticity).toBeLessThan(
        goodMarketConfigs.luxury.priceElasticity
      );
      expect(goodMarketConfigs.material.priceElasticity).toBeLessThan(
        goodMarketConfigs.luxury.priceElasticity
      );
      expect(goodMarketConfigs.tool.priceElasticity).toBeLessThan(
        goodMarketConfigs.luxury.priceElasticity
      );
    });

    it('should have food with lowest elasticity (most stable)', () => {
      const { goodMarketConfigs } = config;

      expect(goodMarketConfigs.food.priceElasticity).toBeLessThanOrEqual(
        goodMarketConfigs.material.priceElasticity
      );
      expect(goodMarketConfigs.food.priceElasticity).toBeLessThanOrEqual(
        goodMarketConfigs.tool.priceElasticity
      );
    });

    it('should have luxury with highest elasticity (most volatile)', () => {
      const { goodMarketConfigs } = config;

      expect(goodMarketConfigs.luxury.priceElasticity).toBeGreaterThan(1.0);
    });
  });

  describe('price pressure calculation', () => {
    it('should show lower price change for food at 50% stock', () => {
      // 50% stock means idealStock/currentStock = 2
      // pressure = 2^elasticity
      // food (0.6): 2^0.6 ≈ 1.52
      // luxury (1.4): 2^1.4 ≈ 2.64

      const fishDef = goods.get('fish')!;
      const luxuryDef = goods.get('luxuries')!;

      const island = createTestIsland({
        fish: 50, // 50% of ideal
        luxuries: 50, // 50% of ideal
      });

      const fishBreakdown = getPriceBreakdown(island, 'fish', fishDef, [], config);
      const luxuryBreakdown = getPriceBreakdown(island, 'luxuries', luxuryDef, [], config);

      // Fish pressure should be lower than luxury pressure
      expect(fishBreakdown.pressure).toBeLessThan(luxuryBreakdown.pressure);

      // Verify approximate values
      expect(fishBreakdown.pressure).toBeCloseTo(Math.pow(2, 0.6), 1);
      expect(luxuryBreakdown.pressure).toBeCloseTo(Math.pow(2, 1.4), 1);
    });

    it('should show higher price change for luxury at 50% stock', () => {
      const fishDef = goods.get('fish')!;
      const luxuryDef = goods.get('luxuries')!;

      const island = createTestIsland({
        fish: 50,
        luxuries: 50,
      });

      const fishBreakdown = getPriceBreakdown(island, 'fish', fishDef, [], config);
      const luxuryBreakdown = getPriceBreakdown(island, 'luxuries', luxuryDef, [], config);

      // Luxury raw price should increase more than fish raw price
      // (relative to their base prices and same stock shortage)
      const fishPriceMultiplier = fishBreakdown.rawPrice / fishBreakdown.basePrice;
      const luxuryPriceMultiplier = luxuryBreakdown.rawPrice / luxuryBreakdown.basePrice;

      expect(luxuryPriceMultiplier).toBeGreaterThan(fishPriceMultiplier);
    });

    it('should have approximately equal prices at ideal stock', () => {
      const island = createTestIsland({
        fish: 100,
        luxuries: 100,
      });

      const fishDef = goods.get('fish')!;
      const luxuryDef = goods.get('luxuries')!;

      const fishBreakdown = getPriceBreakdown(island, 'fish', fishDef, [], config);
      const luxuryBreakdown = getPriceBreakdown(island, 'luxuries', luxuryDef, [], config);

      // At ideal stock, pressure should be ~1 for both
      expect(fishBreakdown.pressure).toBeCloseTo(1, 1);
      expect(luxuryBreakdown.pressure).toBeCloseTo(1, 1);
    });
  });

  describe('price response to supply shocks', () => {
    it('food prices should be more stable than luxury prices', () => {
      const island = createTestIsland();

      // Simulate severe shortage (25% of ideal stock)
      const shortageIsland = createTestIsland({
        fish: 25,
        luxuries: 25,
      });

      const fishDef = goods.get('fish')!;
      const luxuryDef = goods.get('luxuries')!;

      const normalFish = getPriceBreakdown(island, 'fish', fishDef, [], config);
      const shortageFish = getPriceBreakdown(shortageIsland, 'fish', fishDef, [], config);

      const normalLuxury = getPriceBreakdown(island, 'luxuries', luxuryDef, [], config);
      const shortageLuxury = getPriceBreakdown(shortageIsland, 'luxuries', luxuryDef, [], config);

      // Calculate price change ratio
      const fishPriceChange = shortageFish.rawPrice / normalFish.rawPrice;
      const luxuryPriceChange = shortageLuxury.rawPrice / normalLuxury.rawPrice;

      // Luxury should have much larger price change
      expect(luxuryPriceChange).toBeGreaterThan(fishPriceChange * 1.5);
    });

    it('material and tool prices should be between food and luxury', () => {
      const shortageIsland = createTestIsland({
        fish: 50,
        timber: 50,
        tools: 50,
        luxuries: 50,
      });

      const fishDef = goods.get('fish')!;
      const timberDef = goods.get('timber')!;
      const toolsDef = goods.get('tools')!;
      const luxuryDef = goods.get('luxuries')!;

      const fishBreakdown = getPriceBreakdown(shortageIsland, 'fish', fishDef, [], config);
      const timberBreakdown = getPriceBreakdown(shortageIsland, 'timber', timberDef, [], config);
      const toolsBreakdown = getPriceBreakdown(shortageIsland, 'tools', toolsDef, [], config);
      const luxuryBreakdown = getPriceBreakdown(shortageIsland, 'luxuries', luxuryDef, [], config);

      // Verify ordering: food < tool < material < luxury (based on elasticity)
      expect(fishBreakdown.pressure).toBeLessThan(toolsBreakdown.pressure);
      expect(toolsBreakdown.pressure).toBeLessThan(timberBreakdown.pressure);
      expect(timberBreakdown.pressure).toBeLessThan(luxuryBreakdown.pressure);
    });
  });

  describe('updateMarket with per-category elasticity', () => {
    it('should update prices using category-specific elasticity', () => {
      // Create island with shortage
      const island = createTestIsland({
        fish: 50,
        luxuries: 50,
      });

      const noConsumption = new Map<string, number>();
      const newMarket = updateMarket(island, goods, noConsumption, [], config, 1);

      // Get starting prices
      const startFishPrice = island.market.prices.get('fish')!;
      const startLuxuryPrice = island.market.prices.get('luxuries')!;

      // Get new prices
      const newFishPrice = newMarket.prices.get('fish')!;
      const newLuxuryPrice = newMarket.prices.get('luxuries')!;

      // Both should increase due to shortage
      expect(newFishPrice).toBeGreaterThan(startFishPrice);
      expect(newLuxuryPrice).toBeGreaterThan(startLuxuryPrice);

      // Luxury should increase more (higher elasticity)
      const fishIncrease = (newFishPrice - startFishPrice) / startFishPrice;
      const luxuryIncrease = (newLuxuryPrice - startLuxuryPrice) / startLuxuryPrice;

      expect(luxuryIncrease).toBeGreaterThan(fishIncrease);
    });

    it('should produce stable food prices over multiple ticks', () => {
      let island = createTestIsland({ fish: 80 }); // Slight shortage
      const noConsumption = new Map<string, number>();

      const priceHistory: number[] = [island.market.prices.get('fish')!];

      // Run multiple market updates
      for (let i = 0; i < 10; i++) {
        const newMarket = updateMarket(island, goods, noConsumption, [], config, 1);
        island = { ...island, market: newMarket };
        priceHistory.push(newMarket.prices.get('fish')!);
      }

      // Calculate volatility (standard deviation / mean)
      const mean = priceHistory.reduce((a, b) => a + b, 0) / priceHistory.length;
      const variance =
        priceHistory.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / priceHistory.length;
      const stdDev = Math.sqrt(variance);
      const volatility = stdDev / mean;

      // Food should have low volatility (stable prices)
      expect(volatility).toBeLessThan(0.2);
    });
  });

  describe('getPriceBreakdown with elasticity', () => {
    it('should include priceElasticity in breakdown', () => {
      const island = createTestIsland();
      const fishDef = goods.get('fish')!;

      const breakdown = getPriceBreakdown(island, 'fish', fishDef, [], config);

      expect(breakdown.priceElasticity).toBe(config.goodMarketConfigs.food.priceElasticity);
    });

    it('should show different elasticities for different goods', () => {
      const island = createTestIsland();
      const fishDef = goods.get('fish')!;
      const luxuryDef = goods.get('luxuries')!;

      const fishBreakdown = getPriceBreakdown(island, 'fish', fishDef, [], config);
      const luxuryBreakdown = getPriceBreakdown(island, 'luxuries', luxuryDef, [], config);

      expect(fishBreakdown.priceElasticity).toBe(0.6);
      expect(luxuryBreakdown.priceElasticity).toBe(1.4);
    });
  });

  describe('expected price changes at 50% stock (from spec)', () => {
    // From the spec: Price Response Comparison (50% stock reduction)
    // Fish: elasticity 0.6 → +52% (pressure = 2^0.6 ≈ 1.52)
    // Timber: elasticity 0.9 → +87% (pressure = 2^0.9 ≈ 1.87)
    // Tools: elasticity 0.8 → +74% (pressure = 2^0.8 ≈ 1.74)
    // Luxuries: elasticity 1.4 → +164% (pressure = 2^1.4 ≈ 2.64)

    it('should produce expected pressure values at 50% stock', () => {
      const island = createTestIsland({
        fish: 50,
        timber: 50,
        tools: 50,
        luxuries: 50,
      });

      const fishDef = goods.get('fish')!;
      const timberDef = goods.get('timber')!;
      const toolsDef = goods.get('tools')!;
      const luxuryDef = goods.get('luxuries')!;

      const fishBreakdown = getPriceBreakdown(island, 'fish', fishDef, [], config);
      const timberBreakdown = getPriceBreakdown(island, 'timber', timberDef, [], config);
      const toolsBreakdown = getPriceBreakdown(island, 'tools', toolsDef, [], config);
      const luxuryBreakdown = getPriceBreakdown(island, 'luxuries', luxuryDef, [], config);

      // pressure = (ideal/current)^elasticity = 2^elasticity
      expect(fishBreakdown.pressure).toBeCloseTo(Math.pow(2, 0.6), 2); // ~1.52
      expect(timberBreakdown.pressure).toBeCloseTo(Math.pow(2, 0.9), 2); // ~1.87
      expect(toolsBreakdown.pressure).toBeCloseTo(Math.pow(2, 0.8), 2); // ~1.74
      expect(luxuryBreakdown.pressure).toBeCloseTo(Math.pow(2, 1.4), 2); // ~2.64
    });
  });
});

describe('velocity coefficient by category', () => {
  const goods = createGoodsMap(MVP_GOODS);
  const config = DEFAULT_CONFIG;

  it('should have different velocity coefficients per category', () => {
    const { goodMarketConfigs } = config;

    // Luxury should be most sensitive to consumption velocity
    expect(goodMarketConfigs.luxury.velocityCoefficient).toBeGreaterThan(
      goodMarketConfigs.tool.velocityCoefficient
    );
  });
});
