/**
 * Storage Module
 * SQLite database storage and analytics for simulation data
 */

export { SimulationDatabase, createDatabase } from './database.js';
export type { TradeRecord, RunInfo } from './database.js';

export {
  getTradeStats,
  getPriceHistory,
  getAllPriceHistory,
  getEcosystemHealth,
  getLLMUsage,
  getEventHistory,
  getTradeVolumeOverTime,
  getPriceVolatility,
  getPopulationTrends,
} from './analytics.js';

export type {
  TradeStats,
  PricePoint,
  EcosystemSnapshot,
  LLMUsageStats,
} from './analytics.js';
