/**
 * Observer Mode Runner
 * Real-time simulation observation with configurable output and export
 * Phase 5: Observer Mode
 */

import { Simulation, type TickMetrics } from '../core/simulation.js';
import { initializeWorld, DEFAULT_CONFIG } from '../core/world.js';
import { AgentManager } from '../agents/core/agent-manager.js';
import { createMockTraderAgent } from '../agents/traders/trader-agent.js';
import type { WorldState, GoodId } from '../core/types.js';
import * as fs from 'fs';

// ============================================================================
// ANSI Color Codes
// ============================================================================

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
  bgBlack: '\x1b[40m',
  clearScreen: '\x1b[2J\x1b[H',
};

// ============================================================================
// Types
// ============================================================================

type VerbosityLevel = 'quiet' | 'normal' | 'verbose' | 'debug';

interface ObserverOptions {
  seed: number;
  ticks: number;
  delay: number;
  verbosity: VerbosityLevel;
  exportJson: string | null;
  exportCsv: string | null;
  watch: boolean;
  agents: boolean;
  clearScreen: boolean;
}

interface TickSnapshot {
  tick: number;
  gameDay: number;
  gameHour: number;
  islands: Array<{
    id: string;
    name: string;
    population: number;
    health: number;
    inventory: Record<string, number>;
    prices: Record<string, number>;
    ecosystem: {
      fishStock: number;
      forestBiomass: number;
      soilFertility: number;
    };
  }>;
  ships: Array<{
    id: string;
    name: string;
    location: string;
    cash: number;
    cargo: Record<string, number>;
  }>;
  events: string[];
  metrics: {
    production: Record<string, Record<string, number>>;
    priceChanges: Record<string, Record<string, number>>;
    arrivals: Array<{ shipId: string; islandId: string }>;
    newEvents: string[];
  };
}

interface CsvRow {
  tick: number;
  island: string;
  good: string;
  price: number;
  inventory: number;
  population: number;
}

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArgs(): ObserverOptions {
  const args = process.argv.slice(2);
  const options: ObserverOptions = {
    seed: DEFAULT_CONFIG.seed,
    ticks: 100,
    delay: 100,
    verbosity: 'normal',
    exportJson: null,
    exportCsv: null,
    watch: false,
    agents: false,
    clearScreen: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case '--seed':
        options.seed = parseInt(next, 10);
        i++;
        break;
      case '--ticks':
        options.ticks = parseInt(next, 10);
        i++;
        break;
      case '--delay':
        options.delay = parseInt(next, 10);
        i++;
        break;
      case '--verbosity':
        if (['quiet', 'normal', 'verbose', 'debug'].includes(next)) {
          options.verbosity = next as VerbosityLevel;
        }
        i++;
        break;
      case '--export-json':
        options.exportJson = next;
        i++;
        break;
      case '--export-csv':
        options.exportCsv = next;
        i++;
        break;
      case '--watch':
        options.watch = true;
        break;
      case '--agents':
        options.agents = true;
        break;
      case '--clear':
        options.clearScreen = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
${ANSI.bold}Living Archipelago - Observer Mode${ANSI.reset}

${ANSI.cyan}Usage:${ANSI.reset} npm run observe -- [options]

${ANSI.cyan}Options:${ANSI.reset}
  --seed <number>        Random seed (default: ${DEFAULT_CONFIG.seed})
  --ticks <number>       Number of ticks to run (default: 100)
  --delay <ms>           Delay between ticks in milliseconds (default: 100)
  --verbosity <level>    Output verbosity: quiet|normal|verbose|debug (default: normal)
  --export-json <file>   Export simulation history to JSON file
  --export-csv <file>    Export metrics to CSV file
  --watch                Continue running indefinitely until Ctrl+C
  --agents               Enable AI trader agents
  --clear                Clear screen between ticks (watch mode)
  --help, -h             Show this help

${ANSI.cyan}Examples:${ANSI.reset}
  npm run observe -- --delay 500 --verbosity verbose --agents
  npm run observe -- --ticks 100 --export-json results.json
  npm run observe -- --watch --delay 1000
  npm run observe -- --ticks 500 --export-csv prices.csv --verbosity quiet
`);
}

// ============================================================================
// Formatting Utilities
// ============================================================================

function formatPriceArrow(change: number): string {
  if (Math.abs(change) < 0.01) {
    return `${ANSI.dim}-${ANSI.reset}`;
  }
  return change > 0
    ? `${ANSI.green}${ANSI.bold}+${ANSI.reset}`
    : `${ANSI.red}${ANSI.bold}-${ANSI.reset}`;
}

function formatPercent(value: number): string {
  const pct = (value * 100).toFixed(1);
  const color = value >= 0.7 ? ANSI.green : value >= 0.4 ? ANSI.yellow : ANSI.red;
  return `${color}${pct.padStart(5)}%${ANSI.reset}`;
}

function formatPopulation(pop: number, prevPop?: number): string {
  const popStr = Math.round(pop).toString().padStart(4);

  if (prevPop === undefined) {
    return popStr;
  }

  const diff = pop - prevPop;
  if (Math.abs(diff) < 0.5) {
    return popStr;
  }

  const arrow = diff > 0 ? `${ANSI.green}+${ANSI.reset}` : `${ANSI.red}-${ANSI.reset}`;
  return `${popStr} ${arrow}`;
}

function formatInventory(amount: number): string {
  const str = Math.round(amount).toString().padStart(5);
  if (amount < 20) {
    return `${ANSI.red}${str}${ANSI.reset}`;
  } else if (amount < 50) {
    return `${ANSI.yellow}${str}${ANSI.reset}`;
  }
  return str;
}

function formatShipLocation(location: { kind: string; islandId?: string; route?: { toIslandId: string; progress: number } }): string {
  if (location.kind === 'at_island') {
    return `${ANSI.cyan}@${location.islandId}${ANSI.reset}`;
  }
  const progress = Math.round((location.route?.progress ?? 0) * 100);
  return `${ANSI.blue}-> ${location.route?.toIslandId} (${progress}%)${ANSI.reset}`;
}

// ============================================================================
// Output Functions by Verbosity
// ============================================================================

function printHeader(options: ObserverOptions): void {
  if (options.verbosity === 'quiet') return;

  console.log(`${ANSI.bold}${'='.repeat(70)}${ANSI.reset}`);
  console.log(`${ANSI.bold}${ANSI.cyan}Living Archipelago - Observer Mode${ANSI.reset}`);
  console.log(`${ANSI.bold}${'='.repeat(70)}${ANSI.reset}`);
  console.log(`${ANSI.dim}Seed: ${options.seed} | Ticks: ${options.watch ? 'Infinite' : options.ticks} | Delay: ${options.delay}ms | Agents: ${options.agents ? 'ON' : 'OFF'}${ANSI.reset}`);
  console.log('');
}

function printTickHeader(tick: number, gameDay: number, gameHour: number, verbosity: VerbosityLevel): void {
  if (verbosity === 'quiet') return;

  const timeStr = `Day ${gameDay}, Hour ${gameHour.toString().padStart(2, '0')}:00`;
  console.log(`${ANSI.bold}${ANSI.magenta}--- Tick ${tick} (${timeStr}) ---${ANSI.reset}`);
}

function printIslandTable(
  state: WorldState,
  metrics: TickMetrics | null,
  prevState: WorldState | null,
  verbosity: VerbosityLevel
): void {
  if (verbosity === 'quiet') return;

  const goods: GoodId[] = ['fish', 'grain', 'timber', 'tools', 'luxuries'];

  console.log(`${ANSI.bold}Islands:${ANSI.reset}`);

  for (const [islandId, island] of state.islands) {
    const prevIsland = prevState?.islands.get(islandId);
    const priceChanges = metrics?.priceChanges.get(islandId);

    // Island header
    console.log(`  ${ANSI.cyan}${ANSI.bold}${island.name}${ANSI.reset} (${islandId})`);

    // Population and health
    const popStr = formatPopulation(island.population.size, prevIsland?.population.size);
    const healthStr = formatPercent(island.population.health);
    console.log(`    Pop: ${popStr} | Health: ${healthStr}`);

    // Ecosystem (verbose/debug only)
    if (verbosity === 'verbose' || verbosity === 'debug') {
      const eco = island.ecosystem;
      console.log(`    ${ANSI.dim}Ecosystem: Fish ${eco.fishStock.toFixed(0)}/${island.ecosystemParams.fishCapacity} | Forest ${eco.forestBiomass.toFixed(0)}/${island.ecosystemParams.forestCapacity} | Soil ${(eco.soilFertility * 100).toFixed(0)}%${ANSI.reset}`);
    }

    // Prices table
    let priceRow = '    Prices: ';
    for (const goodId of goods) {
      const price = island.market.prices.get(goodId) ?? 0;
      const change = priceChanges?.get(goodId) ?? 0;
      const arrow = formatPriceArrow(change);
      priceRow += `${goodId.slice(0, 4).padEnd(5)}${arrow}${price.toFixed(1).padStart(5)} `;
    }
    console.log(priceRow);

    // Inventory (verbose/debug only)
    if (verbosity === 'verbose' || verbosity === 'debug') {
      let invRow = '    Stock:  ';
      for (const goodId of goods) {
        const amount = island.inventory.get(goodId) ?? 0;
        invRow += `${goodId.slice(0, 4).padEnd(5)} ${formatInventory(amount)} `;
      }
      console.log(invRow);
    }

    // Production details (debug only)
    if (verbosity === 'debug' && metrics) {
      const production = metrics.production.get(islandId);
      if (production) {
        let prodRow = '    Prod:   ';
        for (const goodId of goods) {
          const amount = production.get(goodId) ?? 0;
          const sign = amount >= 0 ? '+' : '';
          prodRow += `${goodId.slice(0, 4).padEnd(5)} ${sign}${amount.toFixed(1).padStart(4)} `;
        }
        console.log(`${ANSI.dim}${prodRow}${ANSI.reset}`);
      }
    }
  }
  console.log('');
}

function printShipTable(state: WorldState, verbosity: VerbosityLevel): void {
  if (verbosity === 'quiet') return;

  console.log(`${ANSI.bold}Ships:${ANSI.reset}`);

  for (const ship of state.ships.values()) {
    const location = formatShipLocation(ship.location as { kind: string; islandId?: string; route?: { toIslandId: string; progress: number } });
    const cashStr = `${ANSI.yellow}$${ship.cash.toFixed(0)}${ANSI.reset}`;

    let output = `  ${ANSI.bold}${ship.name}${ANSI.reset} | ${location} | ${cashStr}`;

    // Cargo (verbose/debug)
    if (verbosity === 'verbose' || verbosity === 'debug') {
      const cargoItems: string[] = [];
      for (const [goodId, amount] of ship.cargo) {
        if (amount > 0) {
          cargoItems.push(`${goodId}: ${amount.toFixed(0)}`);
        }
      }
      if (cargoItems.length > 0) {
        output += ` | Cargo: ${cargoItems.join(', ')}`;
      }
    }

    console.log(output);
  }
  console.log('');
}

function printEvents(metrics: TickMetrics, state: WorldState, verbosity: VerbosityLevel): void {
  if (verbosity === 'quiet') return;

  // New events
  if (metrics.newEvents.length > 0) {
    console.log(`${ANSI.yellow}${ANSI.bold}New Events:${ANSI.reset} ${metrics.newEvents.join(', ')}`);
  }

  // Arrivals
  if (metrics.arrivals.length > 0) {
    const arrivalStrs = metrics.arrivals.map(a => `${a.shipId} arrived at ${a.islandId}`);
    console.log(`${ANSI.green}${ANSI.bold}Arrivals:${ANSI.reset} ${arrivalStrs.join(', ')}`);
  }

  // Active events (verbose/debug)
  if ((verbosity === 'verbose' || verbosity === 'debug') && state.events.length > 0) {
    const activeEvents = state.events
      .filter(e => e.startTick <= state.tick && e.endTick > state.tick)
      .map(e => `${e.type}@${e.targetId} (${e.endTick - state.tick} ticks left)`);

    if (activeEvents.length > 0) {
      console.log(`${ANSI.dim}Active Events: ${activeEvents.join(', ')}${ANSI.reset}`);
    }
  }
}

function printAgentActivity(
  agentResults: Array<{ agentId: string; triggered: boolean; actions: unknown[] }>,
  verbosity: VerbosityLevel
): void {
  if (verbosity === 'quiet' || verbosity === 'normal') return;

  if (agentResults.length === 0) return;

  console.log(`${ANSI.bold}Agent Activity:${ANSI.reset}`);
  for (const result of agentResults) {
    const triggerStr = result.triggered ? `${ANSI.green}TRIGGERED${ANSI.reset}` : `${ANSI.dim}idle${ANSI.reset}`;
    const actionCount = result.actions.length;
    console.log(`  ${result.agentId}: ${triggerStr} | ${actionCount} action(s)`);
  }
  console.log('');
}

function printSeparator(): void {
  console.log('');
}

// ============================================================================
// Snapshot Creation
// ============================================================================

function createSnapshot(state: WorldState, metrics: TickMetrics): TickSnapshot {
  const islands = Array.from(state.islands.values()).map(island => ({
    id: island.id,
    name: island.name,
    population: island.population.size,
    health: island.population.health,
    inventory: Object.fromEntries(island.inventory),
    prices: Object.fromEntries(island.market.prices),
    ecosystem: {
      fishStock: island.ecosystem.fishStock,
      forestBiomass: island.ecosystem.forestBiomass,
      soilFertility: island.ecosystem.soilFertility,
    },
  }));

  const ships = Array.from(state.ships.values()).map(ship => ({
    id: ship.id,
    name: ship.name,
    location: ship.location.kind === 'at_island'
      ? ship.location.islandId
      : `sailing to ${ship.location.route.toIslandId}`,
    cash: ship.cash,
    cargo: Object.fromEntries(ship.cargo),
  }));

  const events = state.events
    .filter(e => e.startTick <= state.tick && e.endTick > state.tick)
    .map(e => `${e.type}@${e.targetId}`);

  // Convert Map-based metrics to plain objects
  const productionObj: Record<string, Record<string, number>> = {};
  for (const [islandId, goodsMap] of metrics.production) {
    productionObj[islandId] = Object.fromEntries(goodsMap);
  }

  const priceChangesObj: Record<string, Record<string, number>> = {};
  for (const [islandId, goodsMap] of metrics.priceChanges) {
    priceChangesObj[islandId] = Object.fromEntries(goodsMap);
  }

  return {
    tick: state.tick,
    gameDay: state.gameTime.gameDay,
    gameHour: state.gameTime.gameHour,
    islands,
    ships,
    events,
    metrics: {
      production: productionObj,
      priceChanges: priceChangesObj,
      arrivals: metrics.arrivals,
      newEvents: metrics.newEvents,
    },
  };
}

function snapshotsToCsvRows(snapshots: TickSnapshot[]): CsvRow[] {
  const rows: CsvRow[] = [];

  for (const snapshot of snapshots) {
    for (const island of snapshot.islands) {
      for (const [goodId, price] of Object.entries(island.prices)) {
        rows.push({
          tick: snapshot.tick,
          island: island.id,
          good: goodId,
          price,
          inventory: island.inventory[goodId] ?? 0,
          population: island.population,
        });
      }
    }
  }

  return rows;
}

function exportJson(snapshots: TickSnapshot[], filepath: string): void {
  fs.writeFileSync(filepath, JSON.stringify(snapshots, null, 2));
  console.log(`${ANSI.green}Exported ${snapshots.length} snapshots to ${filepath}${ANSI.reset}`);
}

function exportCsv(snapshots: TickSnapshot[], filepath: string): void {
  const rows = snapshotsToCsvRows(snapshots);
  const header = 'tick,island,good,price,inventory,population\n';
  const csvData = rows.map(row =>
    `${row.tick},${row.island},${row.good},${row.price.toFixed(2)},${row.inventory.toFixed(0)},${row.population.toFixed(0)}`
  ).join('\n');

  fs.writeFileSync(filepath, header + csvData);
  console.log(`${ANSI.green}Exported ${rows.length} rows to ${filepath}${ANSI.reset}`);
}

// ============================================================================
// Sleep Utility
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// Main Observer Loop
// ============================================================================

async function main(): Promise<void> {
  const options = parseArgs();

  printHeader(options);

  // Initialize world
  const initialState = initializeWorld(options.seed);
  const sim = new Simulation(initialState, { seed: options.seed });

  // Initialize agents if enabled
  let agentManager: AgentManager | null = null;
  if (options.agents) {
    agentManager = new AgentManager({ debug: options.verbosity === 'debug' });

    // Create mock trader agents for each ship
    for (const [shipId, ship] of initialState.ships) {
      const agent = createMockTraderAgent(
        ship.ownerId,
        `Agent-${ship.ownerId}`,
        { cash: ship.cash, shipIds: [shipId] }
      );
      agentManager.registerAgent(agent, initialState);
    }

    if (options.verbosity !== 'quiet') {
      const stats = agentManager.getStats();
      console.log(`${ANSI.cyan}Registered ${stats.agentCount} AI agent(s)${ANSI.reset}`);
      console.log('');
    }
  }

  // Storage for export
  const snapshots: TickSnapshot[] = [];
  let prevState: WorldState | null = null;

  // Setup Ctrl+C handler for watch mode
  let running = true;
  process.on('SIGINT', () => {
    running = false;
    console.log(`\n${ANSI.yellow}Stopping observer...${ANSI.reset}`);
  });

  let tickCount = 0;
  const startTime = Date.now();

  // Main loop
  while (running && (options.watch || tickCount < options.ticks)) {
    // Clear screen if requested
    if (options.clearScreen && options.verbosity !== 'quiet') {
      process.stdout.write(ANSI.clearScreen);
      printHeader(options);
    }

    // Execute simulation tick
    const metrics = sim.tick();
    const state = sim.getState();

    // Process agents if enabled
    let agentResults: Array<{ agentId: string; triggered: boolean; actions: unknown[] }> = [];
    if (agentManager) {
      const { results } = await agentManager.processTick(state);
      agentResults = results.map(r => ({
        agentId: r.agentId,
        triggered: r.triggered,
        actions: r.actions,
      }));
    }

    // Output based on verbosity
    printTickHeader(state.tick, state.gameTime.gameDay, state.gameTime.gameHour, options.verbosity);
    printIslandTable(state, metrics, prevState, options.verbosity);
    printShipTable(state, options.verbosity);
    printEvents(metrics, state, options.verbosity);
    printAgentActivity(agentResults, options.verbosity);

    if (options.verbosity !== 'quiet') {
      printSeparator();
    }

    // Store snapshot for export
    if (options.exportJson || options.exportCsv) {
      snapshots.push(createSnapshot(state, metrics));
    }

    // Store previous state for comparison
    prevState = state;
    tickCount++;

    // Delay between ticks
    if (options.delay > 0 && running && (options.watch || tickCount < options.ticks)) {
      await sleep(options.delay);
    }
  }

  const elapsed = Date.now() - startTime;

  // Final summary
  if (options.verbosity !== 'quiet') {
    console.log(`${ANSI.bold}${'='.repeat(70)}${ANSI.reset}`);
    console.log(`${ANSI.bold}${ANSI.cyan}Observer Complete${ANSI.reset}`);
    console.log(`${ANSI.bold}${'='.repeat(70)}${ANSI.reset}`);
    console.log(`Total ticks: ${tickCount}`);
    console.log(`Elapsed time: ${(elapsed / 1000).toFixed(1)}s`);
    console.log(`Average tick time: ${(elapsed / tickCount).toFixed(1)}ms`);

    // Final state summary
    const summary = sim.getSummary();
    console.log('');
    console.log(`${ANSI.bold}Final State:${ANSI.reset}`);
    for (const island of summary.islands) {
      console.log(`  ${island.name}: Pop ${island.population}, Health ${(island.health * 100).toFixed(0)}%`);
    }
  }

  // Export data
  if (options.exportJson && snapshots.length > 0) {
    exportJson(snapshots, options.exportJson);
  }

  if (options.exportCsv && snapshots.length > 0) {
    exportCsv(snapshots, options.exportCsv);
  }
}

// Run main
main().catch(err => {
  console.error(`${ANSI.red}Error: ${err.message}${ANSI.reset}`);
  process.exit(1);
});
