# Implementation Plans: Economic Model Improvements

> **Note**: The primary documentation is now [`/ECONOMIC_MODEL.md`](../../ECONOMIC_MODEL.md).
> These track files contain detailed implementation specifications for reference.

This directory contains detailed implementation plans ("tracks") for addressing critical and high-priority issues identified in the Economic Model Review.

---

## Priority Matrix

| # | Track | Priority | Complexity | Status |
|---|-------|----------|------------|--------|
| 01 | [Price-Elastic Demand](./01-price-elastic-demand.md) | Critical | Medium | ✅ Done |
| 02 | [Transport Costs](./02-transport-costs.md) | Critical | Medium | Planning |
| 03 | [Harvest-Production Coupling](./03-harvest-production-coupling.md) | Critical | High | ✅ Done |
| 04 | [Population Growth Rate](./04-population-growth-rate.md) | Critical | Low | ✅ Done |
| 05 | [Good-Specific Elasticity](./05-good-specific-elasticity.md) | High | Medium | Planning |
| 06 | [Wage-Based Labor](./06-wage-based-labor.md) | High | High | Planning |
| 07 | [Ecosystem Collapse](./07-ecosystem-collapse.md) | High | Medium | Planning |

---

## Recommended Implementation Order

### Phase 1: Foundation (Week 1-2)
1. **04-population-growth-rate.md** - Quick win, fixes most egregious issue
2. **01-price-elastic-demand.md** - Enables market self-correction

### Phase 2: Physical Constraints (Week 2-3)
3. **03-harvest-production-coupling.md** - Ties production to ecosystem reality
4. **07-ecosystem-collapse.md** - Adds meaningful ecological consequences

### Phase 3: Economic Signals (Week 3-4)
5. **05-good-specific-elasticity.md** - Differentiates goods economically
6. **06-wage-based-labor.md** - Labor responds to prices

### Phase 4: Trade Economics (Week 4)
7. **02-transport-costs.md** - Makes trade costs realistic

---

## Dependencies

```
04-population-growth-rate (independent)
           ↓
01-price-elastic-demand (independent)
           ↓
03-harvest-production-coupling ←→ 07-ecosystem-collapse (coupled)
           ↓
05-good-specific-elasticity (depends on 01)
           ↓
06-wage-based-labor (depends on 05 for prices)
           ↓
02-transport-costs (independent but benefits from above)
```

---

## Files Affected (Summary)

| File | Tracks |
|------|--------|
| `src/core/types.ts` | 01, 02, 03, 04, 05, 06, 07 |
| `src/core/world.ts` | 01, 02, 04, 05 |
| `src/systems/consumption.ts` | 01 |
| `src/systems/market.ts` | 01, 05 |
| `src/systems/shipping.ts` | 02 |
| `src/systems/production.ts` | 03, 06, 07 |
| `src/systems/population.ts` | 04, 06 |
| `src/systems/ecology.ts` | 03, 07 |
| `src/agents/traders/executor.ts` | 02 |

---

## Testing Strategy

Each track includes specific test requirements:

1. **Unit Tests:** Verify individual function behavior
2. **Integration Tests:** Verify system interactions
3. **Determinism Tests:** Same seed → same results
4. **Regression Tests:** Existing functionality preserved

### Determinism is Critical

Every change must preserve the deterministic property:
- No external RNG
- No floating-point order dependencies
- No time-based calculations (use tick count)
- State hash verification

---

## Configuration Changes Summary

### New Config Sections

```typescript
interface SimulationConfig {
  // Existing sections...

  // NEW: Consumption config
  consumption: {
    foodPriceElasticity: number;      // -0.3
    luxuryPriceElasticity: number;    // -1.2
    foodSubstitutionElasticity: number; // 0.5
    healthConsumptionFactor: number;   // 0.3
  };

  // NEW: Shipping costs
  shipping: {
    baseVoyageCost: number;        // 10
    costPerDistanceUnit: number;   // 0.1
    perVolumeHandlingCost: number; // 0.05
    emptyReturnMultiplier: number; // 0.5
  };

  // UPDATED: Ecology thresholds
  ecology: {
    // existing...
    thresholds: EcosystemThresholds;
    recovery: RecoveryConfig;
    harvestEfficiency: number;  // 1.0
  };

  // UPDATED: Population
  population: {
    // existing...
    maxGrowthRate: number;        // 0.005 (annual)
    maxDeclineRate: number;       // 0.02 (annual)
    stableHealthThreshold: number; // 0.5
    optimalHealthThreshold: number; // 0.9
    crisisHealthThreshold: number;  // 0.3
  };

  // NEW: Labor allocation
  labor: {
    baseShares: Record<Sector, number>;
    wageResponsiveness: number;    // 1.0
    reallocationRate: number;      // 0.01
    minSectorShare: number;        // 0.02
    maxSectorShare: number;        // 0.6
  };

  // UPDATED: Market (per-category)
  market: {
    goodConfigs: Record<GoodCategory, GoodMarketConfig>;
    priceLambda: number;
    minPrice: number;
    maxPrice: number;
  };
}
```

---

## Migration Notes

### Breaking Changes
- Production will decrease for depleted ecosystems (Track 03, 07)
- Population growth will slow dramatically (Track 04)
- Trade profitability will decrease (Track 02)

### Backward Compatibility
- Add feature flags for gradual rollout
- Document parameter changes
- Provide migration script for existing saves if needed

---

## Success Metrics

After implementing all tracks:

| Metric | Before | Target |
|--------|--------|--------|
| Market self-correction | None | Price shock causes demand adjustment |
| Trade profitability | ~15% margin = profit | 15% margin ≈ break-even after costs |
| Population doubling time | ~6 months | ~140 years |
| Ecosystem collapse time | Never | ~2000-3000 ticks of overfishing |
| Labor response to prices | None | Shifts within 10-50 ticks |
| Price volatility (food) | High | Lower than luxuries |

---

## Review Checklist

Before implementing each track:
- [ ] Review spec in detail
- [ ] Identify all affected files
- [ ] Write unit tests first (TDD)
- [ ] Implement incrementally
- [ ] Run determinism tests
- [ ] Update documentation
- [ ] Calibrate parameters through simulation runs

---

## Related Documents

- [Economic Model Review](../ECONOMIC_MODEL_REVIEW.md) - Original analysis
- [CLAUDE.md](../../CLAUDE.md) - Project overview and commands
