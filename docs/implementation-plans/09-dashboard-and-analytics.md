# Track 09: Dashboard Redesign & Analytics Infrastructure

**Status:** Planning
**Priority:** High
**Complexity:** Medium

---

## Problem Statement

Current dashboard issues:
1. **Too much information** - Can't see all islands without scrolling
2. **Charts not actionable** - Price history shows raw data, not insights
3. **No data persistence** - Can't analyze historical runs or compare configurations
4. **No self-improvement loop** - No way to evaluate model performance

---

## Phase 1: Dashboard Redesign

### 1.1 Compact Island View

**Current:** Each island is a tall card with:
- Population & health
- 3 resource bars (fish, forest, soil)
- 5 price rows (all goods)

**Proposed:** Compact summary view with expand-on-click:

```
┌─────────────────────────────────────────────────────────┐
│  ISLANDS (3)                                      [Map] │
├─────────────────────────────────────────────────────────┤
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐        │
│ │ Shoalhold   │ │ Greenbarrow │ │ Timberwake  │        │
│ │ 👥 523  ❤️ 82%│ │ 👥 487  ❤️ 78%│ │ 👥 412  ❤️ 85%│        │
│ │ 🐟 High     │ │ 🌾 High     │ │ 🌲 High     │        │
│ │ 📈 $6→$8    │ │ 📈 $12→$10  │ │ 📈 $15→$18  │        │
│ └─────────────┘ └─────────────┘ └─────────────┘        │
└─────────────────────────────────────────────────────────┘
```

**Key metrics per island (no scroll):**
- Name + specialty icon
- Population count + health %
- Primary resource status (one indicator)
- Key price trend (specialty good)

**Click to expand:** Full details in modal/sidebar

### 1.2 Meaningful Charts

**Replace raw price chart with:**

1. **Arbitrage Opportunities** - Show where profit exists
```
┌─────────────────────────────────────────────────────────┐
│ ARBITRAGE OPPORTUNITIES                                 │
├─────────────────────────────────────────────────────────┤
│ 🐟 Fish: Shoalhold ($6) → Greenbarrow ($18)  +200% ⚡  │
│ 🌾 Grain: Greenbarrow ($8) → Timberwake ($15) +88%     │
│ 🌲 Timber: Timberwake ($12) → Shoalhold ($20) +67%    │
└─────────────────────────────────────────────────────────┘
```

2. **System Health Dashboard** - At-a-glance status
```
┌─────────────────────────────────────────────────────────┐
│ SYSTEM HEALTH                          Day 15, Hour 8   │
├─────────────────────────────────────────────────────────┤
│ Economy:  ████████░░  80% (stable)                     │
│ Ecology:  ██████░░░░  60% (declining)                  │
│ Trade:    ████░░░░░░  40% (low activity)               │
│ Population: █████████░  90% (growing)                  │
└─────────────────────────────────────────────────────────┘
```

3. **Trade Activity Timeline** - What's happening
```
┌─────────────────────────────────────────────────────────┐
│ RECENT ACTIVITY                                         │
├─────────────────────────────────────────────────────────┤
│ T382: Alpha Trader bought 50 fish @ $6 at Shoalhold    │
│ T380: Alpha Trader sold 45 fish @ $16 at Greenbarrow   │
│ T378: Storm ended at Timberwake                        │
│ T375: Ship "Wave Runner" arrived at Shoalhold          │
└─────────────────────────────────────────────────────────┘
```

### 1.3 Layout Restructure

**New layout (no horizontal scroll):**

```
┌────────────────────────────────────────────────────────────────┐
│ [Controls] Day 15 Hour 8 | Tick 368 | ▶ 2x | 🤖 LLM On       │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ ISLANDS (compact cards, 3 across, no scroll)             │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  ┌─────────────────────────┐  ┌─────────────────────────────┐ │
│  │ ARBITRAGE / KEY METRICS │  │ ACTIVITY FEED               │ │
│  │                         │  │                             │ │
│  │ (replaces price chart)  │  │ (trades, events, agent      │ │
│  │                         │  │  decisions - combined)      │ │
│  └─────────────────────────┘  └─────────────────────────────┘ │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ SHIPS (horizontal scroll if needed, minimal height)      │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## Phase 2: Data Storage Infrastructure

### 2.1 Database Selection

**Recommended: SQLite** (via better-sqlite3)
- Zero configuration
- File-based (portable)
- Fast for time-series queries
- Can export to Parquet/CSV for analysis

**Alternative: DuckDB** (for analytics-heavy use)
- Columnar storage, faster aggregations
- Direct Parquet export

### 2.2 Schema Design

```sql
-- Simulation runs
CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  seed INTEGER NOT NULL,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP,
  config JSON NOT NULL,
  notes TEXT
);

-- Tick snapshots (sampled, not every tick)
CREATE TABLE snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES runs(id),
  tick INTEGER NOT NULL,
  game_day INTEGER NOT NULL,
  game_hour INTEGER NOT NULL,
  state_hash TEXT,
  UNIQUE(run_id, tick)
);

-- Island metrics per snapshot
CREATE TABLE island_metrics (
  snapshot_id INTEGER REFERENCES snapshots(id),
  island_id TEXT NOT NULL,
  population REAL,
  health REAL,
  fish_stock REAL,
  forest_biomass REAL,
  soil_fertility REAL,
  PRIMARY KEY (snapshot_id, island_id)
);

-- Prices per snapshot
CREATE TABLE prices (
  snapshot_id INTEGER REFERENCES snapshots(id),
  island_id TEXT NOT NULL,
  good_id TEXT NOT NULL,
  price REAL,
  inventory REAL,
  PRIMARY KEY (snapshot_id, island_id, good_id)
);

-- Trade events
CREATE TABLE trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT REFERENCES runs(id),
  tick INTEGER NOT NULL,
  agent_id TEXT NOT NULL,
  ship_id TEXT NOT NULL,
  island_id TEXT NOT NULL,
  good_id TEXT NOT NULL,
  quantity REAL NOT NULL,  -- Positive = buy, negative = sell
  price REAL NOT NULL,
  total_value REAL NOT NULL
);

-- Agent decisions
CREATE TABLE agent_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT REFERENCES runs(id),
  tick INTEGER NOT NULL,
  agent_id TEXT NOT NULL,
  decision_type TEXT NOT NULL,
  reasoning TEXT,
  actions JSON,
  llm_tokens_used INTEGER
);

-- LLM calls
CREATE TABLE llm_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT REFERENCES runs(id),
  tick INTEGER NOT NULL,
  agent_id TEXT,
  prompt_summary TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  latency_ms INTEGER,
  model TEXT
);

-- System events
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT REFERENCES runs(id),
  tick INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  target_id TEXT,
  data JSON
);

-- Indexes for common queries
CREATE INDEX idx_snapshots_run_tick ON snapshots(run_id, tick);
CREATE INDEX idx_trades_run_tick ON trades(run_id, tick);
CREATE INDEX idx_prices_snapshot ON prices(snapshot_id);
```

### 2.3 Data Collection Points

**Where to collect data:**

1. **Simulation tick** (`src/core/simulation.ts`)
   - Snapshot every N ticks (configurable, default: 10)
   - Island metrics, prices, ship positions

2. **Agent manager** (`src/agents/core/agent-manager.ts`)
   - Trade executions
   - Agent decisions
   - Action results

3. **LLM client** (`src/llm/client.ts`)
   - All LLM calls with tokens/latency

4. **Event system** (`src/systems/events.ts`)
   - Storm, blight, festival starts/ends

### 2.4 Implementation

```typescript
// src/storage/database.ts
import Database from 'better-sqlite3';

export class SimulationDatabase {
  private db: Database.Database;
  private runId: string | null = null;
  private snapshotInterval: number = 10;

  constructor(dbPath: string = './simulation.db') {
    this.db = new Database(dbPath);
    this.initSchema();
  }

  startRun(seed: number, config: object): string {
    const id = `run-${Date.now()}`;
    this.db.prepare(`
      INSERT INTO runs (id, seed, config) VALUES (?, ?, ?)
    `).run(id, seed, JSON.stringify(config));
    this.runId = id;
    return id;
  }

  recordSnapshot(tick: number, state: WorldState): void {
    if (tick % this.snapshotInterval !== 0) return;
    // ... insert snapshot and related data
  }

  recordTrade(tick: number, trade: TradeEvent): void {
    // ... insert trade
  }

  // ... other methods
}
```

---

## Phase 3: Analytics & Self-Improvement

### 3.1 Built-in Analysis Queries

```sql
-- Trade profitability by route
SELECT
  t1.island_id as buy_island,
  t2.island_id as sell_island,
  t1.good_id,
  AVG(t2.price - t1.price) as avg_margin,
  COUNT(*) as trade_count
FROM trades t1
JOIN trades t2 ON t1.ship_id = t2.ship_id
  AND t1.good_id = t2.good_id
  AND t1.quantity > 0 AND t2.quantity < 0
  AND t2.tick > t1.tick
GROUP BY t1.island_id, t2.island_id, t1.good_id;

-- Ecosystem health over time
SELECT
  tick,
  AVG(fish_stock / 1000.0) as avg_fish_ratio,
  AVG(forest_biomass / 1000.0) as avg_forest_ratio,
  AVG(soil_fertility) as avg_soil
FROM island_metrics im
JOIN snapshots s ON im.snapshot_id = s.id
GROUP BY tick;

-- LLM efficiency
SELECT
  model,
  COUNT(*) as calls,
  SUM(input_tokens + output_tokens) as total_tokens,
  AVG(latency_ms) as avg_latency,
  SUM(input_tokens + output_tokens) / COUNT(*) as tokens_per_call
FROM llm_calls
GROUP BY model;
```

### 3.2 Export Capabilities

```typescript
// Export to Parquet for Python analysis
export function exportToParquet(runId: string, outputPath: string): void {
  // Use parquet-wasm or shell out to DuckDB CLI
}

// Export to CSV
export function exportToCSV(runId: string, outputDir: string): void {
  // prices.csv, trades.csv, snapshots.csv, etc.
}
```

### 3.3 Model Evaluation Metrics

**Automated checks after each run:**

```typescript
interface RunEvaluation {
  // Economic health
  finalPopulationVsInitial: number;  // Target: 0.95-1.05 (stable)
  priceVolatility: number;           // Target: < 0.3 (not too wild)
  tradeVolumePerTick: number;        // Target: > 0 (activity)

  // Ecological sustainability
  anyResourceCollapsed: boolean;     // Target: false (short runs)
  avgResourceLevel: number;          // Target: > 0.4

  // Agent effectiveness
  agentProfitability: number;        // Target: > 0 (making money)
  llmCallsPerTrade: number;          // Target: < 5 (efficient)

  // System health
  deterministicCheck: boolean;       // Same seed = same result
  noErrorsOrCrashes: boolean;
}
```

---

## Implementation Tasks

### Task 1: Compact Dashboard (Agent 1)
- Redesign IslandCard to be compact (1/3 current height)
- Add expand-on-click modal for full details
- Add ArbitragePanel component (replaces price chart)
- Add SystemHealthBar component
- Combine EventFeed + AgentPanel into ActivityFeed
- Update page.tsx layout

### Task 2: Database Infrastructure (Agent 2)
- Install better-sqlite3
- Create src/storage/database.ts with schema
- Add hooks in simulation.ts for snapshots
- Add hooks in agent-manager.ts for trades/decisions
- Add hooks in llm/client.ts for LLM tracking
- Create CLI for running analysis queries

### Task 3: Analytics Dashboard (Agent 3)
- Create /analytics route in web app
- Run comparison view (side-by-side runs)
- Export buttons (CSV, Parquet)
- Key metrics visualization
- Model evaluation report generator

---

## Success Metrics

| Metric | Before | After |
|--------|--------|-------|
| Islands visible without scroll | 0-1 | 3 (all) |
| Key info visible at glance | Limited | Full summary |
| Historical data retention | None | Unlimited |
| Run comparison capability | None | Full |
| Self-evaluation capability | None | Automated |

---

## Dependencies

- `better-sqlite3` - SQLite bindings
- `parquet-wasm` (optional) - Parquet export
- Existing: `recharts`, `tailwindcss`

---

## Files to Create/Modify

**New Files:**
- `src/storage/database.ts` - Database wrapper
- `src/storage/schema.sql` - Schema definition
- `src/storage/analytics.ts` - Query helpers
- `packages/web/src/components/dashboard/CompactIslandCard.tsx`
- `packages/web/src/components/dashboard/ArbitragePanel.tsx`
- `packages/web/src/components/dashboard/SystemHealth.tsx`
- `packages/web/src/components/dashboard/ActivityFeed.tsx`
- `packages/web/src/app/analytics/page.tsx`

**Modified Files:**
- `packages/web/src/app/page.tsx` - New layout
- `src/core/simulation.ts` - Add data collection hooks
- `src/agents/core/agent-manager.ts` - Add trade recording
- `src/llm/client.ts` - Add call recording
- `package.json` - Add better-sqlite3
