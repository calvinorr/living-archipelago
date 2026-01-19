# Track: Ecosystem Collapse Thresholds

**Priority:** High
**Status:** Planning
**Estimated Complexity:** Medium
**Files Affected:** `src/systems/ecology.ts`, `src/systems/production.ts`, `src/core/types.ts`

---

## Problem Statement

Current ecosystem dynamics are **too forgiving**:

1. **No collapse dynamics:** Production at 0% stock is still 20% of baseline
2. **No irreversible degradation:** All damage recovers if you wait
3. **No critical thresholds:** Linear relationship between stock and productivity
4. **Recovery too fast:** Depleted systems bounce back quickly

Real ecosystems exhibit:
- **Tipping points:** Below critical levels, systems collapse
- **Hysteresis:** Recovery is harder than degradation
- **Regime shifts:** Ecosystems can flip to new stable states

---

## Current Implementation

```typescript
// production.ts - ecosystem modifier
const ecosystemMod = 0.2 + 0.8 * (resource / capacity);
// At 0% stock: modifier = 0.2 (20% production)
// Linear relationship

// ecology.ts - regeneration
const regen = regenRate * stock * (1 - stock / capacity);
// Standard logistic, no thresholds
```

---

## Design

### Core Concepts

1. **Collapse Threshold:** Below this level, ecosystem function degrades rapidly
2. **Critical Threshold:** Below this level, recovery is impaired
3. **Hysteresis:** Recovery rate is lower than degradation rate
4. **Regime Shifts:** Some damage is permanent without intervention

### Ecosystem States

```
HEALTHY (>60% capacity)
  ↓ exploitation
STRESSED (30-60% capacity)
  ↓ continued exploitation
DEGRADED (10-30% capacity) - recovery slowed
  ↓ continued exploitation
COLLAPSED (<10% capacity) - minimal function, very slow recovery
  ↓ extreme exploitation
DEAD (<2% capacity) - no function, requires intervention to recover
```

### Production Modifier Curve

Replace linear with S-curve with collapse zone:

```
modifier = {
  stock > 0.6K:  1.0 (full productivity)
  stock 0.3-0.6K: 0.4 + 0.6 * normalize(0.3, 0.6)
  stock 0.1-0.3K: 0.1 + 0.3 * normalize(0.1, 0.3) [accelerating decline]
  stock < 0.1K:   0.05 * (stock / 0.1K) [collapse zone]
  stock < 0.02K:  0 [dead zone]
}
```

### Recovery Dynamics

```
recoveryRate = baseRegenRate * recoveryMultiplier(stock/capacity)

recoveryMultiplier = {
  stock > 0.3K:  1.0 (normal recovery)
  stock 0.1-0.3K: 0.5 (impaired recovery)
  stock < 0.1K:   0.1 (minimal recovery)
  stock < 0.02K:  0 (no natural recovery)
}
```

---

## Specification

### New Types

```typescript
// types.ts additions
interface EcosystemThresholds {
  healthyRatio: number;      // Above this = full productivity (0.6)
  stressedRatio: number;     // Below this = declining (0.3)
  collapseRatio: number;     // Below this = collapsed (0.1)
  deadRatio: number;         // Below this = dead (0.02)
}

interface RecoveryConfig {
  baseRecoveryRate: number;          // Normal regeneration rate
  impairedRecoveryMultiplier: number; // Multiplier when stressed (0.5)
  collapsedRecoveryMultiplier: number; // Multiplier when collapsed (0.1)
  deadRecoveryRate: number;           // Rate when dead (0 = needs intervention)
}

interface EcosystemConfig {
  // Existing
  fishRegenRate: number;
  fishCapacity: number;
  // NEW
  thresholds: EcosystemThresholds;
  recovery: RecoveryConfig;
}

// Track ecosystem state
type EcosystemHealth = 'healthy' | 'stressed' | 'degraded' | 'collapsed' | 'dead';

interface EcosystemState {
  fishStock: number;
  forestBiomass: number;
  soilFertility: number;
  // NEW: track health states
  fishHealth: EcosystemHealth;
  forestHealth: EcosystemHealth;
  soilHealth: EcosystemHealth;
}
```

### Ecosystem State Classification

```typescript
// ecology.ts - new function
function classifyEcosystemHealth(
  current: number,
  capacity: number,
  thresholds: EcosystemThresholds
): EcosystemHealth {
  const ratio = current / capacity;

  if (ratio >= thresholds.healthyRatio) return 'healthy';
  if (ratio >= thresholds.stressedRatio) return 'stressed';
  if (ratio >= thresholds.collapseRatio) return 'degraded';
  if (ratio >= thresholds.deadRatio) return 'collapsed';
  return 'dead';
}
```

### Non-Linear Production Modifier

```typescript
// production.ts - new function
function calculateEcosystemProductionModifier(
  current: number,
  capacity: number,
  thresholds: EcosystemThresholds
): number {
  const ratio = current / capacity;

  // Healthy zone: full productivity
  if (ratio >= thresholds.healthyRatio) {
    return 1.0;
  }

  // Stressed zone: declining productivity
  if (ratio >= thresholds.stressedRatio) {
    const normalizedRatio = (ratio - thresholds.stressedRatio) /
                            (thresholds.healthyRatio - thresholds.stressedRatio);
    return 0.4 + 0.6 * normalizedRatio;
  }

  // Degraded zone: severe decline
  if (ratio >= thresholds.collapseRatio) {
    const normalizedRatio = (ratio - thresholds.collapseRatio) /
                            (thresholds.stressedRatio - thresholds.collapseRatio);
    return 0.1 + 0.3 * Math.pow(normalizedRatio, 2); // Accelerating decline
  }

  // Collapsed zone: minimal function
  if (ratio >= thresholds.deadRatio) {
    const normalizedRatio = (ratio - thresholds.deadRatio) /
                            (thresholds.collapseRatio - thresholds.deadRatio);
    return 0.05 * normalizedRatio;
  }

  // Dead zone: no production
  return 0;
}
```

### Recovery with Hysteresis

```typescript
// ecology.ts - updated regeneration
function calculateRecoveryRate(
  current: number,
  capacity: number,
  baseRate: number,
  config: EcosystemConfig
): number {
  const ratio = current / capacity;
  const thresholds = config.thresholds;
  const recovery = config.recovery;

  // Standard logistic base
  const logisticGrowth = baseRate * current * (1 - current / capacity);

  // Apply recovery multiplier based on health state
  let recoveryMultiplier: number;

  if (ratio >= thresholds.stressedRatio) {
    // Healthy/stressed: normal recovery
    recoveryMultiplier = 1.0;
  } else if (ratio >= thresholds.collapseRatio) {
    // Degraded: impaired recovery
    recoveryMultiplier = recovery.impairedRecoveryMultiplier;
  } else if (ratio >= thresholds.deadRatio) {
    // Collapsed: very slow recovery
    recoveryMultiplier = recovery.collapsedRecoveryMultiplier;
  } else {
    // Dead: no natural recovery
    return recovery.deadRecoveryRate * capacity; // Flat rate if any
  }

  return logisticGrowth * recoveryMultiplier;
}
```

### Updated Ecology System

```typescript
// ecology.ts - main update function
function updateEcosystem(
  ecosystem: EcosystemState,
  harvested: Record<string, number>,
  config: EcosystemConfig,
  dt: number
): EcosystemState {
  // Fish stock
  const fishRecovery = calculateRecoveryRate(
    ecosystem.fishStock,
    config.fishCapacity,
    config.fishRegenRate,
    config
  );
  const newFishStock = Math.max(0, Math.min(
    config.fishCapacity,
    ecosystem.fishStock + (fishRecovery - harvested.fish) * dt
  ));

  // Forest biomass
  const forestRecovery = calculateRecoveryRate(
    ecosystem.forestBiomass,
    config.forestCapacity,
    config.forestRegenRate,
    config
  );
  const newForestBiomass = Math.max(0, Math.min(
    config.forestCapacity,
    ecosystem.forestBiomass + (forestRecovery - harvested.timber) * dt
  ));

  // Update health classifications
  const fishHealth = classifyEcosystemHealth(newFishStock, config.fishCapacity, config.thresholds);
  const forestHealth = classifyEcosystemHealth(newForestBiomass, config.forestCapacity, config.thresholds);

  return {
    ...ecosystem,
    fishStock: newFishStock,
    forestBiomass: newForestBiomass,
    fishHealth,
    forestHealth,
  };
}
```

---

## Implementation Plan

### Phase 1: Add Threshold Configuration
- [ ] Create `EcosystemThresholds` interface
- [ ] Create `RecoveryConfig` interface
- [ ] Add to `EcosystemConfig`
- [ ] Set sensible defaults

### Phase 2: Implement Health Classification
- [ ] Create `classifyEcosystemHealth()` function
- [ ] Add health state to `EcosystemState`
- [ ] Expose health state in observable state

### Phase 3: Implement Non-Linear Production
- [ ] Create `calculateEcosystemProductionModifier()` function
- [ ] Replace linear `0.2 + 0.8 * ratio` formula
- [ ] Ensure smooth transitions between zones

### Phase 4: Implement Hysteresis Recovery
- [ ] Create `calculateRecoveryRate()` function
- [ ] Apply recovery multipliers based on health state
- [ ] Test recovery dynamics at various health levels

### Phase 5: Update Ecology System
- [ ] Integrate new recovery calculation
- [ ] Update health state each tick
- [ ] Emit events when health state changes

### Phase 6: Agent Awareness
- [ ] Expose ecosystem health to traders
- [ ] Update strategist prompt with health state awareness
- [ ] Consider health state in trade decisions

### Phase 7: Testing
- [ ] Unit test: production drops appropriately at each health level
- [ ] Unit test: recovery is slower in degraded state
- [ ] Unit test: dead ecosystems don't recover naturally
- [ ] Integration test: overfishing leads to collapse within expected ticks
- [ ] Integration test: stopping harvest allows gradual recovery
- [ ] Integration test: hysteresis is observable
- [ ] Determinism test

### Phase 8: Tuning
- [ ] Calibrate thresholds for interesting gameplay
- [ ] Ensure collapse is possible but not too easy
- [ ] Verify recovery times feel meaningful

---

## Behavioral Changes Expected

| Stock Level | Production (Before) | Production (After) | Recovery (Before) | Recovery (After) |
|-------------|---------------------|-------------------|-------------------|------------------|
| 80% | 84% | 100% | Normal | Normal |
| 50% | 60% | 73% | Normal | Normal |
| 25% | 40% | 25% | Normal | 50% |
| 10% | 28% | 5% | Normal | 10% |
| 2% | 22% | 0% | Normal | 0% |

### Collapse Scenario Timeline

**Unsustainable fishing (harvest > regeneration):**

| Tick | Stock | Health | Production | Recovery |
|------|-------|--------|------------|----------|
| 0 | 80% | Healthy | 100% | Normal |
| 500 | 60% | Healthy | 100% | Normal |
| 1000 | 40% | Stressed | 60% | Normal |
| 1500 | 25% | Degraded | 25% | Impaired |
| 2000 | 12% | Degraded | 10% | Impaired |
| 2500 | 8% | Collapsed | 4% | Minimal |
| 3000 | 5% | Collapsed | 2% | Minimal |

**Recovery after stopping harvest:**

| Tick | Stock | Health | Production | Time to Healthy |
|------|-------|--------|------------|-----------------|
| 0 | 5% | Collapsed | 2% | ~3000 ticks |
| 500 | 7% | Collapsed | 3% | ~2500 ticks |
| 1500 | 12% | Degraded | 10% | ~1500 ticks |
| 3000 | 35% | Stressed | 50% | ~500 ticks |
| 3500 | 65% | Healthy | 100% | 0 |

---

## Configuration Recommendations

### Default Thresholds

```typescript
thresholds: {
  healthyRatio: 0.6,    // Above 60% = full productivity
  stressedRatio: 0.3,   // 30-60% = declining
  collapseRatio: 0.1,   // 10-30% = severely degraded
  deadRatio: 0.02,      // Below 2% = dead
}
```

### Recovery Settings

```typescript
recovery: {
  baseRecoveryRate: 0.05,           // Per tick at 50% stock
  impairedRecoveryMultiplier: 0.5,  // 50% recovery when degraded
  collapsedRecoveryMultiplier: 0.1, // 10% recovery when collapsed
  deadRecoveryRate: 0,              // No natural recovery when dead
}
```

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Collapse too easy | Raise collapseRatio; increase recovery rates |
| Collapse too hard | Lower collapseRatio; decrease harvest coupling |
| Death spirals | Add migration escape valve; trade can supply needs |
| Permanent death | Allow intervention mechanics (restoration projects) |
| Jarring transitions | Ensure smooth interpolation between zones |

---

## Future Extensions

1. **Restoration Projects:** Allow investment to recover dead ecosystems
2. **Cascading Effects:** Forest collapse affects soil fertility
3. **Climate Events:** Storms/droughts can push systems over thresholds
4. **Biodiversity:** Track multiple species with interdependencies
5. **Pollution:** Add degradation from industrial activity

---

## Success Criteria

1. Clear visual/numerical distinction between ecosystem health states
2. Overfishing leads to observable collapse within ~2000-3000 ticks
3. Recovery from collapse takes 2-3x longer than degradation
4. Dead ecosystems require intervention (or very long time) to recover
5. Labor naturally shifts away from collapsed sectors
6. Trade becomes essential for islands with collapsed ecosystems
7. All tests pass including determinism
