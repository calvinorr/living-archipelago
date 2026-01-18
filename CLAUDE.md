# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Living Archipelago is an agent-based simulation where ecology, economy, and AI agents co-evolve across interconnected islands. It features LLM-powered traders (Gemini Flash), deterministic tick-based simulation, and real-time WebSocket visualization.

## Commands

```bash
# Development
npm run dev            # Watch mode for headless runner
npm run dev:server     # Start API server with WebSocket
npm run dev:web        # Start Next.js dashboard (packages/web)

# Testing
npm test               # Watch mode (vitest)
npm run test:run       # Single test run
npm run test:determinism  # Determinism tests only

# Quality
npm run lint           # ESLint
npm run typecheck      # TypeScript strict check

# Utilities
npm run verify-llm     # Verify Gemini API connection
npm run simulate       # Run headless simulation
npm run observe        # Observer mode with agent tracing
```

## Architecture

### Tick Loop Order (src/core/simulation.ts)
1. Events (storms, blights, festivals)
2. Ecology (resource regeneration)
3. Production (labor → goods)
4. Consumption (population demand)
5. Population (health, growth)
6. Market (price dynamics)
7. Shipping (vessel movement, spoilage)
8. Event expiration

### Agent Framework (src/agents/)
Agents follow the **Observe → Reason → Act** pattern:
- `interfaces/agent.ts` - IAgent contract
- `traders/trader-agent.ts` - LLM+rules hybrid agent
  - **Strategist**: LLM-powered complex reasoning
  - **Executor**: Rule-based action validation
  - **Memory**: Trade history and plans
- `core/trigger-system.ts` - Event-driven reasoning to minimize LLM calls
- `core/agent-manager.ts` - Lifecycle and coordination

### Systems (src/systems/)
Each system is a pure function: `(state, config) → state`
- `ecology.ts` - Resource regeneration, carrying capacity
- `production.ts` - Goods generation from labor
- `consumption.ts` - Population demand
- `population.ts` - Health, labor allocation
- `market.ts` - Supply/demand price dynamics
- `shipping.ts` - Vessel movement, cargo spoilage
- `events.ts` - Perturbation generation

### Core (src/core/)
- `types.ts` - Complete type system (branded IDs, entities, config)
- `world.ts` - World state initialization and cloning
- `rng.ts` - Deterministic xorshift128+ PRNG
- `simulation.ts` - Tick orchestration

### API Layer (src/server/)
- HTTP + WebSocket server
- State serialization for web clients
- Real-time event broadcast

### Web Dashboard (packages/web/)
Next.js + React + Zustand + Recharts + TailwindCSS

## Key Patterns

**Determinism**: All randomness via seeded RNG. State hash verification ensures reproducibility. Same seed = identical results.

**Immutable Updates**: World state cloned each tick. Systems return new state, never mutate.

**Branded IDs**: `IslandId`, `ShipId`, `GoodId`, `AgentId` are branded strings for type safety.

**Observable State**: Agents receive filtered world view via `ObservableBuilder`, not raw state.

**Rate Limiting**: LLM calls use 3-tier rate limiter (conservative/balanced/aggressive) to control API costs.

## Environment

```bash
GEMINI_API_KEY=your-key  # Required for AI agents
```

## Type System Essentials

- 5 goods: Fish, Grain, Timber, Tools, Luxuries
- Goods have categories (food/material/tool/luxury), spoilage rates, bulkiness
- `IslandState`: ecosystem, population, inventory, market
- `ShipState`: owner, cargo, location, destination
- `WorldState`: complete snapshot with tick count and RNG state
