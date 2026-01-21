/**
 * Analyst API routes
 */

import type { Router } from './router.js';
import { sendJson, sendError, requireDb, requireApiKey, parseRunId, parseJsonBody } from '../utils/http.js';
import { state, config } from '../state.js';
import {
  getTradeStats,
  getPriceVolatility,
  getPopulationTrends,
} from '../../storage/index.js';
import {
  getRunSummary,
  getEcosystemReports,
  getMarketEfficiencyMetrics,
  getTradeRouteAnalysis,
} from '../../storage/analyst-queries.js';
import { EconomicAnalyst } from '../../analyst/analyst-agent.js';
import { addOverride } from '../../config/overrides.js';
import {
  recordAnalysis,
  getAnalysisHistory,
  getPendingRecommendations,
  getAnalysisDetails,
  markRecommendationApplied,
} from '../services/DatabaseService.js';

// Global analyst instance
let analyst: EconomicAnalyst | null = null;

function getAnalyst(): EconomicAnalyst {
  if (!analyst) {
    analyst = new EconomicAnalyst({ rateLimiterPreset: 'balanced', debug: true });
  }
  return analyst;
}

export function registerAnalystRoutes(router: Router): void {
  // Get all runs for analyst
  router.add('GET', '/api/analyst/runs', (_req, res) => {
    if (!requireDb(state.database, res)) return;

    const runs = state.database.getAllRuns();

    // Get duration (max tick) for each run
    const summaries = runs.map((run) => {
      let duration = 0;
      try {
        const db = state.database!.getDb();
        const result = db
          .prepare('SELECT MAX(tick) as maxTick FROM snapshots WHERE run_id = ?')
          .get(run.id) as { maxTick: number | null } | undefined;
        duration = result?.maxTick ?? 0;
      } catch {
        duration = 0;
      }

      return {
        id: run.id,
        seed: run.seed,
        startedAt: run.startedAt.toISOString(),
        endedAt: run.endedAt?.toISOString() || null,
        duration,
      };
    });

    const currentRunId = state.database.getCurrentRunId();
    sendJson(res, 200, { runs: summaries, currentRunId });
  });

  // Delete all runs except current
  router.add('DELETE', '/api/analyst/runs', (_req, res) => {
    if (!requireDb(state.database, res)) return;

    const currentRunId = state.database.getCurrentRunId();
    const runs = state.database.getAllRuns();
    const runsToDelete = runs.filter((r) => r.id !== currentRunId);

    if (runsToDelete.length === 0) {
      sendJson(res, 200, { success: true, deleted: 0, message: 'No runs to delete' });
      return;
    }

    try {
      const db = state.database.getDb();
      let deleted = 0;

      for (const run of runsToDelete) {
        db.prepare('DELETE FROM prices WHERE snapshot_id IN (SELECT id FROM snapshots WHERE run_id = ?)').run(run.id);
        db.prepare('DELETE FROM island_metrics WHERE snapshot_id IN (SELECT id FROM snapshots WHERE run_id = ?)').run(run.id);
        db.prepare('DELETE FROM snapshots WHERE run_id = ?').run(run.id);
        db.prepare('DELETE FROM trades WHERE run_id = ?').run(run.id);
        db.prepare('DELETE FROM llm_calls WHERE run_id = ?').run(run.id);
        db.prepare('DELETE FROM events WHERE run_id = ?').run(run.id);
        db.prepare('DELETE FROM runs WHERE id = ?').run(run.id);
        deleted++;
      }

      console.log(`[Database] Deleted ${deleted} runs (kept current run ${currentRunId})`);
      sendJson(res, 200, { success: true, deleted, message: `Deleted ${deleted} runs` });
    } catch (error) {
      console.error('[Database] Delete all error:', error);
      sendError(res, 500, 'Failed to delete runs');
    }
  });

  // Get run summary
  router.addParam('GET', '/api/analyst/runs/:runId/summary', (_req, res, params) => {
    if (!requireDb(state.database, res)) return;

    const runId = parseRunId(params.runId);
    if (runId === null) {
      sendError(res, 400, 'Invalid run ID');
      return;
    }

    const summary = getRunSummary(state.database, runId);
    if (!summary) {
      sendError(res, 404, 'Run not found');
      return;
    }

    sendJson(res, 200, { summary });
  });

  // Get ecosystem reports
  router.addParam('GET', '/api/analyst/runs/:runId/ecosystem', (_req, res, params) => {
    if (!requireDb(state.database, res)) return;

    const runId = parseRunId(params.runId);
    if (runId === null) {
      sendError(res, 400, 'Invalid run ID');
      return;
    }

    const reports = getEcosystemReports(state.database, runId);
    sendJson(res, 200, { reports });
  });

  // Get market efficiency metrics
  router.addParam('GET', '/api/analyst/runs/:runId/market', (_req, res, params) => {
    if (!requireDb(state.database, res)) return;

    const runId = parseRunId(params.runId);
    if (runId === null) {
      sendError(res, 400, 'Invalid run ID');
      return;
    }

    const metrics = getMarketEfficiencyMetrics(state.database, runId);
    sendJson(res, 200, { metrics });
  });

  // Get trade route analysis
  router.addParam('GET', '/api/analyst/runs/:runId/routes', (_req, res, params) => {
    if (!requireDb(state.database, res)) return;

    const runId = parseRunId(params.runId);
    if (runId === null) {
      sendError(res, 400, 'Invalid run ID');
      return;
    }

    const routes = getTradeRouteAnalysis(state.database, runId);
    sendJson(res, 200, { routes });
  });

  // Get full analysis data
  router.addParam('GET', '/api/analyst/runs/:runId/full', (_req, res, params) => {
    if (!requireDb(state.database, res)) return;

    const runId = parseRunId(params.runId);
    if (runId === null) {
      sendError(res, 400, 'Invalid run ID');
      return;
    }

    const summary = getRunSummary(state.database, runId);
    if (!summary) {
      sendError(res, 404, 'Run not found');
      return;
    }

    const ecosystem = getEcosystemReports(state.database, runId);
    const market = getMarketEfficiencyMetrics(state.database, runId);
    const routes = getTradeRouteAnalysis(state.database, runId);
    const trades = getTradeStats(state.database, runId);
    const prices = getPriceVolatility(state.database, runId);
    const population = getPopulationTrends(state.database, runId);

    sendJson(res, 200, {
      summary,
      ecosystem,
      market,
      routes,
      trades: {
        ...trades,
        tradesByGood: Object.fromEntries(trades.tradesByGood),
        tradesByIsland: Object.fromEntries(trades.tradesByIsland),
      },
      prices: Object.fromEntries(prices),
      population: Object.fromEntries(population),
    });
  });

  // Analyze run with AI
  router.addParam('POST', '/api/analyst/runs/:runId/analyze', (_req, res, params) => {
    if (!requireDb(state.database, res)) return;
    if (!requireApiKey(config.HAS_API_KEY, res)) return;

    const runId = parseRunId(params.runId);
    if (runId === null) {
      sendError(res, 400, 'Invalid run ID');
      return;
    }

    console.log(`[Analyst] Starting analysis for run ${runId}`);

    const analystInstance = getAnalyst();
    analystInstance
      .analyzeRun(state.database, runId)
      .then((analysis) => {
        if (!analysis) {
          sendError(res, 500, 'Analysis failed');
          return;
        }

        // Persist analysis to database for feedback loop
        const analysisRunId = recordAnalysis(runId, analysis);
        if (analysisRunId) {
          console.log(`[Analyst] Persisted analysis ${analysisRunId} for run ${runId}`);
        }

        sendJson(res, 200, {
          runId: analysis.runId,
          analysisRunId,
          analyzedAt: analysis.analyzedAt.toISOString(),
          healthScore: analysis.healthScore,
          issues: analysis.issues,
          recommendations: analysis.recommendations,
          summary: analysis.summary,
        });
      })
      .catch((error) => {
        console.error('[Analyst] Analysis error:', error);
        sendError(res, 500, 'Analysis failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
      });
  });

  // Chat with analyst
  router.add('POST', '/api/analyst/chat', async (req, res) => {
    if (!requireApiKey(config.HAS_API_KEY, res)) return;

    const body = await parseJsonBody<{ message?: string; runId?: number }>(req);
    if (!body) {
      sendError(res, 400, 'Invalid JSON body');
      return;
    }

    const { message, runId } = body;
    if (!message) {
      sendError(res, 400, 'Message is required');
      return;
    }

    try {
      const analystInstance = getAnalyst();
      const response = await analystInstance.chat(message, state.database || undefined, runId);
      sendJson(res, 200, { response: response || 'No response generated' });
    } catch (error) {
      console.error('[Analyst] Chat error:', error);
      sendError(res, 500, 'Chat failed');
    }
  });

  // Apply improvement
  router.add('POST', '/api/analyst/improvements/apply', async (req, res) => {
    const body = await parseJsonBody<{ configPath?: string; newValue?: unknown }>(req);
    if (!body) {
      sendError(res, 400, 'Invalid JSON body');
      return;
    }

    let { configPath, newValue } = body;
    if (!configPath || newValue === undefined) {
      sendError(res, 400, 'configPath and newValue are required');
      return;
    }

    // Normalize config path - strip invalid prefixes that LLM sometimes adds
    const invalidPrefixes = [
      'Market.',
      'Transport.',
      'Population.',
      'Consumption.',
      'Production.',
      'Ecosystem.',
      'Config.',
      'config.',
    ];
    for (const prefix of invalidPrefixes) {
      if (configPath.startsWith(prefix)) {
        console.log(`[Analyst] Stripping invalid prefix "${prefix}" from config path: ${configPath}`);
        configPath = configPath.slice(prefix.length);
        break;
      }
    }

    // Apply to running simulation if active
    if (!state.simulation) {
      sendError(res, 400, 'No simulation running');
      return;
    }

    const oldConfig = state.simulation.getConfig();
    const success = state.simulation.updateConfigPath(configPath, newValue);

    if (!success) {
      sendError(res, 400, `Invalid config path: ${configPath}`);
      return;
    }

    // Get old value for response
    const parts = configPath.split('.');
    let oldValue: unknown = oldConfig;
    for (const part of parts) {
      if (oldValue && typeof oldValue === 'object') {
        oldValue = (oldValue as Record<string, unknown>)[part];
      }
    }

    // Persist to overrides file for future restarts
    const saved = addOverride({
      path: configPath,
      oldValue,
      newValue,
      source: `analyst-run-${state.database?.getCurrentRunId() ?? 'unknown'}`,
    });

    sendJson(res, 200, {
      success: true,
      configPath,
      oldValue,
      newValue,
      persisted: saved,
      message: `Config updated: ${configPath} changed from ${JSON.stringify(oldValue)} to ${JSON.stringify(newValue)}. ${saved ? 'Persisted to config file - will survive restarts.' : 'Applied to current session only.'}`,
    });
  });

  // Delete a run
  router.addParam('DELETE', '/api/analyst/runs/:runId', (_req, res, params) => {
    if (!requireDb(state.database, res)) return;

    const runId = parseRunId(params.runId);
    if (runId === null) {
      sendError(res, 400, 'Invalid run ID');
      return;
    }

    // Don't allow deleting the current run
    const currentRunId = state.database.getCurrentRunId();
    if (runId === currentRunId) {
      sendError(res, 400, 'Cannot delete the currently active run');
      return;
    }

    try {
      const db = state.database.getDb();

      // Delete in order due to foreign keys
      db.prepare('DELETE FROM prices WHERE snapshot_id IN (SELECT id FROM snapshots WHERE run_id = ?)').run(runId);
      db.prepare('DELETE FROM island_metrics WHERE snapshot_id IN (SELECT id FROM snapshots WHERE run_id = ?)').run(runId);
      db.prepare('DELETE FROM snapshots WHERE run_id = ?').run(runId);
      db.prepare('DELETE FROM trades WHERE run_id = ?').run(runId);
      db.prepare('DELETE FROM llm_calls WHERE run_id = ?').run(runId);
      db.prepare('DELETE FROM events WHERE run_id = ?').run(runId);
      db.prepare('DELETE FROM runs WHERE id = ?').run(runId);

      console.log(`[Database] Deleted run ${runId}`);
      sendJson(res, 200, { success: true, message: `Run ${runId} deleted` });
    } catch (error) {
      console.error('[Database] Delete error:', error);
      sendError(res, 500, 'Failed to delete run');
    }
  });

  // ============================================================================
  // Analysis History & Feedback Loop Endpoints
  // ============================================================================

  // Get analysis history (most recent first)
  router.add('GET', '/api/analyst/history', (_req, res) => {
    if (!requireDb(state.database, res)) return;

    const history = getAnalysisHistory(20);
    sendJson(res, 200, { analyses: history });
  });

  // Get full analysis details by analysis ID
  router.addParam('GET', '/api/analyst/analyses/:analysisId', (_req, res, params) => {
    if (!requireDb(state.database, res)) return;

    const analysisId = parseRunId(params.analysisId);
    if (analysisId === null) {
      sendError(res, 400, 'Invalid analysis ID');
      return;
    }

    const details = getAnalysisDetails(analysisId);
    if (!details) {
      sendError(res, 404, 'Analysis not found');
      return;
    }

    sendJson(res, 200, details);
  });

  // Get pending recommendations (not yet applied)
  router.add('GET', '/api/analyst/recommendations/pending', (_req, res) => {
    if (!requireDb(state.database, res)) return;

    const recommendations = getPendingRecommendations();
    sendJson(res, 200, { recommendations });
  });

  // Apply a specific recommendation by ID and track it
  router.addParam('POST', '/api/analyst/recommendations/:id/apply', async (_req, res, params) => {
    if (!requireDb(state.database, res)) return;

    const recommendationId = parseRunId(params.id);
    if (recommendationId === null) {
      sendError(res, 400, 'Invalid recommendation ID');
      return;
    }

    // Get the recommendation details
    const pending = getPendingRecommendations();
    const rec = pending.find((r) => r.id === recommendationId);

    if (!rec) {
      sendError(res, 404, 'Recommendation not found or already applied');
      return;
    }

    // Apply to running simulation
    if (!state.simulation) {
      sendError(res, 400, 'No simulation running');
      return;
    }

    const oldConfig = state.simulation.getConfig();
    const success = state.simulation.updateConfigPath(rec.configPath, rec.suggestedValue);

    if (!success) {
      sendError(res, 400, `Invalid config path: ${rec.configPath}`);
      return;
    }

    // Get old value for response
    const parts = rec.configPath.split('.');
    let oldValue: unknown = oldConfig;
    for (const part of parts) {
      if (oldValue && typeof oldValue === 'object') {
        oldValue = (oldValue as Record<string, unknown>)[part];
      }
    }

    // Persist to overrides file
    const saved = addOverride({
      path: rec.configPath,
      oldValue,
      newValue: rec.suggestedValue,
      source: `analyst-recommendation-${recommendationId}`,
    });

    // Mark recommendation as applied in database
    markRecommendationApplied(recommendationId);

    sendJson(res, 200, {
      success: true,
      recommendationId,
      configPath: rec.configPath,
      oldValue,
      newValue: rec.suggestedValue,
      persisted: saved,
      message: `Applied recommendation: ${rec.title}`,
    });
  });
}
