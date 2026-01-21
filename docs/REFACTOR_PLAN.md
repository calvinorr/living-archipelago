# API Server Refactor Plan (v2)

**Branch:** `refactor/api-server-v2`
**Starting point:** `api-server.ts` at 1,359 lines
**Goal:** Decompose into ~10-15 focused modules, each <200 lines

## Current Structure Analysis

```
api-server.ts (1,359 lines)
├── Imports (22 lines)
├── Types (43 lines) - SimulationStatus, ServerState, ClientMessage, AgentDecisionEvent
├── State & Config (30 lines) - DB config, state object, clients set
├── Simulation Control (277 lines) - init, tick, start/pause/resume, speed, LLM toggle
├── Broadcast (12 lines)
├── HTTP Handler (820 lines) - THE PROBLEM: giant if/else chain
│   ├── /health (5 lines)
│   ├── /api/state, /api/history, /api/llm-stats (25 lines)
│   ├── /api/db/* - 6 endpoints (~120 lines)
│   ├── /api/analyst/* - 11 endpoints (~380 lines)
│   ├── /api/config/* - 3 endpoints (~60 lines)
│   ├── /api/admin/* - 5 endpoints (~150 lines)
│   └── /api/simulation/reset (~50 lines)
├── WebSocket Handler (73 lines)
└── Main/Startup (62 lines)
```

## Target Structure

```
src/server/
├── api-server.ts (~100 lines) - composition root
├── state.ts (~60 lines) - ServerState, config, clients, broadcast
├── types.ts (~50 lines) - shared types
├── utils/
│   └── http.ts (~80 lines) - sendJson, sendError, parseBody, CORS
├── routes/
│   ├── index.ts (~30 lines) - createRouter composition
│   ├── router.ts (~100 lines) - Router class
│   ├── health.ts (~15 lines)
│   ├── simulation.ts (~80 lines)
│   ├── db.ts (~150 lines)
│   ├── analyst.ts (~300 lines)
│   ├── config.ts (~80 lines)
│   └── admin.ts (~180 lines)
├── controllers/
│   └── SimulationController.ts (~200 lines)
├── services/
│   ├── index.ts
│   ├── AgentService.ts (~100 lines)
│   └── DatabaseService.ts (~100 lines)
└── ws/
    ├── index.ts
    └── handlers.ts (~80 lines)
```

---

## Phase 1: Router + HTTP Utilities

### 1.1 Create `src/server/utils/http.ts`

```typescript
// HTTP utility functions
export function sendJson(res: ServerResponse, status: number, payload: unknown): void
export function sendError(res: ServerResponse, status: number, message: string): void
export function parseJsonBody<T>(req: IncomingMessage): Promise<T | null>
export function setCorsHeaders(res: ServerResponse): void
export function parseRunId(value: string | undefined): number | null
export function requireDb<T>(db: T | null, res: ServerResponse): db is T
export function requireApiKey(hasKey: boolean, res: ServerResponse): boolean
```

### 1.2 Create `src/server/routes/router.ts`

```typescript
type HttpMethod = 'GET' | 'POST' | 'DELETE' | 'PUT' | 'PATCH';
type RouteHandler = (req, res, params: Record<string, string>) => void;

export class Router {
  add(method: HttpMethod, path: string, handler: RouteHandler): void
  addParam(method: HttpMethod, pathPattern: string, handler: RouteHandler): void
  addRegex(method: HttpMethod, pattern: RegExp, handler: RouteHandler): void
  handle(req, res, pathname: string): boolean
}
```

### 1.3 Test & Commit
- Run `npm run typecheck`
- Commit: `refactor(server): add router and HTTP utilities (Phase 1)`

---

## Phase 2: Split Routes by Domain

### 2.1 Create `src/server/state.ts`

Extract from api-server.ts:
- `SimulationStatus` type
- `ServerState` interface
- `state` object
- `clients` Set
- `config` object (PORT, ENABLE_AGENTS, etc.)
- `broadcast()` function

### 2.2-2.7 Create route modules

Each route module follows this pattern:
```typescript
import { Router } from './router.js';
import { sendJson, sendError } from '../utils/http.js';
import { state, config } from '../state.js';

export function registerXxxRoutes(router: Router): void {
  router.add('GET', '/api/xxx', (req, res) => {
    // handler logic
  });
}
```

**Route distribution:**
| File | Endpoints | Est. Lines |
|------|-----------|------------|
| health.ts | /health | 15 |
| simulation.ts | /api/state, /api/history, /api/llm-stats, /api/simulation/reset | 80 |
| db.ts | /api/db/* (6) | 150 |
| analyst.ts | /api/analyst/* (11) | 300 |
| config.ts | /api/config/* (3) | 80 |
| admin.ts | /api/admin/* (5) | 180 |

### 2.8 Create `src/server/routes/index.ts`

```typescript
export function createRouter(deps: SimulationDeps): Router {
  const router = new Router();
  registerHealthRoutes(router);
  registerSimulationRoutes(router, deps);
  registerDbRoutes(router);
  registerAnalystRoutes(router);
  registerConfigRoutes(router);
  registerAdminRoutes(router);
  return router;
}
```

### 2.9-2.11 Update api-server.ts, Test & Commit
- Replace 820-line if/else with `router.handle(req, res, pathname)`
- Run typecheck
- Commit: `refactor(server): split routes into domain modules (Phase 2)`

---

## Phase 3: Extract Controller & Services

### 3.1 Create `SimulationController`

Extract:
- `initializeSimulation()`
- `runTick()`
- `startSimulation()`, `pauseSimulation()`, `resumeSimulation()`
- `setSpeed()`, `setLLMEnabled()`
- Reset logic

### 3.2 Create `AgentService`

Extract:
- Agent creation logic from `initializeSimulation()`
- LLM switching logic from `setLLMEnabled()`
- Model changing logic from admin endpoint

### 3.3 Create `DatabaseService`

Extract:
- Database initialization
- `startRun()`, `endRun()`
- `recordSnapshot()`, `recordTrade()`, `recordLLMCall()`

### 3.4-3.6 Update routes, Test & Commit
- Routes call controller/services instead of inline logic
- Commit: `refactor(server): extract controller and services (Phase 3)`

---

## Phase 4: WebSocket Isolation

### 4.1 Create `ws/handlers.ts`

```typescript
export function handleConnection(ws: WebSocket): void
function sendInitialState(ws: WebSocket): void
function handleMessage(ws: WebSocket, data: unknown): void
function handleClose(ws: WebSocket): void
function handleError(ws: WebSocket, error: Error): void
```

### 4.2-4.5 Create index, Update api-server, Test & Commit
- Commit: `refactor(server): isolate WebSocket handling (Phase 4)`

---

## Phase 5: Final Cleanup

### 5.1 Move types if needed
- Consider `src/server/types.ts` for shared interfaces

### 5.2-5.4 Full test suite, Manual test, Final commit
- Run `npm test`
- Start servers, verify dashboard works
- Final commit summarizing the refactor

---

## Success Criteria

1. **No behavior changes** - all endpoints work identically
2. **All tests pass** - `npm test` green
3. **Typecheck passes** - `npm run typecheck` clean
4. **api-server.ts < 150 lines** - just composition
5. **Each module < 300 lines** - focused responsibility
6. **Clear dependencies** - no circular imports

---

## Rollback Plan

If anything breaks:
```bash
git checkout main -- src/server/api-server.ts
git branch -D refactor/api-server-v2
```

The original file is preserved on `main` branch.
