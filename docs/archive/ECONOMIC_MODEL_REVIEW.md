# Economic Model Review: Living Archipelago Simulation

**Date:** January 2026
**Reviewer:** Economic Modelling Analysis (Multi-Agent Review)

---

## Executive Summary

The Living Archipelago simulation implements a sophisticated agent-based model with interconnected systems for ecology, production, consumption, trade, and population dynamics. The core architecture is sound, but from an economic modelling perspective, several critical gaps and unrealistic assumptions warrant attention.

### Key Findings

| Area | Strengths | Critical Gaps |
|------|-----------|---------------|
| **Market System** | Multiplicative price formation, EMA smoothing | No market clearing, identical elasticity across goods |
| **Production** | Diminishing returns, multi-factor model | Independence assumption, arbitrary floors |
| **Consumption** | Food-health coupling | Completely price-inelastic demand |
| **Population** | Health-based dynamics | No demographics, binary thresholds |
| **Trade** | LLM-powered arbitrage detection | No transport costs, perfect information |
| **Ecology** | Logistic regeneration | Harvest decoupled from production, no externalities |

---

## 1. Market Dynamics & Price Formation

### Current Implementation
```
raw_price = base_price * pressure * velocity * event_modifiers
final_price = current_price + lambda * (raw_price - current_price)
```

Where:
- **Pressure** = `(ideal_stock / current_stock)^1.5`
- **Velocity** = `1 + 0.3 * (consumption_rate / reference_rate)`
- **Lambda** (smoothing) = 0.1

### Issues & Recommendations

#### Issue 1.1: Non-Standard Elasticity (High Priority)
The pressure exponent (gamma = 1.5) creates **3-5x more price responsiveness** than real commodity markets (typically 0.3-0.8).

**Impact:** 10% inventory reduction causes ~15% price increase, creating volatile swings.

**Recommendation:**
```typescript
// Consider good-specific elasticity
const priceGamma = {
  Fish: 0.8,    // Essential, lower elasticity
  Grain: 0.6,   // Staple food
  Timber: 1.0,  // Material good
  Tools: 1.2,   // Durable
  Luxuries: 1.5 // High elasticity
};
```

#### Issue 1.2: No Market Clearing Mechanism (High Priority)
The market system only updates prices. It does not:
- Clear inventory through price-driven demand
- Allocate scarce goods
- Model substitution effects
- Handle excess demand (shortages)

**Current flow:** Production creates goods -> Consumption removes goods -> Prices adjust to inventory

**Problem:** If an island produces 100 fish but consumes 200, inventory goes negative (clamped at 0), health penalty kicks in, but there's no mechanism for price to attract supply beyond the signal.

**Recommendation:** Implement demand curves where consumption responds to price:
```typescript
const effectiveDemand = baseDemand * Math.pow(basePrice / currentPrice, demandElasticity);
```

#### Issue 1.3: Identical Elasticity Across All Goods
All goods use the same pressure formula despite economic reality:
- Essential goods (food) should have lower elasticity
- Luxury goods should have higher elasticity
- Non-perishables should differ from perishables

#### Issue 1.4: Extreme Price Bounds
Range [0.1, 1000] allows 10,000x price variation. With base prices 6-30, this permits unrealistic swings.

**Recommendation:** Tighten bounds to 0.3x - 5x base price for stability.

#### Issue 1.5: No Cross-Good Price Relationships
Prices are completely independent. Missing:
- **Substitution effects:** If fish expensive, consumers switch to grain
- **Production complementarities:** Tool prices should affect all production
- **Cross-island arbitrage pricing:** No forward-looking price adjustment

---

## 2. Production System

### Current Implementation
```
effective_prod = base_rate * labour_mod * ecosystem_mod * tool_mod * health_mod * event_mod
```

| Modifier | Formula | Range |
|----------|---------|-------|
| Labour | `(s / s_ref)^0.7` capped at 2.0 | 0.5 - 2.0 |
| Ecosystem | `0.2 + 0.8 * (r / r_ref)` | 0.2 - 1.0 |
| Tools | `1 + 0.5 * log(1 + tools_per_capita)` | 1.0 - ~2.0 |
| Health | `0.5 + 0.5 * health` | 0.5 - 1.0 |

### Issues & Recommendations

#### Issue 2.1: Independence Assumption (High Priority)
The multiplicative structure assumes production factors are independent. In reality:
- Labor productivity depends on ecosystem state (fishing in depleted waters)
- Tool efficiency depends on labor skill level
- Health affects both quantity AND quality of work

**Problem:** A sick worker with good tools is treated as equally productive as a healthy worker with poor tools (via multiplication).

**Recommendation:** Add conditional logic:
```typescript
// Interaction effects
if (ecosystemMod < 0.4 && laborShare > threshold) {
  laborMod *= 0.8; // Additional penalty for overexploitation
}
```

#### Issue 2.2: Uniform Labour Alpha (Medium Priority)
The alpha parameter (0.7) is identical across all sectors. Real economies show:
- Fishing: Higher elasticity (0.8) - benefits from labor concentration
- Farming: Lower elasticity (0.5) - land is fixed constraint
- Services: Very low elasticity (0.4) - diminishing returns fast

**Recommendation:**
```typescript
const sectorAlpha = {
  fishing: 0.8,
  farming: 0.5,
  forestry: 0.6,
  industry: 0.7,
  services: 0.4,
};
```

#### Issue 2.3: Ecosystem Floor Prevents Collapse (Medium Priority)
Formula: `0.2 + 0.8 * (r / r_ref)`

**Problem:** Depleted fishery (r=0) still yields 20% production. An island with no fish can still "produce" fish.

**Recommendation:** Remove the 0.2 floor in production; let depletion genuinely disable sectors. Add separate minimum population stability mechanics (migration, crisis events) to prevent death spirals.

#### Issue 2.4: Missing Specialization & Learning (Low Priority)
No mechanisms for:
- Learning-by-doing (cumulative experience)
- Specialization bonuses (sector thresholds)
- Total Factor Productivity growth

**Recommendation:**
```typescript
// Track cumulative production for learning
const learningBonus = 1 + 0.0001 * cumulativeProduction[sector];
effectiveRate *= learningBonus;
```

---

## 3. Consumption & Utility

### Current Implementation
- **Food:** Deterministic per-capita constant (0.05 units/person/hour)
- **Luxury:** Optional, event-driven (1% of population * multiplier)

### Issues & Recommendations

#### Issue 3.1: Completely Inelastic Food Demand (Critical)
Food consumption is completely inelastic to price, income, or population health:
- Health 1.0: consumes exactly 0.05 units/hour
- Health 0.1: consumes exactly 0.05 units/hour
- 10x price: consumes exactly 0.05 units/hour

**Real-world expectation:**
- Higher food prices -> lower consumption (substitution)
- Lower health -> lower consumption (rationing)
- Crisis -> rationing behavior emerges

**Recommendation:**
```typescript
const priceElasticity = -0.3; // Inelastic but not zero
const effectiveConsumption = baseConsumption * Math.pow(basePrice / currentPrice, priceElasticity);
```

#### Issue 3.2: No Utility Function (Medium Priority)
Luxury consumption adds 0.001 health per unit consumed - an arbitrary number with no microeconomic foundation.

**Recommendation:** Model diminishing marginal utility:
```typescript
const luxuryUtility = config.maxLuxuryBonus * (1 - Math.exp(-luxuryConsumed / pop));
```

#### Issue 3.3: Binary Food Sufficiency (Medium Priority)
Either full ration (0 deficit, no penalty) or partial ration (linear penalty). No intermediate consumption path.

---

## 4. Population & Labor Economics

### Current Implementation
- Growth: 0.01% per hour when health > 0.8
- Decline: Up to 1% per hour at health 0 when health < 0.3
- Labor: 5 sectors, shares sum to 1 (zero unemployment)

### Issues & Recommendations

#### Issue 4.1: Extreme Growth Rate (High Priority)
Growth of 0.01% per hour = ~88% annually. Historical pre-industrial growth was 0.05-0.1% per year.

**Recommendation:** Scale down by factor of 100-1000.

#### Issue 4.2: Binary Health Thresholds (High Priority)
Population only grows above 0.8 health and only declines below 0.3. Between 0.3-0.8, population is static.

**Creates:**
- Unrealistic plateau dynamics
- Insensitivity to marginal health improvements
- Population inertia

**Recommendation:** Use continuous response:
```typescript
const growthRate = maxRate * sigmoid(health - threshold);
```

#### Issue 4.3: No Demographic Structure (Medium Priority)
Population treated as homogeneous mass. Missing:
- Age structure (working-age, children, elderly)
- Life expectancy as function of health
- Labor force participation rates
- Dependency ratio

#### Issue 4.4: Labor Allocation Ignores Prices (High Priority)
Current weights are arbitrary based on ecosystem health:
```typescript
fishing: fishHealth * 0.3
forestry: forestHealth * 0.2
farming: soilHealth * 0.3
industry: 0.1
services: 0.1
```

**Problem:** Labor allocation ignores prices entirely. Real workers allocate based on expected income, not resource abundance.

**Recommendation:** Wage-based allocation:
```typescript
const wage_i = price_i * marginalProduct_i;
const laborTarget_i = labor_i * (wage_i / avgWage);
```

#### Issue 4.5: No Unemployment Modeling (Low Priority)
A population of 500 with labor = {fishing: 0.45, ...} doesn't specify:
- Are all 225 fishing workers fully employed?
- Is there structural/cyclical unemployment?
- What is effective labor force?

---

## 5. Trade & Shipping Economics

### Current Implementation
- LLM strategist detects price arbitrage across islands
- Executor validates trades with 10-15% minimum margin
- Ships move with speed-based travel time
- Spoilage: Fish 2%/hr, Grain 0.1%/hr

### Issues & Recommendations

#### Issue 5.1: No Transport Cost Model (Critical)
Ships move freely with only speed-based travel time. No:
- Cargo capacity utilization cost
- Fuel/maintenance/crew costs
- Per-voyage fixed costs

**Real impact:** In maritime trade, transport costs (5-20% of cargo value) are essential constraints. Ships earning 15% margin while paying 10% in transport barely break even.

**Recommendation:**
```typescript
const transportCost = baseVoyageCost + (cargoVolume * perUnitCost);
const netProfit = sellPrice - buyPrice - transportCost - spoilageLoss;
```

#### Issue 5.2: Spoilage vs. Profit Margin Imbalance (High Priority)
- Fish spoils at 2%/hour
- 24-hour voyage loses ~36% of fish cargo (exp(-0.02*24) = 0.64)
- Executor requires only 10% margin

**Problem:** A trader buying fish at price P, waiting 24 hours while 36% spoils, then selling at +10% margin has negative ROI.

#### Issue 5.3: Perfect Information (Medium Priority)
Strategist receives all island prices each turn. No:
- Discovery lag
- Information cost
- Information asymmetry

**Consequence:** Information arbitrage cannot exist; only price arbitrage based on production differences.

#### Issue 5.4: No Circular Route Economics (Medium Priority)
Ship A->B->A requires:
- A->B voyage: earn margin on cargo
- B->A voyage: return empty

Current model has no return voyage cost, so agents always have profitable circular arbitrage.

#### Issue 5.5: Spoilage Only During Transit (Low Priority)
Spoilage applies only during shipping, not stored inventory on islands.

**Reality:** Spoilage doesn't stop when cargo sits in a warehouse.

---

## 6. Ecology & Natural Capital

### Current Implementation
Logistic regeneration:
```
R_{t+1} = clamp(R_t + dt * (r * R_t * (1 - R_t / K) - harvest_t), 0, K)
```

Three resources: Fish stock, Forest biomass, Soil fertility

### Issues & Recommendations

#### Issue 6.1: Harvest Decoupled from Production (Critical)
Fish harvest calculated as `0.1 * fishProductionRate * laborModifier * healthModifier`

**Problem:** A population producing 100 units of fish doesn't necessarily harvest 100 from the ecosystem - the relationship is arbitrary (10%).

**Recommendation:** Production = Harvest (with efficiency losses):
```typescript
const harvest = actualProduction / harvestEfficiency;
```

#### Issue 6.2: No Collapse Dynamics (High Priority)
Ecosystem modifier: `0.2 + 0.8 * (resource/capacity)`

Even at 0 fish stock, productivity stays at 20% baseline. No collapse threshold.

**Real-world:** Cod fishery collapse was catastrophic because fishing continued post-collapse.

**Recommendation:** Nonlinear collapse:
```typescript
if (resourceLevel < criticalThreshold) {
  modifier = 0.2 * Math.pow(resourceLevel / criticalThreshold, 2);
}
```

#### Issue 6.3: No Tragedy of the Commons (High Priority)
The simulation has weak incentive structures for resource depletion:
- Labor automatically reallocates toward healthy sectors
- No competition for shared resources
- No coordination failure dynamics

**Recommendation:** Model resources as common pool with multi-agent extraction.

#### Issue 6.4: Missing Ecosystem Services (Medium Priority)
Market prices only cover: Fish, Grain, Timber, Tools, Luxuries

**Missing valuations:**
- Nutrient cycling
- Water filtration by forests
- Storm surge protection
- Pollination services

**Problem:** Cutting down all forests appears profitable (capture 100% harvest value, pay 0% ecosystem service loss).

#### Issue 6.5: No Irreversible Degradation (Medium Priority)
Soil fertility at 0.2 can regenerate to 0.9 if farming stops. Real soil degradation (salinization, erosion) is often irreversible.

#### Issue 6.6: Static Carrying Capacities (Low Priority)
Fish capacity = 1000, Forest = 1000, Soil = 1.0 - never adjust based on climate, disease, or cumulative degradation.

---

## 7. Priority Recommendations Summary

### Critical (Must Fix)
1. **Implement price-elastic demand** - consumption must respond to prices
2. **Add transport costs to shipping** - voyages need economic cost
3. **Couple harvest to production** - physical flow accounting
4. **Reduce population growth rate** - 100x too high

### High Priority
5. **Good-specific price elasticity** - essentials vs. luxuries differ
6. **Wage-based labor allocation** - workers follow money, not resources
7. **Continuous population dynamics** - remove binary thresholds
8. **Add collapse thresholds** - nonlinear ecosystem failure

### Medium Priority
9. **Cross-good substitution** - fish/grain substitutes
10. **Spoilage on stored inventory** - not just in transit
11. **Production factor interactions** - remove independence assumption
12. **Add demographic structure** - age cohorts matter

### Low Priority (Enhancement)
13. Learning-by-doing mechanics
14. Ecosystem service valuation
15. Information asymmetry in trade
16. Circular route economics

---

## 8. Suggested Configuration Changes

```typescript
// More realistic defaults
const suggestedConfig = {
  // Market - reduce volatility
  priceGamma: 0.8,           // Down from 1.5
  minPrice: 2.0,             // Up from 0.1
  maxPrice: 100,             // Down from 1000

  // Population - slower dynamics
  populationGrowthRate: 0.00001,    // Down from 0.0001
  populationDeclineThreshold: 0.4,   // Up from 0.3
  populationGrowthThreshold: 0.7,    // Down from 0.8

  // Production - remove floors
  ecosystemFloor: 0.05,      // Down from 0.2

  // Consumption - add elasticity
  foodPriceElasticity: -0.3,

  // Shipping - add costs
  baseVoyageCost: 10,
  perVolumeTransportCost: 0.5,
};
```

---

## 9. Research Questions for Further Investigation

1. **What equilibrium emerges?** Do islands converge to specialization or autarky?
2. **Collapse sensitivity:** How many ticks until first population collapse with current parameters?
3. **Trade profitability:** What is average trader ROI accounting for spoilage?
4. **Ecosystem stability:** Do resources stabilize or oscillate?
5. **Price convergence:** Do inter-island prices converge over time?

---

## Appendix: Files Reviewed

- `src/systems/market.ts` - Price formation
- `src/systems/production.ts` - Production functions
- `src/systems/consumption.ts` - Consumption patterns
- `src/systems/population.ts` - Demographics and labor
- `src/systems/shipping.ts` - Trade logistics
- `src/systems/ecology.ts` - Resource regeneration
- `src/core/types.ts` - Type definitions
- `src/core/world.ts` - Initialization and config
- `src/agents/traders/` - LLM trader implementation
