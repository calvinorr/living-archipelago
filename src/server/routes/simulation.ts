/**
 * Simulation state and control routes
 */

import type { Router } from './router.js';
import { sendJson, sendError } from '../utils/http.js';
import { state, broadcast } from '../state.js';
import { serializeWorldState } from '../state-serializer.js';
import { llmMetrics } from '../../llm/metrics.js';

// Dependencies injected from api-server
export interface SimulationDeps {
  initializeSimulation: () => void;
}

let deps: SimulationDeps | null = null;

export function setSimulationDeps(d: SimulationDeps): void {
  deps = d;
}

export function registerSimulationRoutes(router: Router): void {
  // Get current state
  router.add('GET', '/api/state', (_req, res) => {
    const snapshot = state.simulation
      ? serializeWorldState(state.simulation.getState())
      : null;
    sendJson(res, 200, { status: state.status, world: snapshot });
  });

  // Get price history
  router.add('GET', '/api/history', (_req, res) => {
    sendJson(res, 200, { priceHistory: state.priceHistory });
  });

  // Get LLM metrics
  router.add('GET', '/api/llm-stats', (_req, res) => {
    sendJson(res, 200, { summary: llmMetrics.getSummary() });
  });

  // Reset simulation
  router.add('POST', '/api/simulation/reset', (_req, res) => {
    if (!deps) {
      sendError(res, 500, 'Simulation dependencies not initialized');
      return;
    }

    try {
      // Stop current simulation if running
      if (state.tickInterval) {
        clearInterval(state.tickInterval);
        state.tickInterval = null;
      }
      state.status = 'paused';

      // Get old run ID for reference
      const oldRunId = state.database?.getCurrentRunId();

      // Re-initialize simulation with current config (includes applied overrides)
      deps.initializeSimulation();

      // Get new run ID
      const newRunId = state.database?.getCurrentRunId();

      // Broadcast reset to all clients
      broadcast({
        type: 'simulation_reset',
        data: { oldRunId, newRunId },
      });

      // Send new state to all clients
      if (state.simulation) {
        broadcast({
          type: 'state',
          data: serializeWorldState(state.simulation.getState()),
        });
      }

      console.log(`[Server] Simulation reset: run ${oldRunId} → run ${newRunId}`);

      sendJson(res, 200, {
        success: true,
        oldRunId,
        newRunId,
        message: `Simulation reset. New run #${newRunId} started with current config.`,
      });
    } catch (error) {
      console.error('[Server] Reset failed:', error);
      sendError(res, 500, 'Failed to reset simulation');
    }
  });
}
