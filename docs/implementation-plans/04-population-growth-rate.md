# Track: Population Growth Rate Fix

**Priority:** Critical
**Status:** ✅ Implemented
**Estimated Complexity:** Low
**Files Affected:** `src/systems/population.ts`, `src/core/types.ts`, `src/core/world.ts`

---

## Problem Statement

Current population growth rate is **100x too fast**:

```typescript
// Current: 0.01% per hour = 0.0001 per hour
// Annual equivalent: (1 + 0.0001)^8760 - 1 ≈ 140% per year

// Historical pre-industrial: 0.05-0.1% per YEAR
// Current model: ~140% per year
```

This creates unrealistic runaway population growth in healthy periods.

---

## Current Implementation

```typescript
// population.ts - growth calculation
const growthRate = 0.0001; // 0.01% per hour
if (population.health > 0.8) {
  newSize = currentSize * (1 + growthRate * dt);
}
```

---

## Design

### Target Growth Rates

| Condition | Historical Rate (Annual) | Per-Hour Equivalent |
|-----------|-------------------------|---------------------|
| Optimal health (>0.9) | 0.5% per year | ~0.00000057 |
| Good health (0.7-0.9) | 0.2% per year | ~0.00000023 |
| Fair health (0.5-0.7) | 0% (stable) | 0 |
| Poor health (0.3-0.5) | -0.5% per year | ~-0.00000057 |
| Crisis (<0.3) | -2% per year | ~-0.0000023 |

### Continuous Health Response

Replace binary thresholds with continuous function:

```
growthRate = maxGrowthRate * growthCurve(health)

where growthCurve(h) = {
  h < 0.3: -1.0 (max decline)
  h = 0.5: 0.0 (stable)
  h = 0.7: 0.5 (moderate growth)
  h > 0.9: 1.0 (max growth)
}
```

---

## Specification

### New Types

```typescript
// types.ts additions
interface PopulationConfig {
  // Existing
  foodPerCapita: number;
  healthPenaltyRate: number;
  // UPDATED
  maxGrowthRate: number;        // Max annual growth rate (0.005 = 0.5%)
  maxDeclineRate: number;       // Max annual decline rate (0.02 = 2%)
  stableHealthThreshold: number; // Health at which growth = 0 (0.5)
  optimalHealthThreshold: number; // Health for max growth (0.9)
  crisisHealthThreshold: number;  // Health for max decline (0.3)
}
```

### Growth Curve Function

```typescript
// population.ts - new function
function calculateGrowthMultiplier(
  health: number,
  config: PopulationConfig
): number {
  // Below crisis threshold: max decline
  if (health < config.crisisHealthThreshold) {
    return -1.0;
  }

  // Between crisis and stable: interpolate decline
  if (health < config.stableHealthThreshold) {
    const ratio = (health - config.crisisHealthThreshold) /
                  (config.stableHealthThreshold - config.crisisHealthThreshold);
    return -1.0 + ratio; // -1.0 to 0.0
  }

  // Between stable and optimal: interpolate growth
  if (health < config.optimalHealthThreshold) {
    const ratio = (health - config.stableHealthThreshold) /
                  (config.optimalHealthThreshold - config.stableHealthThreshold);
    return ratio; // 0.0 to 1.0
  }

  // Above optimal: max growth
  return 1.0;
}
```

### Updated Population Growth

```typescript
// population.ts - updated calculation
function calculatePopulationChange(
  island: IslandState,
  config: SimulationConfig,
  dt: number
): number {
  const health = island.population.health;
  const currentSize = island.population.size;

  // Get growth multiplier from continuous curve
  const multiplier = calculateGrowthMultiplier(health, config.population);

  // Convert annual rate to per-tick rate
  // Annual rate = (1 + hourlyRate)^8760 - 1
  // hourlyRate = (1 + annualRate)^(1/8760) - 1
  let annualRate: number;
  if (multiplier >= 0) {
    annualRate = config.population.maxGrowthRate * multiplier;
  } else {
    annualRate = config.population.maxDeclineRate * multiplier; // multiplier is negative
  }

  const hourlyRate = Math.pow(1 + annualRate, 1 / 8760) - 1;
  const change = currentSize * hourlyRate * dt;

  return change;
}
```

---

## Implementation Plan

### Phase 1: Update Config
- [ ] Add new population config parameters
- [ ] Set realistic defaults:
  - `maxGrowthRate: 0.005` (0.5% annual)
  - `maxDeclineRate: 0.02` (2% annual)
  - `stableHealthThreshold: 0.5`
  - `optimalHealthThreshold: 0.9`
  - `crisisHealthThreshold: 0.3`

### Phase 2: Implement Continuous Curve
- [ ] Create `calculateGrowthMultiplier()` function
- [ ] Unit test curve outputs at various health levels

### Phase 3: Update Growth Calculation
- [ ] Replace binary threshold logic with continuous curve
- [ ] Convert annual rates to hourly rates correctly
- [ ] Ensure minimum population floor (1) is still enforced

### Phase 4: Testing
- [ ] Unit test: health 1.0 produces ~0.5% annual growth
- [ ] Unit test: health 0.5 produces stable population
- [ ] Unit test: health 0.2 produces ~2% annual decline
- [ ] Integration test: population doubles in ~140 years (simulated time), not 1 year
- [ ] Integration test: smooth transitions, no jumps at thresholds
- [ ] Determinism test

### Phase 5: Adjust Simulation Timescales
- [ ] Consider if tick rate needs adjustment for interesting dynamics
- [ ] Document expected population trajectories over simulation runs

---

## Behavioral Changes Expected

| Health | Before (Annual Equiv) | After (Annual) |
|--------|----------------------|----------------|
| 1.0 | ~140% growth | 0.5% growth |
| 0.85 | ~140% growth | ~0.4% growth |
| 0.7 | ~140% growth | ~0.25% growth |
| 0.5 | Stable (0%) | Stable (0%) |
| 0.3 | Stable (0%) | ~-1% decline |
| 0.1 | ~-99% decline | ~-2% decline |

---

## Timescale Implications

With realistic growth rates:
- Population doubles in ~140 game-years at optimal health
- 1 game-year = 8,760 ticks = 8,760 hours
- Typical simulation run of 10,000 ticks ≈ 1.14 years

**Consideration:** At these rates, population dynamics are slow. Options:
1. Accept slow dynamics (realistic)
2. Provide "fast-forward" simulation mode
3. Use slightly accelerated rates (2-5% annual) for gameplay interest

---

## Configuration Recommendations

| Scenario | maxGrowthRate | maxDeclineRate | Notes |
|----------|---------------|----------------|-------|
| Realistic | 0.005 | 0.02 | Historical accuracy |
| Accelerated | 0.02 | 0.05 | More dynamic gameplay |
| Game Mode | 0.05 | 0.10 | Rapid consequences |

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Population dynamics too slow | Offer accelerated mode or higher default |
| Existing saves break | Population will stop growing as fast; acceptable |
| Decline too slow to matter | crisisHealthThreshold can trigger migration earlier |

---

## Success Criteria

1. Healthy population grows at realistic rates (~0.5% annual)
2. Smooth continuous response to health changes
3. No sudden jumps at threshold boundaries
4. Crisis conditions cause meaningful but not instant collapse
5. Simulation dynamics are still interesting within reasonable tick counts
6. All tests pass including determinism
