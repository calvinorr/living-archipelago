# Economic Model V2: Realistic Trading System

## Overview

This document outlines the implementation plan for fixing the simulation's economic model to create realistic trading dynamics with proper money flow, capital constraints, and market mechanics.

**Goal:** Transform the economy from "ships exploit infinite arbitrage" to "traders compete in a challenging market with realistic profit margins (5-20%)".

---

## Current Problems Summary

| Problem | Impact | Root Cause |
|---------|--------|------------|
| 700%+ arbitrage profits | Unrealistic wealth accumulation | No friction in trading |
| Islands have no money | One-way wealth transfer | Missing budget system |
| Tax destroys money | Deflationary spiral | No redistribution |
| No spoilage | Perfect goods transport | Missing decay system |
| Instant price knowledge | No uncertainty | Missing information lag |
| Unlimited buyers | No demand constraints | Missing purchasing power |
| Minimal operating costs | Free money | Costs too low |

---

## Implementation Phases

### Phase 1: Spoilage & Transport Friction
**Priority: HIGH | Complexity: MEDIUM | Impact: HIGH**

Makes transport risky and time-sensitive, eliminating static arbitrage.

#### 1.1 Cargo Spoilage System
- [ ] Add `spoilageRate` to good definitions in `src/core/types.ts`
  - Fish: 3% per day (highly perishable)
  - Grain: 1% per day (moderately perishable)
  - Timber: 0.1% per day (durable)
  - Tools: 0% per day (non-perishable)
  - Luxuries: 0% per day (non-perishable)

- [ ] Create spoilage calculation in `src/systems/shipping.ts`
  ```typescript
  function applySpoilage(cargo: Cargo, ticksElapsed: number, config: Config): Cargo {
    const daysElapsed = ticksElapsed / config.ticksPerDay;
    for (const [goodId, quantity] of cargo.entries()) {
      const rate = GOODS[goodId].spoilageRate;
      const lost = quantity * (1 - Math.pow(1 - rate, daysElapsed));
      cargo.set(goodId, quantity - lost);
    }
    return cargo;
  }
  ```

- [ ] Apply spoilage each tick for ships at sea
- [ ] Add spoilage tracking to ship state for reporting
- [ ] Update UI to show spoilage losses

#### 1.2 Extended Travel Times
- [ ] Review and potentially increase base travel times
- [ ] Add weather/event modifiers to travel time
- [ ] Show ETA uncertainty in UI (±10-20%)

#### 1.3 Price Discovery Lag
- [ ] Ships should see "last known price" not current price
- [ ] Price information updates when ship visits island
- [ ] Add `lastVisitTick` to ship's knowledge of each island
- [ ] UI shows price staleness indicator

---

### Phase 2: Island Economics
**Priority: HIGH | Complexity: HIGH | Impact: HIGH**

Gives islands agency and purchasing power, creating demand constraints.

#### 2.1 Island Treasury System
- [ ] Add `treasury` field to `IslandState` in `src/core/types.ts`
  ```typescript
  interface IslandState {
    // ... existing fields
    treasury: number;  // Island's cash reserves
    debt: number;      // Outstanding loans
    creditRating: number; // 0-1, affects borrowing rates
  }
  ```

- [ ] Initialize islands with starting treasury based on population/resources
- [ ] Add treasury to state serialization for UI

#### 2.2 Island Income Sources
- [ ] **Export Revenue**: When ships BUY from island, island receives payment
  ```typescript
  // In executeTrade() for ship buying:
  island.treasury += (price * quantity) - tax;
  ship.cash -= (price * quantity);
  // Tax goes to... (see 2.4)
  ```

- [ ] **Production Value**: Internal consumption has implicit value
- [ ] **Port Fees**: Islands charge docking/trading fees (2-5% of transaction)

#### 2.3 Island Expenses
- [ ] **Import Costs**: When ships SELL to island, island pays from treasury
  ```typescript
  // In executeTrade() for ship selling:
  const cost = price * quantity;
  if (island.treasury >= cost) {
    island.treasury -= cost;
    ship.cash += cost - tax;
  } else {
    // Island can't afford - reduce quantity or reject trade
  }
  ```

- [ ] **Population Maintenance**: Base cost per population per tick
- [ ] **Infrastructure Upkeep**: Building maintenance costs

#### 2.4 Tax Redistribution
- [ ] Create tax collection pool (per island or global)
- [ ] Redistribute tax to fund:
  - Island infrastructure improvements
  - Emergency food purchases during shortages
  - Population health services
- [ ] Track tax flow in economy metrics

#### 2.5 Island Purchasing Power Limits
- [ ] Calculate `maxImportBudget = treasury * importBudgetRatio`
- [ ] Islands prioritize essential goods (food > tools > luxuries)
- [ ] Create demand queue system:
  ```typescript
  interface IslandDemand {
    goodId: GoodId;
    quantity: number;
    maxPrice: number;
    priority: number;
  }
  ```

- [ ] Ships can only sell what islands can afford/want

---

### Phase 3: Realistic Operating Costs
**Priority: MEDIUM | Complexity: LOW | Impact: MEDIUM**

Makes trading require ongoing profitability to sustain.

#### 3.1 Enhanced Crew Costs
- [ ] Increase crew wage rate from 0.5 to 2-5 coins per crew per tick
- [ ] Add crew morale impact on wages (unhappy crew demands more)
- [ ] Crew wages paid regardless of trading activity

#### 3.2 Ship Maintenance Costs
- [ ] Ongoing maintenance: 1-2% of ship value per day
- [ ] Condition-based repairs more expensive when deferred
- [ ] Major overhaul required periodically (expensive)

#### 3.3 Port Fees
- [ ] Entry fee: Fixed cost per port visit (10-50 coins)
- [ ] Docking fee: Per-tick cost while docked (1-5 coins)
- [ ] Loading/unloading fee: Per-unit cargo handling (0.1-0.5 coins)
- [ ] Different islands have different fee structures

#### 3.4 Fuel/Supplies
- [ ] Ships consume supplies during voyage
- [ ] Must purchase supplies at ports
- [ ] Running out of supplies = slower travel, crew morale hit

---

### Phase 4: Capital & Credit System
**Priority: MEDIUM | Complexity: HIGH | Impact: MEDIUM**

Adds financial constraints and consequences.

#### 4.1 Trader Capital Tracking
- [ ] Separate `cash` (liquid) from `assets` (cargo value)
- [ ] Track `netWorth = cash + cargoValue - debt`
- [ ] Bankruptcy threshold: netWorth < 0 for extended period

#### 4.2 Debt Mechanics
- [ ] Ships can borrow from "merchant bank" (system)
- [ ] Interest rate = baseRate + riskPremium
  - Base rate: 2% per 100 ticks
  - Risk premium: Based on debt/asset ratio, history
- [ ] Debt service deducted automatically each tick
- [ ] Maximum leverage: 3x net worth

#### 4.3 Credit Rating
- [ ] Track payment history per ship/agent
- [ ] Defaults increase future borrowing costs
- [ ] Good history reduces rates

#### 4.4 Bankruptcy Consequences
- [ ] Ship seized if debt > assets for too long
- [ ] Agent loses ship, starts over with reduced capital
- [ ] Creates real stakes for risky decisions

---

### Phase 5: Market Depth & Liquidity
**Priority: LOW | Complexity: MEDIUM | Impact: MEDIUM**

Prevents unlimited trading at fixed prices.

#### 5.1 Order Book System
- [ ] Islands have buy/sell orders at different price levels
- [ ] Large trades move the price (market impact)
  ```typescript
  interface OrderBook {
    bids: Array<{ price: number; quantity: number }>;
    asks: Array<{ price: number; quantity: number }>;
  }
  ```

#### 5.2 Price Impact
- [ ] Selling large quantities pushes price down
- [ ] Buying large quantities pushes price up
- [ ] Impact proportional to trade size vs market depth

#### 5.3 Demand Elasticity
- [ ] Higher prices = lower quantity demanded
- [ ] Essential goods (food) less elastic than luxuries
- [ ] Creates natural price ceilings

---

### Phase 6: Supply Volatility
**Priority: LOW | Complexity: LOW | Impact: MEDIUM**

Creates genuine uncertainty and risk.

#### 6.1 Production Variance
- [ ] Add ±20-30% random variance to production each tick
- [ ] Seasonal patterns (fish abundant in summer, grain at harvest)
- [ ] Multi-tick production cycles

#### 6.2 Supply Shocks
- [ ] Random events that dramatically affect supply
- [ ] Bountiful harvest: +50% production for period
- [ ] Blight/disease: -50% production for period
- [ ] These exist but may need tuning

#### 6.3 Demand Shocks
- [ ] Population growth spurts increase demand
- [ ] Festivals increase luxury demand
- [ ] Disease outbreaks increase tool demand (medicine)

---

## Configuration Parameters

New config values to add to `SimulationConfig`:

```typescript
interface EconomicConfig {
  // Spoilage
  spoilageEnabled: boolean;
  spoilageRates: Record<GoodId, number>;  // Per-day rates

  // Island Economics
  islandStartingTreasury: number;  // Base treasury
  islandTreasuryPerPop: number;    // Additional per population
  importBudgetRatio: number;       // Max % of treasury for imports
  portEntryFee: number;
  portDockingFeePerTick: number;
  portCargoFeePerUnit: number;

  // Operating Costs
  crewWagePerTick: number;
  shipMaintenanceRate: number;     // % of ship value per day

  // Credit System
  baseInterestRate: number;        // Per 100 ticks
  maxLeverageRatio: number;
  bankruptcyThreshold: number;     // Ticks below zero networth

  // Market Depth
  priceImpactFactor: number;       // How much large trades move price
  demandElasticity: Record<GoodCategory, number>;

  // Volatility
  productionVariance: number;      // ±% random variance
  supplyShockProbability: number;
  supplyShockMagnitude: number;
}
```

---

## Migration Plan

### Step 1: Add Config (Non-Breaking)
- Add new config fields with defaults that match current behavior
- Spoilage rates = 0, costs = current values, etc.

### Step 2: Implement Features Behind Flags
- Each major feature has enable/disable flag
- Can test individually without breaking simulation

### Step 3: Tune Parameters
- Run simulations with realistic values
- Adjust until profit margins are 5-20%
- Verify economy is sustainable (not deflationary)

### Step 4: Update AI Agents
- Trader agent needs to account for:
  - Spoilage in route planning
  - Island purchasing power
  - Operating costs in profitability calc
  - Credit/debt management

### Step 5: Update UI
- Show island treasury
- Show spoilage losses
- Show operating costs breakdown
- Show debt/credit status

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Average trade profit margin | 100-700% | 5-20% |
| Ship wealth growth per 100 ticks | Exponential | Linear 5-10% |
| Island treasury stability | N/A | ±20% variance |
| Bankruptcy rate | 0% | 5-15% for risky traders |
| Price volatility (std dev) | Low | 15-30% |
| Money supply change | -4% per trade cycle | ±2% |

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/core/types.ts` | Add treasury, debt, spoilage fields |
| `src/core/world.ts` | Initialize new economic fields |
| `src/systems/shipping.ts` | Spoilage, operating costs |
| `src/systems/market.ts` | Island purchasing power, price impact |
| `src/systems/production.ts` | Production variance |
| `src/agents/traders/trader-agent.ts` | Account for new economics |
| `src/agents/traders/executor.ts` | Check island can afford trades |
| `src/server/state-serializer.ts` | Serialize new fields |
| `packages/web/src/lib/types.ts` | Frontend types for new data |
| `packages/web/src/app/trade/page.tsx` | Show new economic data |

---

## Estimated Effort

| Phase | Effort | Dependencies |
|-------|--------|--------------|
| Phase 1: Spoilage | 2-3 days | None |
| Phase 2: Island Economics | 4-5 days | None |
| Phase 3: Operating Costs | 1-2 days | None |
| Phase 4: Credit System | 3-4 days | Phase 2 |
| Phase 5: Market Depth | 2-3 days | Phase 2 |
| Phase 6: Supply Volatility | 1-2 days | None |

**Total: ~15-20 days of development**

Recommended order: Phase 1 → Phase 3 → Phase 2 → Phase 6 → Phase 4 → Phase 5

---

## References

- [Medieval Trade Economics](https://www.worldhistory.org/article/1301/trade-in-medieval-europe/)
- [Age of Sail Maritime Economics](https://www.cambridge.org/core/books/market-for-seamen-in-the-age-of-sail)
- [Small Island Developing States](https://en.wikipedia.org/wiki/Small_Island_Developing_States)
- [Commodity Trading Margins](https://www.mckinsey.com/industries/electric-power-and-natural-gas/our-insights)
- [Agricultural Price Volatility](https://www.fao.org/markets-and-trade/areas-of-work/emerging-trends-challenges-and-opportunities/agricultural-policy/price-volatility-in-agricultural-markets)
