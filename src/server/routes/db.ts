/**
 * Database analytics routes
 */

import type { Router } from './router.js';
import { sendJson, sendError, requireDb, parseRunId } from '../utils/http.js';
import { state } from '../state.js';
import {
  getTradeStats,
  getLLMUsage,
  getEcosystemHealth,
  getPriceHistory,
} from '../../storage/index.js';

export function registerDbRoutes(router: Router): void {
  // Get database stats
  router.add('GET', '/api/db/stats', (_req, res) => {
    if (!requireDb(state.database, res)) return;

    const stats = state.database.getStats();
    const runId = state.database.getCurrentRunId();
    sendJson(res, 200, { currentRunId: runId, stats });
  });

  // Get all runs
  router.add('GET', '/api/db/runs', (_req, res) => {
    if (!requireDb(state.database, res)) return;

    const runs = state.database.getAllRuns();
    sendJson(res, 200, { runs });
  });

  // Get trade stats for a run
  router.addParam('GET', '/api/db/trades/:runId', (_req, res, params) => {
    if (!requireDb(state.database, res)) return;

    const runId = parseRunId(params.runId);
    if (runId === null) {
      sendError(res, 400, 'Invalid run ID');
      return;
    }

    const stats = getTradeStats(state.database, runId);
    sendJson(res, 200, {
      ...stats,
      tradesByGood: Object.fromEntries(stats.tradesByGood),
      tradesByIsland: Object.fromEntries(stats.tradesByIsland),
    });
  });

  // Get ecosystem health for a run
  router.addParam('GET', '/api/db/ecosystem/:runId', (_req, res, params) => {
    if (!requireDb(state.database, res)) return;

    const runId = parseRunId(params.runId);
    if (runId === null) {
      sendError(res, 400, 'Invalid run ID');
      return;
    }

    const health = getEcosystemHealth(state.database, runId);
    const serialized = health.map((snapshot) => ({
      ...snapshot,
      islands: Object.fromEntries(snapshot.islands),
    }));
    sendJson(res, 200, { health: serialized });
  });

  // Get LLM usage for a run
  router.addParam('GET', '/api/db/llm/:runId', (_req, res, params) => {
    if (!requireDb(state.database, res)) return;

    const runId = parseRunId(params.runId);
    if (runId === null) {
      sendError(res, 400, 'Invalid run ID');
      return;
    }

    const usage = getLLMUsage(state.database, runId);
    sendJson(res, 200, {
      ...usage,
      callsByModel: Object.fromEntries(usage.callsByModel),
    });
  });

  // Get price history for a run/island/good
  router.add('GET', '/api/db/prices', (req, res) => {
    if (!requireDb(state.database, res)) return;

    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const runId = parseRunId(url.searchParams.get('runId') || undefined);
    const islandId = url.searchParams.get('islandId');
    const goodId = url.searchParams.get('goodId');

    if (runId === null || !islandId || !goodId) {
      sendError(res, 400, 'Missing runId, islandId, or goodId');
      return;
    }

    const prices = getPriceHistory(state.database, runId, islandId, goodId);
    sendJson(res, 200, { prices });
  });
}
