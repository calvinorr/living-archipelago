/**
 * Advanced Analytics for Economic Analyst
 * Provides aggregated metrics for AI analysis
 */

import type { SimulationDatabase } from './database.js';
import type { SimulationConfig, IslandId, GoodId } from '../core/types.js';

// ============================================================================
// Types for Analyst
// ============================================================================

export interface RunSummary {
  runId: number;
  seed: number;
  startedAt: Date;
  endedAt: Date | null;
  duration: number; // ticks
  config: SimulationConfig;

  // Trade metrics
  totalTrades: number;
  profitableTradeRatio: number;
  totalTradeValue: number;

  // Price metrics
  avgPriceVolatility: Record<GoodId, number>;
  priceConvergence: number; // 0-1, higher = more convergent

  // Ecosystem metrics
  ecosystemHealthTrend: 'improving' | 'stable' | 'declining' | 'critical';
  avgFishStockRatio: number;
  avgForestRatio: number;

  // Population metrics
  populationTrend: 'growing' | 'stable' | 'declining' | 'critical';
  avgPopulationHealth: number;
  totalPopulationChange: number;

  // Agent metrics
  agentROI: number;

  // Detected anomalies
  anomalies: string[];
}

export interface EcosystemReport {
  islandId: IslandId;
  islandName: string;

  fishStock: {
    initial: number;
    final: number;
    min: number;
    max: number;
    trend: 'improving' | 'stable' | 'declining' | 'collapsed';
    capacityRatio: number;
  };

  forestBiomass: {
    initial: number;
    final: number;
    trend: 'improving' | 'stable' | 'declining' | 'collapsed';
    capacityRatio: number;
  };

  soilFertility: {
    initial: number;
    final: number;
    trend: 'improving' | 'stable' | 'declining';
  };

  sustainability: 'sustainable' | 'at_risk' | 'unsustainable';
}

export interface MarketEfficiencyMetrics {
  priceConvergenceByGood: Record<GoodId, number>;
  arbitrageOpportunities: number;
  avgPriceSpread: Record<GoodId, number>;
  tradeFriction: number; // Higher = more friction
}

export interface RouteAnalysis {
  fromIsland: IslandId;
  toIsland: IslandId;
  goodId: GoodId;
  tradeCount: number;
  avgMargin: number;
  totalVolume: number;
  profitable: boolean;
}

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Get comprehensive run summary for analyst
 */
export function getRunSummary(db: SimulationDatabase, runId: number): RunSummary | null {
  const dbInstance = db.getDatabase();

  // Get run info
  const run = dbInstance.prepare(`
    SELECT id, seed, started_at, ended_at, config
    FROM runs WHERE id = ?
  `).get(runId) as { id: number; seed: number; started_at: string; ended_at: string | null; config: string } | undefined;

  if (!run) return null;

  // Get tick range
  const tickRange = dbInstance.prepare(`
    SELECT MIN(tick) as min_tick, MAX(tick) as max_tick
    FROM snapshots WHERE run_id = ?
  `).get(runId) as { min_tick: number; max_tick: number };

  // Get trade stats
  const tradeStats = dbInstance.prepare(`
    SELECT
      COUNT(*) as total_trades,
      SUM(ABS(quantity) * price) as total_value
    FROM trades WHERE run_id = ?
  `).get(runId) as { total_trades: number; total_value: number };

  // Calculate profitable trade ratio
  const profitableRatio = dbInstance.prepare(`
    WITH buy_sell AS (
      SELECT good_id,
        SUM(CASE WHEN quantity > 0 THEN ABS(quantity) * price ELSE 0 END) as buy_cost,
        SUM(CASE WHEN quantity < 0 THEN ABS(quantity) * price ELSE 0 END) as sell_rev
      FROM trades WHERE run_id = ?
      GROUP BY good_id
    )
    SELECT
      CAST(SUM(CASE WHEN sell_rev > buy_cost THEN 1 ELSE 0 END) AS REAL) /
      CAST(COUNT(*) AS REAL) as ratio
    FROM buy_sell
    WHERE buy_cost > 0 AND sell_rev > 0
  `).get(runId) as { ratio: number | null };

  // Get price volatility by good
  const volatilityRows = dbInstance.prepare(`
    SELECT p.good_id,
      SQRT(AVG(p.price * p.price) - AVG(p.price) * AVG(p.price)) / AVG(p.price) as volatility
    FROM prices p
    JOIN snapshots s ON p.snapshot_id = s.id
    WHERE s.run_id = ?
    GROUP BY p.good_id
  `).all(runId) as Array<{ good_id: string; volatility: number }>;

  const avgPriceVolatility: Record<string, number> = {};
  for (const row of volatilityRows) {
    avgPriceVolatility[row.good_id] = row.volatility || 0;
  }

  // Calculate price convergence (lower variance across islands = higher convergence)
  const convergence = dbInstance.prepare(`
    WITH price_variance AS (
      SELECT s.tick, p.good_id,
        AVG(p.price) as avg_price,
        SQRT(AVG(p.price * p.price) - AVG(p.price) * AVG(p.price)) as std_dev
      FROM prices p
      JOIN snapshots s ON p.snapshot_id = s.id
      WHERE s.run_id = ?
      GROUP BY s.tick, p.good_id
    )
    SELECT AVG(CASE WHEN avg_price > 0 THEN 1 - (std_dev / avg_price) ELSE 1 END) as convergence
    FROM price_variance
  `).get(runId) as { convergence: number | null };

  // Get ecosystem health metrics
  const ecoMetrics = dbInstance.prepare(`
    WITH first_last AS (
      SELECT im.island_id,
        FIRST_VALUE(im.fish_stock) OVER (PARTITION BY im.island_id ORDER BY s.tick) as first_fish,
        LAST_VALUE(im.fish_stock) OVER (PARTITION BY im.island_id ORDER BY s.tick
          ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) as last_fish,
        AVG(im.fish_stock) as avg_fish,
        AVG(im.forest_biomass) as avg_forest
      FROM island_metrics im
      JOIN snapshots s ON im.snapshot_id = s.id
      WHERE s.run_id = ?
    )
    SELECT
      AVG(last_fish - first_fish) as fish_change,
      AVG(avg_fish) / 1000.0 as avg_fish_ratio,
      AVG(avg_forest) / 1000.0 as avg_forest_ratio
    FROM first_last
  `).get(runId) as { fish_change: number; avg_fish_ratio: number; avg_forest_ratio: number };

  // Get population metrics
  const popMetrics = dbInstance.prepare(`
    WITH first_last AS (
      SELECT im.island_id,
        FIRST_VALUE(im.population) OVER (PARTITION BY im.island_id ORDER BY s.tick) as first_pop,
        LAST_VALUE(im.population) OVER (PARTITION BY im.island_id ORDER BY s.tick
          ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) as last_pop,
        AVG(im.health) as avg_health
      FROM island_metrics im
      JOIN snapshots s ON im.snapshot_id = s.id
      WHERE s.run_id = ?
    )
    SELECT
      SUM(last_pop - first_pop) as total_pop_change,
      AVG(avg_health) as avg_health
    FROM first_last
  `).get(runId) as { total_pop_change: number; avg_health: number };

  // Determine trends
  const ecosystemTrend = determineEcosystemTrend(ecoMetrics.fish_change, ecoMetrics.avg_fish_ratio);
  const populationTrend = determinePopulationTrend(popMetrics.total_pop_change, popMetrics.avg_health);

  // Detect anomalies
  const anomalies = detectAnomalies({
    profitableRatio: profitableRatio?.ratio || 0,
    avgFishRatio: ecoMetrics.avg_fish_ratio,
    avgHealth: popMetrics.avg_health,
    totalPopChange: popMetrics.total_pop_change,
    priceVolatility: avgPriceVolatility,
  });

  return {
    runId: run.id,
    seed: run.seed,
    startedAt: new Date(run.started_at),
    endedAt: run.ended_at ? new Date(run.ended_at) : null,
    duration: (tickRange.max_tick || 0) - (tickRange.min_tick || 0),
    config: JSON.parse(run.config),
    totalTrades: tradeStats.total_trades || 0,
    profitableTradeRatio: profitableRatio?.ratio || 0,
    totalTradeValue: tradeStats.total_value || 0,
    avgPriceVolatility,
    priceConvergence: Math.max(0, Math.min(1, convergence?.convergence || 0)),
    ecosystemHealthTrend: ecosystemTrend,
    avgFishStockRatio: ecoMetrics.avg_fish_ratio || 0,
    avgForestRatio: ecoMetrics.avg_forest_ratio || 0,
    populationTrend,
    avgPopulationHealth: popMetrics.avg_health || 0,
    totalPopulationChange: popMetrics.total_pop_change || 0,
    agentROI: calculateAgentROI(db, runId),
    anomalies,
  };
}

/**
 * Get ecosystem report for each island
 */
export function getEcosystemReports(db: SimulationDatabase, runId: number): EcosystemReport[] {
  const dbInstance = db.getDatabase();

  const rows = dbInstance.prepare(`
    WITH island_data AS (
      SELECT
        im.island_id,
        FIRST_VALUE(im.fish_stock) OVER w as first_fish,
        LAST_VALUE(im.fish_stock) OVER w as last_fish,
        MIN(im.fish_stock) OVER w as min_fish,
        MAX(im.fish_stock) OVER w as max_fish,
        FIRST_VALUE(im.forest_biomass) OVER w as first_forest,
        LAST_VALUE(im.forest_biomass) OVER w as last_forest,
        FIRST_VALUE(im.soil) OVER w as first_soil,
        LAST_VALUE(im.soil) OVER w as last_soil
      FROM island_metrics im
      JOIN snapshots s ON im.snapshot_id = s.id
      WHERE s.run_id = ?
      WINDOW w AS (PARTITION BY im.island_id ORDER BY s.tick
        ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)
    )
    SELECT DISTINCT * FROM island_data
  `).all(runId) as Array<{
    island_id: string;
    first_fish: number;
    last_fish: number;
    min_fish: number;
    max_fish: number;
    first_forest: number;
    last_forest: number;
    first_soil: number;
    last_soil: number;
  }>;

  return rows.map(row => {
    const fishCapacity = 1000; // Default
    const forestCapacity = 1000;

    const fishTrend = determineTrend(row.first_fish, row.last_fish, fishCapacity);
    const forestTrend = determineTrend(row.first_forest, row.last_forest, forestCapacity);
    const soilTrend = determineTrend(row.first_soil, row.last_soil, 1);

    const sustainability = determineSustainability(
      row.last_fish / fishCapacity,
      row.last_forest / forestCapacity,
      row.last_soil
    );

    return {
      islandId: row.island_id,
      islandName: row.island_id, // Would need join to get actual name
      fishStock: {
        initial: row.first_fish,
        final: row.last_fish,
        min: row.min_fish,
        max: row.max_fish,
        trend: fishTrend,
        capacityRatio: row.last_fish / fishCapacity,
      },
      forestBiomass: {
        initial: row.first_forest,
        final: row.last_forest,
        trend: forestTrend,
        capacityRatio: row.last_forest / forestCapacity,
      },
      soilFertility: {
        initial: row.first_soil,
        final: row.last_soil,
        trend: soilTrend as 'improving' | 'stable' | 'declining',
      },
      sustainability,
    };
  });
}

/**
 * Get market efficiency metrics
 */
export function getMarketEfficiencyMetrics(db: SimulationDatabase, runId: number): MarketEfficiencyMetrics {
  const dbInstance = db.getDatabase();

  // Price convergence by good (how close prices are across islands)
  const convergenceRows = dbInstance.prepare(`
    SELECT p.good_id,
      AVG(CASE WHEN avg_price > 0 THEN 1 - (std_dev / avg_price) ELSE 1 END) as convergence
    FROM (
      SELECT s.tick, p.good_id,
        AVG(p.price) as avg_price,
        SQRT(AVG(p.price * p.price) - AVG(p.price) * AVG(p.price)) as std_dev
      FROM prices p
      JOIN snapshots s ON p.snapshot_id = s.id
      WHERE s.run_id = ?
      GROUP BY s.tick, p.good_id
    ) sub
    GROUP BY good_id
  `).all(runId) as Array<{ good_id: string; convergence: number }>;

  const priceConvergenceByGood: Record<string, number> = {};
  for (const row of convergenceRows) {
    priceConvergenceByGood[row.good_id] = Math.max(0, row.convergence || 0);
  }

  // Average price spread (max - min across islands)
  const spreadRows = dbInstance.prepare(`
    SELECT p.good_id,
      AVG(max_price - min_price) as avg_spread
    FROM (
      SELECT s.tick, p.good_id,
        MAX(p.price) as max_price,
        MIN(p.price) as min_price
      FROM prices p
      JOIN snapshots s ON p.snapshot_id = s.id
      WHERE s.run_id = ?
      GROUP BY s.tick, p.good_id
    ) sub
    GROUP BY good_id
  `).all(runId) as Array<{ good_id: string; avg_spread: number }>;

  const avgPriceSpread: Record<string, number> = {};
  for (const row of spreadRows) {
    avgPriceSpread[row.good_id] = row.avg_spread || 0;
  }

  // Count arbitrage opportunities (>10% price difference)
  const arbitrage = dbInstance.prepare(`
    SELECT COUNT(*) as count
    FROM (
      SELECT s.tick, p.good_id,
        (MAX(p.price) - MIN(p.price)) / MIN(p.price) as spread_ratio
      FROM prices p
      JOIN snapshots s ON p.snapshot_id = s.id
      WHERE s.run_id = ?
      GROUP BY s.tick, p.good_id
      HAVING spread_ratio > 0.1
    )
  `).get(runId) as { count: number };

  // Trade friction (inverse of trade frequency relative to price spreads)
  const tradeFriction = dbInstance.prepare(`
    SELECT
      CAST(COUNT(DISTINCT t.tick) AS REAL) / CAST(MAX(s.tick) - MIN(s.tick) AS REAL) as trade_freq
    FROM trades t
    JOIN snapshots s ON t.run_id = s.run_id
    WHERE t.run_id = ?
  `).get(runId) as { trade_freq: number };

  return {
    priceConvergenceByGood,
    arbitrageOpportunities: arbitrage.count || 0,
    avgPriceSpread,
    tradeFriction: 1 - Math.min(1, tradeFriction.trade_freq || 0),
  };
}

/**
 * Get trade route analysis
 */
export function getTradeRouteAnalysis(db: SimulationDatabase, runId: number): RouteAnalysis[] {
  const dbInstance = db.getDatabase();

  // This is a simplified analysis - assumes buy at one island, sell at another
  const rows = dbInstance.prepare(`
    WITH buys AS (
      SELECT tick, good_id, island_id, ABS(quantity) as qty, price
      FROM trades
      WHERE run_id = ? AND quantity > 0
    ),
    sells AS (
      SELECT tick, good_id, island_id, ABS(quantity) as qty, price
      FROM trades
      WHERE run_id = ? AND quantity < 0
    )
    SELECT
      b.island_id as from_island,
      s.island_id as to_island,
      b.good_id,
      COUNT(*) as trade_count,
      AVG((s.price - b.price) / b.price) as avg_margin,
      SUM(b.qty) as total_volume
    FROM buys b
    JOIN sells s ON b.good_id = s.good_id
      AND s.tick > b.tick
      AND s.tick <= b.tick + 48
      AND s.island_id != b.island_id
    GROUP BY b.island_id, s.island_id, b.good_id
    ORDER BY avg_margin DESC
  `).all(runId, runId) as Array<{
    from_island: string;
    to_island: string;
    good_id: string;
    trade_count: number;
    avg_margin: number;
    total_volume: number;
  }>;

  return rows.map(row => ({
    fromIsland: row.from_island,
    toIsland: row.to_island,
    goodId: row.good_id,
    tradeCount: row.trade_count,
    avgMargin: row.avg_margin || 0,
    totalVolume: row.total_volume || 0,
    profitable: (row.avg_margin || 0) > 0.05,
  }));
}

// ============================================================================
// Helper Functions
// ============================================================================

function determineEcosystemTrend(
  fishChange: number,
  avgFishRatio: number
): 'improving' | 'stable' | 'declining' | 'critical' {
  if (avgFishRatio < 0.1) return 'critical';
  if (fishChange > 50) return 'improving';
  if (fishChange < -50) return 'declining';
  return 'stable';
}

function determinePopulationTrend(
  popChange: number,
  avgHealth: number
): 'growing' | 'stable' | 'declining' | 'critical' {
  if (avgHealth < 0.3) return 'critical';
  if (popChange > 100) return 'growing';
  if (popChange < -100) return 'declining';
  return 'stable';
}

function determineTrend(
  initial: number,
  final: number,
  capacity: number
): 'improving' | 'stable' | 'declining' | 'collapsed' {
  const ratio = final / capacity;
  if (ratio < 0.1) return 'collapsed';
  const change = (final - initial) / Math.max(initial, 1);
  if (change > 0.1) return 'improving';
  if (change < -0.1) return 'declining';
  return 'stable';
}

function determineSustainability(
  fishRatio: number,
  forestRatio: number,
  soilRatio: number
): 'sustainable' | 'at_risk' | 'unsustainable' {
  const avgRatio = (fishRatio + forestRatio + soilRatio) / 3;
  if (avgRatio < 0.2) return 'unsustainable';
  if (avgRatio < 0.5) return 'at_risk';
  return 'sustainable';
}

function detectAnomalies(metrics: {
  profitableRatio: number;
  avgFishRatio: number;
  avgHealth: number;
  totalPopChange: number;
  priceVolatility: Record<string, number>;
}): string[] {
  const anomalies: string[] = [];

  if (metrics.profitableRatio < 0.3) {
    anomalies.push('Low trade profitability (<30% of goods profitable)');
  }
  if (metrics.avgFishRatio < 0.2) {
    anomalies.push('Fish stocks critically low across islands');
  }
  if (metrics.avgHealth < 0.4) {
    anomalies.push('Population health dangerously low');
  }
  if (metrics.totalPopChange > 500) {
    anomalies.push('Population growth unusually fast (may be unrealistic)');
  }

  // Check for extreme price volatility
  for (const [good, vol] of Object.entries(metrics.priceVolatility)) {
    if (vol > 0.5) {
      anomalies.push(`Extreme price volatility for ${good} (${(vol * 100).toFixed(0)}%)`);
    }
  }

  return anomalies;
}

function calculateAgentROI(db: SimulationDatabase, runId: number): number {
  const dbInstance = db.getDatabase();

  // Simplified: compare total sell revenue to total buy cost
  const roi = dbInstance.prepare(`
    SELECT
      SUM(CASE WHEN quantity < 0 THEN ABS(quantity) * price ELSE 0 END) as revenue,
      SUM(CASE WHEN quantity > 0 THEN ABS(quantity) * price ELSE 0 END) as cost
    FROM trades
    WHERE run_id = ?
  `).get(runId) as { revenue: number; cost: number };

  if (!roi.cost || roi.cost === 0) return 0;
  return (roi.revenue - roi.cost) / roi.cost;
}
