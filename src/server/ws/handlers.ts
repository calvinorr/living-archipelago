/**
 * WebSocket connection handlers
 */

import { WebSocket } from 'ws';
import { llmMetrics } from '../../llm/metrics.js';
import { serializeWorldState } from '../state-serializer.js';
import { state, clients, type ClientMessage } from '../state.js';
import {
  startSimulation,
  pauseSimulation,
  resumeSimulation,
  setSpeed,
  setLLMEnabled,
} from '../controllers/SimulationController.js';

/**
 * Send initial state to a newly connected client
 */
function sendInitialState(ws: WebSocket): void {
  // Send current status
  ws.send(JSON.stringify({
    type: 'status',
    data: { status: state.status === 'stopped' ? 'connected' : state.status },
  }));

  // Send current world state and price history if simulation is running
  if (state.simulation) {
    const snapshot = serializeWorldState(state.simulation.getState());
    ws.send(JSON.stringify({ type: 'tick', data: snapshot }));
    ws.send(JSON.stringify({ type: 'history', data: { priceHistory: state.priceHistory } }));
  }

  // Send LLM status
  ws.send(JSON.stringify({ type: 'llm-status', data: { enabled: state.llmEnabled } }));
  ws.send(JSON.stringify({ type: 'llm-stats', data: llmMetrics.getSummary() }));
}

/**
 * Handle incoming WebSocket message
 */
function handleMessage(_ws: WebSocket, data: unknown): void {
  try {
    const message = JSON.parse(String(data)) as ClientMessage;

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
        // Already subscribed to everything on connection
        break;
      case 'set-llm':
        if (typeof message.enabled === 'boolean') {
          setLLMEnabled(message.enabled);
        }
        break;
      default:
        console.log('[WebSocket] Unknown message type:', message.type);
    }
  } catch (error) {
    console.error('[WebSocket] Message parse error:', error);
  }
}

/**
 * Handle client disconnection
 */
function handleClose(ws: WebSocket): void {
  clients.delete(ws);
  console.log(`[WebSocket] Client disconnected (${clients.size} remaining)`);
}

/**
 * Handle WebSocket error
 */
function handleError(ws: WebSocket, error: Error): void {
  console.error('[WebSocket] Error:', error);
  clients.delete(ws);
}

/**
 * Handle new WebSocket connection
 */
export function handleConnection(ws: WebSocket): void {
  clients.add(ws);
  console.log(`[WebSocket] Client connected (${clients.size} total)`);

  // Send initial state
  sendInitialState(ws);

  // Set up event handlers
  ws.on('message', (data) => handleMessage(ws, data));
  ws.on('close', () => handleClose(ws));
  ws.on('error', (error) => handleError(ws, error));
}
