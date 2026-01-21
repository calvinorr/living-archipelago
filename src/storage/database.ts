/**
 * SQLite Database Storage for Simulation Data
 * Enables analysis and model improvement by persisting simulation state
 */

import Database from 'better-sqlite3';
import type {
  WorldState,
  SimulationConfig,
  WorldEvent,
  IslandId,
  GoodId,
  AgentId,
  ShipId,
} from '../core/types.js';
import type { LLMCallRecord } from '../llm/metrics.js';
import type { RunAnalysis } from '../analyst/analyst-agent.js';
import { hashState } from '../core/rng.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Trade record for database storage
 */
export interface TradeRecord {
  agentId: AgentId;
  shipId: ShipId;
  islandId: IslandId;
  goodId: GoodId;
  quantity: number; // Positive = buy, negative = sell
  price: number;
}

/**
 * Run information
 */
export interface RunInfo {
  id: number;
  seed: number;
  startedAt: Date;
  endedAt: Date | null;
  config: SimulationConfig;
}

// ============================================================================
// Schema
// ============================================================================

const SCHEMA = `
-- Simulation runs
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seed INTEGER NOT NULL,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT,
  config TEXT NOT NULL
);

-- World state snapshots (every N ticks)
CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  tick INTEGER NOT NULL,
  game_day INTEGER NOT NULL,
  game_hour INTEGER NOT NULL,
  state_hash TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs(id),
  UNIQUE(run_id, tick)
);

-- Island metrics per snapshot
CREATE TABLE IF NOT EXISTS island_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id INTEGER NOT NULL,
  island_id TEXT NOT NULL,
  population REAL NOT NULL,
  health REAL NOT NULL,
  fish_stock REAL NOT NULL,
  forest_biomass REAL NOT NULL,
  soil REAL NOT NULL,
  FOREIGN KEY (snapshot_id) REFERENCES snapshots(id)
);

-- Price data per snapshot per island
CREATE TABLE IF NOT EXISTS prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id INTEGER NOT NULL,
  island_id TEXT NOT NULL,
  good_id TEXT NOT NULL,
  price REAL NOT NULL,
  inventory REAL NOT NULL,
  FOREIGN KEY (snapshot_id) REFERENCES snapshots(id)
);

-- Trade executions
CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  tick INTEGER NOT NULL,
  agent_id TEXT NOT NULL,
  ship_id TEXT NOT NULL,
  island_id TEXT NOT NULL,
  good_id TEXT NOT NULL,
  quantity REAL NOT NULL,
  price REAL NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs(id)
);

-- LLM call records
CREATE TABLE IF NOT EXISTS llm_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  tick INTEGER NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  latency_ms INTEGER NOT NULL,
  estimated_cost_usd REAL NOT NULL,
  prompt_summary TEXT,
  finish_reason TEXT,
  FOREIGN KEY (run_id) REFERENCES runs(id)
);

-- World events
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  tick INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  start_tick INTEGER NOT NULL,
  end_tick INTEGER NOT NULL,
  data TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs(id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_snapshots_run_tick ON snapshots(run_id, tick);
CREATE INDEX IF NOT EXISTS idx_island_metrics_snapshot ON island_metrics(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_prices_snapshot ON prices(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_trades_run ON trades(run_id);
CREATE INDEX IF NOT EXISTS idx_trades_run_tick ON trades(run_id, tick);
CREATE INDEX IF NOT EXISTS idx_llm_calls_run ON llm_calls(run_id);
CREATE INDEX IF NOT EXISTS idx_events_run ON events(run_id);
CREATE INDEX IF NOT EXISTS idx_events_run_tick ON events(run_id, tick);

-- Analysis runs (one per analyst.analyzeRun() call)
CREATE TABLE IF NOT EXISTS analysis_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  analyzed_at TEXT NOT NULL DEFAULT (datetime('now')),
  health_score REAL NOT NULL,
  health_explanation TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL,
  raw_response TEXT,
  FOREIGN KEY (run_id) REFERENCES runs(id)
);

-- Analysis findings (issues detected)
CREATE TABLE IF NOT EXISTS analysis_findings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  analysis_run_id INTEGER NOT NULL,
  severity TEXT NOT NULL CHECK(severity IN ('critical', 'warning', 'info')),
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  evidence TEXT NOT NULL,
  FOREIGN KEY (analysis_run_id) REFERENCES analysis_runs(id)
);

-- Analysis recommendations
CREATE TABLE IF NOT EXISTS analysis_recommendations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  analysis_run_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  config_path TEXT NOT NULL,
  current_value TEXT NOT NULL,
  suggested_value TEXT NOT NULL,
  rationale TEXT NOT NULL,
  expected_impact TEXT NOT NULL,
  confidence REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'applied', 'rejected', 'superseded')),
  applied_at TEXT,
  applied_run_id INTEGER,
  impact_verified INTEGER DEFAULT 0,
  impact_notes TEXT,
  FOREIGN KEY (analysis_run_id) REFERENCES analysis_runs(id),
  FOREIGN KEY (applied_run_id) REFERENCES runs(id)
);

-- Indexes for analysis tables
CREATE INDEX IF NOT EXISTS idx_analysis_runs_run ON analysis_runs(run_id);
CREATE INDEX IF NOT EXISTS idx_analysis_findings_run ON analysis_findings(analysis_run_id);
CREATE INDEX IF NOT EXISTS idx_analysis_recommendations_run ON analysis_recommendations(analysis_run_id);
CREATE INDEX IF NOT EXISTS idx_analysis_recommendations_status ON analysis_recommendations(status);
`;

// ============================================================================
// SimulationDatabase Class
// ============================================================================

/**
 * SQLite database for simulation data storage
 * All methods are synchronous for simplicity with better-sqlite3
 */
export class SimulationDatabase {
  private db: Database.Database;
  private currentRunId: number | null = null;
  private snapshotInterval: number;
  private lastSnapshotTick: number = -1;

  // Prepared statements for performance
  private stmtInsertSnapshot: Database.Statement | null = null;
  private stmtInsertIslandMetrics: Database.Statement | null = null;
  private stmtInsertPrice: Database.Statement | null = null;
  private stmtInsertTrade: Database.Statement | null = null;
  private stmtInsertLLMCall: Database.Statement | null = null;
  private stmtInsertEvent: Database.Statement | null = null;
  private stmtInsertAnalysisRun: Database.Statement | null = null;
  private stmtInsertFinding: Database.Statement | null = null;
  private stmtInsertRecommendation: Database.Statement | null = null;

  /**
   * Create a new SimulationDatabase
   * @param dbPath Path to SQLite database file (use ':memory:' for in-memory)
   * @param snapshotInterval Record snapshots every N ticks (default: 10)
   */
  constructor(dbPath: string = 'simulation.db', snapshotInterval: number = 10) {
    this.db = new Database(dbPath);
    this.snapshotInterval = snapshotInterval;

    // Enable WAL mode for better concurrent performance
    this.db.pragma('journal_mode = WAL');

    // Create schema
    this.db.exec(SCHEMA);

    // Prepare statements
    this.prepareStatements();
  }

  /**
   * Get the underlying database connection for direct queries
   */
  getDb(): Database.Database {
    return this.db;
  }

  /**
   * Prepare statements for repeated use
   */
  private prepareStatements(): void {
    this.stmtInsertSnapshot = this.db.prepare(`
      INSERT INTO snapshots (run_id, tick, game_day, game_hour, state_hash)
      VALUES (?, ?, ?, ?, ?)
    `);

    this.stmtInsertIslandMetrics = this.db.prepare(`
      INSERT INTO island_metrics (snapshot_id, island_id, population, health, fish_stock, forest_biomass, soil)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    this.stmtInsertPrice = this.db.prepare(`
      INSERT INTO prices (snapshot_id, island_id, good_id, price, inventory)
      VALUES (?, ?, ?, ?, ?)
    `);

    this.stmtInsertTrade = this.db.prepare(`
      INSERT INTO trades (run_id, tick, agent_id, ship_id, island_id, good_id, quantity, price)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.stmtInsertLLMCall = this.db.prepare(`
      INSERT INTO llm_calls (run_id, tick, model, input_tokens, output_tokens, latency_ms, estimated_cost_usd, prompt_summary, finish_reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.stmtInsertEvent = this.db.prepare(`
      INSERT INTO events (run_id, tick, event_type, target_id, start_tick, end_tick, data)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    this.stmtInsertAnalysisRun = this.db.prepare(`
      INSERT INTO analysis_runs (run_id, health_score, health_explanation, summary, raw_response)
      VALUES (?, ?, ?, ?, ?)
    `);

    this.stmtInsertFinding = this.db.prepare(`
      INSERT INTO analysis_findings (analysis_run_id, severity, category, description, evidence)
      VALUES (?, ?, ?, ?, ?)
    `);

    this.stmtInsertRecommendation = this.db.prepare(`
      INSERT INTO analysis_recommendations
      (analysis_run_id, title, config_path, current_value, suggested_value, rationale, expected_impact, confidence)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
  }

  // ============================================================================
  // Run Management
  // ============================================================================

  /**
   * Start tracking a new simulation run
   * @param seed Random seed for the simulation
   * @param config Simulation configuration
   * @returns Run ID
   */
  startRun(seed: number, config: SimulationConfig): number {
    const stmt = this.db.prepare(`
      INSERT INTO runs (seed, config) VALUES (?, ?)
    `);
    const result = stmt.run(seed, JSON.stringify(config));
    this.currentRunId = result.lastInsertRowid as number;
    this.lastSnapshotTick = -1;
    return this.currentRunId;
  }

  /**
   * Mark the current run as ended
   */
  endRun(): void {
    if (this.currentRunId === null) return;

    const stmt = this.db.prepare(`
      UPDATE runs SET ended_at = datetime('now') WHERE id = ?
    `);
    stmt.run(this.currentRunId);
    this.currentRunId = null;
  }

  /**
   * Get current run ID
   */
  getCurrentRunId(): number | null {
    return this.currentRunId;
  }

  /**
   * Get information about a run
   */
  getRun(runId: number): RunInfo | null {
    const stmt = this.db.prepare(`
      SELECT id, seed, started_at, ended_at, config FROM runs WHERE id = ?
    `);
    const row = stmt.get(runId) as {
      id: number;
      seed: number;
      started_at: string;
      ended_at: string | null;
      config: string;
    } | undefined;

    if (!row) return null;

    return {
      id: row.id,
      seed: row.seed,
      startedAt: new Date(row.started_at),
      endedAt: row.ended_at ? new Date(row.ended_at) : null,
      config: JSON.parse(row.config),
    };
  }

  /**
   * Get all runs
   */
  getAllRuns(): RunInfo[] {
    const stmt = this.db.prepare(`
      SELECT id, seed, started_at, ended_at, config FROM runs ORDER BY started_at DESC
    `);
    const rows = stmt.all() as Array<{
      id: number;
      seed: number;
      started_at: string;
      ended_at: string | null;
      config: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      seed: row.seed,
      startedAt: new Date(row.started_at),
      endedAt: row.ended_at ? new Date(row.ended_at) : null,
      config: JSON.parse(row.config),
    }));
  }

  // ============================================================================
  // Snapshot Recording
  // ============================================================================

  /**
   * Record a world state snapshot
   * Only records at the configured interval (e.g., every 10 ticks)
   * @param tick Current tick
   * @param state World state to record
   * @returns true if snapshot was recorded, false if skipped
   */
  recordSnapshot(tick: number, state: WorldState): boolean {
    if (this.currentRunId === null) return false;

    // Check if we should record this tick
    if (tick - this.lastSnapshotTick < this.snapshotInterval) {
      return false;
    }

    // Use a transaction for atomic insert
    const runId = this.currentRunId;
    const insertSnapshot = this.db.transaction(() => {
      // Insert snapshot
      const stateHash = hashState(state);
      const snapshotResult = this.stmtInsertSnapshot!.run(
        runId,
        tick,
        state.gameTime.gameDay,
        state.gameTime.gameHour,
        stateHash
      );
      const snapshotId = snapshotResult.lastInsertRowid as number;

      // Insert island metrics and prices
      for (const [islandId, island] of state.islands) {
        // Island metrics
        this.stmtInsertIslandMetrics!.run(
          snapshotId,
          islandId,
          island.population.size,
          island.population.health,
          island.ecosystem.fishStock,
          island.ecosystem.forestBiomass,
          island.ecosystem.soilFertility
        );

        // Prices and inventory
        for (const [goodId, price] of island.market.prices) {
          const inventory = island.inventory.get(goodId) ?? 0;
          this.stmtInsertPrice!.run(snapshotId, islandId, goodId, price, inventory);
        }
      }

      return snapshotId;
    });

    insertSnapshot();
    this.lastSnapshotTick = tick;
    return true;
  }

  // ============================================================================
  // Trade Recording
  // ============================================================================

  /**
   * Record a trade execution
   * @param tick Current tick
   * @param trade Trade record
   */
  recordTrade(tick: number, trade: TradeRecord): void {
    if (this.currentRunId === null) return;

    this.stmtInsertTrade!.run(
      this.currentRunId,
      tick,
      trade.agentId,
      trade.shipId,
      trade.islandId,
      trade.goodId,
      trade.quantity,
      trade.price
    );
  }

  /**
   * Record multiple trades at once
   */
  recordTrades(tick: number, trades: TradeRecord[]): void {
    if (this.currentRunId === null || trades.length === 0) return;

    const runId = this.currentRunId;
    const insertTrades = this.db.transaction((tradeList: TradeRecord[]) => {
      for (const trade of tradeList) {
        this.stmtInsertTrade!.run(
          runId,
          tick,
          trade.agentId,
          trade.shipId,
          trade.islandId,
          trade.goodId,
          trade.quantity,
          trade.price
        );
      }
    });

    insertTrades(trades);
  }

  // ============================================================================
  // LLM Call Recording
  // ============================================================================

  /**
   * Record an LLM call
   * @param tick Current tick
   * @param call LLM call record
   */
  recordLLMCall(tick: number, call: LLMCallRecord): void {
    if (this.currentRunId === null) return;

    this.stmtInsertLLMCall!.run(
      this.currentRunId,
      tick,
      call.model,
      call.inputTokens,
      call.outputTokens,
      call.latencyMs,
      call.estimatedCostUsd,
      call.promptSummary,
      call.finishReason
    );
  }

  // ============================================================================
  // Event Recording
  // ============================================================================

  /**
   * Record a world event
   * @param tick Current tick
   * @param event World event
   */
  recordEvent(tick: number, event: WorldEvent): void {
    if (this.currentRunId === null) return;

    this.stmtInsertEvent!.run(
      this.currentRunId,
      tick,
      event.type,
      event.targetId,
      event.startTick,
      event.endTick,
      JSON.stringify(event.modifiers)
    );
  }

  /**
   * Record multiple events at once
   */
  recordEvents(tick: number, events: WorldEvent[]): void {
    if (this.currentRunId === null || events.length === 0) return;

    const runId = this.currentRunId;
    const insertEvents = this.db.transaction((eventList: WorldEvent[]) => {
      for (const event of eventList) {
        this.stmtInsertEvent!.run(
          runId,
          tick,
          event.type,
          event.targetId,
          event.startTick,
          event.endTick,
          JSON.stringify(event.modifiers)
        );
      }
    });

    insertEvents(events);
  }

  // ============================================================================
  // Analysis Recording
  // ============================================================================

  /**
   * Record an analysis result with all findings and recommendations
   * @param runId The simulation run that was analyzed
   * @param analysis The analysis result from the analyst agent
   * @returns The analysis_run ID
   */
  recordAnalysis(runId: number, analysis: RunAnalysis): number {
    const insertAnalysis = this.db.transaction(() => {
      // Insert main analysis record
      const result = this.stmtInsertAnalysisRun!.run(
        runId,
        analysis.healthScore,
        '', // healthExplanation not in RunAnalysis type
        analysis.summary,
        analysis.rawResponse || null
      );
      const analysisRunId = result.lastInsertRowid as number;

      // Insert issues as findings
      for (const issue of analysis.issues) {
        this.stmtInsertFinding!.run(
          analysisRunId,
          issue.severity,
          issue.category,
          issue.description,
          JSON.stringify(issue.evidence)
        );
      }

      // Insert recommendations
      for (const rec of analysis.recommendations) {
        this.stmtInsertRecommendation!.run(
          analysisRunId,
          rec.title,
          rec.configPath,
          JSON.stringify(rec.currentValue),
          JSON.stringify(rec.suggestedValue),
          rec.rationale,
          rec.expectedImpact,
          rec.confidence
        );
      }

      return analysisRunId;
    });

    return insertAnalysis();
  }

  /**
   * Mark a recommendation as applied
   * @param recommendationId The recommendation ID
   * @param appliedRunId The run where it was applied
   */
  markRecommendationApplied(recommendationId: number, appliedRunId: number): void {
    const stmt = this.db.prepare(`
      UPDATE analysis_recommendations
      SET status = 'applied', applied_at = datetime('now'), applied_run_id = ?
      WHERE id = ?
    `);
    stmt.run(appliedRunId, recommendationId);
  }

  /**
   * Update recommendation impact tracking
   * @param recommendationId The recommendation ID
   * @param verified Whether the expected impact was observed
   * @param notes Notes about the impact
   */
  updateRecommendationImpact(recommendationId: number, verified: boolean, notes: string): void {
    const stmt = this.db.prepare(`
      UPDATE analysis_recommendations
      SET impact_verified = ?, impact_notes = ?
      WHERE id = ?
    `);
    stmt.run(verified ? 1 : 0, notes, recommendationId);
  }

  /**
   * Get analysis history (most recent first)
   */
  getAnalysisHistory(limit: number = 20): Array<{
    id: number;
    runId: number;
    analyzedAt: Date;
    healthScore: number;
    summary: string;
    issueCount: number;
    recommendationCount: number;
  }> {
    const stmt = this.db.prepare(`
      SELECT
        ar.id,
        ar.run_id,
        ar.analyzed_at,
        ar.health_score,
        ar.summary,
        (SELECT COUNT(*) FROM analysis_findings WHERE analysis_run_id = ar.id) as issue_count,
        (SELECT COUNT(*) FROM analysis_recommendations WHERE analysis_run_id = ar.id) as recommendation_count
      FROM analysis_runs ar
      ORDER BY ar.analyzed_at DESC
      LIMIT ?
    `);

    const rows = stmt.all(limit) as Array<{
      id: number;
      run_id: number;
      analyzed_at: string;
      health_score: number;
      summary: string;
      issue_count: number;
      recommendation_count: number;
    }>;

    return rows.map((row) => ({
      id: row.id,
      runId: row.run_id,
      analyzedAt: new Date(row.analyzed_at),
      healthScore: row.health_score,
      summary: row.summary,
      issueCount: row.issue_count,
      recommendationCount: row.recommendation_count,
    }));
  }

  /**
   * Get pending recommendations (not yet applied)
   */
  getPendingRecommendations(): Array<{
    id: number;
    analysisRunId: number;
    runId: number;
    title: string;
    configPath: string;
    currentValue: unknown;
    suggestedValue: unknown;
    rationale: string;
    expectedImpact: string;
    confidence: number;
    analyzedAt: Date;
  }> {
    const stmt = this.db.prepare(`
      SELECT
        r.id,
        r.analysis_run_id,
        ar.run_id,
        r.title,
        r.config_path,
        r.current_value,
        r.suggested_value,
        r.rationale,
        r.expected_impact,
        r.confidence,
        ar.analyzed_at
      FROM analysis_recommendations r
      JOIN analysis_runs ar ON r.analysis_run_id = ar.id
      WHERE r.status = 'pending'
      ORDER BY ar.analyzed_at DESC, r.confidence DESC
    `);

    const rows = stmt.all() as Array<{
      id: number;
      analysis_run_id: number;
      run_id: number;
      title: string;
      config_path: string;
      current_value: string;
      suggested_value: string;
      rationale: string;
      expected_impact: string;
      confidence: number;
      analyzed_at: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      analysisRunId: row.analysis_run_id,
      runId: row.run_id,
      title: row.title,
      configPath: row.config_path,
      currentValue: JSON.parse(row.current_value),
      suggestedValue: JSON.parse(row.suggested_value),
      rationale: row.rationale,
      expectedImpact: row.expected_impact,
      confidence: row.confidence,
      analyzedAt: new Date(row.analyzed_at),
    }));
  }

  /**
   * Get full analysis details including issues and recommendations
   */
  getAnalysisDetails(analysisRunId: number): {
    analysis: {
      id: number;
      runId: number;
      analyzedAt: Date;
      healthScore: number;
      summary: string;
    };
    issues: Array<{
      id: number;
      severity: string;
      category: string;
      description: string;
      evidence: string[];
    }>;
    recommendations: Array<{
      id: number;
      title: string;
      configPath: string;
      currentValue: unknown;
      suggestedValue: unknown;
      rationale: string;
      expectedImpact: string;
      confidence: number;
      status: string;
      appliedAt: Date | null;
    }>;
  } | null {
    // Get main analysis
    const analysisStmt = this.db.prepare(`
      SELECT id, run_id, analyzed_at, health_score, summary
      FROM analysis_runs WHERE id = ?
    `);
    const analysisRow = analysisStmt.get(analysisRunId) as {
      id: number;
      run_id: number;
      analyzed_at: string;
      health_score: number;
      summary: string;
    } | undefined;

    if (!analysisRow) return null;

    // Get issues
    const issuesStmt = this.db.prepare(`
      SELECT id, severity, category, description, evidence
      FROM analysis_findings WHERE analysis_run_id = ?
    `);
    const issueRows = issuesStmt.all(analysisRunId) as Array<{
      id: number;
      severity: string;
      category: string;
      description: string;
      evidence: string;
    }>;

    // Get recommendations
    const recsStmt = this.db.prepare(`
      SELECT id, title, config_path, current_value, suggested_value,
             rationale, expected_impact, confidence, status, applied_at
      FROM analysis_recommendations WHERE analysis_run_id = ?
    `);
    const recRows = recsStmt.all(analysisRunId) as Array<{
      id: number;
      title: string;
      config_path: string;
      current_value: string;
      suggested_value: string;
      rationale: string;
      expected_impact: string;
      confidence: number;
      status: string;
      applied_at: string | null;
    }>;

    return {
      analysis: {
        id: analysisRow.id,
        runId: analysisRow.run_id,
        analyzedAt: new Date(analysisRow.analyzed_at),
        healthScore: analysisRow.health_score,
        summary: analysisRow.summary,
      },
      issues: issueRows.map((row) => ({
        id: row.id,
        severity: row.severity,
        category: row.category,
        description: row.description,
        evidence: JSON.parse(row.evidence),
      })),
      recommendations: recRows.map((row) => ({
        id: row.id,
        title: row.title,
        configPath: row.config_path,
        currentValue: JSON.parse(row.current_value),
        suggestedValue: JSON.parse(row.suggested_value),
        rationale: row.rationale,
        expectedImpact: row.expected_impact,
        confidence: row.confidence,
        status: row.status,
        appliedAt: row.applied_at ? new Date(row.applied_at) : null,
      })),
    };
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }

  /**
   * Get the underlying database instance (for advanced queries)
   */
  getDatabase(): Database.Database {
    return this.db;
  }

  /**
   * Vacuum the database to reclaim space
   */
  vacuum(): void {
    this.db.exec('VACUUM');
  }

  /**
   * Get database statistics
   */
  getStats(): {
    totalRuns: number;
    totalSnapshots: number;
    totalTrades: number;
    totalLLMCalls: number;
    totalEvents: number;
    dbSizeBytes: number;
  } {
    const runs = this.db.prepare('SELECT COUNT(*) as count FROM runs').get() as { count: number };
    const snapshots = this.db.prepare('SELECT COUNT(*) as count FROM snapshots').get() as { count: number };
    const trades = this.db.prepare('SELECT COUNT(*) as count FROM trades').get() as { count: number };
    const llmCalls = this.db.prepare('SELECT COUNT(*) as count FROM llm_calls').get() as { count: number };
    const events = this.db.prepare('SELECT COUNT(*) as count FROM events').get() as { count: number };
    const pageCountResult = this.db.pragma('page_count') as Array<{ page_count: number }>;
    const pageSizeResult = this.db.pragma('page_size') as Array<{ page_size: number }>;
    const pageCount = pageCountResult[0]?.page_count ?? 0;
    const pageSize = pageSizeResult[0]?.page_size ?? 4096;

    return {
      totalRuns: runs.count,
      totalSnapshots: snapshots.count,
      totalTrades: trades.count,
      totalLLMCalls: llmCalls.count,
      totalEvents: events.count,
      dbSizeBytes: pageCount * pageSize,
    };
  }
}

/**
 * Create a simulation database instance
 * Returns null if database creation fails (allows simulation to run without DB)
 */
export function createDatabase(
  dbPath: string = 'simulation.db',
  snapshotInterval: number = 10
): SimulationDatabase | null {
  try {
    return new SimulationDatabase(dbPath, snapshotInterval);
  } catch (error) {
    console.warn('[Database] Failed to create database:', error);
    return null;
  }
}
