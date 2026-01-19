# Track 08: Full Economic Model Overhaul

**Status:** Planning
**Priority:** Foundation
**Complexity:** High

---

## Overview

This track consolidates all economic model improvements into a cohesive system where resources, production, trade, and capital formation create emergent economic behavior.

---

## Current State Assessment

### Implemented (Tracks 01, 03, 04)
- Price-elastic demand (consumption responds to prices)
- Harvest-production coupling (physical flow accounting)
- Population growth rate calibration (realistic demographics)

### In Progress (Parallel Development)
- Ship building system (Timber + Tools + Labor → Ship)
- Crew system (recruitment, wages, morale, desertion)
- Trading fix (mock trader executes actual trades)

### Planned but Not Implemented (Tracks 02, 05, 06, 07)
- Transport costs (voyage economics)
- Good-specific price elasticity
- Wage-based labor allocation
- Ecosystem collapse dynamics

### Missing for Full Economy
- Buildings/Infrastructure
- Production chains (intermediate goods)
- Capital goods lifecycle
- Banking/Credit system
- Government/Taxation
- Contracts and obligations

---

## Phase 1: Complete Foundation (Tracks 02, 05, 06, 07)

### 1.1 Transport Costs (Track 02)
```typescript
interface VoyageCost {
  fixedCost: number;      // Per-voyage overhead (10 coins)
  distanceCost: number;   // Per-unit distance (0.1 coins/unit)
  volumeCost: number;     // Per-cargo volume (0.05 coins/unit)
  returnCost: number;     // Empty return voyage multiplier (0.5x)
}

// Profit calculation
const netProfit = sellRevenue - buyCost - transportCost - spoilageLoss - crewWages;
```

### 1.2 Good-Specific Elasticity (Track 05)
| Good | Category | Price Elasticity | Demand Elasticity |
|------|----------|------------------|-------------------|
| Fish | Food | 0.8 | -0.3 |
| Grain | Food | 0.6 | -0.3 |
| Timber | Material | 1.0 | -0.8 |
| Tools | Tool | 1.2 | -0.5 |
| Luxuries | Luxury | 1.5 | -1.2 |

### 1.3 Wage-Based Labor (Track 06)
```typescript
// Workers follow expected income
const expectedWage = price[good] * marginalProduct[sector];
const laborShare = baseLaborShare * (expectedWage / averageWage) ** wageResponsiveness;
```

### 1.4 Ecosystem Collapse (Track 07)
```typescript
// Nonlinear collapse below critical threshold
const thresholds = {
  healthy: 0.6,    // Full productivity
  stressed: 0.4,   // Productivity declining
  degraded: 0.2,   // Severe productivity loss
  collapsed: 0.1,  // Near-zero productivity
  dead: 0.02       // Requires intervention to recover
};
```

---

## Phase 2: Capital Formation

### 2.1 Ship Building (In Progress)
```typescript
interface ShipBlueprint {
  id: string;
  name: string;
  capacity: number;
  speed: number;
  crewCapacity: number;
  minCrew: number;
  buildCost: {
    timber: number;   // 50 units
    tools: number;    // 20 units
    coins: number;    // 100 coins (labor)
  };
  buildTime: number;  // 48 ticks (2 days)
}

interface Shipyard {
  islandId: IslandId;
  level: number;          // Affects build speed, ship quality
  buildQueue: BuildOrder[];
  maxConcurrent: number;  // Ships building at once
}
```

### 2.2 Crew System (In Progress)
```typescript
interface CrewState {
  count: number;
  capacity: number;
  morale: number;      // 0-1, affects efficiency
  wageRate: number;    // Per-tick cost
  experience: number;  // Affects ship performance
}

// Crew mechanics
- Hire from island population (reduces labor supply)
- Pay wages from ship cash
- Morale affected by: wages paid, cargo success, time at sea
- Low morale → desertion, reduced efficiency
- Experience → faster voyages, less spoilage
```

### 2.3 Buildings & Infrastructure
```typescript
type BuildingType =
  | 'shipyard'      // Build ships
  | 'warehouse'     // Increase storage, reduce spoilage
  | 'market'        // Reduce trade friction
  | 'port'          // Faster loading/unloading
  | 'workshop'      // Tool production bonus
  | 'granary'       // Food storage, emergency reserves
  | 'lighthouse'    // Reduce voyage time to this island

interface Building {
  id: BuildingId;
  type: BuildingType;
  level: number;
  islandId: IslandId;
  condition: number;     // 0-1, degrades over time
  maintenanceCost: number;
  buildCost: ResourceCost;
}

interface IslandState {
  // ... existing fields
  buildings: Map<BuildingId, Building>;
  buildingSlots: number;  // Limit buildings per island
}
```

---

## Phase 3: Production Chains

### 3.1 Intermediate Goods
```typescript
// New goods
type GoodId =
  | 'fish' | 'grain' | 'timber' | 'tools' | 'luxuries'  // Existing
  | 'planks'      // Timber → Planks (for building)
  | 'rope'        // Grain fiber → Rope (for ships)
  | 'iron_ore'    // Mining output
  | 'iron'        // Smelted iron
  | 'cloth'       // Grain fiber → Cloth
  | 'preserved_fish'  // Fish + Salt → Preserved (no spoilage)
  | 'salt';       // From coastal evaporation

interface Recipe {
  id: string;
  inputs: Map<GoodId, number>;
  outputs: Map<GoodId, number>;
  laborRequired: number;
  toolsRequired: number;
  buildingRequired?: BuildingType;
  ticksToComplete: number;
}

// Example recipes
const recipes: Recipe[] = [
  { id: 'saw_timber', inputs: { timber: 10 }, outputs: { planks: 8 }, labor: 2, tools: 1, ticks: 4 },
  { id: 'smelt_iron', inputs: { iron_ore: 5 }, outputs: { iron: 3 }, labor: 3, tools: 2, building: 'workshop', ticks: 6 },
  { id: 'preserve_fish', inputs: { fish: 10, salt: 2 }, outputs: { preserved_fish: 8 }, labor: 1, tools: 0, ticks: 2 },
];
```

### 3.2 Production System Update
```typescript
interface ProductionOrder {
  recipeId: string;
  quantity: number;
  priority: number;
  startTick: number;
  assignedLabor: number;
}

// Islands queue production orders
// System processes orders based on available inputs, labor, buildings
function processProduction(island: IslandState, config: SimConfig): IslandState {
  for (const order of island.productionQueue) {
    const recipe = recipes.get(order.recipeId);
    if (hasInputs(island, recipe) && hasLabor(island, recipe)) {
      consumeInputs(island, recipe);
      scheduleOutput(island, recipe, order.startTick + recipe.ticks);
    }
  }
}
```

---

## Phase 4: Financial System

### 4.1 Banking & Credit
```typescript
interface Bank {
  islandId: IslandId;
  reserves: number;
  loans: Loan[];
  depositRate: number;   // Interest paid on deposits
  loanRate: number;      // Interest charged on loans
}

interface Loan {
  id: LoanId;
  borrowerId: AgentId;
  principal: number;
  interestRate: number;
  termTicks: number;
  remainingBalance: number;
  collateral?: {
    type: 'ship' | 'cargo' | 'building';
    id: string;
  };
}

// Agents can:
// - Deposit cash (earn interest)
// - Take loans (pay interest)
// - Default (lose collateral)
// - Build credit history
```

### 4.2 Contracts & Obligations
```typescript
interface TradeContract {
  id: ContractId;
  buyer: AgentId;
  seller: AgentId;
  good: GoodId;
  quantity: number;
  pricePerUnit: number;
  deliveryIsland: IslandId;
  deliveryTick: number;
  penaltyRate: number;   // For late/failed delivery
  status: 'pending' | 'fulfilled' | 'defaulted';
}

// Enables:
// - Forward contracts (buy now, deliver later)
// - Price hedging
// - Reputation system
// - Legal disputes
```

### 4.3 Insurance
```typescript
interface InsurancePolicy {
  id: PolicyId;
  holder: AgentId;
  type: 'cargo' | 'ship' | 'voyage';
  coverage: number;
  premium: number;
  deductible: number;
  coveredRisks: ('storm' | 'piracy' | 'spoilage')[];
}

// Events trigger insurance claims
// Insurers must maintain reserves
```

---

## Phase 5: Governance

### 5.1 Island Governance
```typescript
interface IslandGovernance {
  islandId: IslandId;
  type: 'free_market' | 'cooperative' | 'monarchy' | 'council';
  taxRate: number;           // On trade, production
  tariffRate: number;        // On imports
  subsidies: Subsidy[];      // For specific goods/sectors
  regulations: Regulation[];
  treasury: number;
}

interface Regulation {
  type: 'price_floor' | 'price_ceiling' | 'quota' | 'ban';
  good: GoodId;
  value: number;
}

// Tax revenue funds:
// - Public buildings
// - Emergency reserves
// - Military (future: defense)
```

### 5.2 Inter-Island Relations
```typescript
interface TradeAgreement {
  islands: [IslandId, IslandId];
  tariffReduction: number;
  duration: number;
  terms: string[];
}

// Islands can form:
// - Trade agreements (reduced tariffs)
// - Alliances (shared defense)
// - Embargoes (trade bans)
```

---

## Phase 6: Agent Enhancement

### 6.1 Agent Types
```typescript
type AgentType =
  | 'trader'      // Existing: arbitrage, transport
  | 'producer'    // Owns production facilities
  | 'banker'      // Provides loans, manages deposits
  | 'shipwright'  // Builds ships for others
  | 'insurer'     // Provides insurance policies
  | 'governor';   // Manages island policy (AI or player)

interface AgentCapabilities {
  canTrade: boolean;
  canProduce: boolean;
  canLend: boolean;
  canInsure: boolean;
  canGovern: boolean;
}
```

### 6.2 Agent Goals
```typescript
interface AgentGoals {
  primary: 'profit' | 'growth' | 'stability' | 'dominance';
  constraints: {
    minCash: number;
    maxRisk: number;
    preferredGoods: GoodId[];
    preferredIslands: IslandId[];
  };
  reputation: {
    reliability: number;    // Contract fulfillment rate
    creditworthiness: number;
    tradingVolume: number;
  };
}
```

---

## Implementation Roadmap

### Sprint 1: Foundation Completion (1-2 weeks)
- [ ] Implement Track 02 (Transport Costs)
- [ ] Implement Track 05 (Good-Specific Elasticity)
- [ ] Implement Track 06 (Wage-Based Labor)
- [ ] Implement Track 07 (Ecosystem Collapse)

### Sprint 2: Capital Formation (1-2 weeks)
- [ ] Complete ship building system
- [ ] Complete crew system
- [ ] Add basic buildings (shipyard, warehouse)
- [ ] Ship maintenance/depreciation

### Sprint 3: Production Chains (1-2 weeks)
- [ ] Add intermediate goods (planks, rope, iron)
- [ ] Implement recipe system
- [ ] Production queue per island
- [ ] Workshop building for advanced production

### Sprint 4: Financial System (1-2 weeks)
- [ ] Basic banking (deposits, loans)
- [ ] Trade contracts
- [ ] Basic insurance
- [ ] Default/bankruptcy mechanics

### Sprint 5: Governance (1 week)
- [ ] Island taxation
- [ ] Tariffs on imports
- [ ] Price regulations
- [ ] Treasury and public spending

### Sprint 6: Agent Enhancement (1-2 weeks)
- [ ] New agent types (producer, banker)
- [ ] Goal-based behavior
- [ ] Reputation system
- [ ] Multi-agent coordination

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Goods types | 5 | 12+ |
| Building types | 0 | 7+ |
| Agent types | 1 | 5+ |
| Production chains | 0 | 10+ |
| Financial instruments | 0 | 3+ |
| Trade profitability | Unrealistic | 5-15% after all costs |
| Ship lifespan | Infinite | 500-1000 ticks |
| Economic cycles | None | Boom/bust visible |
| Island specialization | Random | Resource-driven |

---

## Architecture Impact

### New Files
```
src/systems/
  buildings.ts       # Building construction, maintenance
  recipes.ts         # Production chain processing
  banking.ts         # Loans, deposits, interest
  contracts.ts       # Trade contracts, enforcement
  insurance.ts       # Risk pooling, claims
  governance.ts      # Taxation, regulation

src/core/
  types.ts           # Extended with new types

src/agents/
  producers/         # Production-focused agents
  bankers/           # Financial agents
  governors/         # Island management agents
```

### Tick Loop Update
```
1. Events (storms, blights, festivals)
2. Governance (tax collection, regulation enforcement)
3. Banking (interest accrual, loan payments)
4. Ecology (resource regeneration)
5. Production (recipes, building output)
6. Consumption (population demand)
7. Population (health, growth, labor allocation)
8. Market (price dynamics)
9. Contracts (delivery, default checks)
10. Shipping (vessel movement, spoilage)
11. Buildings (maintenance, degradation)
12. Event expiration
```

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Complexity explosion | High | High | Incremental implementation, feature flags |
| Performance degradation | Medium | Medium | Profile critical paths, optimize hot loops |
| Balance issues | High | Medium | Extensive playtesting, parameter tuning |
| Determinism breaks | Low | Critical | Comprehensive determinism tests |
| UI overwhelm | Medium | Low | Progressive disclosure, dashboards |

---

## Dependencies

```
Track 08 (Full Model)
    ├── Track 02 (Transport Costs) - Required for trade profitability
    ├── Track 05 (Good Elasticity) - Required for production decisions
    ├── Track 06 (Wage Labor) - Required for labor allocation
    ├── Track 07 (Ecosystem Collapse) - Required for resource constraints
    ├── Ship Building System - Required for capital formation
    └── Crew System - Required for operating costs
```

---

## Open Questions

1. **Scope**: Should we implement all phases or prioritize subset?
2. **Complexity**: Is the production chain system too complex for the simulation's goals?
3. **AI Agents**: Should banking/governance be AI-controlled or player-controlled?
4. **Performance**: Can we maintain 60+ ticks/second with all systems?
5. **Balance**: What parameter ranges create interesting emergent behavior?

---

## Next Steps

1. Review with stakeholder (you!) for scope decisions
2. Prioritize phases based on gameplay value
3. Create detailed specs for Sprint 1
4. Begin implementation of remaining foundation tracks
