/**
 * API Server
 * HTTP + WebSocket server for the Living Archipelago dashboard
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { WebSocketServer } from 'ws';
import { llmMetrics } from '../llm/metrics.js';

// Import shared state
import { state, config, broadcast } from './state.js';

// Import router
import { createRouter } from './routes/index.js';
import { setCorsHeaders, handleCorsPreflightIfNeeded, sendError } from './utils/http.js';

// Import controller and services
import { initializeSimulation, pauseSimulation, resumeSimulation } from './controllers/SimulationController.js';
import { initializeDatabase, closeDatabase, recordLLMCall } from './services/DatabaseService.js';

// Import WebSocket handler
import { handleConnection } from './ws/index.js';

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

  if (router.handle(req, res, url.pathname)) {
    return;
  }

  sendError(res, 404, 'Not found');
}

// ============================================================================
// Main
// ============================================================================

const server = createServer(handleRequest);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', handleConnection);

// Subscribe to LLM metrics
llmMetrics.subscribe((record) => {
  broadcast({ type: 'llm-call', data: record });

  if (state.simulation) {
    const tick = state.simulation.getState().tick;
    recordLLMCall(tick, record);
  }
});

// Initialize database and simulation on startup
initializeDatabase();
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

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Server] Shutting down...');
  if (state.tickInterval) {
    clearInterval(state.tickInterval);
  }

  closeDatabase();

  wss.close();
  server.close();
  process.exit(0);
});
