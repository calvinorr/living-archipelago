# Economic Model Research: Deep Dive Analysis

## Executive Summary

This document presents research findings from academic literature on game economic models, comparing them against Living Archipelago's current implementation. Three major economic modeling paradigms were analyzed:

1. **Generative Agent-Based Modeling (GABM)** - LLM-powered economic agents
2. **Virtual Economy Design (MMO Economics)** - Sink/faucet balancing and market structures
3. **Coupled Human-Ecological Systems (CHES)** - Ecosystem-economy feedback loops

The analysis identifies 12 significant gaps and proposes 8 major improvement tracks.

---

## Part 1: Economic Model Deep Dives

### Model 1: Generative Agent-Based Modeling (GABM)

**Source**: [Xu et al., KDD 2025 - arXiv](https://arxiv.org/html/2506.04699v1)

#### Core Architecture

GABM employs a five-module agent architecture:
- **Profile**: Character traits derived from k-means clustering of real player data
- **Perception**: Environment parsing with numeric-aware embeddings
- **Reasoning**: Zero-shot chain-of-thought planning
- **Memory**: Dual-store (short-term: 10 recent actions; long-term: importance-scored experiences)
- **Action**: Structured game function calls

#### Market Mechanisms

| Feature | Implementation | Living Archipelago Status |
|---------|---------------|---------------------------|
| Dual trading channels | Auctions + P2P negotiation | ❌ Missing - only peer-to-peer exists |
| Price discovery | Supply-demand correlation (r=0.67) | ⚠️ Partial - pressure-based only |
| Role specialization | Emergent from profiles | ⚠️ Partial - island-based only |

#### Key Innovations

1. **Numeric-Aware Embeddings**: Addresses LLM difficulty with numerical reasoning by concentrating dynamic metrics into unified representations
2. **Periodic Reflection**: Agents re-evaluate strategy every n timesteps
3. **Data-Driven Profiles**: Agent personalities grounded in actual player clustering

#### Evaluation Metrics
- **Profitability**: Cumulative spending correlating with performance gains
- **Equality**: Gini coefficient for wealth distribution
- **Human consistency**: 3.8/5.0 rating for profile-behavior alignment

---

### Model 2: Virtual Economy Design (MMO Economics)

**Sources**:
- [Virtual Economic Theory - Game Developer](https://www.gamedeveloper.com/business/virtual-economic-theory-how-mmos-really-work)
- [EVE Online ISK Sinks/Faucets](https://fastercapital.com/content/ISK-Sink-or-ISK-Faucet--The-Economic-Balance-in-EVE-Online.html)
- [Sinks & Faucets Design Lessons](https://medium.com/1kxnetwork/sinks-faucets-lessons-on-designing-effective-virtual-game-economies-c8daf6b88d05)

#### The MIMO Principle (Money In, Money Out)

The fundamental law of virtual economies:

```
Rate(Currency Generation) ≈ Rate(Currency Destruction)
```

**Faucets** (money creation):
- NPC bounties (kills generate currency from nothing)
- Quest rewards
- Insurance payouts
- Resource harvesting that sells to NPCs

**Sinks** (money destruction):
- Transaction taxes (historically largest sink in EVE)
- Broker fees
- Repair costs
- Training/upgrade costs
- Housing/property maintenance
- Ship destruction (PvP)

#### Market Structure Comparison

| Structure | Example | Characteristics |
|-----------|---------|-----------------|
| Sell-only | FFXIV Bazaar | Sellers control price; buyers have no power |
| Dual-order | EVE Online | Buyers AND sellers compete; drives to opportunity cost |
| Auction | WoW AH | Time-limited bidding; encourages speculation |

#### Critical Design Principles

1. **Opportunity Cost Anchoring**: Players evaluate trades by time-to-alternative (e.g., 10 min harvesting = X gold worth of activity)

2. **Transaction Friction**: Listing fees discourage undercutting wars; provides price stability

3. **Item Complexity**: Deep crafting trees (FFXIV: 16 components × 5 crafters per item) create:
   - Market interdependency
   - Specialization incentives
   - Price discovery across supply chains

4. **Inventory Pressure**: Limited storage forces selling, maintaining market liquidity

5. **Professional Economic Oversight**: EVE employs economists who:
   - Monitor market data continuously
   - Adjust resource drop rates
   - Tune money sinks subtly
   - Publish quarterly economic reports

#### Living Archipelago Gap Analysis

| MMO Best Practice | Current Status | Gap Severity |
|-------------------|----------------|--------------|
| Money sinks | ❌ None implemented | **CRITICAL** |
| Money faucets | ⚠️ Implicit (trade profits) | High |
| Transaction taxes | ❌ None | High |
| Dual-order book | ❌ Perfect-information trades | High |
| Opportunity cost visibility | ❌ Hidden | Medium |
| Item complexity/crafting | ❌ Simple goods only | Medium |
| Inventory limits | ❌ Unlimited storage | Medium |

---

### Model 3: Coupled Human-Ecological Systems (CHES)

**Sources**:
- [Coupled Human-Natural Networks - Academia](https://www.academia.edu/53764593/Sustaining_economic_exploitation_of_complex_ecosystems_in_computational_models_of_coupled_human_natural_networks)
- [Tragedy of the Commons Research - PLOS ONE](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0148403)
- [Ecosystem Services Simulation Games](https://www.sciencedirect.com/science/article/pii/S221204161400117X)

#### Core CHES Architecture

```
┌─────────────────┐     harvest      ┌─────────────────┐
│   ECOLOGICAL    │ ───────────────► │    ECONOMIC     │
│     SYSTEM      │                  │     SYSTEM      │
│                 │ ◄─────────────── │                 │
│  • Stock        │    degradation   │  • Production   │
│  • Regeneration │                  │  • Consumption  │
│  • Carrying Cap │                  │  • Trade        │
└─────────────────┘                  └─────────────────┘
         │                                    │
         └──────────────┬─────────────────────┘
                        ▼
              ┌─────────────────┐
              │   GOVERNANCE    │
              │                 │
              │  • Regulations  │
              │  • Incentives   │
              │  • Information  │
              └─────────────────┘
```

#### Tragedy of the Commons Dynamics

Research from Colombian fishermen experiments reveals:

| Condition | Behavior | Outcome |
|-----------|----------|---------|
| Resource abundance | 86% below Nash equilibrium | Cooperative |
| Resource scarcity | 43% ABOVE Nash equilibrium | Self-destructive over-extraction |

**Key Finding**: Scarcity triggers individually irrational behavior where players harm themselves while destroying the commons.

#### Player Types (from experimental games)

| Type | Proportion | Behavior |
|------|------------|----------|
| Cooperative | 27% | Never over-extracts |
| Competitive | 34% | Occasionally over-extracts |
| Exacerbating | 39% | Consistently over-extracts |

**Peer Effects**: Behavior is contagious - inefficient players grouped together extract significantly more than when mixed with cooperative players.

#### Sustainability Thresholds

Critical parameters from CHES modeling:

1. **Carrying Capacity (K)**: Maximum sustainable stock
2. **Regeneration Rate (r)**: Stock recovery speed
3. **Harvest Intensity (H)**: Extraction pressure
4. **Spatial Connectivity**: How stocks move between regions
5. **Governance Effectiveness**: Policy feedback speed

**Critical Insight**: "The greater the potential movement of stocks across ecosystems, the more any particular human sub-system can increase its harvesting rate" - enabling temporary overexploitation at neighbors' expense.

#### Living Archipelago CHES Status

| CHES Feature | Implementation | Notes |
|--------------|----------------|-------|
| Two-way ecological coupling | ✅ Implemented (Track 03, 07) | Strong foundation |
| Nonlinear collapse thresholds | ✅ Implemented | Healthy/Stressed/Degraded/Collapsed/Dead |
| Hysteresis (slow recovery) | ⚠️ Partial | Recovery slower than degradation |
| Spatial stock movement | ❌ Missing | Fish don't migrate between islands |
| Governance mechanisms | ❌ Missing | No regulations, quotas, or marine reserves |
| Player type differentiation | ❌ Missing | All traders behave identically |
| Peer effects | ❌ Missing | No social influence on extraction |

---

## Part 2: Gap Analysis

### Critical Gaps (Must Fix)

#### Gap 1: No Currency Sinks
**Impact**: Eventual hyperinflation, wealth concentration, economic stagnation
**Evidence**: EVE Online's transaction taxes are their largest currency sink
**Risk Level**: 🔴 CRITICAL

#### Gap 2: No Market Clearing Mechanism
**Impact**: Prices don't reflect true supply/demand equilibrium
**Evidence**: Dual-order books in EVE achieve price discovery through competition
**Risk Level**: 🔴 CRITICAL

#### Gap 3: Perfect Information Trading
**Impact**: No price discovery, no information value, unrealistic arbitrage
**Evidence**: Information asymmetry is fundamental to real markets and creates trader differentiation
**Risk Level**: 🔴 CRITICAL

### High-Priority Gaps

#### Gap 4: No Agent Memory/Learning
**Impact**: Agents don't learn from experience, repeat mistakes
**Evidence**: GABM agents use dual memory stores and periodic reflection
**Risk Level**: 🟠 HIGH

#### Gap 5: Missing Inventory Spoilage (Stored Goods)
**Impact**: No urgency to sell perishables, unrealistic stockpiling
**Evidence**: Real economies have storage costs and spoilage
**Risk Level**: 🟠 HIGH

#### Gap 6: No Spatial Fish Migration
**Impact**: Overfishing one island doesn't affect neighbors
**Evidence**: CHES models show spatial connectivity enables exploitation shifting
**Risk Level**: 🟠 HIGH

#### Gap 7: Homogeneous Trader Behavior
**Impact**: Predictable, boring market dynamics
**Evidence**: Research shows 27/34/39% cooperative/competitive/exacerbating split
**Risk Level**: 🟠 HIGH

### Medium-Priority Gaps

#### Gap 8: No Crafting/Production Chains
**Impact**: Simple economy with limited depth
**Evidence**: FFXIV's 16-component recipes create rich market interdependencies
**Risk Level**: 🟡 MEDIUM

#### Gap 9: No Reputation System
**Impact**: No trust building, no long-term relationships
**Evidence**: Trust reduces transaction costs and enables preferred partnerships
**Risk Level**: 🟡 MEDIUM

#### Gap 10: No Governance Mechanisms
**Impact**: No policy tools to prevent commons tragedy
**Evidence**: Catch shares are only management approach that sustains fisheries
**Risk Level**: 🟡 MEDIUM

#### Gap 11: No Inventory Limits
**Impact**: Unlimited hoarding, no market pressure
**Evidence**: Inventory limits force selling and maintain liquidity
**Risk Level**: 🟡 MEDIUM

#### Gap 12: No Economic Metrics Dashboard
**Impact**: Can't monitor economic health
**Evidence**: EVE publishes quarterly economic reports with Gini coefficients, velocity metrics
**Risk Level**: 🟡 MEDIUM

---

## Part 3: Detailed Improvement Plan

### Track A: Currency System Overhaul

**Objective**: Implement MIMO balance with proper sinks and faucets

#### A1: Currency Faucets
```typescript
interface CurrencyFaucet {
  type: 'bounty' | 'quest' | 'npc_purchase' | 'insurance';
  amount: number;
  source: 'system'; // Currency created from nothing
}
```

- **Island Subsidies**: NPC governments pay for essential goods during shortage
- **Bounty System**: Rewards for clearing pirate encounters during shipping
- **Insurance Payouts**: Ship destruction triggers insurance (creates currency)

#### A2: Currency Sinks
```typescript
interface CurrencySink {
  type: 'tax' | 'fee' | 'maintenance' | 'training' | 'upgrade';
  rate: number;
  destination: 'void'; // Currency destroyed
}
```

**Priority Sinks**:
1. **Transaction Tax** (3-5%): Applied to all trades
2. **Harbor Fees**: Per-voyage cost based on cargo value
3. **Ship Maintenance**: Ongoing costs beyond repair
4. **Warehouse Rent**: Storage costs create selling pressure
5. **Crew Wages**: Already implemented - verify it destroys currency

#### A3: Economic Monitoring
- Track Money Supply (M1) each tick
- Calculate Velocity of Money (transactions / supply)
- Monitor Gini coefficient for wealth inequality
- Alert on inflation indicators

---

### Track B: Market Structure Reform

**Objective**: Implement dual-order book with information asymmetry

#### B1: Order Book System
```typescript
interface OrderBook {
  bids: Order[]; // Buy orders: price + quantity
  asks: Order[]; // Sell orders: price + quantity
  lastTrade: { price: number; quantity: number; timestamp: number };
}

interface Order {
  id: OrderId;
  agentId: AgentId;
  goodId: GoodId;
  islandId: IslandId;
  side: 'bid' | 'ask';
  price: number;
  quantity: number;
  expiresAt: number;
}
```

#### B2: Trade Execution
```typescript
function matchOrders(book: OrderBook): Trade[] {
  // Match highest bid with lowest ask when bid >= ask
  // Execute at midpoint or maker price
  // Partial fills allowed
}
```

#### B3: Information Asymmetry
- **Price Discovery Delay**: Traders only see prices from last visit to island
- **Rumor System**: Agents hear about prices with noise/delay
- **Scouting**: Ships can be sent to scout prices (cost + time)
- **Information Value**: Good information enables profitable arbitrage

---

### Track C: Agent Intelligence Enhancement

**Objective**: Implement GABM-inspired memory and learning

#### C1: Agent Memory System
```typescript
interface AgentMemory {
  shortTerm: ActionObservation[]; // Last 10 actions
  longTerm: Experience[];         // Important scored experiences
  priceHistory: Map<IslandId, Map<GoodId, PriceObservation[]>>;
  tradeHistory: Trade[];
  relationships: Map<AgentId, TrustScore>;
}

interface Experience {
  context: string;
  action: Action;
  outcome: Outcome;
  importance: number; // 0-1, affects retention
}
```

#### C2: Periodic Reflection
- Every N ticks, agent reviews recent performance
- Updates strategy weights based on profit/loss
- Adjusts risk tolerance based on outcomes

#### C3: Agent Personality Types
Based on experimental game research:

| Type | Proportion | Extraction Behavior | Trade Behavior |
|------|------------|--------------------|--------------   |
| Cooperative | 27% | Conservative, sustainable | Fair prices, long-term relationships |
| Competitive | 34% | Opportunistic | Price-sensitive, seeks deals |
| Aggressive | 39% | Maximizes short-term | Undercuts, exploits scarcity |

---

### Track D: Ecological Enhancement

**Objective**: Full CHES implementation with spatial dynamics

#### D1: Fish Migration
```typescript
interface MigrationEvent {
  species: 'fish';
  fromIsland: IslandId;
  toIsland: IslandId;
  quantity: number;
  trigger: 'overfishing' | 'seasonal' | 'temperature';
}

function calculateMigration(world: WorldState): MigrationEvent[] {
  // Fish migrate away from depleted ecosystems
  // Migration rate proportional to depletion severity
  // Creates spatial spillover effects
}
```

#### D2: Seasonal Cycles
- **Breeding Seasons**: Increased regeneration during specific periods
- **Migration Patterns**: Predictable but exploitable fish movements
- **Weather Effects**: Storms affect both ecology and shipping

#### D3: Marine Reserve Mechanics
```typescript
interface MarineReserve {
  islandId: IslandId;
  protectionLevel: number; // 0-1
  establishedAt: number;
  spilloverBenefit: number; // Productivity boost to adjacent waters
}
```

---

### Track E: Governance & Institutions

**Objective**: Add policy mechanisms to prevent tragedy of commons

#### E1: Fishing Quotas
```typescript
interface FishingQuota {
  islandId: IslandId;
  maxHarvest: number;
  period: 'daily' | 'weekly' | 'seasonal';
  penalties: { fine: number; licenseRevocation: boolean };
}
```

#### E2: Catch Shares (ITQ - Individual Transferable Quotas)
- Each agent receives quota allocation
- Quotas are tradeable (creates quota market!)
- Most sustainable management approach per research

#### E3: Trade Agreements
```typescript
interface TradeAgreement {
  parties: IslandId[];
  terms: {
    tariffReduction: number;
    quotaSharing: boolean;
    mutualDefense: boolean;
  };
  duration: number;
}
```

---

### Track F: Production Depth

**Objective**: Add crafting chains for market interdependency

#### F1: Intermediate Goods
```typescript
const PRODUCTION_CHAINS = {
  // Tools now require multiple inputs
  tools: {
    inputs: [
      { good: 'timber', quantity: 2 },
      { good: 'iron_ore', quantity: 1 }, // New resource
    ],
    output: { good: 'tools', quantity: 1 },
    laborHours: 4,
  },
  // Luxuries require processed materials
  luxuries: {
    inputs: [
      { good: 'cloth', quantity: 1 },     // Processed from fiber
      { good: 'dye', quantity: 0.5 },     // Rare resource
      { good: 'tools', quantity: 0.1 },   // Tool wear
    ],
    output: { good: 'luxuries', quantity: 1 },
    laborHours: 8,
  },
};
```

#### F2: New Resource Types
- **Iron Ore**: Found only on certain islands
- **Fiber/Cotton**: Agricultural product
- **Dye**: Rare, drives luxury prices
- **Coal**: Enables advanced tool production

#### F3: Specialist Craftsmen
- Islands develop expertise in specific crafts
- Learning-by-doing: Productivity improves with experience
- Creates stronger comparative advantage

---

### Track G: Inventory & Storage

**Objective**: Add realistic storage constraints

#### G1: Warehouse Capacity
```typescript
interface Warehouse {
  islandId: IslandId;
  capacity: number;
  currentVolume: number;
  rentalCost: number; // Per tick
  spoilageReduction: number;
}
```

#### G2: Stored Goods Spoilage
```typescript
function applyStorageSpoilage(inventory: Inventory): Inventory {
  // Fish spoils at 0.5% per tick in storage (vs 2% in transit)
  // Grain spoils at 0.05% per tick
  // Warehouse level reduces rates
}
```

#### G3: Pressure to Sell
- Storage costs create urgency
- Full warehouses force sales at lower prices
- Creates more dynamic market activity

---

### Track H: Reputation & Trust

**Objective**: Enable relationship-based trading

#### H1: Trust Scores
```typescript
interface TrustRelationship {
  fromAgent: AgentId;
  toAgent: AgentId;
  score: number; // -1 to +1
  history: {
    trades: number;
    disputes: number;
    onTimeDeliveries: number;
  };
}
```

#### H2: Trust Benefits
- **Lower Transaction Costs**: Trusted partners skip verification
- **Credit Extension**: High-trust enables delayed payment
- **Priority Access**: Preferred partners get first dibs on scarce goods
- **Information Sharing**: Trusted allies share price intelligence

#### H3: Reputation Decay
- Trust scores decay over time without interaction
- Betrayal causes severe, long-lasting damage
- Recovery requires consistent good behavior

---

## Part 4: Implementation Priority Matrix

### Phase 1: Foundation (Critical Path)
| Track | Item | Effort | Impact | Priority |
|-------|------|--------|--------|----------|
| A | Transaction tax sink | Low | High | P0 |
| A | Harbor fees | Low | High | P0 |
| B | Basic order book | Medium | Critical | P0 |
| C | Agent personality types | Low | High | P0 |

### Phase 2: Depth (High Value)
| Track | Item | Effort | Impact | Priority |
|-------|------|--------|--------|----------|
| D | Fish migration | Medium | High | P1 |
| A | Economic monitoring | Medium | Medium | P1 |
| C | Agent memory system | Medium | High | P1 |
| G | Storage spoilage | Low | Medium | P1 |

### Phase 3: Richness (Fun Factor)
| Track | Item | Effort | Impact | Priority |
|-------|------|--------|--------|----------|
| E | Fishing quotas | Medium | High | P2 |
| F | Production chains | High | High | P2 |
| B | Information asymmetry | Medium | High | P2 |
| H | Reputation system | Medium | Medium | P2 |

### Phase 4: Polish (Completeness)
| Track | Item | Effort | Impact | Priority |
|-------|------|--------|--------|----------|
| E | Catch shares market | High | Medium | P3 |
| D | Seasonal cycles | Medium | Medium | P3 |
| F | New resource types | High | Medium | P3 |
| G | Warehouse capacity | Low | Low | P3 |

---

## Part 5: Expected Outcomes

### Economic Realism Improvements

| Metric | Current | After Phase 1 | After Phase 4 |
|--------|---------|---------------|---------------|
| Price volatility | Moderate | Realistic | Highly realistic |
| Wealth distribution | Undefined | Monitored | Managed |
| Trade volume | Steady | Dynamic | Event-driven |
| Agent differentiation | None | Basic types | Full personalities |
| Information value | Zero | Moderate | High |

### Fun Factor Improvements

1. **Emergent Stories**: Different agent types create conflict narratives
2. **Strategic Depth**: Information asymmetry rewards clever play
3. **Meaningful Choices**: Quota systems create trade-offs
4. **Visible Consequences**: Overfishing affects neighbors
5. **Long-term Planning**: Reputation enables trust-based strategies

### Research Alignment

| Model | Key Feature | Implementation Status |
|-------|-------------|----------------------|
| GABM | Agent memory | Track C |
| GABM | Profile-driven behavior | Track C |
| MMO | Sink/faucet balance | Track A |
| MMO | Order book trading | Track B |
| CHES | Spatial connectivity | Track D |
| CHES | Governance mechanisms | Track E |

---

## Sources

### Primary Research Papers
- [Generative Agent-Based Modeling for MMO Economies (arXiv, 2025)](https://arxiv.org/html/2506.04699v1)
- [Exacerbating the Tragedy of the Commons (PLOS ONE)](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0148403)
- [Coupled Human-Natural Networks (Academia)](https://www.academia.edu/53764593/Sustaining_economic_exploitation_of_complex_ecosystems_in_computational_models_of_coupled_human_natural_networks)
- [LLM-Empowered Agent-Based Modeling (Nature, 2024)](https://www.nature.com/articles/s41599-024-03611-3)

### Industry Sources
- [Virtual Economic Theory: How MMOs Really Work (Game Developer)](https://www.gamedeveloper.com/business/virtual-economic-theory-how-mmos-really-work)
- [ISK Sink or ISK Faucet: EVE Online Economics](https://fastercapital.com/content/ISK-Sink-or-ISK-Faucet--The-Economic-Balance-in-EVE-Online.html)
- [The Counterintuitive Economy of EVE Online (INN)](https://imperium.news/the-counterintuitive-economy-of-eve-online/)

### Foundational Research
- [Agent-Based Modeling for Trade and Development (JASSS)](https://www.jasss.org/16/2/1.html)
- [Network-Based Trust Games (JASSS)](https://www.jasss.org/18/3/5.html)
- [Tragedy of the Commons Game (Economics Games)](https://economics-games.com/tragedy-commons)

---

*Document generated: January 2026*
*Research scope: 15+ academic papers and industry sources analyzed*
