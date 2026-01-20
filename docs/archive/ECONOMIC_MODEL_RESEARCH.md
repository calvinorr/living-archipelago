# Economic Model Research: Deep Dive & Improvement Plan

## Executive Summary

This document analyzes three major economic models from games/research and compares them against Living Archipelago's current implementation. It identifies **27 gaps** across 8 categories and provides a prioritized improvement roadmap.

**Research Sources:**
- EVE Online (CCP Games) - Largest virtual economy, 20+ years of iteration
- Victoria 3 (Paradox) - Most sophisticated single-player economic simulation
- Academic Research: LLM-driven MMO economies (2024-2025), ABIDES-Economist
- Dwarf Fortress - Emergent complexity through systemic interaction

---

## Part 1: Economic Model Deep Dives

### Model 1: EVE Online's Virtual Economy

**Overview:** EVE Online operates a fully player-driven economy with real economic consequences. CCP employs a full-time economist (Dr. Eyjolfur Gudmundsson) and publishes quarterly economic reports.

**Key Design Principles:**

| Principle | Implementation | Why It Works |
|-----------|---------------|--------------|
| **Scarcity by Design** | Resources deplete; production requires inputs | Creates genuine value; prevents item flooding |
| **Regional Markets** | 5000+ star systems, each with local prices | Price discovery through geography; arbitrage opportunities |
| **Destruction as Sink** | PvP combat permanently destroys items/ships | Largest economic sink; creates constant demand |
| **Transaction Taxes** | 2-8% tax on all market transactions | Removes currency; scales with economic activity |
| **Perfect Information** | Full market history visible to all players | Enables speculation; rewards research |
| **Player Specialization** | Manufacturing, trading, mining are distinct careers | Emergent division of labor |

**Price Mechanism:**
```
Market Price = f(buy_orders, sell_orders, transaction_history)
- Fully order-book based (bid/ask spread)
- No NPC price floors or ceilings
- Prices can crash to near-zero or spike 1000x+
```

**Sink/Faucet Balance:**
| Faucets (Money In) | Sinks (Money Out) |
|-------------------|-------------------|
| NPC bounties | Transaction taxes (largest) |
| Mission rewards | Manufacturing costs |
| Insurance payouts | Skill books |
| Incursion rewards | Repair bills |
| | Ship destruction (implicit) |

**Emergent Behaviors:**
- Market manipulation (corner markets, pump-and-dump)
- Cartel formation (moon mining alliances)
- Speculation (betting on patch changes)
- Arbitrage networks (hauling between regions)
- Banking/loan systems (player-run)

**Sources:**
- [Boston College: Macroeconomic Conceptualization in EVE](https://dlib.bc.edu/islandora/object/bc-ir:109033)
- [PLOS One: Virtual Worlds Study](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0240196)
- [GamaSutra: EVE Predicting Real Recessions](https://www.gamedeveloper.com/design/how-i-used-eve-online-to-predict-the-great-recession)

---

### Model 2: Victoria 3's Snapshot Economy

**Overview:** Victoria 3 simulates the entire 19th-century global economy with 1 billion simulated people, 750+ regional markets, and 50+ goods types. It uses a radical "snapshot" approach that solves classical economic simulation problems.

**Key Design Principles:**

| Principle | Implementation | Why It Works |
|-----------|---------------|--------------|
| **No Stockpiles** | All production/consumption calculated instantaneously | Eliminates distribution modeling; prevents cascading collapse |
| **Capacity to Pay** | Goods distributed by wealth, not prestige | Realistic competition; prevents rich nations hoarding |
| **Market Access** | Infrastructure determines market participation | Creates regional price variation; incentivizes development |
| **POP Needs Hierarchy** | 10 wealth tiers with different consumption baskets | Creates realistic demand curves; emergence of middle class |
| **Substitution** | Goods can partially substitute (fabric→clothes) | Prevents hard crashes; creates soft scarcity |
| **Wage-Driven Labor** | POPs move to highest-paying jobs | Emergent labor markets; self-balancing production |

**Price Mechanism:**
```
Local Price = Base Price × Market Access Impact × Supply/Demand Ratio

Where:
- Market Access = infrastructure rating (0-100%)
- Supply/Demand Ratio = sell_orders / buy_orders
- No smoothing - prices respond instantly
```

**POP Needs System:**
| Wealth Tier | Example Needs | Behavior |
|-------------|---------------|----------|
| 1-4 (Starving) | Basic food, heating | Will take any job |
| 5-9 (Struggling) | Simple clothing, intoxicants | Seeks better wages |
| 15-25 (Middling) | Household items, services | Has preferences |
| 40-59 (Wealthy) | Luxury drinks, fine clothes | Discriminating consumer |
| 60+ (Opulent) | Art, automobiles, telephones | Status consumption |

**Key Innovation - Wealth Pools:**
- POPs don't hold money; they have "wealth" score
- Wages flow through as income → consumption → revenue
- Prevents need to track individual bank accounts
- Simplifies while maintaining economic realism

**Sources:**
- [GamaSutra: Deep Dive on Victoria 3 Economy](https://www.gamedeveloper.com/design/deep-dive-modeling-the-global-economy-in-victoria-3)
- [Victoria 3 Wiki: Market System](https://vic3.paradoxwikis.com/Market)

---

### Model 3: LLM-Driven Agent Economies (Academic Research 2024-2025)

**Overview:** Recent academic work explores using Large Language Models to create human-like economic agents that exhibit emergent specialization, realistic trading, and adaptive behavior.

**Key Papers:**

#### A) "Empowering Economic Simulation for MMO Games" (KDD 2025)
**Key Findings:**
- LLM agents naturally exhibit **role specialization** (traders vs. producers)
- Price fluctuations follow real market rules without explicit programming
- Agents demonstrate **risk aversion** and **loss aversion** behaviors
- Memory systems enable learning from past trades

**Agent Architecture:**
```
Agent = Perception + Memory + Reasoning + Action

Where:
- Perception: Observable market state
- Memory: Trade history, price trends, relationship history
- Reasoning: LLM-driven strategy formation
- Action: Validated execution
```

#### B) ABIDES-Economist (JPMorgan, 2024)
**Key Design:**
- Heterogeneous agents: households, firms, central bank, government
- Agents can use rule-based OR reinforcement learning behavior
- Calibrated against real U.S. economic data
- Enables policy testing (interest rates, stimulus)

**Validation Approach:**
- Match "stylized facts" from real economic data
- Verify Phillips Curve, business cycles, wealth distribution
- Test policy interventions against known outcomes

**Sources:**
- [arXiv: LLM MMO Economy](https://arxiv.org/abs/2506.04699)
- [arXiv: ABIDES-Economist](https://arxiv.org/abs/2402.09563)

---

### Bonus Model: Dwarf Fortress Emergent Systems

**Key Insight:** Complexity emerges from simple, interacting rules rather than sophisticated individual systems.

**Design Philosophy:**
- 500+ interlocking systems with deterministic rules
- No explicit economic "design" - economy emerges from needs
- Dwarves have preferences, memories, relationships
- Production chains (mining→smelting→smithing) create dependencies
- Resource spirals can cascade into fortress-wide crises

**Why It Works:**
- Each rule is simple and understandable
- Rules can "stand alone" but also "feed into each other"
- Brutal honesty: consequences ripple through all systems
- Player observes and interprets emergent patterns

**Source:** [Genezi Research: Dwarf Fortress Nexus](https://research.genezi.io/p/dwarf-fortress-the-nexus-of-emergent)

---

## Part 2: Current Living Archipelago Model Analysis

### Current Implementation Summary

Based on codebase analysis (`src/systems/market.ts`, `production.ts`, `consumption.ts`, `shipping.ts`, `population.ts`):

| System | Current Implementation |
|--------|----------------------|
| **Price Formation** | Multiplicative: `base × pressure × velocity × events`, smoothed by EMA |
| **Production** | Multiplicative modifiers: labor × ecosystem × tools × health × buildings |
| **Consumption** | Price-elastic with substitution between fish/grain |
| **Trade** | Transport costs (fixed + distance + volume), spoilage during transit |
| **Labor** | Wage-driven reallocation with friction (1%/hour max shift) |
| **Currency** | Fixed initial capital, no new money creation |
| **Agents** | LLM strategist + rule-based executor, trigger-driven reasoning |

### Strengths of Current Model

1. **Deterministic Reproducibility** - Seeded RNG enables replay/debugging
2. **Harvest-Production Coupling** - Ecosystem limits prevent infinite extraction
3. **Transport Cost Realism** - Distance, volume, spoilage create real trade-offs
4. **Wage-Labor Feedback** - Self-balancing production allocation
5. **Per-Category Elasticity** - Food vs. luxury price sensitivity differences
6. **LLM+Rules Hybrid** - Best of both worlds for agent decision-making

---

## Part 3: Gap Analysis

### Category 1: Market Mechanisms

| Gap | Current State | Best Practice | Impact |
|-----|--------------|---------------|--------|
| **G1.1 No Order Book** | Prices set by formula | EVE: Full bid/ask order book | Missing: speculation, market depth, limit orders |
| **G1.2 No Market Maker** | Instant buy/sell at formula price | EVE: Spread between bid/ask | Missing: liquidity risk, trading skill |
| **G1.3 No Price History** | Only current price visible | EVE: Full transaction history | Missing: trend analysis, informed speculation |
| **G1.4 No Transaction Tax** | Free trading | EVE: 2-8% tax as sink | Missing: major currency sink |
| **G1.5 Perfect Information** | Agents see all prices instantly | Real markets: discovery cost | Missing: information asymmetry value |

### Category 2: Currency & Banking

| Gap | Current State | Best Practice | Impact |
|-----|--------------|---------------|--------|
| **G2.1 No Credit/Debt** | Cash-only transactions | EVE: Player loans, bonds | Missing: leverage, financial instruments |
| **G2.2 No Interest Rates** | Money has no time value | Vic3: Implicit via investment returns | Missing: savings incentive, capital allocation |
| **G2.3 No Bankruptcy** | Agents persist forever | Real: Failure and exit | Missing: creative destruction, turnover |
| **G2.4 Static Money Supply** | Fixed initial capital | EVE: Faucets balance sinks | Missing: economic growth mechanism |

### Category 3: Production & Industry

| Gap | Current State | Best Practice | Impact |
|-----|--------------|---------------|--------|
| **G3.1 No Production Chains** | Single-step: labor→goods | Vic3/DF: Multi-step chains | Missing: intermediate goods, complexity |
| **G3.2 No Capital Goods** | Tools boost but aren't consumed | Vic3: Machines wear out | Missing: investment cycles, depreciation |
| **G3.3 No Technological Progress** | Static production rates | Vic3: Innovation unlocks | Missing: long-term growth, research value |
| **G3.4 No Building Construction** | Buildings exist or don't | Anno: Build costs, time | Missing: investment decisions, planning |

### Category 4: Population & Society

| Gap | Current State | Best Practice | Impact |
|-----|--------------|---------------|--------|
| **G4.1 No Wealth Classes** | Uniform population | Vic3: 10 wealth tiers | Missing: inequality dynamics, class conflict |
| **G4.2 No Cultural Preferences** | All consume same basket | Vic3: Culture affects needs | Missing: differentiated demand, identity |
| **G4.3 No Migration** | Population stuck on islands | Vic3: POPs seek opportunity | Missing: labor mobility, urbanization |
| **G4.4 No Unemployment** | All labor allocated | Real: Structural unemployment | Missing: labor market slack, skills mismatch |

### Category 5: Trade & Logistics

| Gap | Current State | Best Practice | Impact |
|-----|--------------|---------------|--------|
| **G5.1 No Contracts/Futures** | Spot trading only | EVE: Forward contracts | Missing: hedging, price stability |
| **G5.2 No Trade Routes** | Ad-hoc agent decisions | Anno: Automated routes | Missing: infrastructure value, efficiency |
| **G5.3 No Port Capacity** | Infinite throughput | Real: Congestion costs | Missing: infrastructure investment |
| **G5.4 No Insurance** | Ships sink = total loss | EVE: Insurance payouts | Missing: risk management, moral hazard |

### Category 6: Information & Discovery

| Gap | Current State | Best Practice | Impact |
|-----|--------------|---------------|--------|
| **G6.1 No Exploration** | World fully known | DF: Unknown regions | Missing: discovery, expansion narrative |
| **G6.2 No Reputation System** | All agents equal trust | EVE: Standing, history | Missing: trust, relationship value |
| **G6.3 No News/Events Feed** | Events just happen | Vic3: Newspaper system | Missing: player awareness, narrative |

### Category 7: Agent Behavior

| Gap | Current State | Best Practice | Impact |
|-----|--------------|---------------|--------|
| **G7.1 No Agent Personality** | All agents same goals | DF: Preferences, traits | Missing: behavioral diversity |
| **G7.2 No Social Networks** | Agents don't interact | LLM research: Relationships | Missing: trust networks, cooperation |
| **G7.3 No Risk Preferences** | Implicit in LLM | ABIDES: Explicit risk params | Missing: controllable behavior variation |

### Category 8: Emergent Systems

| Gap | Current State | Best Practice | Impact |
|-----|--------------|---------------|--------|
| **G8.1 No Cascading Crises** | Systems isolated | DF: Spiral effects | Missing: dramatic emergent narratives |
| **G8.2 No Speculation Mechanics** | Can't bet on futures | EVE: Market speculation | Missing: player expression, risk/reward |
| **G8.3 No Cartel/Guild Formation** | Agents independent | EVE: Player organizations | Missing: emergent cooperation/competition |

---

## Part 4: Prioritized Improvement Roadmap

### Tier 1: High Impact, Medium Effort (Implement First)

These improvements significantly enhance realism and fun with reasonable implementation cost.

#### 1.1 Transaction Tax & Economic Sinks
**Gap Addressed:** G1.4, G2.4

```typescript
// Add to market.ts
interface MarketConfig {
  transactionTaxRate: number;      // 0.02-0.05 (2-5%)
  listingFee: number;              // Fixed fee per trade
  taxDestination: 'destroy' | 'government';
}

// On every trade:
const tax = tradeValue * config.transactionTaxRate;
if (config.taxDestination === 'destroy') {
  // Money exits economy (deflationary)
} else {
  // Money goes to island treasury (enables services)
}
```

**Why:** Creates sustainable sink, funds island services, makes large trades costly.

---

#### 1.2 Price History & Market Memory
**Gap Addressed:** G1.3, G6.3

```typescript
interface MarketHistory {
  prices: Map<GoodId, PriceRecord[]>;
  trades: TradeRecord[];
  movingAverages: Map<GoodId, { ma7: number; ma30: number }>;
}

interface PriceRecord {
  tick: number;
  price: number;
  volume: number;
  high: number;
  low: number;
}
```

**Why:** Enables informed speculation, trend-following strategies, adds depth to trading.

---

#### 1.3 Wealth Tiers for Population
**Gap Addressed:** G4.1, G4.2

```typescript
enum WealthTier {
  Destitute = 1,    // Basic food only
  Poor = 2,         // + simple clothing
  Working = 3,      // + tools, intoxicants
  Middle = 4,       // + household items, services
  Wealthy = 5,      // + luxuries, better food
}

interface PopulationSegment {
  tier: WealthTier;
  count: number;
  consumptionBasket: Map<GoodId, number>;  // Different needs per tier
}
```

**Why:** Creates differentiated demand, enables inequality dynamics, more realistic consumption.

---

#### 1.4 Basic Production Chains
**Gap Addressed:** G3.1

```typescript
// Example: Tools now require Timber + Labor
interface ProductionRecipe {
  output: GoodId;
  inputs: Map<GoodId, number>;  // Timber: 2 per tool
  laborRequired: number;
  productionTime: number;
}

const TOOL_RECIPE: ProductionRecipe = {
  output: 'tools',
  inputs: new Map([['timber', 2]]),
  laborRequired: 1,
  productionTime: 1,
};
```

**Why:** Creates intermediate good demand, supply chain disruption potential, more strategic depth.

---

#### 1.5 Ship Insurance System
**Gap Addressed:** G5.4

```typescript
interface InsurancePolicy {
  shipId: ShipId;
  premium: number;           // Paid upfront
  coverage: number;          // Payout on loss (70-90% of value)
  deductible: number;        // Agent pays first X coins
  expirationTick: number;
}

// On ship loss:
const payout = Math.min(coverage, shipValue) - deductible;
agentCash += payout;
insurancePool -= payout;
```

**Why:** Risk management tool, creates insurance market, enables riskier strategies.

---

### Tier 2: High Impact, High Effort (Strategic Investment)

These are larger systems that transform gameplay significantly.

#### 2.1 Order Book Market System
**Gap Addressed:** G1.1, G1.2, G8.2

Replace formula-based pricing with true order book:

```typescript
interface OrderBook {
  bids: Order[];  // Buy orders, sorted high→low
  asks: Order[];  // Sell orders, sorted low→high
}

interface Order {
  id: OrderId;
  agentId: AgentId;
  type: 'buy' | 'sell';
  goodId: GoodId;
  quantity: number;
  priceLimit: number;
  expirationTick: number;
}

// Matching engine
function matchOrders(book: OrderBook): Trade[] {
  const trades: Trade[] = [];
  while (book.bids[0]?.priceLimit >= book.asks[0]?.priceLimit) {
    // Execute trade at ask price (maker gets better price)
    const trade = executeTrade(book.bids[0], book.asks[0]);
    trades.push(trade);
  }
  return trades;
}
```

**Why:** Enables limit orders, market depth, spread trading, speculation, market making strategies.

---

#### 2.2 Credit & Debt System
**Gap Addressed:** G2.1, G2.2, G2.3

```typescript
interface Loan {
  lenderId: AgentId | 'bank';
  borrowerId: AgentId;
  principal: number;
  interestRate: number;      // Per tick
  remainingBalance: number;
  collateral?: ShipId[];
  defaultThreshold: number;  // Triggers foreclosure
}

interface CreditRating {
  agentId: AgentId;
  score: number;             // 0-100
  history: LoanRecord[];
  maxBorrowable: number;
}
```

**Why:** Enables leverage, expansion without capital, creates financial risk/reward.

---

#### 2.3 Technology & Research
**Gap Addressed:** G3.3

```typescript
interface Technology {
  id: TechId;
  name: string;
  effects: TechEffect[];
  researchCost: number;      // Labor-hours
  prerequisites: TechId[];
}

type TechEffect =
  | { type: 'production_multiplier'; good: GoodId; factor: number }
  | { type: 'new_recipe'; recipe: ProductionRecipe }
  | { type: 'unlock_building'; building: BuildingType }
  | { type: 'reduce_spoilage'; good: GoodId; factor: number };

// Example: "Preservation" tech reduces fish spoilage 50%
const PRESERVATION: Technology = {
  id: 'preservation',
  name: 'Food Preservation',
  effects: [{ type: 'reduce_spoilage', good: 'fish', factor: 0.5 }],
  researchCost: 1000,
  prerequisites: [],
};
```

**Why:** Long-term progression, strategic choices, differentiation between islands/agents.

---

#### 2.4 Migration System
**Gap Addressed:** G4.3

```typescript
interface MigrationPressure {
  sourceIsland: IslandId;
  targetIsland: IslandId;
  pressure: number;  // -1 to +1
  factors: {
    wageDifferential: number;
    healthDifferential: number;
    unemploymentDifferential: number;
    distance: number;
  };
}

// Each tick, some population migrates based on pressure
function processMigration(world: WorldState): WorldState {
  for (const pressure of calculateMigrationPressures(world)) {
    if (pressure.pressure > MIGRATION_THRESHOLD) {
      const migrants = calculateMigrantCount(pressure);
      // Move population between islands
    }
  }
  return world;
}
```

**Why:** Labor mobility, urbanization dynamics, creates island competition for workers.

---

### Tier 3: Medium Impact, Low Effort (Quick Wins)

Easy improvements that add polish and depth.

#### 3.1 Agent Personality Traits
**Gap Addressed:** G7.1, G7.3

```typescript
interface AgentPersonality {
  riskTolerance: number;      // 0-1 (conservative → aggressive)
  patience: number;           // 0-1 (reactive → long-term)
  socialOrientation: number;  // 0-1 (competitive → cooperative)
  specialization: GoodId[];   // Preferred goods to trade
}

// Inject into LLM prompts
const personalityPrompt = `
You are a ${personality.riskTolerance > 0.7 ? 'bold risk-taker' : 'cautious trader'}
who ${personality.patience > 0.5 ? 'plans for the long term' : 'seeks quick profits'}.
`;
```

**Why:** Behavioral diversity, more interesting agent ecosystem, emergent specialization.

---

#### 3.2 News & Events Feed
**Gap Addressed:** G6.3

```typescript
interface NewsItem {
  tick: number;
  headline: string;
  category: 'market' | 'weather' | 'population' | 'trade';
  islandIds: IslandId[];
  importance: 1 | 2 | 3;
}

// Generate news from state changes
function generateNews(prev: WorldState, curr: WorldState): NewsItem[] {
  const news: NewsItem[] = [];

  // Price movements
  for (const [islandId, market] of curr.markets) {
    for (const [goodId, price] of market.prices) {
      const prevPrice = prev.markets.get(islandId)?.prices.get(goodId);
      if (prevPrice && Math.abs(price - prevPrice) / prevPrice > 0.2) {
        news.push({
          tick: curr.tick,
          headline: `${goodId} prices ${price > prevPrice ? 'surge' : 'crash'} in ${islandId}`,
          category: 'market',
          islandIds: [islandId],
          importance: 2,
        });
      }
    }
  }

  return news;
}
```

**Why:** Player awareness, narrative emergence, information for decision-making.

---

#### 3.3 Reputation System
**Gap Addressed:** G6.2

```typescript
interface Reputation {
  agentId: AgentId;
  islandReputations: Map<IslandId, number>;  // -100 to +100
  tradeHistory: {
    completed: number;
    defaulted: number;
    avgRating: number;
  };
}

// Reputation affects:
// - Price offered (bad rep = worse prices)
// - Credit access (bad rep = no loans)
// - Port access (very bad rep = banned)
```

**Why:** Consequence for behavior, trust as resource, long-term relationship value.

---

#### 3.4 Seasonal Events Cycle
**Gap Addressed:** G8.1

```typescript
interface Season {
  name: 'spring' | 'summer' | 'autumn' | 'winter';
  productionModifiers: Map<GoodId, number>;
  consumptionModifiers: Map<GoodId, number>;
  eventProbabilities: Map<EventType, number>;
}

// Winter: fishing down 30%, grain consumption up 20%, storm probability 2x
const WINTER: Season = {
  name: 'winter',
  productionModifiers: new Map([['fish', 0.7], ['grain', 0.9]]),
  consumptionModifiers: new Map([['grain', 1.2], ['timber', 1.3]]),
  eventProbabilities: new Map([['storm', 2.0], ['festival', 0.5]]),
};
```

**Why:** Predictable cycles for planning, seasonal arbitrage, natural boom-bust.

---

### Tier 4: Experimental (Research Required)

High-risk, high-reward ideas that need prototyping.

#### 4.1 Player-Run Organizations (Guilds/Cartels)
```typescript
interface Organization {
  id: OrgId;
  name: string;
  members: AgentId[];
  treasury: number;
  sharedAssets: ShipId[];
  policies: OrgPolicy[];
}

// Agents can vote on organization decisions
// Shared profits, coordinated trading strategies
```

---

#### 4.2 Futures & Derivatives Market
```typescript
interface FuturesContract {
  good: GoodId;
  quantity: number;
  strikePrice: number;
  settlementTick: number;
  seller: AgentId;
  buyer: AgentId;
}

// Enables hedging, speculation on future prices
// Creates "paper" economy alongside real goods
```

---

#### 4.3 Dynamic World Events
```typescript
// Events that fundamentally change the world
interface MajorEvent {
  type: 'new_island_discovered' | 'trade_route_blocked' | 'technology_breakthrough';
  trigger: EventTrigger;
  effects: WorldEffect[];
  duration: number | 'permanent';
}
```

---

## Part 5: Implementation Priority Matrix

| Improvement | Impact | Effort | Priority | Dependencies |
|-------------|--------|--------|----------|--------------|
| Transaction Tax | High | Low | **P1** | None |
| Price History | High | Low | **P1** | None |
| Wealth Tiers | High | Medium | **P1** | Consumption system |
| Production Chains | High | Medium | **P1** | Production system |
| Agent Personality | Medium | Low | **P2** | Agent framework |
| News Feed | Medium | Low | **P2** | Event system |
| Seasonal Cycles | Medium | Low | **P2** | Event system |
| Reputation | Medium | Medium | **P2** | Agent framework |
| Ship Insurance | Medium | Medium | **P2** | Shipping system |
| Order Book Market | High | High | **P3** | Market rewrite |
| Credit System | High | High | **P3** | Order book helpful |
| Migration | Medium | High | **P3** | Population system |
| Technology | Medium | High | **P3** | Production chains |
| Organizations | High | Very High | **P4** | Agent framework |
| Futures Market | Medium | Very High | **P4** | Order book required |

---

## Part 6: Recommended Implementation Phases

### Phase 1: Economic Foundations (2-3 weeks)
1. Add transaction tax (3% default)
2. Implement price history tracking (last 100 ticks)
3. Add news/events feed generation
4. Implement seasonal cycle system

### Phase 2: Population Depth (2-3 weeks)
1. Implement wealth tiers (5 levels)
2. Create differentiated consumption baskets per tier
3. Add basic reputation system
4. Implement agent personality traits

### Phase 3: Production Complexity (3-4 weeks)
1. Convert tools to require timber input
2. Add intermediate goods (planks, ingots)
3. Implement building construction with costs/time
4. Add ship insurance system

### Phase 4: Market Evolution (4-6 weeks)
1. Design order book system
2. Implement bid/ask spread mechanics
3. Add limit orders and order expiration
4. Create market maker NPCs for liquidity

### Phase 5: Financial Systems (4-6 weeks)
1. Implement credit/debt system
2. Add bankruptcy mechanics
3. Create basic futures contracts
4. Enable agent organizations

---

## Part 7: Metrics for Success

### Economic Health Indicators
- **Price Stability**: Standard deviation of prices over 100 ticks
- **Trade Volume**: Transactions per tick (should grow with population)
- **Wealth Distribution**: Gini coefficient across agents
- **Market Efficiency**: Arbitrage opportunities (should decrease over time)

### Engagement Indicators
- **Agent Diversity**: Variance in agent strategies
- **Crisis Frequency**: Interesting events per 1000 ticks
- **Recovery Time**: Ticks to return to equilibrium after shock
- **Emergent Behaviors**: Novel strategies not explicitly programmed

### Technical Indicators
- **Determinism**: State hash consistency across runs
- **Performance**: Tick processing time under 100ms
- **Memory**: State size growth rate

---

## References

1. [EVE Online Economy Reports](https://www.eveonline.com/news/view/monthly-economic-report)
2. [Victoria 3 Economy Deep Dive](https://www.gamedeveloper.com/design/deep-dive-modeling-the-global-economy-in-victoria-3)
3. [LLM-Driven MMO Economies (KDD 2025)](https://arxiv.org/abs/2506.04699)
4. [ABIDES-Economist](https://arxiv.org/abs/2402.09563)
5. [Sinks & Faucets in Game Economies](https://machinations.io/articles/what-is-game-economy-inflation-how-to-foresee-it-and-how-to-overcome-it-in-your-game-design)
6. [Dwarf Fortress Emergent Complexity](https://research.genezi.io/p/dwarf-fortress-the-nexus-of-emergent)
7. [Boston College EVE Study](https://dlib.bc.edu/islandora/object/bc-ir:109033)
