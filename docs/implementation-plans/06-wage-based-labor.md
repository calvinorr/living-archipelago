# Track: Wage-Based Labor Allocation

**Priority:** High
**Status:** Planning
**Estimated Complexity:** High
**Files Affected:** `src/systems/population.ts`, `src/systems/production.ts`, `src/core/types.ts`

---

## Problem Statement

Labor currently allocates based on **ecosystem health**, not economic signals:

```typescript
// population.ts - current allocation weights
const weights = {
  fishing: fishHealth * 0.3,
  forestry: forestHealth * 0.2,
  farming: soilHealth * 0.3,
  industry: 0.1,  // Fixed!
  services: 0.1,  // Fixed!
};
```

**Problems:**
1. Labor follows resource abundance, not profitability
2. High prices (signaling demand) don't attract workers
3. Industry and services are fixed at 10% regardless of market conditions
4. Workers don't respond to wage differentials

**Real behavior:** Workers follow money. High fish prices should attract fishing labor.

---

## Current Implementation

```typescript
// population.ts - labor reallocation
function reallocateLabor(island: IslandState, config: SimulationConfig, dt: number): LaborAllocation {
  // Target weights based on ecosystem health
  const weights = {
    fishing: island.ecosystem.fishStock / config.ecology.fishCapacity * 0.3,
    forestry: island.ecosystem.forestBiomass / config.ecology.forestCapacity * 0.2,
    farming: island.ecosystem.soilFertility * 0.3,
    industry: 0.1,
    services: 0.1,
  };

  // Slow adjustment toward targets
  const adjustmentRate = 0.001; // 0.1% per hour
  // ... gradual shift
}
```

---

## Design

### Core Principle: Labor Follows Expected Returns

```
Expected return for sector i = price_i * marginal_product_i
Target labor share ∝ expected_return_i / average_expected_return
```

### Wage Calculation

Each sector has an implied "wage" based on output value:

```typescript
wage[sector] = price[good] * production_per_worker[sector]
```

Workers prefer higher-wage sectors, with friction preventing instant reallocation.

### Labor Allocation Formula

```
targetShare[i] = normalize(baseShare[i] * (wage[i] / avgWage)^responsiveness)
```

Where:
- `baseShare[i]` = historical/default allocation (prevents collapse to single sector)
- `wage[i]` = expected income from working in sector i
- `avgWage` = average wage across all sectors
- `responsiveness` = how quickly labor responds to wage differentials (0.5-2.0)

---

## Specification

### New Types

```typescript
// types.ts additions
interface LaborConfig {
  baseShares: Record<Sector, number>;        // Default allocation without signals
  wageResponsiveness: number;                // How strongly labor responds (1.0 default)
  reallocationRate: number;                  // Max % change per hour (0.01 = 1%)
  minSectorShare: number;                    // Minimum share any sector can have (0.02)
  maxSectorShare: number;                    // Maximum share any sector can have (0.6)
}

interface SectorEconomics {
  sector: Sector;
  good: GoodId;
  currentWage: number;
  laborShare: number;
  productionPerWorker: number;
}

interface LaborState {
  allocation: Record<Sector, number>;
  wages: Record<Sector, number>;              // NEW: track implied wages
  lastReallocation: number;                   // Tick of last reallocation
}
```

### Wage Calculation Function

```typescript
// population.ts - new function
function calculateSectorWages(
  island: IslandState,
  config: SimulationConfig
): Record<Sector, number> {
  const wages: Record<Sector, number> = {};
  const pop = island.population.size;

  for (const sector of SECTORS) {
    const good = SECTOR_TO_GOOD[sector];
    if (!good) {
      // Services sector - wage based on population wealth
      wages[sector] = calculateServiceWage(island, config);
      continue;
    }

    // Get current price
    const price = island.market.prices.get(good) ?? GOODS[good].basePrice;

    // Calculate marginal product of labor in this sector
    const currentLabor = island.population.labor[sector];
    const baseProduction = calculateBaseProduction(good, island, config);

    // Marginal product = derivative of production w.r.t. labor
    // For Cobb-Douglas with alpha: dQ/dL = alpha * Q / L
    const alpha = config.production.laborAlpha;
    const marginalProduct = alpha * baseProduction / Math.max(currentLabor * pop, 1);

    wages[sector] = price * marginalProduct;
  }

  return wages;
}
```

### Updated Labor Allocation

```typescript
// population.ts - wage-based allocation
function calculateLaborTargets(
  island: IslandState,
  wages: Record<Sector, number>,
  config: SimulationConfig
): Record<Sector, number> {
  const laborConfig = config.labor;
  const targets: Record<Sector, number> = {};

  // Calculate average wage
  const avgWage = Object.values(wages).reduce((a, b) => a + b, 0) / SECTORS.length;

  // Calculate raw targets based on wage ratios
  let totalWeight = 0;
  for (const sector of SECTORS) {
    const wageRatio = wages[sector] / Math.max(avgWage, 0.01);
    const baseShare = laborConfig.baseShares[sector];

    // Target = base allocation adjusted by wage attractiveness
    const attractiveness = Math.pow(wageRatio, laborConfig.wageResponsiveness);
    const rawTarget = baseShare * attractiveness;

    targets[sector] = rawTarget;
    totalWeight += rawTarget;
  }

  // Normalize and clamp
  for (const sector of SECTORS) {
    targets[sector] = targets[sector] / totalWeight;
    targets[sector] = Math.max(laborConfig.minSectorShare,
                               Math.min(laborConfig.maxSectorShare, targets[sector]));
  }

  // Re-normalize after clamping
  const total = Object.values(targets).reduce((a, b) => a + b, 0);
  for (const sector of SECTORS) {
    targets[sector] = targets[sector] / total;
  }

  return targets;
}
```

### Gradual Reallocation with Friction

```typescript
// population.ts - apply reallocation with friction
function applyLaborReallocation(
  current: Record<Sector, number>,
  targets: Record<Sector, number>,
  config: SimulationConfig,
  dt: number
): Record<Sector, number> {
  const newAllocation: Record<Sector, number> = {};
  const maxChange = config.labor.reallocationRate * dt;

  for (const sector of SECTORS) {
    const diff = targets[sector] - current[sector];
    const change = Math.sign(diff) * Math.min(Math.abs(diff), maxChange);
    newAllocation[sector] = current[sector] + change;
  }

  // Ensure normalization
  const total = Object.values(newAllocation).reduce((a, b) => a + b, 0);
  for (const sector of SECTORS) {
    newAllocation[sector] = newAllocation[sector] / total;
  }

  return newAllocation;
}
```

---

## Implementation Plan

### Phase 1: Add Config & Types
- [ ] Create `LaborConfig` interface
- [ ] Add `wages` field to labor state
- [ ] Define `baseShares` defaults for each sector
- [ ] Map sectors to goods (`SECTOR_TO_GOOD`)

### Phase 2: Implement Wage Calculation
- [ ] Create `calculateSectorWages()` function
- [ ] Handle all sectors including services
- [ ] Calculate marginal product correctly using Cobb-Douglas derivative

### Phase 3: Implement Target Calculation
- [ ] Create `calculateLaborTargets()` function
- [ ] Apply wage responsiveness parameter
- [ ] Enforce min/max share constraints

### Phase 4: Update Reallocation
- [ ] Replace ecosystem-based weights with wage-based targets
- [ ] Keep gradual adjustment mechanism
- [ ] Ensure shares always sum to 1.0

### Phase 5: Update Observable State
- [ ] Expose sector wages to agents
- [ ] Expose labor targets vs. current allocation
- [ ] Allow strategist to see labor market dynamics

### Phase 6: Testing
- [ ] Unit test: high prices attract labor
- [ ] Unit test: wage calculation is correct
- [ ] Unit test: reallocation respects constraints
- [ ] Integration test: labor shifts to profitable sectors
- [ ] Integration test: industry/services respond to economy
- [ ] Determinism test

### Phase 7: Tuning
- [ ] Calibrate `wageResponsiveness` for stability
- [ ] Set appropriate `reallocationRate`
- [ ] Verify labor doesn't oscillate

---

## Behavioral Changes Expected

| Scenario | Before | After |
|----------|--------|-------|
| Fish price doubles | No labor change | Fishing labor increases |
| Timber price collapses | No labor change | Forestry labor decreases |
| Tools scarce (high price) | Industry stays at 10% | Industry labor increases |
| All sectors equal price | Allocation by ecosystem health | Allocation by base shares |

### Example: Fish Price Spike

**Before:**
- Fish price +100%
- Fishing labor: stable at 45%
- Response: none

**After:**
- Fish price +100%
- Fishing wage doubles
- Target fishing labor: ~55-60%
- Actual change: +1% per hour toward target
- Result: Gradual shift to fishing over ~10-15 hours

---

## Configuration Recommendations

### Default Base Shares

```typescript
baseShares: {
  fishing: 0.20,
  forestry: 0.15,
  farming: 0.25,
  industry: 0.15,
  services: 0.25,
}
```

### Responsiveness Settings

| Mode | wageResponsiveness | reallocationRate | Behavior |
|------|-------------------|------------------|----------|
| Sticky | 0.5 | 0.005 | Slow, stable allocation |
| Balanced | 1.0 | 0.01 | Moderate response |
| Dynamic | 1.5 | 0.02 | Quick response to prices |

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Labor oscillates between sectors | Lower responsiveness, add hysteresis |
| Single sector dominates | maxSectorShare constraint (60%) |
| Sector collapses completely | minSectorShare constraint (2%) |
| Wages undefined (division by zero) | Guard against zero labor/production |
| Services wage unclear | Base on population wealth/productivity |

---

## Success Criteria

1. Labor responds to price signals within 10-50 ticks
2. High-price goods attract more workers
3. Industry and services are dynamic, not fixed
4. No sector collapses to 0% or dominates at 100%
5. Stable equilibrium emerges for stable prices
6. Economic shocks cause meaningful labor reallocation
7. All tests pass including determinism
