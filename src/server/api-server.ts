/**
 * API Server
 * HTTP + WebSocket server for the Living Archipelago dashboard
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { Simulation } from '../core/simulation.js';
import { initializeWorld } from '../core/world.js';
import { AgentManager } from '../agents/core/agent-manager.js';
import { TraderAgent, createMockTraderAgent } from '../agents/traders/trader-agent.js';
import { LLMClient } from '../llm/client.js';
import { llmMetrics } from '../llm/metrics.js';
import { serializeWorldState } from './state-serializer.js';

// ============================================================================
// Types
// ============================================================================

type SimulationStatus = 'stopped' | 'running' | 'paused';

interface ServerState {
  status: SimulationStatus;
  simulation: Simulation | null;
  agentManager: AgentManager | null;
  timeScale: number;
  tickInterval: NodeJS.Timeout | null;
  llmEnabled: boolean;
  priceHistory: Array<{
    tick: number;
    gameDay: number;
    gameHour: number;
    prices: Record<string, Record<string, number>>;
  }>;
}

interface ClientMessage {
  type: string;
  [key: string]: unknown;
}

interface AgentDecisionEvent {
  agentId: string;
  agentName: string;
  tick: number;
  triggered: boolean;
  triggers: string[];
  strategy?: {
    type: string;
    goal: string;
    targetRoute?: string;
  };
  actions: Array<{
    type: string;
    details: string;
  }>;
  reasoning?: string;
}

// ============================================================================
// Server State
// ============================================================================

const state: ServerState = {
  status: 'stopped',
  simulation: null,
  agentManager: null,
  timeScale: 1,
  tickInterval: null,
  llmEnabled: false,
  priceHistory: [],
};

const clients = new Set<WebSocket>();

const PORT = parseInt(process.env.PORT || '3001', 10);
const ENABLE_AGENTS = process.env.ENABLE_AGENTS !== 'false';
const HAS_API_KEY = !!process.env.GEMINI_API_KEY;

// ============================================================================
// Simulation Control
// ============================================================================

function initializeSimulation(): void {
  const seed = parseInt(process.env.SEED || '12345', 10);
  const initialState = initializeWorld(seed);

  state.simulation = new Simulation(initialState, { seed });
  state.priceHistory = [];

  if (ENABLE_AGENTS) {
    state.agentManager = new AgentManager({ debug: false });

    const shipIds = Array.from(initialState.ships.keys());
    const initialCash = 1000;

    let agent: TraderAgent;
    // Faster trigger for demo - reason every 10 ticks instead of 60
    const triggerConfig = { maxTicksWithoutReasoning: 10, priceDivergenceThreshold: 0.1 };

    if (state.llmEnabled && HAS_API_KEY) {
      console.log('[Server] Using real Gemini LLM');
      const llmClient = new LLMClient();
      agent = new TraderAgent('trader-alpha', 'Alpha Trader', llmClient, {
        cash: initialCash,
        shipIds,
      }, { triggerConfig, debug: true });
    } else {
      console.log('[Server] Using mock LLM');
      agent = createMockTraderAgent('trader-mock', 'Mock Trader', {
        cash: initialCash,
        shipIds,
      });
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

    // Process agents
    if (state.agentManager) {
      const agentResults = await state.agentManager.processTick(worldState);

      for (const result of agentResults.results) {
        // Log agent activity
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

          broadcast({ type: 'agent-decision', data: decision });
        }
      }
    }

    // Broadcast tick
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
  if (!HAS_API_KEY && enabled) {
    console.log('[Server] Cannot enable LLM: GEMINI_API_KEY not set');
    broadcast({ type: 'llm-status', data: { enabled: false } });
    return;
  }

  const wasRunning = state.status === 'running';

  // Pause if running
  if (wasRunning) {
    pauseSimulation();
  }

  state.llmEnabled = enabled;

  // Reinitialize agent with new LLM setting
  if (state.simulation && ENABLE_AGENTS) {
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
      agent = createMockTraderAgent('trader-mock', 'Mock Trader', {
        cash: initialCash,
        shipIds,
      });
    }

    state.agentManager.registerAgent(agent, worldState);

    // Reset LLM metrics when switching
    llmMetrics.reset();
  }

  broadcast({ type: 'llm-status', data: { enabled: state.llmEnabled } });
  broadcast({ type: 'llm-stats', data: llmMetrics.getSummary() });

  // Resume if was running
  if (wasRunning) {
    resumeSimulation();
  }

  console.log(`[Server] LLM ${enabled ? 'enabled' : 'disabled'}`);
}

// ============================================================================
// WebSocket Broadcast
// ============================================================================

function broadcast(message: object): void {
  const data = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

// ============================================================================
// HTTP Server
// ============================================================================

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://${req.headers.host}`);

  // Health check
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  // Get current state
  if (url.pathname === '/api/state' && req.method === 'GET') {
    const snapshot = state.simulation ? serializeWorldState(state.simulation.getState()) : null;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: state.status, world: snapshot }));
    return;
  }

  // Get price history
  if (url.pathname === '/api/history' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ priceHistory: state.priceHistory }));
    return;
  }

  // Get LLM metrics
  if (url.pathname === '/api/llm-stats' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ summary: llmMetrics.getSummary() }));
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
}

// ============================================================================
// WebSocket Server
// ============================================================================

function handleWebSocket(ws: WebSocket): void {
  clients.add(ws);
  console.log(`[Server] Client connected (${clients.size} total)`);

  // Send current status
  ws.send(
    JSON.stringify({
      type: 'status',
      data: { status: state.status === 'stopped' ? 'connected' : state.status },
    })
  );

  // Send current state if simulation is running
  if (state.simulation) {
    const snapshot = serializeWorldState(state.simulation.getState());
    ws.send(JSON.stringify({ type: 'tick', data: snapshot }));

    // Send price history
    ws.send(JSON.stringify({ type: 'history', data: { priceHistory: state.priceHistory } }));
  }

  // Send LLM status and metrics
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
          // Already subscribed to everything
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

// Subscribe to LLM metrics and broadcast to WebSocket clients
llmMetrics.subscribe((record) => {
  broadcast({ type: 'llm-call', data: record });
});

// Initialize simulation on startup
initializeSimulation();

server.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log('Living Archipelago API Server');
  console.log('='.repeat(50));
  console.log(`HTTP:      http://localhost:${PORT}`);
  console.log(`WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`Agents:    ${ENABLE_AGENTS ? 'Enabled' : 'Disabled'}`);
  console.log(`API Key:   ${HAS_API_KEY ? 'Available' : 'Not set'}`);
  console.log(`LLM Mode:  ${state.llmEnabled ? 'Real' : 'Mock'} (toggle via dashboard)`);
  console.log('='.repeat(50));
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Server] Shutting down...');
  if (state.tickInterval) {
    clearInterval(state.tickInterval);
  }
  wss.close();
  server.close();
  process.exit(0);
});
