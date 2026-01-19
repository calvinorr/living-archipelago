/**
 * Analytics Queries for Simulation Data
 * Provides insights into trade performance, ecosystem health, and LLM usage
 */

import type { SimulationDatabase } from './database.js';
import type { IslandId, GoodId } from '../core/types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Trade statistics for a run
 */
export interface TradeStats {
  totalTrades: number;
  totalVolume: number; // Absolute quantity traded
  totalValue: number; // Total value of trades
  buyVolume: number;
  sellVolume: number;
  avgTradeSize: number;
  avgPrice: number;
  tradesByGood: Map<GoodId, {
    count: number;
    volume: number;
    avgPrice: number;
  }>;
  tradesByIsland: Map<IslandId, {
    count: number;
    buyCount: number;
    sellCount: number;
  }>;
  profitability: {
    estimatedProfit: number;
    profitableTradeCount: number;
    totalTradeCount: number;
  };
}

/**
 * Price history point
 */
export interface PricePoint {
  tick: number;
  gameDay: number;
  gameHour: number;
  price: number;
  inventory: number;
}

/**
 * Ecosystem health snapshot
 */
export interface EcosystemSnapshot {
  tick: number;
  gameDay: number;
  gameHour: number;
  islands: Map<IslandId, {
    population: number;
    health: number;
    fishStock: number;
    forestBiomass: number;
    soil: number;
  }>;
}

/**
 * LLM usage statistics
 */
export interface LLMUsageStats {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  avgLatencyMs: number;
  callsByModel: Map<string, {
    count: number;
    tokens: number;
    costUsd: number;
  }>;
  tokensOverTime: Array<{
    tick: number;
    inputTokens: number;
    outputTokens: number;
    cumulativeTokens: number;
  }>;
}

// ============================================================================
// Analytics Functions
// ============================================================================

/**
 * Get trade statistics for a run
 * @param db SimulationDatabase instance
 * @param runId Run ID to analyze
 */
export function getTradeStats(db: SimulationDatabase, runId: number): TradeStats {
  const dbInstance = db.getDatabase();

  // Basic trade statistics
  const basicStats = dbInstance.prepare(`
    SELECT
      COUNT(*) as total_trades,
      SUM(ABS(quantity)) as total_volume,
      SUM(ABS(quantity) * price) as total_value,
      SUM(CASE WHEN quantity > 0 THEN ABS(quantity) ELSE 0 END) as buy_volume,
      SUM(CASE WHEN quantity < 0 THEN ABS(quantity) ELSE 0 END) as sell_volume,
      AVG(ABS(quantity)) as avg_trade_size,
      AVG(price) as avg_price
    FROM trades
    WHERE run_id = ?
  `).get(runId) as {
    total_trades: number;
    total_volume: number;
    total_value: number;
    buy_volume: number;
    sell_volume: number;
    avg_trade_size: number;
    avg_price: number;
  };

  // Trades by good
  const tradesByGoodRows = dbInstance.prepare(`
    SELECT
      good_id,
      COUNT(*) as count,
      SUM(ABS(quantity)) as volume,
      AVG(price) as avg_price
    FROM trades
    WHERE run_id = ?
    GROUP BY good_id
  `).all(runId) as Array<{
    good_id: string;
    count: number;
    volume: number;
    avg_price: number;
  }>;

  const tradesByGood = new Map<GoodId, { count: number; volume: number; avgPrice: number }>();
  for (const row of tradesByGoodRows) {
    tradesByGood.set(row.good_id, {
      count: row.count,
      volume: row.volume,
      avgPrice: row.avg_price,
    });
  }

  // Trades by island
  const tradesByIslandRows = dbInstance.prepare(`
    SELECT
      island_id,
      COUNT(*) as count,
      SUM(CASE WHEN quantity > 0 THEN 1 ELSE 0 END) as buy_count,
      SUM(CASE WHEN quantity < 0 THEN 1 ELSE 0 END) as sell_count
    FROM trades
    WHERE run_id = ?
    GROUP BY island_id
  `).all(runId) as Array<{
    island_id: string;
    count: number;
    buy_count: number;
    sell_count: number;
  }>;

  const tradesByIsland = new Map<IslandId, { count: number; buyCount: number; sellCount: number }>();
  for (const row of tradesByIslandRows) {
    tradesByIsland.set(row.island_id, {
      count: row.count,
      buyCount: row.buy_count,
      sellCount: row.sell_count,
    });
  }

  // Estimate profitability by matching buys and sells of same good
  // This is a simplified calculation - real profit depends on transport costs
  const profitabilityData = dbInstance.prepare(`
    WITH buy_sells AS (
      SELECT
        good_id,
        SUM(CASE WHEN quantity > 0 THEN ABS(quantity) * price ELSE 0 END) as buy_cost,
        SUM(CASE WHEN quantity < 0 THEN ABS(quantity) * price ELSE 0 END) as sell_revenue
      FROM trades
      WHERE run_id = ?
      GROUP BY good_id
    )
    SELECT
      SUM(sell_revenue - buy_cost) as estimated_profit
    FROM buy_sells
    WHERE sell_revenue > 0 AND buy_cost > 0
  `).get(runId) as { estimated_profit: number | null };

  const profitableTradeCount = dbInstance.prepare(`
    SELECT COUNT(DISTINCT good_id) as count
    FROM (
      SELECT
        good_id,
        SUM(CASE WHEN quantity > 0 THEN ABS(quantity) * price ELSE 0 END) as buy_cost,
        SUM(CASE WHEN quantity < 0 THEN ABS(quantity) * price ELSE 0 END) as sell_revenue
      FROM trades
      WHERE run_id = ?
      GROUP BY good_id
      HAVING sell_revenue > buy_cost
    )
  `).get(runId) as { count: number };

  return {
    totalTrades: basicStats.total_trades ?? 0,
    totalVolume: basicStats.total_volume ?? 0,
    totalValue: basicStats.total_value ?? 0,
    buyVolume: basicStats.buy_volume ?? 0,
    sellVolume: basicStats.sell_volume ?? 0,
    avgTradeSize: basicStats.avg_trade_size ?? 0,
    avgPrice: basicStats.avg_price ?? 0,
    tradesByGood,
    tradesByIsland,
    profitability: {
      estimatedProfit: profitabilityData.estimated_profit ?? 0,
      profitableTradeCount: profitableTradeCount.count ?? 0,
      totalTradeCount: tradesByGood.size,
    },
  };
}

/**
 * Get price history for a specific good at a specific island
 * @param db SimulationDatabase instance
 * @param runId Run ID to query
 * @param islandId Island ID
 * @param goodId Good ID
 */
export function getPriceHistory(
  db: SimulationDatabase,
  runId: number,
  islandId: IslandId,
  goodId: GoodId
): PricePoint[] {
  const dbInstance = db.getDatabase();

  const rows = dbInstance.prepare(`
    SELECT
      s.tick,
      s.game_day,
      s.game_hour,
      p.price,
      p.inventory
    FROM prices p
    JOIN snapshots s ON p.snapshot_id = s.id
    WHERE s.run_id = ? AND p.island_id = ? AND p.good_id = ?
    ORDER BY s.tick ASC
  `).all(runId, islandId, goodId) as Array<{
    tick: number;
    game_day: number;
    game_hour: number;
    price: number;
    inventory: number;
  }>;

  return rows.map((row) => ({
    tick: row.tick,
    gameDay: row.game_day,
    gameHour: row.game_hour,
    price: row.price,
    inventory: row.inventory,
  }));
}

/**
 * Get all prices for a run (all islands, all goods)
 */
export function getAllPriceHistory(
  db: SimulationDatabase,
  runId: number
): Map<IslandId, Map<GoodId, PricePoint[]>> {
  const dbInstance = db.getDatabase();

  const rows = dbInstance.prepare(`
    SELECT
      p.island_id,
      p.good_id,
      s.tick,
      s.game_day,
      s.game_hour,
      p.price,
      p.inventory
    FROM prices p
    JOIN snapshots s ON p.snapshot_id = s.id
    WHERE s.run_id = ?
    ORDER BY p.island_id, p.good_id, s.tick ASC
  `).all(runId) as Array<{
    island_id: string;
    good_id: string;
    tick: number;
    game_day: number;
    game_hour: number;
    price: number;
    inventory: number;
  }>;

  const result = new Map<IslandId, Map<GoodId, PricePoint[]>>();

  for (const row of rows) {
    if (!result.has(row.island_id)) {
      result.set(row.island_id, new Map());
    }
    const islandPrices = result.get(row.island_id)!;

    if (!islandPrices.has(row.good_id)) {
      islandPrices.set(row.good_id, []);
    }
    islandPrices.get(row.good_id)!.push({
      tick: row.tick,
      gameDay: row.game_day,
      gameHour: row.game_hour,
      price: row.price,
      inventory: row.inventory,
    });
  }

  return result;
}

/**
 * Get ecosystem health over time
 * @param db SimulationDatabase instance
 * @param runId Run ID to query
 */
export function getEcosystemHealth(db: SimulationDatabase, runId: number): EcosystemSnapshot[] {
  const dbInstance = db.getDatabase();

  const rows = dbInstance.prepare(`
    SELECT
      s.tick,
      s.game_day,
      s.game_hour,
      im.island_id,
      im.population,
      im.health,
      im.fish_stock,
      im.forest_biomass,
      im.soil
    FROM island_metrics im
    JOIN snapshots s ON im.snapshot_id = s.id
    WHERE s.run_id = ?
    ORDER BY s.tick ASC, im.island_id ASC
  `).all(runId) as Array<{
    tick: number;
    game_day: number;
    game_hour: number;
    island_id: string;
    population: number;
    health: number;
    fish_stock: number;
    forest_biomass: number;
    soil: number;
  }>;

  // Group by tick
  const snapshotsByTick = new Map<number, EcosystemSnapshot>();

  for (const row of rows) {
    if (!snapshotsByTick.has(row.tick)) {
      snapshotsByTick.set(row.tick, {
        tick: row.tick,
        gameDay: row.game_day,
        gameHour: row.game_hour,
        islands: new Map(),
      });
    }

    const snapshot = snapshotsByTick.get(row.tick)!;
    snapshot.islands.set(row.island_id, {
      population: row.population,
      health: row.health,
      fishStock: row.fish_stock,
      forestBiomass: row.forest_biomass,
      soil: row.soil,
    });
  }

  return Array.from(snapshotsByTick.values()).sort((a, b) => a.tick - b.tick);
}

/**
 * Get LLM usage statistics
 * @param db SimulationDatabase instance
 * @param runId Run ID to query
 */
export function getLLMUsage(db: SimulationDatabase, runId: number): LLMUsageStats {
  const dbInstance = db.getDatabase();

  // Overall statistics
  const overallStats = dbInstance.prepare(`
    SELECT
      COUNT(*) as total_calls,
      COALESCE(SUM(input_tokens), 0) as total_input_tokens,
      COALESCE(SUM(output_tokens), 0) as total_output_tokens,
      COALESCE(SUM(input_tokens + output_tokens), 0) as total_tokens,
      COALESCE(SUM(estimated_cost_usd), 0) as total_cost_usd,
      COALESCE(AVG(latency_ms), 0) as avg_latency_ms
    FROM llm_calls
    WHERE run_id = ?
  `).get(runId) as {
    total_calls: number;
    total_input_tokens: number;
    total_output_tokens: number;
    total_tokens: number;
    total_cost_usd: number;
    avg_latency_ms: number;
  };

  // By model
  const byModelRows = dbInstance.prepare(`
    SELECT
      model,
      COUNT(*) as count,
      SUM(input_tokens + output_tokens) as tokens,
      SUM(estimated_cost_usd) as cost_usd
    FROM llm_calls
    WHERE run_id = ?
    GROUP BY model
  `).all(runId) as Array<{
    model: string;
    count: number;
    tokens: number;
    cost_usd: number;
  }>;

  const callsByModel = new Map<string, { count: number; tokens: number; costUsd: number }>();
  for (const row of byModelRows) {
    callsByModel.set(row.model, {
      count: row.count,
      tokens: row.tokens ?? 0,
      costUsd: row.cost_usd ?? 0,
    });
  }

  // Tokens over time
  const tokensOverTimeRows = dbInstance.prepare(`
    SELECT
      tick,
      input_tokens,
      output_tokens,
      SUM(input_tokens + output_tokens) OVER (ORDER BY tick) as cumulative_tokens
    FROM llm_calls
    WHERE run_id = ?
    ORDER BY tick ASC
  `).all(runId) as Array<{
    tick: number;
    input_tokens: number;
    output_tokens: number;
    cumulative_tokens: number;
  }>;

  const tokensOverTime = tokensOverTimeRows.map((row) => ({
    tick: row.tick,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    cumulativeTokens: row.cumulative_tokens,
  }));

  return {
    totalCalls: overallStats.total_calls ?? 0,
    totalInputTokens: overallStats.total_input_tokens ?? 0,
    totalOutputTokens: overallStats.total_output_tokens ?? 0,
    totalTokens: overallStats.total_tokens ?? 0,
    totalCostUsd: overallStats.total_cost_usd ?? 0,
    avgLatencyMs: Math.round(overallStats.avg_latency_ms ?? 0),
    callsByModel,
    tokensOverTime,
  };
}

/**
 * Get event history for a run
 */
export function getEventHistory(
  db: SimulationDatabase,
  runId: number
): Array<{
  tick: number;
  eventType: string;
  targetId: string;
  startTick: number;
  endTick: number;
  data: Record<string, unknown>;
}> {
  const dbInstance = db.getDatabase();

  const rows = dbInstance.prepare(`
    SELECT tick, event_type, target_id, start_tick, end_tick, data
    FROM events
    WHERE run_id = ?
    ORDER BY tick ASC
  `).all(runId) as Array<{
    tick: number;
    event_type: string;
    target_id: string;
    start_tick: number;
    end_tick: number;
    data: string;
  }>;

  return rows.map((row) => ({
    tick: row.tick,
    eventType: row.event_type,
    targetId: row.target_id,
    startTick: row.start_tick,
    endTick: row.end_tick,
    data: JSON.parse(row.data),
  }));
}

/**
 * Get trade volume over time
 */
export function getTradeVolumeOverTime(
  db: SimulationDatabase,
  runId: number,
  bucketSize: number = 24 // Group by day (24 ticks)
): Array<{
  tickBucket: number;
  tradeCount: number;
  totalVolume: number;
  totalValue: number;
}> {
  const dbInstance = db.getDatabase();

  const rows = dbInstance.prepare(`
    SELECT
      (tick / ?) * ? as tick_bucket,
      COUNT(*) as trade_count,
      SUM(ABS(quantity)) as total_volume,
      SUM(ABS(quantity) * price) as total_value
    FROM trades
    WHERE run_id = ?
    GROUP BY tick_bucket
    ORDER BY tick_bucket ASC
  `).all(bucketSize, bucketSize, runId) as Array<{
    tick_bucket: number;
    trade_count: number;
    total_volume: number;
    total_value: number;
  }>;

  return rows.map((row) => ({
    tickBucket: row.tick_bucket,
    tradeCount: row.trade_count,
    totalVolume: row.total_volume ?? 0,
    totalValue: row.total_value ?? 0,
  }));
}

/**
 * Get price volatility for each good
 */
export function getPriceVolatility(
  db: SimulationDatabase,
  runId: number
): Map<GoodId, {
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  stdDev: number;
  volatility: number; // stdDev / avgPrice
}> {
  const dbInstance = db.getDatabase();

  const rows = dbInstance.prepare(`
    SELECT
      p.good_id,
      AVG(p.price) as avg_price,
      MIN(p.price) as min_price,
      MAX(p.price) as max_price,
      -- SQLite doesn't have STDDEV, so calculate manually
      SQRT(AVG(p.price * p.price) - AVG(p.price) * AVG(p.price)) as std_dev
    FROM prices p
    JOIN snapshots s ON p.snapshot_id = s.id
    WHERE s.run_id = ?
    GROUP BY p.good_id
  `).all(runId) as Array<{
    good_id: string;
    avg_price: number;
    min_price: number;
    max_price: number;
    std_dev: number;
  }>;

  const result = new Map<GoodId, {
    avgPrice: number;
    minPrice: number;
    maxPrice: number;
    stdDev: number;
    volatility: number;
  }>();

  for (const row of rows) {
    const avgPrice = row.avg_price ?? 0;
    const stdDev = row.std_dev ?? 0;
    result.set(row.good_id, {
      avgPrice,
      minPrice: row.min_price ?? 0,
      maxPrice: row.max_price ?? 0,
      stdDev,
      volatility: avgPrice > 0 ? stdDev / avgPrice : 0,
    });
  }

  return result;
}

/**
 * Get population trends
 */
export function getPopulationTrends(
  db: SimulationDatabase,
  runId: number
): Map<IslandId, Array<{
  tick: number;
  gameDay: number;
  population: number;
  health: number;
}>> {
  const dbInstance = db.getDatabase();

  const rows = dbInstance.prepare(`
    SELECT
      im.island_id,
      s.tick,
      s.game_day,
      im.population,
      im.health
    FROM island_metrics im
    JOIN snapshots s ON im.snapshot_id = s.id
    WHERE s.run_id = ?
    ORDER BY im.island_id, s.tick ASC
  `).all(runId) as Array<{
    island_id: string;
    tick: number;
    game_day: number;
    population: number;
    health: number;
  }>;

  const result = new Map<IslandId, Array<{
    tick: number;
    gameDay: number;
    population: number;
    health: number;
  }>>();

  for (const row of rows) {
    if (!result.has(row.island_id)) {
      result.set(row.island_id, []);
    }
    result.get(row.island_id)!.push({
      tick: row.tick,
      gameDay: row.game_day,
      population: row.population,
      health: row.health,
    });
  }

  return result;
}
