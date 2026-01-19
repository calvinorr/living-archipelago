/**
 * Run simulation and analyze results
 * Runs a simulation with database recording, then analyzes the results
 */

import { Simulation } from '../src/core/simulation.js';
import { initializeWorld, DEFAULT_CONFIG } from '../src/core/world.js';
import { AgentManager } from '../src/agents/core/agent-manager.js';
import { createMockTraderAgent } from '../src/agents/traders/trader-agent.js';
import { createDatabase } from '../src/storage/database.js';
import {
  getTradeStats,
  getPriceVolatility,
  getPopulationTrends,
  getEcosystemHealth,
} from '../src/storage/analytics.js';
import type { GoodId, IslandId } from '../src/core/types.js';

const TICKS_TO_RUN = 2400; // 100 game days
const SEED = Date.now() % 100000; // Random seed
const DB_PATH = 'simulation_test.db';

// ANSI colors
const BOLD = '\x1b[1m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

function formatPercent(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

async function main() {
  console.log(`${BOLD}Running Economic Model Test${RESET}`);
  console.log(`Seed: ${SEED}`);
  console.log(`Ticks: ${TICKS_TO_RUN} (~${Math.floor(TICKS_TO_RUN / 24)} days)\n`);

  // Initialize database
  const db = createDatabase(DB_PATH, 10);
  if (!db) {
    console.error('Failed to create database');
    process.exit(1);
  }

  // Initialize simulation
  const initialState = initializeWorld(SEED);
  const simulation = new Simulation(initialState, { seed: SEED });

  // Start database run
  const runId = db.startRun(SEED, { ...DEFAULT_CONFIG, seed: SEED });
  console.log(`Database run ID: ${runId}\n`);

  // Initialize agent
  const agentManager = new AgentManager({ debug: false });
  const shipIds = Array.from(initialState.ships.keys());
  const agent = createMockTraderAgent('trader-alpha', 'Test Trader', {
    cash: 1000,
    shipIds,
  });
  agentManager.registerAgent(agent, initialState);

  // Run simulation
  console.log('Running simulation...');
  const startTime = Date.now();

  for (let i = 0; i < TICKS_TO_RUN; i++) {
    simulation.tick();
    const worldState = simulation.getState();

    // Record snapshot every 10 ticks
    db.recordSnapshot(worldState.tick, worldState);

    // Run agent every tick
    const agentResults = await agentManager.processTick(worldState);
    if (agentResults.newWorld) {
      simulation.updateState(agentResults.newWorld);
    }

    // Record trades from results
    for (const result of agentResults.results) {
      for (const action of result.actions) {
        if (action.type === 'trade') {
          for (const tx of action.transactions) {
            db.recordTrade(worldState.tick, {
              agentId: result.agentId,
              shipId: action.shipId,
              islandId: action.islandId,
              goodId: tx.goodId,
              quantity: tx.quantity,
              price: worldState.islands.get(action.islandId)?.market.prices.get(tx.goodId) ?? 0,
            });
          }
        }
      }
    }

    // Progress
    if (i % 240 === 0) {
      process.stdout.write(`  Day ${Math.floor(i / 24)}...`);
    }
    if (i % 240 === 239) {
      console.log(' done');
    }
  }

  const elapsed = Date.now() - startTime;
  console.log(`\nSimulation complete in ${(elapsed / 1000).toFixed(1)}s\n`);

  // End run
  db.endRun();

  // =========================================================================
  // Analyze Results
  // =========================================================================
  console.log(`${BOLD}${BLUE}=== ANALYSIS RESULTS ===${RESET}\n`);

  // Trade Stats
  const tradeStats = getTradeStats(db, runId);
  console.log(`${BOLD}Trade Statistics:${RESET}`);
  console.log(`  Total Trades: ${tradeStats.totalTrades}`);
  console.log(`  Total Volume: ${tradeStats.totalVolume.toFixed(0)}`);
  console.log(`  Buy Volume: ${tradeStats.buyVolume.toFixed(0)}`);
  console.log(`  Sell Volume: ${tradeStats.sellVolume.toFixed(0)}`);
  const buySellRatio = tradeStats.buyVolume / (tradeStats.sellVolume || 1);
  const ratioStatus = buySellRatio > 0.7 && buySellRatio < 1.5 ? GREEN : buySellRatio > 0.5 && buySellRatio < 2 ? YELLOW : RED;
  console.log(`  Buy/Sell Ratio: ${ratioStatus}${buySellRatio.toFixed(2)}${RESET}`);
  console.log(`  Est. Profit: $${tradeStats.profitability.estimatedProfit.toFixed(0)}`);

  // Price Volatility
  console.log(`\n${BOLD}Price Volatility:${RESET}`);
  const volatility = getPriceVolatility(db, runId);
  for (const [goodId, stats] of volatility) {
    const volStatus = stats.volatility < 0.3 ? GREEN : stats.volatility < 0.5 ? YELLOW : RED;
    console.log(`  ${goodId}: ${volStatus}${formatPercent(stats.volatility)}${RESET} (range: $${stats.minPrice.toFixed(1)} - $${stats.maxPrice.toFixed(1)})`);
  }

  // Population Health
  console.log(`\n${BOLD}Population Health:${RESET}`);
  const popTrends = getPopulationTrends(db, runId);
  for (const [islandId, data] of popTrends) {
    if (data.length === 0) continue;
    const first = data[0];
    const last = data[data.length - 1];
    const healthStatus = last.health > 0.6 ? GREEN : last.health > 0.3 ? YELLOW : RED;
    const popChange = ((last.population - first.population) / first.population) * 100;
    console.log(`  ${islandId}: Health=${healthStatus}${formatPercent(last.health)}${RESET}, Pop change=${popChange > 0 ? '+' : ''}${popChange.toFixed(1)}%`);
  }

  // Ecosystem
  console.log(`\n${BOLD}Ecosystem Health:${RESET}`);
  const ecoHealth = getEcosystemHealth(db, runId);
  if (ecoHealth.length > 0) {
    const first = ecoHealth[0];
    const last = ecoHealth[ecoHealth.length - 1];
    for (const [islandId, finalData] of last.islands) {
      const initialData = first.islands.get(islandId);
      if (!initialData) continue;
      const fishChange = ((finalData.fishStock - initialData.fishStock) / initialData.fishStock) * 100;
      const forestChange = ((finalData.forestBiomass - initialData.forestBiomass) / initialData.forestBiomass) * 100;
      console.log(`  ${islandId}: Fish=${fishChange > 0 ? '+' : ''}${fishChange.toFixed(0)}%, Forest=${forestChange > 0 ? '+' : ''}${forestChange.toFixed(0)}%`);
    }
  }

  // Summary
  console.log(`\n${BOLD}${BLUE}=== SUMMARY ===${RESET}`);

  const issues: string[] = [];
  if (buySellRatio < 0.5 || buySellRatio > 2) {
    issues.push(`Buy/sell imbalance (${buySellRatio.toFixed(2)})`);
  }
  const highVolGoods = Array.from(volatility.values()).filter(v => v.volatility > 0.5);
  if (highVolGoods.length > 0) {
    issues.push(`${highVolGoods.length} goods with >50% volatility`);
  }
  for (const [islandId, data] of popTrends) {
    if (data.length > 0 && data[data.length - 1].health < 0.3) {
      issues.push(`${islandId} has critically low health`);
    }
  }

  if (issues.length === 0) {
    console.log(`${GREEN}No major issues detected! Economic model appears healthy.${RESET}`);
  } else {
    console.log(`${RED}Issues found:${RESET}`);
    for (const issue of issues) {
      console.log(`  - ${issue}`);
    }
  }

  console.log('\n');
  db.close();
}

main().catch(console.error);
