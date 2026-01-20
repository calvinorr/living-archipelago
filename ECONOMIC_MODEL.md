# Living Archipelago Economic Model

> **Single Source of Truth** for the economic simulation model.
> Last updated: January 2026

---

## Table of Contents

1. [Overview](#1-overview)
2. [Current Implementation Status](#2-current-implementation-status)
3. [Core Economic Systems](#3-core-economic-systems)
4. [Configuration Reference](#4-configuration-reference)
5. [Future Development Roadmap](#5-future-development-roadmap)
6. [Research Foundation](#6-research-foundation)

---

## 1. Overview

Living Archipelago is an agent-based economic simulation featuring interconnected maritime islands. The economy models:

- **5 Tradeable Goods**: Fish, Grain, Timber, Tools, Luxuries
- **5 Labor Sectors**: Fishing, Forestry, Farming, Industry, Services
- **3 Ecosystem Resources**: Fish stocks, Forest biomass, Soil fertility
- **LLM-Powered Traders**: Agents that detect arbitrage and execute trades

### Design Philosophy

The model follows these principles:

1. **Deterministic Reproducibility** - Seeded RNG ensures identical results from same seed
2. **Ecological Coupling** - Production is constrained by ecosystem health
3. **Price Signals Drive Behavior** - Labor, consumption, and trade respond to prices
4. **Emergent Complexity** - Simple rules create complex outcomes

---

## 2. Current Implementation Status

### Completed Features

| Track | Feature | Status | Key Files |
|-------|---------|--------|-----------|
| 01 | Price-Elastic Demand | **DONE** | `src/systems/consumption.ts` |
| 03 | Harvest-Production Coupling | **DONE** | `src/systems/production.ts`, `ecology.ts` |
| 04 | Realistic Population Growth | **DONE** | `src/systems/population.ts` |
| 06 | Wage-Based Labor Allocation | **DONE** | `src/systems/population.ts` |
| 07 | Ecosystem Collapse Thresholds | **DONE** | `src/systems/ecology.ts` |
| -- | Fish Migration | **DONE** | `src/systems/ecology.ts` |
| -- | AI Analyst System | **DONE** | `src/analyst/`, `packages/web/src/app/analyst/` |
| -- | Building System (Workshops) | **DONE** | `src/systems/buildings.ts` |
| -- | Crew System | **DONE** | `src/systems/crew.ts` |
| -- | Ship Maintenance | **DONE** | `src/systems/shipping.ts` |

### Not Yet Implemented

| Track | Feature | Priority | Complexity |
|-------|---------|----------|------------|
| 02 | Transport Costs | Critical | Medium |
| 05 | Good-Specific Price Elasticity | High | Medium |
| -- | Currency Sinks (Transaction Tax) | Critical | Low |
| -- | Order Book Market | High | High |
| -- | Production Chains | Medium | High |
| -- | Inventory Spoilage (Stored) | Medium | Low |
| -- | Agent Personalities | Medium | Low |
| -- | Governance/Quotas | Low | Medium |

---

## 3. Core Economic Systems

### 3.1 Market System

**File**: `src/systems/market.ts`

**Price Formation Formula**:
```
raw_price = base_price × pressure × velocity × event_modifiers
final_price = current_price + λ × (raw_price - current_price)
```

Where:
- **Pressure** = `(ideal_stock / current_stock)^γ` where γ = 1.5
- **Velocity** = `1 + 0.3 × (consumption_rate / reference_rate)`
- **λ (smoothing)** = 0.1 (EMA smoothing)

**Price Bounds**: [0.1, 1000]

**Known Limitations**:
- All goods use same elasticity (γ = 1.5)
- No transaction costs or taxes
- Perfect information (all prices visible)

---

### 3.2 Production System

**File**: `src/systems/production.ts`

**Production Formula**:
```
production = base_rate × labor_mod × ecosystem_mod × tool_mod × health_mod × building_mod × event_mod
```

**Modifiers**:

| Modifier | Formula | Range |
|----------|---------|-------|
| Labor | `(share / ref_share)^0.7` capped at 2.0 | 0.5 - 2.0 |
| Ecosystem | `0.05 + 0.95 × (resource / capacity)` | 0.05 - 1.0 |
| Tools | `1 + 0.5 × log(1 + tools_per_capita)` | 1.0 - ~2.0 |
| Health | `0.2 + 0.8 × health` | 0.2 - 1.0 |

**Harvest-Production Coupling** (Track 03):
- Extractive goods (fish, timber) are limited by ecosystem yield curve
- `harvest = production / harvest_efficiency`
- Yield multiplier scales with ecosystem health state

---

### 3.3 Consumption System

**File**: `src/systems/consumption.ts`

**Price-Elastic Demand** (Track 01):
```typescript
// Price elasticity effect
demand = base_demand × (base_price / current_price)^(-elasticity)

// Substitution between fish and grain
grain_share = 0.5 + 0.25 × tanh(log(relative_price) × substitution_elasticity)
fish_share = 1 - grain_share
```

**Configuration**:
- `foodPriceElasticity`: -0.3 (inelastic but responsive)
- `luxuryPriceElasticity`: -1.2 (highly elastic)
- `foodSubstitutionElasticity`: 0.5

**Health Factor**: Sick populations consume less (rationing)

---

### 3.4 Population System

**File**: `src/systems/population.ts`

**Growth Model** (Track 04):
```typescript
// Continuous growth curve based on health
if (health <= crisis) return -1.0;      // Max decline
if (health < stable) return interpolate(-1.0, 0.0);
if (health < optimal) return interpolate(0.0, 1.0);
return 1.0;                             // Max growth

// Convert annual rate to hourly
hourly_rate = (1 + annual_rate)^(1/8760) - 1
```

**Health Thresholds**:
- Crisis: 0.3 (below = population decline)
- Stable: 0.5 (equilibrium point)
- Optimal: 0.9 (above = maximum growth)

**Realistic Rates**:
- Max Growth: 0.5% per year (was 88% before fix)
- Max Decline: 2% per year

**Wage-Based Labor** (Track 06):
```typescript
wage[sector] = price[good] × marginal_product
target_share = base_share × (wage / avg_wage)^responsiveness
// Workers reallocate gradually (max 1% per tick)
```

---

### 3.5 Ecology System

**File**: `src/systems/ecology.ts`

**Logistic Regeneration**:
```
R_{t+1} = R_t + dt × (r × R_t × (1 - R_t / K) × recovery_mult - harvest)
```

**Ecosystem Health States** (Track 07):

| State | Stock Ratio | Yield | Recovery |
|-------|-------------|-------|----------|
| Healthy | >60% | 100% | 100% |
| Stressed | 30-60% | Linear decline | 100% |
| Degraded | 10-30% | Quadratic decline | 50% (hysteresis) |
| Collapsed | 2-10% | Minimal | 10% |
| Dead | <2% | 0% | 0% (needs intervention) |

**Fish Migration**:
- Fish migrate from depleted (<30%) to healthy (>60%) islands
- Migration rate proportional to depletion severity
- Prevents total ecosystem collapse

---

### 3.6 Shipping System

**File**: `src/systems/shipping.ts`

**Current Features**:
- Distance-based travel time
- Cargo spoilage during transit (Fish: 2%/hr, Grain: 0.1%/hr)
- Ship condition and maintenance
- Crew morale and wages

**Missing** (Track 02):
- Transport costs (fixed + distance + volume)
- Return voyage economics

---

### 3.7 Trade & Agents

**Files**: `src/agents/traders/`

**Architecture**:
- **Strategist**: LLM-powered (Gemini Flash) for complex reasoning
- **Executor**: Rule-based validation (10-15% minimum margin)
- **Trigger System**: Event-driven to minimize LLM calls

**Trade Execution**:
1. Agent observes prices across all islands
2. Strategist identifies arbitrage opportunities
3. Executor validates margin and executes
4. Ship travels, cargo spoils, goods delivered

---

## 4. Configuration Reference

### Key Parameters

```typescript
// Population (Track 04)
maxGrowthRate: 0.005,          // 0.5% annual growth
maxDeclineRate: 0.02,          // 2% annual decline
crisisHealthThreshold: 0.3,
stableHealthThreshold: 0.5,
optimalHealthThreshold: 0.9,

// Consumption (Track 01)
foodPriceElasticity: -0.3,
luxuryPriceElasticity: -1.2,
foodSubstitutionElasticity: 0.5,
healthConsumptionFactor: 0.3,
foodPerCapita: 0.05,

// Production
labourAlpha: 0.7,              // Labor elasticity
toolBeta: 0.5,                 // Tool productivity
harvestEfficiency: 1.0,        // 1:1 harvest to production

// Ecosystem (Track 07)
healthyThreshold: 0.6,
criticalThreshold: 0.3,
collapseThreshold: 0.1,
deadThreshold: 0.02,
collapseFloor: 0.05,
impairedRecoveryMultiplier: 0.5,
collapsedRecoveryMultiplier: 0.1,

// Labor (Track 06)
laborConfig: {
  wageResponsiveness: 1.0,
  reallocationRate: 0.01,      // 1% max change per hour
  minSectorShare: 0.02,
  maxSectorShare: 0.6,
}
```

### Config Overrides System

AI-suggested improvements can be persisted to `config/simulation-overrides.json`:

```bash
# View current overrides
curl http://localhost:3001/api/config/overrides

# Apply an improvement
curl -X POST http://localhost:3001/api/analyst/improvements/apply \
  -H "Content-Type: application/json" \
  -d '{"configPath":"maxGrowthRate","newValue":0.003}'

# Clear all overrides
curl -X DELETE http://localhost:3001/api/config/overrides
```

---

## 5. Future Development Roadmap

### Phase 1: Trade Economics (Next Priority)

#### Track 02: Transport Costs
Add real costs to shipping:
```typescript
transportCost = baseVoyageCost + (distance × costPerUnit) + (volume × handlingCost)
netProfit = sellPrice - buyPrice - transportCost - spoilageLoss
```

#### Track 05: Good-Specific Elasticity
Different price sensitivity per good category:
```typescript
priceGamma = {
  food: 0.6,      // Essential, low elasticity
  material: 1.0,  // Standard
  tool: 1.2,      // Durable, higher elasticity
  luxury: 1.5,    // Very elastic
}
```

### Phase 2: Currency & Markets

#### Currency Sinks
Implement MIMO (Money In, Money Out) balance:
- **Transaction Tax**: 3-5% on all trades
- **Harbor Fees**: Per-voyage cost
- **Maintenance Costs**: Ship upkeep (partially done)

#### Order Book Market (Future)
Replace formula-based pricing with bid/ask orders:
- Enables speculation and market depth
- Creates bid-ask spreads
- Allows limit orders

### Phase 3: Production Depth

#### Production Chains
Multi-step production:
```typescript
tools = timber(2) + labor(4)
luxuries = cloth(1) + dye(0.5) + tools(0.1)
```

#### Inventory Spoilage
Goods spoil in storage, not just transit:
- Creates urgency to sell
- Prevents infinite hoarding

### Phase 4: Agent Enhancement

#### Agent Personalities
Behavioral diversity:
- Cooperative (27%): Conservative, fair prices
- Competitive (34%): Opportunistic, price-sensitive
- Aggressive (39%): Maximizes short-term, undercuts

#### Agent Memory
Learning from experience:
- Track successful/failed trades
- Adjust strategy based on outcomes
- Build trust relationships

---

## 6. Research Foundation

### Academic Sources

1. **Generative Agent-Based Modeling** (KDD 2025)
   - LLM agents naturally exhibit role specialization
   - Memory systems enable learning from past trades
   - [arXiv:2506.04699](https://arxiv.org/abs/2506.04699)

2. **ABIDES-Economist** (JPMorgan, 2024)
   - Heterogeneous agents calibrated against real data
   - [arXiv:2402.09563](https://arxiv.org/abs/2402.09563)

3. **Coupled Human-Ecological Systems**
   - Tragedy of the commons dynamics
   - 27/34/39% cooperative/competitive/aggressive split
   - [PLOS ONE](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0148403)

### Industry References

1. **EVE Online**
   - Largest virtual economy (20+ years)
   - Full order book, transaction taxes
   - Professional economist oversight

2. **Victoria 3**
   - Wealth tiers, wage-driven labor
   - Market access and infrastructure
   - No stockpiles (snapshot economy)

3. **Dwarf Fortress**
   - Emergent complexity from simple rules
   - Production chains and dependencies
   - Cascading crisis dynamics

### Key Design Insights

| Principle | Source | Implementation |
|-----------|--------|----------------|
| Sink/Faucet Balance | EVE Online | Planned: Transaction tax |
| Wage-Driven Labor | Victoria 3 | **Done**: Track 06 |
| Ecosystem Hysteresis | CHES Research | **Done**: Track 07 |
| Price Elasticity | Standard Economics | **Done**: Track 01 |
| Agent Heterogeneity | GABM Research | Planned: Personalities |

---

## Appendix: File Map

### Core Systems
```
src/systems/
├── market.ts        # Price formation
├── production.ts    # Goods production (Track 03)
├── consumption.ts   # Demand & consumption (Track 01)
├── population.ts    # Health, growth, labor (Track 04, 06)
├── ecology.ts       # Resource regeneration (Track 07)
├── shipping.ts      # Trade logistics
├── buildings.ts     # Workshop bonuses
├── crew.ts          # Ship crew mechanics
└── events.ts        # Random events
```

### Configuration
```
src/core/
├── types.ts         # Type definitions
├── world.ts         # Initial state, defaults
└── simulation.ts    # Tick loop orchestration

config/
└── simulation-overrides.json  # AI-persisted improvements
```

### AI Systems
```
src/analyst/
├── analyst-agent.ts # LLM analysis logic
├── prompts.ts       # Analysis prompts
└── config-patcher.ts # Apply improvements

src/agents/traders/
├── trader-agent.ts  # Main trader logic
├── strategist.ts    # LLM strategy
├── executor.ts      # Trade validation
└── memory.ts        # Trade history
```

---

## Change Log

| Date | Change |
|------|--------|
| Jan 2026 | Initial consolidation from scattered docs |
| Jan 2026 | Tracks 01, 03, 04, 06, 07 implemented |
| Jan 2026 | AI Analyst system complete |
| Jan 2026 | Config overrides persistence added |
