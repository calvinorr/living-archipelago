/**
 * Economic Model Analysis Script
 * Analyzes simulation data to identify areas for improvement
 */

import { createDatabase } from '../src/storage/database.js';
import {
  getTradeStats,
  getPriceVolatility,
  getPopulationTrends,
  getEcosystemHealth,
  getAllPriceHistory,
  getTradeVolumeOverTime,
} from '../src/storage/analytics.js';
import type { GoodId, IslandId } from '../src/core/types.js';

const DB_PATH = process.env.DB_PATH || 'simulation.db';

// ANSI colors for output
const BOLD = '\x1b[1m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

function formatNumber(n: number, decimals = 2): string {
  return n.toFixed(decimals);
}

function formatPercent(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function printHeader(title: string): void {
  console.log(`\n${BOLD}${BLUE}${'='.repeat(60)}${RESET}`);
  console.log(`${BOLD}${BLUE}${title}${RESET}`);
  console.log(`${BOLD}${BLUE}${'='.repeat(60)}${RESET}\n`);
}

function printSubHeader(title: string): void {
  console.log(`\n${BOLD}${CYAN}--- ${title} ---${RESET}\n`);
}

function printMetric(label: string, value: string | number, status?: 'good' | 'warn' | 'bad'): void {
  const color = status === 'good' ? GREEN : status === 'warn' ? YELLOW : status === 'bad' ? RED : '';
  console.log(`  ${label}: ${color}${value}${RESET}`);
}

async function main() {
  console.log(`${BOLD}Economic Model Analysis${RESET}`);
  console.log(`Database: ${DB_PATH}\n`);

  const db = createDatabase(DB_PATH, 10);
  if (!db) {
    console.error('Failed to open database');
    process.exit(1);
  }

  // Get latest run
  const dbInstance = db.getDatabase();
  const latestRun = dbInstance.prepare('SELECT id, seed, started_at FROM runs ORDER BY id DESC LIMIT 1').get() as {
    id: number;
    seed: number;
    started_at: string;
  };

  if (!latestRun) {
    console.error('No runs found in database');
    process.exit(1);
  }

  console.log(`Analyzing Run #${latestRun.id} (seed: ${latestRun.seed})`);
  console.log(`Started: ${latestRun.started_at}\n`);

  const runId = latestRun.id;

  // =========================================================================
  // 1. Trade Analysis
  // =========================================================================
  printHeader('1. TRADE ANALYSIS');

  const tradeStats = getTradeStats(db, runId);

  printSubHeader('Overall Statistics');
  printMetric('Total Trades', tradeStats.totalTrades);
  printMetric('Total Volume', formatNumber(tradeStats.totalVolume, 0));
  printMetric('Total Value', `$${formatNumber(tradeStats.totalValue, 0)}`);
  printMetric('Average Trade Size', formatNumber(tradeStats.avgTradeSize));
  printMetric('Average Price', `$${formatNumber(tradeStats.avgPrice)}`);
  printMetric('Buy Volume', formatNumber(tradeStats.buyVolume, 0));
  printMetric('Sell Volume', formatNumber(tradeStats.sellVolume, 0));

  const buySellRatio = tradeStats.buyVolume / (tradeStats.sellVolume || 1);
  printMetric('Buy/Sell Ratio', formatNumber(buySellRatio),
    buySellRatio > 0.8 && buySellRatio < 1.2 ? 'good' : 'warn');

  printSubHeader('Trades by Good');
  for (const [goodId, stats] of tradeStats.tradesByGood) {
    console.log(`  ${BOLD}${goodId}${RESET}: ${stats.count} trades, vol=${formatNumber(stats.volume, 0)}, avg=$${formatNumber(stats.avgPrice)}`);
  }

  printSubHeader('Trades by Island');
  for (const [islandId, stats] of tradeStats.tradesByIsland) {
    const buyPct = stats.buyCount / stats.count;
    console.log(`  ${BOLD}${islandId}${RESET}: ${stats.count} trades (${formatPercent(buyPct)} buys, ${formatPercent(1 - buyPct)} sells)`);
  }

  printSubHeader('Profitability');
  printMetric('Estimated Profit', `$${formatNumber(tradeStats.profitability.estimatedProfit)}`,
    tradeStats.profitability.estimatedProfit > 0 ? 'good' : 'bad');
  printMetric('Profitable Goods', `${tradeStats.profitability.profitableTradeCount}/${tradeStats.profitability.totalTradeCount}`);

  // =========================================================================
  // 2. Price Volatility Analysis
  // =========================================================================
  printHeader('2. PRICE VOLATILITY ANALYSIS');

  const volatility = getPriceVolatility(db, runId);

  console.log(`  ${BOLD}Good${RESET.padEnd(15)} Avg Price   Min      Max      StdDev   Volatility`);
  console.log('  ' + '-'.repeat(70));

  for (const [goodId, stats] of volatility) {
    const volStatus = stats.volatility > 0.5 ? 'bad' : stats.volatility > 0.3 ? 'warn' : 'good';
    const volColor = volStatus === 'good' ? GREEN : volStatus === 'warn' ? YELLOW : RED;
    console.log(
      `  ${goodId.padEnd(12)} $${formatNumber(stats.avgPrice).padStart(8)} $${formatNumber(stats.minPrice).padStart(6)} $${formatNumber(stats.maxPrice).padStart(6)} $${formatNumber(stats.stdDev).padStart(6)} ${volColor}${formatPercent(stats.volatility).padStart(8)}${RESET}`
    );
  }

  // Identify problematic goods (high volatility)
  const highVolGoods = Array.from(volatility.entries()).filter(([, s]) => s.volatility > 0.4);
  if (highVolGoods.length > 0) {
    printSubHeader('High Volatility Goods (>40%)');
    for (const [goodId, stats] of highVolGoods) {
      console.log(`  ${RED}${goodId}${RESET}: ${formatPercent(stats.volatility)} volatility`);
      console.log(`    Price range: $${formatNumber(stats.minPrice)} - $${formatNumber(stats.maxPrice)} (${formatNumber(stats.maxPrice / stats.minPrice)}x)`);
    }
  }

  // =========================================================================
  // 3. Population & Health Analysis
  // =========================================================================
  printHeader('3. POPULATION & HEALTH ANALYSIS');

  const popTrends = getPopulationTrends(db, runId);

  for (const [islandId, data] of popTrends) {
    if (data.length === 0) continue;

    const first = data[0];
    const last = data[data.length - 1];
    const popChange = (last.population - first.population) / first.population;
    const avgHealth = data.reduce((sum, d) => sum + d.health, 0) / data.length;
    const minHealth = Math.min(...data.map(d => d.health));

    printSubHeader(islandId);
    printMetric('Initial Population', formatNumber(first.population, 0));
    printMetric('Final Population', formatNumber(last.population, 0));
    printMetric('Population Change', formatPercent(popChange),
      popChange > 0 ? 'good' : popChange > -0.1 ? 'warn' : 'bad');
    printMetric('Average Health', formatPercent(avgHealth),
      avgHealth > 0.7 ? 'good' : avgHealth > 0.5 ? 'warn' : 'bad');
    printMetric('Minimum Health', formatPercent(minHealth),
      minHealth > 0.5 ? 'good' : minHealth > 0.3 ? 'warn' : 'bad');
  }

  // =========================================================================
  // 4. Ecosystem Analysis
  // =========================================================================
  printHeader('4. ECOSYSTEM ANALYSIS');

  const ecoHealth = getEcosystemHealth(db, runId);

  if (ecoHealth.length > 0) {
    const firstSnapshot = ecoHealth[0];
    const lastSnapshot = ecoHealth[ecoHealth.length - 1];

    for (const [islandId, finalData] of lastSnapshot.islands) {
      const initialData = firstSnapshot.islands.get(islandId);
      if (!initialData) continue;

      printSubHeader(islandId);

      const fishChange = (finalData.fishStock - initialData.fishStock) / initialData.fishStock;
      const forestChange = (finalData.forestBiomass - initialData.forestBiomass) / initialData.forestBiomass;
      const soilChange = (finalData.soil - initialData.soil) / initialData.soil;

      printMetric('Fish Stock Change', formatPercent(fishChange),
        fishChange > -0.1 ? 'good' : fishChange > -0.3 ? 'warn' : 'bad');
      printMetric('Forest Biomass Change', formatPercent(forestChange),
        forestChange > -0.1 ? 'good' : forestChange > -0.3 ? 'warn' : 'bad');
      printMetric('Soil Quality Change', formatPercent(soilChange),
        soilChange > -0.1 ? 'good' : soilChange > -0.3 ? 'warn' : 'bad');
    }
  }

  // =========================================================================
  // 5. Trade Activity Over Time
  // =========================================================================
  printHeader('5. TRADE ACTIVITY OVER TIME');

  const tradeVolume = getTradeVolumeOverTime(db, runId, 24); // Daily buckets

  if (tradeVolume.length > 0) {
    const avgDaily = tradeVolume.reduce((sum, d) => sum + d.tradeCount, 0) / tradeVolume.length;
    const maxDaily = Math.max(...tradeVolume.map(d => d.tradeCount));
    const minDaily = Math.min(...tradeVolume.map(d => d.tradeCount));

    printMetric('Average Trades/Day', formatNumber(avgDaily));
    printMetric('Max Trades/Day', maxDaily.toString());
    printMetric('Min Trades/Day', minDaily.toString());

    // Check for trade activity decline
    const firstHalf = tradeVolume.slice(0, Math.floor(tradeVolume.length / 2));
    const secondHalf = tradeVolume.slice(Math.floor(tradeVolume.length / 2));

    const firstHalfAvg = firstHalf.reduce((sum, d) => sum + d.tradeCount, 0) / firstHalf.length;
    const secondHalfAvg = secondHalf.reduce((sum, d) => sum + d.tradeCount, 0) / secondHalf.length;
    const activityChange = (secondHalfAvg - firstHalfAvg) / firstHalfAvg;

    printMetric('Activity Trend', formatPercent(activityChange),
      activityChange > -0.2 ? 'good' : activityChange > -0.5 ? 'warn' : 'bad');
  }

  // =========================================================================
  // 6. Price Spread Analysis (Arbitrage Opportunities)
  // =========================================================================
  printHeader('6. PRICE SPREAD ANALYSIS');

  const allPrices = getAllPriceHistory(db, runId);

  // Calculate average price spreads between islands for each good
  const goods = ['Fish', 'Grain', 'Timber', 'Tools', 'Luxuries'] as GoodId[];
  const islands = Array.from(allPrices.keys());

  for (const good of goods) {
    const islandPrices: Map<IslandId, number[]> = new Map();

    for (const [islandId, goodPrices] of allPrices) {
      const prices = goodPrices.get(good);
      if (prices) {
        islandPrices.set(islandId, prices.map(p => p.price));
      }
    }

    if (islandPrices.size < 2) continue;

    // Calculate average prices per island
    const avgPrices: Map<IslandId, number> = new Map();
    for (const [islandId, prices] of islandPrices) {
      avgPrices.set(islandId, prices.reduce((a, b) => a + b, 0) / prices.length);
    }

    // Find max spread
    const priceValues = Array.from(avgPrices.values());
    const minPrice = Math.min(...priceValues);
    const maxPrice = Math.max(...priceValues);
    const spread = (maxPrice - minPrice) / minPrice;

    const spreadStatus = spread > 0.3 ? 'good' : spread > 0.1 ? 'warn' : 'bad';
    console.log(`  ${BOLD}${good}${RESET}: spread=${spreadStatus === 'good' ? GREEN : spreadStatus === 'warn' ? YELLOW : RED}${formatPercent(spread)}${RESET} (low=$${formatNumber(minPrice)}, high=$${formatNumber(maxPrice)})`);
  }

  // =========================================================================
  // 7. Economic Model Issues & Recommendations
  // =========================================================================
  printHeader('7. ECONOMIC MODEL ASSESSMENT');

  const issues: string[] = [];
  const recommendations: string[] = [];

  // Check for issues
  if (tradeStats.totalTrades < 100) {
    issues.push('Low trade activity - agents may not be finding profitable opportunities');
    recommendations.push('Review agent decision thresholds and arbitrage detection sensitivity');
  }

  if (buySellRatio < 0.5 || buySellRatio > 2) {
    issues.push(`Imbalanced buy/sell ratio (${formatNumber(buySellRatio)}) - possible market inefficiency`);
    recommendations.push('Check if agents are holding too much inventory or not selling enough');
  }

  const highVolCount = Array.from(volatility.values()).filter(v => v.volatility > 0.5).length;
  if (highVolCount > 2) {
    issues.push(`${highVolCount} goods have >50% price volatility - prices too unstable`);
    recommendations.push('Consider increasing price smoothing (lambda) or reducing pressure exponent (gamma)');
  }

  const lowVolCount = Array.from(volatility.values()).filter(v => v.volatility < 0.1).length;
  if (lowVolCount > 2) {
    issues.push(`${lowVolCount} goods have <10% price volatility - prices too static`);
    recommendations.push('Consider reducing price smoothing or increasing event frequency');
  }

  for (const [islandId, data] of popTrends) {
    if (data.length === 0) continue;
    const last = data[data.length - 1];
    if (last.health < 0.3) {
      issues.push(`${islandId} has critically low health (${formatPercent(last.health)})`);
      recommendations.push(`Check food supply and production at ${islandId}`);
    }
  }

  if (tradeStats.profitability.estimatedProfit < 0) {
    issues.push('Agent trading is unprofitable overall');
    recommendations.push('Review transport costs and trade margins');
  }

  printSubHeader('Issues Found');
  if (issues.length === 0) {
    console.log(`  ${GREEN}No major issues detected!${RESET}`);
  } else {
    for (const issue of issues) {
      console.log(`  ${RED}!${RESET} ${issue}`);
    }
  }

  printSubHeader('Recommendations');
  if (recommendations.length === 0) {
    console.log(`  ${GREEN}Model appears healthy${RESET}`);
  } else {
    for (const rec of recommendations) {
      console.log(`  ${YELLOW}>${RESET} ${rec}`);
    }
  }

  console.log('\n');
  db.close();
}

main().catch(console.error);
