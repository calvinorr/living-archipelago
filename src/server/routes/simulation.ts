/**
 * Simulation state and control routes
 */

import type { Router } from './router.js';
import { sendJson, sendError } from '../utils/http.js';
import { state } from '../state.js';
import { serializeWorldState } from '../state-serializer.js';
import { llmMetrics } from '../../llm/metrics.js';
import { resetSimulation } from '../controllers/SimulationController.js';

// Dependencies interface kept for backward compatibility with routes/index.ts
export interface SimulationDeps {
  initializeSimulation: () => void;
}

export function setSimulationDeps(_d: SimulationDeps): void {
  // No longer needed - using controller directly
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
    try {
      const { oldRunId, newRunId } = resetSimulation();

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
