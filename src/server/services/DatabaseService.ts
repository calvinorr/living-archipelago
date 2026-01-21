/**
 * Database Service
 * Handles database initialization, run management, and recording
 */

import { createDatabase, type SimulationDatabase } from '../../storage/index.js';
import type { TradeRecord } from '../../storage/index.js';
import type { WorldState, WorldEvent, SimulationConfig } from '../../core/types.js';
import type { LLMCallRecord } from '../../llm/metrics.js';
import { state, config } from '../state.js';

/**
 * Initialize the database if enabled
 */
export function initializeDatabase(): void {
  if (!config.DB_ENABLED) return;

  if (!state.database) {
    state.database = createDatabase(config.DB_PATH, config.DB_SNAPSHOT_INTERVAL);
    if (state.database) {
      console.log(`[DatabaseService] Initialized at ${config.DB_PATH} (snapshot every ${config.DB_SNAPSHOT_INTERVAL} ticks)`);
    }
  }
}

/**
 * Start a new simulation run in the database
 */
export function startRun(seed: number, simConfig: SimulationConfig): number | null {
  if (!state.database) return null;

  const runId = state.database.startRun(seed, simConfig);
  console.log(`[DatabaseService] Started run ${runId}`);
  return runId;
}

/**
 * End the current database run
 */
export function endRun(): void {
  if (!state.database) return;
  state.database.endRun();
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (!state.database) return;

  state.database.endRun();
  state.database.close();
  console.log('[DatabaseService] Closed');
}

/**
 * Record a world state snapshot
 */
export function recordSnapshot(tick: number, worldState: WorldState): void {
  if (!state.database) return;
  state.database.recordSnapshot(tick, worldState);
}

/**
 * Record events that started at the current tick
 */
export function recordEvents(tick: number, events: WorldEvent[]): void {
  if (!state.database) return;

  for (const event of events) {
    if (event.startTick === tick) {
      state.database.recordEvent(tick, event);
    }
  }
}

/**
 * Record a trade
 */
export function recordTrade(tick: number, trade: TradeRecord): void {
  if (!state.database) return;
  state.database.recordTrade(tick, trade);
}

/**
 * Record an LLM call
 */
export function recordLLMCall(tick: number, record: LLMCallRecord): void {
  if (!state.database) return;
  state.database.recordLLMCall(tick, record);
}

/**
 * Get the database instance (for direct access when needed)
 */
export function getDatabase(): SimulationDatabase | null {
  return state.database;
}
