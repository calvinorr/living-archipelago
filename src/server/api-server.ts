/**
 * API Server
 * HTTP + WebSocket server for the Living Archipelago dashboard
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { Simulation } from '../core/simulation.js';
import { initializeWorld, DEFAULT_CONFIG } from '../core/world.js';
import { AgentManager } from '../agents/core/agent-manager.js';
import { TraderAgent, createMockTraderAgent } from '../agents/traders/trader-agent.js';
import { LLMClient } from '../llm/client.js';
import { llmMetrics } from '../llm/metrics.js';
import { serializeWorldState } from './state-serializer.js';
import { createDatabase } from '../storage/index.js';
import type { TradeRecord } from '../storage/index.js';
import { applyOverridesToConfig } from '../config/overrides.js';

// Import shared state and router
import { state, config, clients, broadcast, type ClientMessage, type AgentDecisionEvent } from './state.js';
import { createRouter } from './routes/index.js';
import { setCorsHeaders, handleCorsPreflightIfNeeded, sendError } from './utils/http.js';

// ============================================================================
// Simulation Control
// ============================================================================

function initializeSimulation(): void {
  const seed = parseInt(process.env.SEED || '12345', 10);
  const initialState = initializeWorld(seed);

  // Build config with overrides applied
  const configObj = { ...DEFAULT_CONFIG, seed } as unknown as Record<string, unknown>;
  applyOverridesToConfig(configObj);
  const simConfig = configObj as unknown as typeof DEFAULT_CONFIG & { seed: number };

  state.simulation = new Simulation(initialState, simConfig);
  state.priceHistory = [];

  // Initialize database if enabled
  if (config.DB_ENABLED && !state.database) {
    state.database = createDatabase(config.DB_PATH, config.DB_SNAPSHOT_INTERVAL);
    if (state.database) {
      console.log(`[Database] Initialized at ${config.DB_PATH}`);
    }
  }

  // Start a new database run
  if (state.database) {
    const runId = state.database.startRun(seed, simConfig);
    console.log(`[Database] Started run ${runId}`);
  }

  if (config.ENABLE_AGENTS) {
    state.agentManager = new AgentManager({ debug: false });

    const shipIds = Array.from(initialState.ships.keys());
    const initialCash = 1000;
    const triggerConfig = { maxTicksWithoutReasoning: 10, priceDivergenceThreshold: 0.1 };

    let agent: TraderAgent;

    if (state.llmEnabled && config.HAS_API_KEY) {
      console.log(`[Server] Using real Gemini LLM (model: ${state.llmModel})`);
      const llmClient = new LLMClient({ model: state.llmModel });
      agent = new TraderAgent('trader-alpha', 'Alpha Trader', llmClient, {
        cash: initialCash,
        shipIds,
      }, { triggerConfig, debug: true });
    } else {
      console.log('[Server] Using mock LLM');
      agent = createMockTraderAgent('trader-alpha', 'Mock Trader', {
        cash: initialCash,
        shipIds,
      }, undefined, { triggerConfig, debug: true });
    }

    state.agentManager.registerAgent(agent, initialState);
  }

  console.log('[Server] Simulation initialized');
}

async function runTick(): Promise<void> {
  if (!state.simulation || state.status !== 'running') return;

  try {
    state.simulation.tick();
    const worldState = state.simulation.getState();
    const snapshot = serializeWorldState(worldState);

    // Record price history
    const pricePoint = {
      tick: worldState.tick,
      gameDay: worldState.gameTime.gameDay,
      gameHour: worldState.gameTime.gameHour,
      prices: {} as Record<string, Record<string, number>>,
    };
    for (const island of snapshot.islands) {
      pricePoint.prices[island.id] = island.market.prices;
    }
    state.priceHistory.push(pricePoint);
    if (state.priceHistory.length > 500) {
      state.priceHistory.shift();
    }

    // Record database snapshot (at configured interval)
    if (state.database) {
      state.database.recordSnapshot(worldState.tick, worldState);

      for (const event of worldState.events) {
        if (event.startTick === worldState.tick) {
          state.database.recordEvent(worldState.tick, event);
        }
      }
    }

    // Process agents
    if (state.agentManager) {
      const agentResults = await state.agentManager.processTick(worldState);

      if (agentResults.newWorld !== worldState) {
        state.simulation.updateState(agentResults.newWorld);
      }

      for (const result of agentResults.results) {
        if (worldState.tick % 10 === 0) {
          console.log(`[Agent] Tick ${worldState.tick}: triggered=${result.triggered}, actions=${result.actions.length}`);
        }

        if (result.triggered || result.actions.length > 0) {
          console.log(`[Agent] Decision at tick ${worldState.tick}:`, result.triggered ? 'TRIGGERED' : 'ACTIONS');

          const decision: AgentDecisionEvent = {
            agentId: result.agentId,
            agentName: result.agentId,
            tick: worldState.tick,
            triggered: result.triggered,
            triggers: result.triggers.map((t) => t.data.type),
            actions: result.actions.map((a) => ({
              type: a.type,
              details: JSON.stringify(a),
            })),
          };

          if (result.decision?.plan) {
            decision.strategy = {
              type: 'trade',
              goal: result.decision.plan.summary,
            };
          }

          // Record trades to database
          if (state.database) {
            for (const action of result.actions) {
              if (action.type === 'trade') {
                const tradeAction = action as { shipId: string; islandId: string; transactions: Array<{ goodId: string; quantity: number }> };
                const island = worldState.islands.get(tradeAction.islandId);
                if (island) {
                  for (const tx of tradeAction.transactions) {
                    const price = island.market.prices.get(tx.goodId) ?? 0;
                    const tradeRecord: TradeRecord = {
                      agentId: result.agentId,
                      shipId: tradeAction.shipId,
                      islandId: tradeAction.islandId,
                      goodId: tx.goodId,
                      quantity: tx.quantity,
                      price: price,
                    };
                    state.database.recordTrade(worldState.tick, tradeRecord);
                  }
                }
              }
            }
          }

          broadcast({ type: 'agent-decision', data: decision });
        }
      }
    }

    broadcast({ type: 'tick', data: snapshot });
  } catch (error) {
    console.error('[Server] Tick error:', error);
  }
}

function startSimulation(): void {
  if (state.status === 'running') return;

  if (!state.simulation) {
    initializeSimulation();
  }

  state.status = 'running';
  const intervalMs = Math.round(1000 / state.timeScale);
  state.tickInterval = setInterval(runTick, intervalMs);

  broadcast({ type: 'status', data: { status: 'running' } });
  console.log(`[Server] Simulation started (${state.timeScale}x speed)`);
}

function pauseSimulation(): void {
  if (state.status !== 'running') return;

  state.status = 'paused';
  if (state.tickInterval) {
    clearInterval(state.tickInterval);
    state.tickInterval = null;
  }

  broadcast({ type: 'status', data: { status: 'paused' } });
  console.log('[Server] Simulation paused');
}

function resumeSimulation(): void {
  if (state.status !== 'paused') return;

  state.status = 'running';
  const intervalMs = Math.round(1000 / state.timeScale);
  state.tickInterval = setInterval(runTick, intervalMs);

  broadcast({ type: 'status', data: { status: 'running' } });
  console.log('[Server] Simulation resumed');
}

function setSpeed(scale: number): void {
  state.timeScale = Math.max(1, Math.min(10, scale));

  if (state.status === 'running' && state.tickInterval) {
    clearInterval(state.tickInterval);
    const intervalMs = Math.round(1000 / state.timeScale);
    state.tickInterval = setInterval(runTick, intervalMs);
  }

  console.log(`[Server] Speed set to ${state.timeScale}x`);
}

function setLLMEnabled(enabled: boolean): void {
  if (!config.HAS_API_KEY && enabled) {
    console.log('[Server] Cannot enable LLM: GEMINI_API_KEY not set');
    broadcast({ type: 'llm-status', data: { enabled: false } });
    return;
  }

  const wasRunning = state.status === 'running';
  if (wasRunning) {
    pauseSimulation();
  }

  state.llmEnabled = enabled;

  if (state.simulation && config.ENABLE_AGENTS) {
    const worldState = state.simulation.getState();
    state.agentManager = new AgentManager({ debug: false });

    const shipIds = Array.from(worldState.ships.keys());
    const initialCash = 1000;
    const triggerConfig = { maxTicksWithoutReasoning: 10, priceDivergenceThreshold: 0.1 };

    let agent: TraderAgent;
    if (enabled) {
      console.log('[Server] Switching to real Gemini LLM');
      const llmClient = new LLMClient();
      agent = new TraderAgent('trader-alpha', 'Alpha Trader', llmClient, {
        cash: initialCash,
        shipIds,
      }, { triggerConfig, debug: true });
    } else {
      console.log('[Server] Switching to mock LLM');
      agent = createMockTraderAgent('trader-alpha', 'Mock Trader', {
        cash: initialCash,
        shipIds,
      }, undefined, { triggerConfig, debug: true });
    }

    state.agentManager.registerAgent(agent, worldState);
    llmMetrics.reset();
  }

  broadcast({ type: 'llm-status', data: { enabled: state.llmEnabled } });
  broadcast({ type: 'llm-stats', data: llmMetrics.getSummary() });

  if (wasRunning) {
    resumeSimulation();
  }

  console.log(`[Server] LLM ${enabled ? 'enabled' : 'disabled'}`);
}

// ============================================================================
// Router Setup
// ============================================================================

const router = createRouter({
  initializeSimulation,
  pauseSimulation,
  resumeSimulation,
});

// ============================================================================
// HTTP Server
// ============================================================================

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  setCorsHeaders(res);

  if (handleCorsPreflightIfNeeded(req, res)) {
    return;
  }

  const url = new URL(req.url || '/', `http://${req.headers.host}`);

  // Try the router first
  if (router.handle(req, res, url.pathname)) {
    return;
  }

  // 404 fallback
  sendError(res, 404, 'Not found');
}

// ============================================================================
// WebSocket Server
// ============================================================================

function handleWebSocket(ws: WebSocket): void {
  clients.add(ws);
  console.log(`[Server] Client connected (${clients.size} total)`);

  ws.send(JSON.stringify({
    type: 'status',
    data: { status: state.status === 'stopped' ? 'connected' : state.status },
  }));

  if (state.simulation) {
    const snapshot = serializeWorldState(state.simulation.getState());
    ws.send(JSON.stringify({ type: 'tick', data: snapshot }));
    ws.send(JSON.stringify({ type: 'history', data: { priceHistory: state.priceHistory } }));
  }

  ws.send(JSON.stringify({ type: 'llm-status', data: { enabled: state.llmEnabled } }));
  ws.send(JSON.stringify({ type: 'llm-stats', data: llmMetrics.getSummary() }));

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString()) as ClientMessage;

      switch (message.type) {
        case 'start':
          startSimulation();
          break;
        case 'pause':
          pauseSimulation();
          break;
        case 'resume':
          resumeSimulation();
          break;
        case 'speed':
          if (typeof message.scale === 'number') {
            setSpeed(message.scale);
          }
          break;
        case 'subscribe':
          break;
        case 'set-llm':
          if (typeof message.enabled === 'boolean') {
            setLLMEnabled(message.enabled);
          }
          break;
        default:
          console.log('[Server] Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('[Server] Message parse error:', error);
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[Server] Client disconnected (${clients.size} remaining)`);
  });

  ws.on('error', (error) => {
    console.error('[Server] WebSocket error:', error);
    clients.delete(ws);
  });
}

// ============================================================================
// Main
// ============================================================================

const server = createServer(handleRequest);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', handleWebSocket);

llmMetrics.subscribe((record) => {
  broadcast({ type: 'llm-call', data: record });

  if (state.database && state.simulation) {
    const tick = state.simulation.getState().tick;
    state.database.recordLLMCall(tick, record);
  }
});

// Initialize database on startup
if (config.DB_ENABLED) {
  state.database = createDatabase(config.DB_PATH, config.DB_SNAPSHOT_INTERVAL);
  if (state.database) {
    console.log(`[Database] Initialized at ${config.DB_PATH} (snapshot every ${config.DB_SNAPSHOT_INTERVAL} ticks)`);
  }
}

// Initialize simulation on startup
initializeSimulation();

server.listen(config.PORT, () => {
  console.log('='.repeat(50));
  console.log('Living Archipelago API Server');
  console.log('='.repeat(50));
  console.log(`HTTP:      http://localhost:${config.PORT}`);
  console.log(`WebSocket: ws://localhost:${config.PORT}/ws`);
  console.log(`Agents:    ${config.ENABLE_AGENTS ? 'Enabled' : 'Disabled'}`);
  console.log(`API Key:   ${config.HAS_API_KEY ? 'Available' : 'Not set'}`);
  console.log(`LLM Mode:  ${state.llmEnabled ? 'Real' : 'Mock'} (toggle via dashboard)`);
  console.log(`Database:  ${state.database ? `${config.DB_PATH} (every ${config.DB_SNAPSHOT_INTERVAL} ticks)` : 'Disabled'}`);
  console.log('='.repeat(50));
});

process.on('SIGINT', () => {
  console.log('\n[Server] Shutting down...');
  if (state.tickInterval) {
    clearInterval(state.tickInterval);
  }

  if (state.database) {
    state.database.endRun();
    state.database.close();
    console.log('[Database] Closed');
  }

  wss.close();
  server.close();
  process.exit(0);
});
