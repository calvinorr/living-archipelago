# Track: Good-Specific Price Elasticity

**Priority:** High
**Status:** Planning
**Estimated Complexity:** Medium
**Files Affected:** `src/systems/market.ts`, `src/core/types.ts`, `src/core/world.ts`

---

## Problem Statement

All goods currently use **identical price elasticity** (gamma = 1.5):

```typescript
// market.ts - current
const pressure = Math.pow(idealStock / currentStock, config.priceGamma);
// Same gamma for Fish, Grain, Timber, Tools, Luxuries
```

This ignores fundamental economic differences:
- Essential goods (food) should have **lower** elasticity (prices more stable)
- Luxury goods should have **higher** elasticity (prices more volatile)
- Perishables vs. durables behave differently

---

## Current Implementation

```typescript
// market.ts
const pressure = Math.pow(idealStock / currentStock, config.priceGamma);
// priceGamma = 1.5 for all goods

// world.ts - config
priceGamma: 1.5,  // Single value for all goods
```

---

## Design

### Economic Rationale

| Good Category | Economic Behavior | Target Elasticity |
|---------------|-------------------|-------------------|
| Food (essential) | Demand stable regardless of price | 0.5-0.7 |
| Material | Moderate substitution | 0.8-1.0 |
| Tool (capital) | Investment-driven, somewhat elastic | 0.7-0.9 |
| Luxury | Highly discretionary | 1.3-1.5 |

### Per-Good Configuration

Move from single `priceGamma` to per-category or per-good elasticity:

```typescript
interface GoodPriceConfig {
  priceElasticity: number;  // Inventory-pressure exponent
  velocityK: number;        // Consumption velocity coefficient
  idealStockMultiplier: number;  // How much stock to target (relative to consumption)
}
```

---

## Specification

### New Types

```typescript
// types.ts additions
interface GoodMarketConfig {
  priceElasticity: number;      // Inventory pressure exponent
  velocityCoefficient: number;  // Consumption velocity sensitivity
  idealStockDays: number;       // Days of consumption to target as ideal stock
}

interface MarketConfig {
  // Remove: priceGamma (global)
  // Add: per-category defaults
  goodConfigs: Record<GoodCategory, GoodMarketConfig>;
  priceLambda: number;          // EMA smoothing (keep global)
  minPrice: number;             // Keep global
  maxPrice: number;             // Keep global
}

// Default configurations
const DEFAULT_GOOD_MARKET_CONFIGS: Record<GoodCategory, GoodMarketConfig> = {
  food: {
    priceElasticity: 0.6,
    velocityCoefficient: 0.4,
    idealStockDays: 7,
  },
  material: {
    priceElasticity: 0.9,
    velocityCoefficient: 0.3,
    idealStockDays: 14,
  },
  tool: {
    priceElasticity: 0.8,
    velocityCoefficient: 0.2,
    idealStockDays: 30,
  },
  luxury: {
    priceElasticity: 1.4,
    velocityCoefficient: 0.5,
    idealStockDays: 21,
  },
};
```

### Updated Price Calculation

```typescript
// market.ts - updated pressure calculation
function calculatePricePressure(
  currentStock: number,
  good: GoodDefinition,
  island: IslandState,
  config: MarketConfig
): number {
  const goodConfig = config.goodConfigs[good.category];

  // Calculate ideal stock based on consumption rate
  const consumptionRate = getConsumptionRate(good.id, island);
  const idealStock = consumptionRate * goodConfig.idealStockDays * 24; // Convert days to hours

  // Apply category-specific elasticity
  const stockRatio = idealStock / Math.max(currentStock, 0.1); // Prevent division by zero
  const pressure = Math.pow(stockRatio, goodConfig.priceElasticity);

  return pressure;
}

function calculatePriceVelocity(
  currentVelocity: number,
  referenceVelocity: number,
  good: GoodDefinition,
  config: MarketConfig
): number {
  const goodConfig = config.goodConfigs[good.category];
  const velocityRatio = currentVelocity / Math.max(referenceVelocity, 0.1);

  return 1 + goodConfig.velocityCoefficient * (velocityRatio - 1);
}
```

### Ideal Stock Calculation

Currently, ideal stock is a fixed config value. Make it dynamic based on consumption:

```typescript
// market.ts - dynamic ideal stock
function calculateIdealStock(
  good: GoodDefinition,
  island: IslandState,
  config: MarketConfig
): number {
  const goodConfig = config.goodConfigs[good.category];

  // Estimate daily consumption
  let dailyConsumption: number;
  if (good.category === 'food') {
    dailyConsumption = island.population.size * config.foodPerCapita * 24;
  } else if (good.category === 'luxury') {
    dailyConsumption = island.population.size * 0.01 * 24; // 1% of pop per hour
  } else {
    // Materials and tools: based on production needs (simplified)
    dailyConsumption = island.population.size * 0.005 * 24;
  }

  return dailyConsumption * goodConfig.idealStockDays;
}
```

---

## Implementation Plan

### Phase 1: Restructure Config
- [ ] Create `GoodMarketConfig` interface
- [ ] Add `goodConfigs` to `MarketConfig`
- [ ] Remove global `priceGamma`
- [ ] Update `createDefaultConfig()` with category defaults

### Phase 2: Update Price Pressure
- [ ] Modify `calculatePricePressure()` to use per-category elasticity
- [ ] Ensure pressure calculation handles edge cases (zero stock)

### Phase 3: Update Velocity Calculation
- [ ] Modify velocity calculation to use per-category coefficient
- [ ] Test velocity response to consumption spikes

### Phase 4: Dynamic Ideal Stock
- [ ] Implement `calculateIdealStock()` based on consumption
- [ ] Replace hardcoded `idealStock` in market state initialization
- [ ] Update ideal stock periodically (not just at init)

### Phase 5: Testing
- [ ] Unit test: food prices less volatile than luxury prices
- [ ] Unit test: same supply shock causes different price changes per category
- [ ] Unit test: ideal stock scales with population
- [ ] Integration test: market stability improved for essentials
- [ ] Determinism test

### Phase 6: Tuning
- [ ] Run simulations with various elasticity values
- [ ] Compare price volatility across goods
- [ ] Document recommended parameter ranges

---

## Behavioral Changes Expected

| Scenario | Before | After |
|----------|--------|-------|
| 50% fish stock | Price +89% | Price +32% (lower elasticity) |
| 50% luxury stock | Price +89% | Price +132% (higher elasticity) |
| Food shortage | High volatility | More stable prices |
| Luxury surplus | Moderate price drop | Larger price drop |

### Price Response Comparison (50% stock reduction)

| Good | Elasticity | Price Change |
|------|------------|--------------|
| Fish | 0.6 | +52% |
| Grain | 0.6 | +52% |
| Timber | 0.9 | +87% |
| Tools | 0.8 | +74% |
| Luxuries | 1.4 | +164% |

---

## Configuration Recommendations

### Conservative (Stable Markets)

```typescript
food: { priceElasticity: 0.5, ... },
material: { priceElasticity: 0.7, ... },
tool: { priceElasticity: 0.6, ... },
luxury: { priceElasticity: 1.0, ... },
```

### Balanced (Recommended)

```typescript
food: { priceElasticity: 0.6, ... },
material: { priceElasticity: 0.9, ... },
tool: { priceElasticity: 0.8, ... },
luxury: { priceElasticity: 1.4, ... },
```

### Volatile (Dynamic Markets)

```typescript
food: { priceElasticity: 0.8, ... },
material: { priceElasticity: 1.1, ... },
tool: { priceElasticity: 1.0, ... },
luxury: { priceElasticity: 1.8, ... },
```

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Food prices too stable | Increase food elasticity if needed |
| Luxury prices explode | Cap at maxPrice; consider smoothing |
| Breaking change for existing configs | Provide migration path from global gamma |
| Complexity increase | Good abstraction makes it manageable |

---

## Success Criteria

1. Food prices vary less than luxury prices for equivalent supply shocks
2. Market volatility differentiated by good category
3. Traders still find arbitrage opportunities
4. No price explosions or collapses
5. Economic behavior feels more realistic
6. All tests pass including determinism
