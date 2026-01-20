# Routing + Module Split Plan (Step-by-step Checklist)

Goal: decompose `src/server/api-server.ts` into a small routing layer + focused services/controllers without changing behavior.

## Phase 0: Inventory and baselines
- [ ] List all endpoints and categorize by domain:
  - health
  - simulation
  - db analytics
  - analyst
  - config overrides
  - admin
- [ ] Note shared patterns in request parsing and error handling.
- [ ] Confirm current behavior for: status codes, payload shapes, and error messages.

## Phase 1: Add router + HTTP helpers (no logic moves yet)
- [ ] Create `src/server/routes/router.ts` with:
  - `add(method, path, handler)`
  - `addRegex(method, regex, handler)` (for dynamic paths)
  - `handle(req, res)`
- [ ] Create `src/server/utils/http.ts` with:
  - `sendJson(res, status, payload)`
  - `parseJsonBody(req)`
  - `parseRunId(pathParts, index)`
  - `requireDb(state, res)`
- [ ] Replace the `handleRequest` if-chain with router registrations (handlers still inline in `api-server.ts`).
- [ ] Ensure no behavior change: same status codes and payloads for all endpoints.

## Phase 2: Move routes by domain

### Health
- [ ] Create `src/server/routes/health.ts`.
- [ ] Move `/health` handler from `api-server.ts`.
- [ ] Register module in `api-server.ts`.

### Simulation
- [ ] Create `src/server/routes/simulation.ts`.
- [ ] Move `/api/state`, `/api/history`, `/api/llm-stats`, `/api/simulation/reset`.
- [ ] Centralize JSON responses with `sendJson`.

### DB Analytics
- [ ] Create `src/server/routes/db.ts`.
- [ ] Move `/api/db/stats`, `/api/db/runs`, `/api/db/trades/:runId`, `/api/db/ecosystem/:runId`, `/api/db/llm/:runId`, `/api/db/prices`.
- [ ] Replace repeated `state.database` checks with `requireDb` helper.

### Analyst
- [ ] Create `src/server/routes/analyst.ts`.
- [ ] Move:
  - `/api/analyst/runs` (GET + DELETE)
  - `/api/analyst/runs/:id/summary`
  - `/api/analyst/runs/:id/ecosystem`
  - `/api/analyst/runs/:id/market`
  - `/api/analyst/runs/:id/routes`
  - `/api/analyst/runs/:id/full`
  - `/api/analyst/runs/:id/analyze`
  - `/api/analyst/chat`
  - `/api/analyst/improvements/apply`
- [ ] Keep identical error messages and status codes.

### Config Overrides
- [ ] Create `src/server/routes/config.ts`.
- [ ] Move `/api/config/overrides` (GET + DELETE) and `/api/config/overrides/remove`.

### Admin
- [ ] Create `src/server/routes/admin.ts`.
- [ ] Move `/api/admin/llm`, `/api/admin/agents`, `/api/admin/config`, `/api/admin/status`, `/api/admin/model`.

## Phase 3: Extract controller/services

### SimulationController
- [ ] Create `src/server/controller/SimulationController.ts`.
- [ ] Move:
  - `initializeSimulation`
  - `runTick`
  - `startSimulation` / `pauseSimulation` / `resumeSimulation` / `setSpeed` / `setLLMEnabled`
- [ ] Ensure `runTick` still broadcasts and persists DB snapshots and events in same order.

### AgentService
- [ ] Create `src/server/services/AgentService.ts`.
- [ ] Move agent setup logic (`TraderAgent`, `createMockTraderAgent`, `AgentManager` registration).
- [ ] Move per-tick agent processing and trade recording logic.

### DatabaseService
- [ ] Create `src/server/services/DatabaseService.ts`.
- [ ] Move DB initialization, run lifecycle, helper queries, and map serialization utilities.

### AnalystService
- [ ] Create `src/server/services/AnalystService.ts`.
- [ ] Wrap `EconomicAnalyst` usage: `analyzeRun`, `chat`.

## Phase 4: WebSocket isolation
- [ ] Create `src/server/ws/handlers.ts`.
- [ ] Move WS connection handler and message switch.
- [ ] Ensure WS calls into `SimulationController` for start/pause/resume/speed/LLM toggles.

## Phase 5: Clean up
- [ ] Move shared server state into `src/server/state.ts`.
- [ ] Reduce `api-server.ts` to composition root + server startup.
- [ ] Ensure no unused imports or dead code remain.

## Validation checks
- [ ] All endpoints return identical status codes and JSON shapes.
- [ ] WS events are emitted with same types and payloads.
- [ ] DB run start/end and snapshot timing unchanged.
- [ ] LLM enable/disable flow unchanged.

---

If you want, I can turn this into a migration branch plan with commit-sized steps.
