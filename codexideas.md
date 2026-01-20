# Codebase Review: Risks + Refactoring Plan

## Key Concerns (ordered by severity)

1) **API server is a monolith with many responsibilities**
- `src/server/api-server.ts` mixes simulation control, HTTP routing, WebSocket handling, DB analytics, and analyst workflows in one file (~1.3k lines). This raises change risk and makes testing or isolating features difficult.
- The HTTP handler is a long chain of `if` branches; repeated request parsing and validation logic is scattered throughout.

2) **Tick loop does too much per tick**
- `src/server/api-server.ts` `runTick()` handles simulation ticks, price history, DB snapshots, agent processing, trade recording, and broadcasting. This makes timing/ordering bugs more likely and complicates performance tuning.
- The tick loop’s responsibilities overlap with `src/core/simulation.ts`, which is already an orchestrator. The outer loop duplicates orchestration concerns.

3) **Large UI pages are doing heavy data derivation inline**
- `packages/web/src/app/trade/page.tsx` (~1.1k lines) and `packages/web/src/app/admin/page.tsx` (~500 lines) combine heavy computation, layout, and rendering in a single file. This slows iteration and makes performance optimizations harder.
- KPI calculations in `page.tsx` recompute when ships/islands change, but several metrics could be memoized or moved into a hook or selector to improve clarity and perf.

4) **Growing surface area of endpoints without a routing layer**
- `src/server/api-server.ts` has many endpoint families (db, analyst, config, admin, simulation). There is no shared validation or response helpers, increasing the odds of inconsistent responses and error handling.

## Refactoring Opportunities (impact vs effort)

### High impact / medium effort
- **Split API server by domain**: move endpoints into route modules (e.g., `routes/admin.ts`, `routes/analyst.ts`, `routes/db.ts`) and centralize request parsing/response helpers.
- **Extract a SimulationController**: encapsulate start/pause/resume/reset, speed changes, tick scheduling, and state changes in a class to remove orchestration from the HTTP layer.
- **Extract Agent/DB services**: move agent run + trade recording into `AgentService` and DB analytics into `DatabaseService`.

### Medium impact / low effort
- **Create request helpers**: small utilities for JSON parsing, runId parsing, and “DB enabled” guards. This trims repeated blocks in `handleRequest`.
- **Create UI hooks**: `useFleetMetrics`, `usePriceMatrix`, and `useRouteSummary` for `trade/page.tsx` and similar hooks for admin pages.

### Lower impact / incremental
- **Typed endpoint contracts**: define request/response types in a shared module for admin/analyst endpoints.
- **Thin routing layer**: add an internal router abstraction (even a simple map of `method+path -> handler`) to reduce `if` cascades.

## Proposed Plan

### Phase 1: Baseline map + quick wins (1–2 days)
- Inventory endpoints by domain (admin, analyst, db, simulation). Identify shared parsing/response patterns.
- Create small helpers for: JSON body parsing, query param parsing, `runId` validation, and common error responses.
- Move `handleRequest` condition blocks into a router table without changing behavior.

### Phase 2: Server decomposition (2–4 days)
- Introduce `SimulationController` (start/pause/resume/reset/speed). Move `runTick` and state transitions into the controller.
- Extract `AgentService` (agent setup, tick processing, trade recording) with explicit interface boundaries.
- Extract `DatabaseService` (db init, run lifecycle, analytics queries, and conversion of maps to JSON).

### Phase 3: UI page refactors (2–3 days)
- Split `packages/web/src/app/trade/page.tsx` into components: `KPISummary`, `PriceMatrix`, `FleetTable`, `RoutesPanel`, etc.
- Move complex calculations into hooks or selector helpers; keep components presentational.
- Apply same approach to `packages/web/src/app/admin/page.tsx` and any other pages over ~400 lines.

### Phase 4: Hardening + testing (1–2 days)
- Add focused tests for routing: request parsing and error responses for common failure cases.
- Add unit tests for `SimulationController` and `AgentService` (e.g., tick order, pause/resume, side effects).
- Add smoke tests for web pages to ensure refactor doesn’t regress data rendering.

## Candidate Files to Target First
- `src/server/api-server.ts`
- `src/core/simulation.ts`
- `packages/web/src/app/trade/page.tsx`
- `packages/web/src/app/admin/page.tsx`
