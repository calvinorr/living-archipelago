# Track: Transport Costs in Shipping

**Priority:** Critical
**Status:** Planning
**Estimated Complexity:** Medium
**Files Affected:** `src/systems/shipping.ts`, `src/agents/traders/executor.ts`, `src/core/types.ts`, `src/core/world.ts`

---

## Problem Statement

Ships currently move **for free**. There are no:
- Fuel/maintenance costs
- Per-voyage fixed costs
- Capacity utilization penalties
- Return voyage (deadheading) costs

This makes arbitrage unrealistically profitable. A 15% margin trade is pure profit, when real maritime trade has 5-20% of cargo value consumed by transport costs.

---

## Current Implementation

```typescript
// shipping.ts - voyage execution
// Ship travels from A to B
// Only costs: time (spoilage) and opportunity cost (capital tied up)
// No explicit monetary cost for the voyage
```

```typescript
// executor.ts - profit calculation
const margin = (sellPrice - buyPrice) / buyPrice;
// Margin is compared to minProfitMargin (0.10-0.15)
// No transport cost deducted
```

---

## Design

### Cost Components

1. **Per-Distance Cost:** Scales with voyage length
   ```
   distanceCost = distance * ship.costPerDistanceUnit
   ```

2. **Per-Voyage Fixed Cost:** Loading/unloading, port fees
   ```
   fixedCost = config.baseVoyageCost
   ```

3. **Cargo Volume Cost:** Larger cargos cost more to handle
   ```
   cargoCost = totalCargoVolume * config.perVolumeHandlingCost
   ```

4. **Return Voyage Penalty:** Empty returns cost ~50% of loaded trip
   ```
   returnCost = distance * ship.costPerDistanceUnit * 0.5
   ```

### Total Transport Cost Formula

```
transportCost = fixedCost + (distance * costPerDistance) + (volume * handlingCost)
roundTripCost = transportCost + returnCost (if returning empty)
```

### Profit Calculation Update

```
netProfit = (sellPrice * quantity) - (buyPrice * quantity) - transportCost - spoilageLoss
ROI = netProfit / (buyPrice * quantity + transportCost)
```

---

## Specification

### New Types

```typescript
// types.ts additions
interface ShippingConfig {
  baseVoyageCost: number;        // Fixed cost per voyage (default: 10)
  costPerDistanceUnit: number;   // Per-distance cost (default: 0.1)
  perVolumeHandlingCost: number; // Per-cargo-volume cost (default: 0.05)
  emptyReturnMultiplier: number; // Cost multiplier for empty return (default: 0.5)
}

interface ShipState {
  // ... existing fields
  cash: number;
  // NEW: track voyage costs
  lastVoyageCost?: number;
  cumulativeTransportCosts: number;
}
```

### Transport Cost Calculator

```typescript
// shipping.ts - new function
function calculateTransportCost(
  ship: ShipState,
  origin: IslandId,
  destination: IslandId,
  cargoVolume: number,
  config: ShippingConfig
): TransportCostBreakdown {
  const distance = getDistance(origin, destination);

  const fixedCost = config.baseVoyageCost;
  const distanceCost = distance * config.costPerDistanceUnit;
  const volumeCost = cargoVolume * config.perVolumeHandlingCost;
  const oneWayCost = fixedCost + distanceCost + volumeCost;

  // Return voyage (assuming empty unless planning round trip with backhaul)
  const returnCost = distance * config.costPerDistanceUnit * config.emptyReturnMultiplier;

  return {
    oneWayCost,
    returnCost,
    totalRoundTrip: oneWayCost + returnCost,
    breakdown: { fixedCost, distanceCost, volumeCost, returnCost }
  };
}
```

### Updated Executor Profit Logic

```typescript
// executor.ts - updated profit calculation
function evaluateTradeOpportunity(
  buyIsland: IslandId,
  sellIsland: IslandId,
  good: GoodId,
  quantity: number,
  buyPrice: number,
  sellPrice: number,
  ship: ShipState,
  config: ShippingConfig
): TradeEvaluation {
  const cargoVolume = quantity * GOODS[good].bulkiness;

  // Transport costs
  const transport = calculateTransportCost(
    ship, buyIsland, sellIsland, cargoVolume, config
  );

  // Spoilage estimate
  const travelTime = getDistance(buyIsland, sellIsland) / ship.speed;
  const spoilageRate = GOODS[good].spoilageRate;
  const survivalRate = Math.exp(-spoilageRate * travelTime);
  const deliveredQuantity = quantity * survivalRate;
  const spoilageLoss = (quantity - deliveredQuantity) * buyPrice;

  // Profit calculation
  const revenue = deliveredQuantity * sellPrice;
  const costOfGoods = quantity * buyPrice;
  const totalCost = costOfGoods + transport.totalRoundTrip + spoilageLoss;
  const netProfit = revenue - totalCost;

  // ROI considers capital tied up
  const capitalRequired = costOfGoods + transport.oneWayCost;
  const roi = netProfit / capitalRequired;

  return {
    netProfit,
    roi,
    transportCost: transport.totalRoundTrip,
    spoilageLoss,
    viable: roi > config.minProfitMargin,
    breakdown: { revenue, costOfGoods, transport, spoilageLoss }
  };
}
```

---

## Implementation Plan

### Phase 1: Add Config & Types
- [ ] Add `ShippingConfig` interface to types
- [ ] Add transport cost fields to `ShipState`
- [ ] Update `createDefaultConfig()` with shipping cost defaults
- [ ] Document typical cost ranges

### Phase 2: Implement Cost Calculator
- [ ] Create `calculateTransportCost()` function in `shipping.ts`
- [ ] Add `TransportCostBreakdown` type for detailed cost analysis
- [ ] Ensure costs use existing distance calculations

### Phase 3: Update Executor Profit Logic
- [ ] Modify `evaluateTradeOpportunity()` to include transport costs
- [ ] Update `findGoodsToBuy()` to consider transport in profitability
- [ ] Adjust `minProfitMargin` interpretation (now net of transport)

### Phase 4: Deduct Costs from Ship Cash
- [ ] Deduct transport costs when voyage completes in `processShipping()`
- [ ] Track `cumulativeTransportCosts` on ship state
- [ ] Ensure ship has sufficient cash before embarking (or abort voyage)

### Phase 5: Strategist Awareness
- [ ] Update strategist prompt to include transport cost considerations
- [ ] Provide transport cost estimates in observable state
- [ ] Consider backhaul opportunities (return with cargo vs. empty)

### Phase 6: Testing
- [ ] Unit test: transport costs calculated correctly for various distances
- [ ] Unit test: executor rejects trades that are unprofitable after transport
- [ ] Unit test: ship cash decreases by transport cost
- [ ] Integration test: trader makes fewer but more profitable trades
- [ ] Determinism test: same seed produces same results

### Phase 7: Tuning & Calibration
- [ ] Run simulations with various cost parameters
- [ ] Target: transport costs = 5-15% of typical cargo value
- [ ] Verify arbitrage is still possible but not unlimited

---

## Behavioral Changes Expected

| Scenario | Before | After |
|----------|--------|-------|
| Short-distance trade | Always profitable at 10% margin | Profitable |
| Long-distance trade | Always profitable at 10% margin | May be unprofitable due to costs |
| Perishable long haul | Profitable if margin > spoilage | Must overcome transport + spoilage |
| Return voyage | Free | Costs 50% of outbound voyage |
| Partial cargo | Same profit per unit | Lower profit due to fixed costs |

---

## Economic Impact

1. **Trade Volume:** Expect 20-40% reduction in total voyages
2. **Trade Profitability:** Real margins become tighter, more realistic
3. **Route Selection:** Traders will prefer shorter routes, high-margin goods
4. **Backhaul Incentives:** Traders will seek round-trip cargo to avoid empty returns
5. **Capital Constraints:** Ships will deplete cash over time, requiring profitable trades

---

## Configuration Recommendations

| Parameter | Conservative | Balanced | Aggressive |
|-----------|--------------|----------|------------|
| baseVoyageCost | 5 | 10 | 20 |
| costPerDistanceUnit | 0.05 | 0.1 | 0.2 |
| perVolumeHandlingCost | 0.02 | 0.05 | 0.1 |
| emptyReturnMultiplier | 0.3 | 0.5 | 0.7 |

**Typical scenario (balanced):**
- Distance: 100 units
- Cargo: 50 volume units
- Transport cost: 10 + (100 × 0.1) + (50 × 0.05) = 22.5
- Round trip: 22.5 + (100 × 0.1 × 0.5) = 27.5
- For cargo worth 200, transport = 13.75% of value

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Trade becomes unviable | Start with conservative costs, tune up gradually |
| Ships run out of cash | Add cash reserve warnings, profitable trade requirements |
| Backhaul complexity | Phase 2: simple one-way; Phase 3: add backhaul planning |
| Strategist doesn't adapt | Update prompt with explicit cost awareness |

---

## Success Criteria

1. Transport costs consume 5-15% of typical cargo value
2. Long-distance trades require higher margins to be viable
3. Ship cash dynamics are realistic (depletes if unprofitable)
4. Traders naturally prefer shorter routes when margins are similar
5. All tests pass including determinism
