# Track: Harvest-Production Coupling

**Priority:** Critical
**Status:** ✅ Implemented
**Estimated Complexity:** High
**Files Affected:** `src/systems/ecology.ts`, `src/systems/production.ts`, `src/core/types.ts`

---

## Problem Statement

Currently, **harvest is decoupled from production**:

```typescript
// ecology.ts - current harvest calculation
const fishHarvest = fishProductionRate * laborModifier * healthModifier * 0.1;
// Only 10% of production affects the ecosystem
```

This means producing 100 fish only harvests 10 from the ecosystem. The other 90 units appear from nowhere, violating physical conservation.

**Consequences:**
- True overexploitation is impossible
- Ecological collapse dynamics don't emerge
- Production feels disconnected from natural limits

---

## Current Implementation

```typescript
// production.ts - calculates production
const fishProduction = baseRate * laborMod * ecosystemMod * toolMod * healthMod;
// Output: e.g., 100 units

// ecology.ts - applies harvest pressure
const harvest = fishProduction * 0.1;  // Only 10 units extracted from ecosystem
// Fish stock: fishStock - harvest + regeneration
```

The 10% factor was likely added to prevent instant collapse, but it breaks the fundamental constraint.

---

## Design

### Core Principle: Production = Harvest

Every unit of fish produced must be harvested from the fish stock. The ecosystem modifier then naturally limits production.

### Option A: Direct Coupling (Recommended)

Production is constrained by what the ecosystem can sustainably yield:

```
maxHarvest = f(stock, regeneration, technology)
actualProduction = min(desiredProduction, maxHarvest)
ecosystemDrain = actualProduction
```

### Option B: Efficiency-Based Coupling

Production has an efficiency factor (how much of harvest becomes usable product):

```
harvest = production / efficiency
efficiency = f(technology, labor_skill)
ecosystemDrain = harvest
```

**Chosen approach:** Option A with production ceiling.

### Production-Ecosystem Relationship

```
Stock-Dependent Production:
- At stock > 80% capacity: full production potential
- At stock 50% capacity: 70% production potential
- At stock 20% capacity: 30% production potential
- At stock < 10% capacity: collapse zone, production drops to 5%

Formula:
ecosystemYield = baseProduction * yieldCurve(stock / capacity)

where yieldCurve is a sigmoid with collapse threshold:
yieldCurve(ratio) = {
  if ratio < 0.1: 0.05  // Collapse floor
  if ratio < 0.3: 0.3 * (ratio / 0.3)^2  // Accelerating decline
  if ratio >= 0.3: 0.3 + 0.7 * ((ratio - 0.3) / 0.7)  // Linear to full
}
```

---

## Specification

### New Types

```typescript
// types.ts additions
interface EcologyConfig {
  // Existing
  fishRegenRate: number;
  fishCapacity: number;
  // NEW
  collapseThreshold: number;     // Stock ratio below which collapse occurs (0.1)
  collapseFloor: number;         // Minimum yield multiplier in collapse (0.05)
  criticalThreshold: number;     // Stock ratio where decline accelerates (0.3)
  harvestEfficiency: number;     // What fraction of harvest becomes product (1.0 = perfect)
}

interface ProductionResult {
  produced: Record<GoodId, number>;
  harvested: Record<GoodId, number>;  // NEW: actual ecosystem drain
  constrained: Record<GoodId, boolean>; // NEW: was production limited by ecosystem?
}
```

### Yield Curve Function

```typescript
// ecology.ts - new function
function calculateYieldMultiplier(
  currentStock: number,
  capacity: number,
  config: EcologyConfig
): number {
  const ratio = currentStock / capacity;

  if (ratio < config.collapseThreshold) {
    // Collapse zone: minimal yield
    return config.collapseFloor;
  }

  if (ratio < config.criticalThreshold) {
    // Accelerating decline zone
    const normalizedRatio = ratio / config.criticalThreshold;
    return config.collapseFloor +
           (config.criticalThreshold - config.collapseFloor) * Math.pow(normalizedRatio, 2);
  }

  // Normal zone: linear scaling from criticalThreshold to 1.0
  const normalizedRatio = (ratio - config.criticalThreshold) / (1 - config.criticalThreshold);
  return config.criticalThreshold + (1 - config.criticalThreshold) * normalizedRatio;
}
```

### Updated Production Function

```typescript
// production.ts - updated to respect ecosystem limits
function calculateProduction(
  island: IslandState,
  config: SimulationConfig,
  dt: number
): ProductionResult {
  const produced: Record<GoodId, number> = {};
  const harvested: Record<GoodId, number> = {};
  const constrained: Record<GoodId, boolean> = {};

  // Fish production
  const desiredFishProd = calculateDesiredProduction('fish', island, config, dt);
  const fishYield = calculateYieldMultiplier(
    island.ecosystem.fishStock,
    config.ecology.fishCapacity,
    config.ecology
  );
  const maxFishHarvest = island.ecosystem.fishStock * fishYield * dt;
  const actualFishProd = Math.min(desiredFishProd, maxFishHarvest);

  produced.fish = actualFishProd;
  harvested.fish = actualFishProd / config.ecology.harvestEfficiency;
  constrained.fish = actualFishProd < desiredFishProd;

  // Similar for timber...
  const desiredTimberProd = calculateDesiredProduction('timber', island, config, dt);
  const forestYield = calculateYieldMultiplier(
    island.ecosystem.forestBiomass,
    config.ecology.forestCapacity,
    config.ecology
  );
  const maxTimberHarvest = island.ecosystem.forestBiomass * forestYield * dt;
  const actualTimberProd = Math.min(desiredTimberProd, maxTimberHarvest);

  produced.timber = actualTimberProd;
  harvested.timber = actualTimberProd / config.ecology.harvestEfficiency;
  constrained.timber = actualTimberProd < desiredTimberProd;

  // Grain uses soil fertility differently (doesn't deplete stock, degrades quality)
  produced.grain = calculateDesiredProduction('grain', island, config, dt);
  harvested.grain = 0; // Grain doesn't harvest from a stock

  return { produced, harvested, constrained };
}
```

### Updated Ecology System

```typescript
// ecology.ts - use actual harvest from production
function updateEcosystem(
  island: IslandState,
  productionResult: ProductionResult,
  config: SimulationConfig,
  dt: number
): EcosystemState {
  const { harvested } = productionResult;

  // Fish stock update
  const fishRegen = config.ecology.fishRegenRate *
    island.ecosystem.fishStock *
    (1 - island.ecosystem.fishStock / config.ecology.fishCapacity);
  const newFishStock = Math.max(0, Math.min(
    config.ecology.fishCapacity,
    island.ecosystem.fishStock + (fishRegen - harvested.fish) * dt
  ));

  // Forest update
  const forestRegen = config.ecology.forestRegenRate *
    island.ecosystem.forestBiomass *
    (1 - island.ecosystem.forestBiomass / config.ecology.forestCapacity);
  const newForestBiomass = Math.max(0, Math.min(
    config.ecology.forestCapacity,
    island.ecosystem.forestBiomass + (forestRegen - harvested.timber) * dt
  ));

  // Soil fertility (unchanged - degrades from farming, not harvesting)

  return {
    ...island.ecosystem,
    fishStock: newFishStock,
    forestBiomass: newForestBiomass,
  };
}
```

---

## Implementation Plan

### Phase 1: Add Yield Curve
- [ ] Add ecology config parameters for collapse/critical thresholds
- [ ] Implement `calculateYieldMultiplier()` function
- [ ] Unit test yield curve behavior at various stock levels

### Phase 2: Update Production System
- [ ] Modify `calculateProduction()` to return `ProductionResult`
- [ ] Apply yield multiplier to constrain production
- [ ] Track when production is ecosystem-constrained

### Phase 3: Couple to Ecology System
- [ ] Pass `ProductionResult.harvested` to ecology update
- [ ] Remove the old arbitrary 0.1 harvest factor
- [ ] Ensure harvest = production for extractive goods

### Phase 4: Update Tick Order
- [ ] Ensure production runs before ecology (or within same pass)
- [ ] Production result feeds into ecology update
- [ ] Verify state consistency across tick boundary

### Phase 5: Handle Edge Cases
- [ ] What happens when stock hits zero? (Production stops)
- [ ] Recovery from collapse (slow regeneration)
- [ ] Multiple extractive goods (fish vs. timber)

### Phase 6: Testing
- [ ] Unit test: production decreases as stock decreases
- [ ] Unit test: collapse zone produces minimal output
- [ ] Unit test: ecosystem recovers when harvest stops
- [ ] Integration test: overfishing leads to collapse
- [ ] Integration test: sustainable harvest maintains stock
- [ ] Determinism test

### Phase 7: Rebalance Parameters
- [ ] Tune production base rates (may need increase to compensate)
- [ ] Tune regeneration rates for desired equilibrium
- [ ] Calibrate collapse threshold for interesting gameplay

---

## Behavioral Changes Expected

| Scenario | Before | After |
|----------|--------|-------|
| Stock at 100% | Full production | Full production |
| Stock at 50% | Full production | ~70% production |
| Stock at 20% | ~85% production | ~30% production |
| Stock at 5% | ~75% production | ~5% production (collapse) |
| Overfishing | Stock stabilizes via weak feedback | Stock collapses, production stops |
| Stop fishing | Stock recovers quickly | Stock recovers, production resumes |

---

## Migration Considerations

### Breaking Changes
- Production output will decrease for depleted ecosystems
- Islands with low stocks will immediately see production drop
- May require rebalancing starting conditions

### Compatibility
- Add feature flag `useHarvestCoupling: boolean` for gradual rollout
- Default: `true` for new simulations, `false` for existing saves

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Immediate collapse on startup | Check starting conditions; increase initial stocks if needed |
| Death spiral (no food → death → less labor → still no food) | Add migration/trade as escape valve |
| Too harsh collapse | Tune collapse threshold and floor |
| Grain production affected | Grain uses soil fertility, not stock extraction; handle separately |

---

## Success Criteria

1. Production is physically constrained by ecosystem state
2. Overfishing leads to observable collapse within ~500 ticks
3. Sustainable harvest levels can maintain stable stocks
4. Recovery from collapse takes significant time (~1000+ ticks)
5. Labor reallocation naturally occurs away from collapsed sectors
6. Trade becomes crucial for islands with depleted resources
7. All tests pass including determinism
