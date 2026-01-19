# Track: Price-Elastic Demand

**Priority:** Critical
**Status:** ✅ Implemented
**Estimated Complexity:** Medium
**Files Affected:** `src/systems/consumption.ts`, `src/core/types.ts`, `src/core/world.ts`

---

## Problem Statement

Food consumption is currently **100% price-inelastic**. Regardless of price levels:
- A healthy population consumes exactly 0.05 units/person/hour
- A starving population consumes exactly 0.05 units/person/hour
- 10x price increase has zero effect on consumption

This breaks fundamental market feedback mechanisms. High prices should reduce demand, allowing markets to self-correct shortages.

---

## Current Implementation

```typescript
// consumption.ts - current behavior
const foodNeeded = island.population.size * config.foodPerCapita * dt;
// Price is completely ignored
```

---

## Design

### Core Concept: Demand Elasticity

Implement price elasticity using the standard economics formula:

```
Q_demanded = Q_base * (P_reference / P_current)^elasticity
```

Where:
- `Q_base` = baseline consumption (current `foodPerCapita * population`)
- `P_reference` = reference price (e.g., `basePrice` from goods definition)
- `P_current` = current market price
- `elasticity` = price elasticity coefficient (negative for normal goods)

### Elasticity Values by Good Category

| Category | Elasticity | Rationale |
|----------|------------|-----------|
| Food (essential) | -0.3 to -0.5 | Necessities are inelastic |
| Material | -0.8 to -1.0 | More substitutable |
| Tool | -0.6 to -0.8 | Capital goods, moderate |
| Luxury | -1.2 to -1.5 | High elasticity |

### Additional Modifiers

1. **Health Factor:** Sicker populations consume less (rationing behavior)
   ```
   healthFactor = 0.7 + 0.3 * health  // Range: 0.7 to 1.0
   ```

2. **Substitution Between Foods:** When one food is expensive, shift to the other
   ```
   grainShare = baseShare * (fishPrice / grainPrice)^substitutionElasticity
   ```

---

## Specification

### New Types

```typescript
// types.ts additions
interface ConsumptionConfig {
  foodPerCapita: number;
  foodPriceElasticity: number;      // NEW: -0.3 default
  luxuryPriceElasticity: number;    // NEW: -1.2 default
  foodSubstitutionElasticity: number; // NEW: 0.5 default
  healthConsumptionFactor: number;   // NEW: 0.3 (how much health affects consumption)
}
```

### Updated Consumption Function

```typescript
// consumption.ts - new implementation
function calculateFoodDemand(
  island: IslandState,
  config: SimulationConfig,
  dt: number
): { grainDemand: number; fishDemand: number } {
  const pop = island.population.size;
  const baseNeed = pop * config.foodPerCapita * dt;

  // Health factor: sicker populations ration
  const healthFactor = (1 - config.healthConsumptionFactor) +
                       config.healthConsumptionFactor * island.population.health;

  // Get current prices
  const grainPrice = island.market.prices.get('grain') ?? GOODS.grain.basePrice;
  const fishPrice = island.market.prices.get('fish') ?? GOODS.fish.basePrice;
  const grainRef = GOODS.grain.basePrice;
  const fishRef = GOODS.fish.basePrice;

  // Price elasticity effect
  const grainElasticityMult = Math.pow(grainRef / grainPrice, -config.foodPriceElasticity);
  const fishElasticityMult = Math.pow(fishRef / fishPrice, -config.foodPriceElasticity);

  // Substitution effect: relative price determines share
  const relativePriceRatio = (fishPrice / fishRef) / (grainPrice / grainRef);
  const grainShare = 0.5 + 0.25 * Math.tanh(Math.log(relativePriceRatio) * config.foodSubstitutionElasticity);
  const fishShare = 1 - grainShare;

  // Final demand
  const adjustedNeed = baseNeed * healthFactor;

  return {
    grainDemand: adjustedNeed * grainShare * grainElasticityMult,
    fishDemand: adjustedNeed * fishShare * fishElasticityMult,
  };
}
```

---

## Implementation Plan

### Phase 1: Add Config Parameters
- [ ] Add `foodPriceElasticity`, `luxuryPriceElasticity`, `foodSubstitutionElasticity`, `healthConsumptionFactor` to `SimulationConfig`
- [ ] Update `createDefaultConfig()` in `world.ts` with sensible defaults
- [ ] Update type definitions

### Phase 2: Implement Elastic Demand
- [ ] Create `calculateFoodDemand()` function with price elasticity
- [ ] Replace hardcoded `foodNeeded` calculation in `consumeFood()`
- [ ] Implement health-based consumption modifier

### Phase 3: Implement Food Substitution
- [ ] Calculate relative price ratio between grain and fish
- [ ] Implement share allocation based on relative prices
- [ ] Ensure shares sum to 1.0 and are bounded [0.2, 0.8]

### Phase 4: Update Luxury Consumption
- [ ] Apply price elasticity to luxury consumption
- [ ] Consider income effect (wealthier populations buy more luxuries)

### Phase 5: Testing
- [ ] Unit test: demand decreases when price increases
- [ ] Unit test: substitution shifts demand between foods
- [ ] Unit test: health factor reduces consumption
- [ ] Integration test: market prices stabilize faster with elastic demand
- [ ] Determinism test: same seed produces same results

### Phase 6: Tuning
- [ ] Run simulations with various elasticity values
- [ ] Calibrate to achieve stable but responsive markets
- [ ] Document recommended parameter ranges

---

## Behavioral Changes Expected

| Scenario | Before | After |
|----------|--------|-------|
| Fish price doubles | Consumption unchanged | Fish demand drops ~15-25%, grain demand rises |
| Food shortage | Population starves at fixed rate | Rationing kicks in, slower health decline |
| One food unavailable | Fixed consumption pattern | Substitution to available food |
| Healthy vs sick population | Same consumption | Healthy consume more |

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Too-elastic demand causes price collapse | Use conservative elasticity (-0.3 to -0.5 for food) |
| Substitution oscillates between foods | Add smoothing, bound share range |
| Determinism broken | Ensure all calculations use only state + config, no external RNG |
| Performance regression | Profile; demand calculation is per-island, not per-entity |

---

## Success Criteria

1. Markets self-correct: a 50% supply shock causes <30% price spike (vs. current ~75%)
2. Populations survive longer during shortages due to rationing
3. Trade becomes more valuable (smooths price differences via demand response)
4. All tests pass including determinism
