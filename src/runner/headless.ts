/**
 * Headless Runner
 * CLI for running simulations without UI
 * Phase 5: Observer Mode with Agent Tracing
 */

import { Simulation } from '../core/simulation.js';
import { initializeWorld, DEFAULT_CONFIG } from '../core/world.js';
import { AgentManager, type AgentTickResult } from '../agents/core/agent-manager.js';
import { TraderAgent, createMockTraderAgent } from '../agents/traders/trader-agent.js';
import { LLMClient } from '../llm/client.js';
import type { Trigger } from '../agents/core/trigger-system.js';

interface RunOptions {
  seed: number;
  ticks: number;
  verbose: boolean;
  logInterval: number;
  agents: boolean;
  traceLLM: boolean;
  useRealLLM: boolean;
}

interface AgentMetrics {
  totalLLMCalls: number;
  tradesExecuted: number;
  totalProfit: number;
  strategiesCreated: number;
  triggeredCount: number;
}

function parseArgs(): RunOptions {
  const args = process.argv.slice(2);
  const options: RunOptions = {
    seed: DEFAULT_CONFIG.seed,
    ticks: 100,
    verbose: false,
    logInterval: 24, // Log every game day
    agents: false,
    traceLLM: false,
    useRealLLM: false,
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
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
      case '--log-interval':
        options.logInterval = parseInt(next, 10);
        i++;
        break;
      case '--agents':
        options.agents = true;
        break;
      case '--trace-llm':
        options.traceLLM = true;
        break;
      case '--use-real-llm':
        options.useRealLLM = true;
        break;
      case '--help':
      case '-h':
        console.log(`
Living Archipelago Simulation Runner

Usage: npm run simulate -- [options]

Options:
  --seed <number>        Random seed (default: ${DEFAULT_CONFIG.seed})
  --ticks <number>       Number of ticks to run (default: 100)
  --verbose, -v          Show detailed output
  --log-interval <n>     Log summary every N ticks (default: 24)
  --agents               Enable AI agent mode (TraderAgents)
  --trace-llm            Show LLM calls and responses
  --use-real-llm         Use real Gemini LLM (requires GEMINI_API_KEY)
  --help, -h             Show this help

Examples:
  npm run simulate -- --seed 12345 --ticks 500
  npm run simulate -- --ticks 1000 --verbose
  npm run simulate -- --agents --ticks 200
  npm run simulate -- --agents --trace-llm --use-real-llm
        `);
        process.exit(0);
    }
  }

  return options;
}

function formatPrice(price: number): string {
  return price.toFixed(2).padStart(7);
}

function formatPercent(value: number): string {
  return (value * 100).toFixed(1).padStart(5) + '%';
}

function formatTrigger(trigger: Trigger): string {
  const data = trigger.data;
  switch (data.type) {
    case 'price_divergence':
      return `PRICE_DIVERGENCE(${data.goodId}: ${(data.divergence * 100).toFixed(0)}% ${data.lowIsland}->${data.highIsland})`;
    case 'ship_arrival':
      return `SHIP_ARRIVAL(${data.shipId} at ${data.islandId})`;
    case 'event_started':
      return `EVENT_STARTED(${data.eventType} at ${data.targetId})`;
    case 'event_ended':
      return `EVENT_ENDED(${data.eventType} at ${data.targetId})`;
    case 'plan_completed':
      return `PLAN_COMPLETED(${data.planId})`;
    case 'plan_failed':
      return `PLAN_FAILED(${data.planId}: ${data.reason ?? 'unknown'})`;
    case 'resource_threshold':
      return `RESOURCE(${data.resource}: ${data.current}/${data.threshold})`;
    case 'time_elapsed':
      return `TIME_ELAPSED(${data.ticksSinceLastReasoning} ticks)`;
    case 'no_plan':
      return 'NO_PLAN';
    default:
      return 'UNKNOWN';
  }
}

function formatDecision(result: AgentTickResult): string {
  const decision = result.decision;
  if (!decision) return 'No decision';

  const parts: string[] = [];

  if (decision.actions.length > 0) {
    for (const action of decision.actions) {
      switch (action.type) {
        case 'trade': {
          const txs = action.transactions.map((tx) =>
            `${tx.quantity > 0 ? 'BUY' : 'SELL'} ${Math.abs(tx.quantity)} ${tx.goodId}`
          );
          parts.push(`TRADE(${action.shipId}@${action.islandId}: ${txs.join(', ')})`);
          break;
        }
        case 'navigate':
          parts.push(`NAVIGATE(${action.shipId}->${action.destinationId})`);
          break;
        case 'wait':
          parts.push(`WAIT(${action.shipId}: ${action.ticks} ticks)`);
          break;
      }
    }
  }

  if (decision.plan) {
    parts.push(`Plan: "${decision.plan.summary}"`);
  }

  if (decision.triggerReason) {
    parts.push(`Reason: ${decision.triggerReason}`);
  }

  return parts.length > 0 ? parts.join(' | ') : 'No actions';
}

function formatActionResults(result: AgentTickResult): string {
  if (result.results.length === 0) return '';

  const outcomes = result.results.map((r) => {
    const status = r.success ? 'OK' : 'FAIL';
    const type = r.action.type.toUpperCase();
    const error = r.error ? `: ${r.error}` : '';
    return `[${status}] ${type}${error}`;
  });

  return outcomes.join(', ');
}

function logAgentTick(result: AgentTickResult, traceLLM: boolean): void {
  const prefix = `  [Agent: ${result.agentId}]`;

  if (result.error) {
    console.log(`${prefix} ERROR: ${result.error}`);
    return;
  }

  if (!result.triggered && result.actions.length === 0) {
    // Agent did nothing significant
    return;
  }

  // Log triggered state
  if (result.triggered) {
    const triggerSummary = result.triggers.map(formatTrigger).join(', ');
    console.log(`${prefix} TRIGGERED: ${triggerSummary}`);
  }

  // Log decision
  const decisionStr = formatDecision(result);
  if (decisionStr !== 'No actions') {
    console.log(`${prefix} Decision: ${decisionStr}`);
  }

  // Log action results
  const resultsStr = formatActionResults(result);
  if (resultsStr) {
    console.log(`${prefix} Results: ${resultsStr}`);
  }

  // LLM tracing
  if (traceLLM && result.triggered) {
    console.log(`${prefix} [LLM] Strategy invoked`);
    if (result.decision?.plan) {
      console.log(`${prefix} [LLM] Generated plan: ${result.decision.plan.summary}`);
    }
  }
}

function createTraderAgents(
  options: RunOptions,
  initialCash: number,
  shipIds: string[]
): TraderAgent[] {
  const agents: TraderAgent[] = [];

  if (options.useRealLLM && process.env.GEMINI_API_KEY) {
    console.log('Using real Gemini LLM client');
    const llmClient = new LLMClient();

    const agent = new TraderAgent(
      'trader-alpha',
      'Alpha Trader',
      llmClient,
      { cash: initialCash, shipIds },
      { debug: options.verbose }
    );
    agents.push(agent);
  } else {
    console.log('Using mock LLM client (set GEMINI_API_KEY and --use-real-llm for real LLM)');

    const mockAgent = createMockTraderAgent(
      'trader-mock',
      'Mock Trader',
      { cash: initialCash, shipIds }
    );
    agents.push(mockAgent);
  }

  return agents;
}

async function main() {
  const options = parseArgs();

  console.log('='.repeat(60));
  console.log('Living Archipelago Simulation');
  console.log('='.repeat(60));
  console.log(`Seed: ${options.seed}`);
  console.log(`Ticks: ${options.ticks}`);
  console.log(`Agents: ${options.agents ? 'Enabled' : 'Disabled'}`);
  if (options.agents) {
    console.log(`LLM Tracing: ${options.traceLLM ? 'Enabled' : 'Disabled'}`);
    console.log(`Real LLM: ${options.useRealLLM ? 'Enabled' : 'Disabled'}`);
  }
  console.log('');

  // Initialize world
  const initialState = initializeWorld(options.seed);
  const sim = new Simulation(initialState, { seed: options.seed });

  // Initialize agent system if enabled
  let agentManager: AgentManager | null = null;
  let traderAgents: TraderAgent[] = [];
  const agentMetrics: AgentMetrics = {
    totalLLMCalls: 0,
    tradesExecuted: 0,
    totalProfit: 0,
    strategiesCreated: 0,
    triggeredCount: 0,
  };

  if (options.agents) {
    agentManager = new AgentManager({ debug: options.verbose });

    // Get ship IDs from world state for the trader
    const shipIds = Array.from(initialState.ships.keys());
    const initialCash = 1000;

    traderAgents = createTraderAgents(options, initialCash, shipIds);

    for (const agent of traderAgents) {
      agentManager.registerAgent(agent, initialState);
      console.log(`Registered agent: ${agent.name} (${agent.id})`);
    }
    console.log('');
  }

  console.log('Initial State:');
  console.log('-'.repeat(60));
  printSummary(sim);
  console.log('');

  // Run simulation
  const startTime = Date.now();

  for (let i = 0; i < options.ticks; i++) {
    const metrics = sim.tick();

    // Process agents if enabled
    if (agentManager) {
      const currentState = sim.getState();
      const agentResults = await agentManager.processTick(currentState);

      // Update world state with agent actions
      // Note: In a full implementation, we'd update sim state from agentResults.newWorld

      // Track metrics and log agent activity
      for (const result of agentResults.results) {
        if (result.triggered) {
          agentMetrics.triggeredCount++;
        }

        // Count trades
        for (const actionResult of result.results) {
          if (actionResult.success && actionResult.action.type === 'trade') {
            agentMetrics.tradesExecuted++;
          }
        }

        // Log agent activity at intervals or if triggered
        if ((i + 1) % options.logInterval === 0 || result.triggered || options.verbose) {
          logAgentTick(result, options.traceLLM);
        }
      }
    }

    // Log at intervals
    if ((i + 1) % options.logInterval === 0) {
      console.log(`\nTick ${metrics.tick} (Day ${sim.getState().gameTime.gameDay}):`);
      console.log('-'.repeat(60));
      printSummary(sim);

      if (metrics.newEvents.length > 0) {
        console.log(`  New Events: ${metrics.newEvents.join(', ')}`);
      }
      if (metrics.arrivals.length > 0) {
        console.log(
          `  Arrivals: ${metrics.arrivals.map((a) => `${a.shipId} at ${a.islandId}`).join(', ')}`
        );
      }
    }

    // Verbose logging
    if (options.verbose && metrics.newEvents.length > 0) {
      console.log(`  [Tick ${metrics.tick}] Events: ${metrics.newEvents.join(', ')}`);
    }
  }

  const elapsed = Date.now() - startTime;

  console.log('');
  console.log('='.repeat(60));
  console.log('Simulation Complete');
  console.log('='.repeat(60));
  console.log(`Total ticks: ${options.ticks}`);
  console.log(`Elapsed time: ${elapsed}ms`);
  console.log(`Performance: ${((options.ticks / elapsed) * 1000).toFixed(1)} ticks/sec`);
  console.log('');

  console.log('Final State:');
  console.log('-'.repeat(60));
  printSummary(sim);

  // Agent statistics summary
  if (options.agents && traderAgents.length > 0) {
    console.log('');
    console.log('='.repeat(60));
    console.log('Agent Statistics');
    console.log('='.repeat(60));

    for (const agent of traderAgents) {
      const stats = agent.getStats();
      agentMetrics.totalLLMCalls += stats.llmCalls;
      agentMetrics.strategiesCreated += stats.strategiesCreated;
      agentMetrics.totalProfit += stats.recentProfit;

      console.log(`\n  Agent: ${agent.name} (${agent.id})`);
      console.log('  ' + '-'.repeat(40));
      console.log(`    LLM Calls: ${stats.llmCalls}`);
      console.log(`    Strategies Created: ${stats.strategiesCreated}`);
      console.log(`    Recent Profit: ${stats.recentProfit.toFixed(2)}`);

      const rateLimiter = stats.rateLimiterStatus;
      console.log(`    Rate Limiter:`);
      console.log(`      Calls Made: ${rateLimiter.callsMade}`);
      console.log(`      Remaining: ${rateLimiter.callsRemaining}`);
      console.log(`      Can Call: ${rateLimiter.canCall ? 'Yes' : 'No'}`);

      if (stats.currentStrategy) {
        console.log(`    Current Strategy:`);
        console.log(`      Goal: ${stats.currentStrategy.primaryGoal}`);
        console.log(`      Risk: ${stats.currentStrategy.riskTolerance}`);
        console.log(`      Routes: ${stats.currentStrategy.targetRoutes.length}`);
      } else {
        console.log(`    Current Strategy: None`);
      }
    }

    console.log('');
    console.log('  Overall Metrics:');
    console.log('  ' + '-'.repeat(40));
    console.log(`    Total LLM Calls: ${agentMetrics.totalLLMCalls}`);
    console.log(`    Total Trades Executed: ${agentMetrics.tradesExecuted}`);
    console.log(`    Total Profit: ${agentMetrics.totalProfit.toFixed(2)}`);
    console.log(`    Times Triggered: ${agentMetrics.triggeredCount}`);
    console.log(`    Strategies Created: ${agentMetrics.strategiesCreated}`);
  }

  // Verify determinism
  console.log('');
  console.log('Determinism Check:');
  const history = sim.getTickHistory();
  console.log(`  State hashes collected: ${history.length}`);
  console.log(`  Final hash: ${history[history.length - 1]}`);
}

function printSummary(sim: Simulation) {
  const summary = sim.getSummary();

  console.log('  Islands:');
  for (const island of summary.islands) {
    console.log(`    ${island.name}:`);
    console.log(
      `      Pop: ${island.population.toString().padStart(4)} | Health: ${formatPercent(island.health)}`
    );
    console.log(
      `      Prices: Fish ${formatPrice(island.prices.fish)} | Grain ${formatPrice(island.prices.grain)} | Timber ${formatPrice(island.prices.timber)}`
    );
  }

  console.log('  Ships:');
  for (const ship of summary.ships) {
    console.log(`    ${ship.id}: ${ship.location} (${ship.cash} cash)`);
  }

  if (summary.activeEvents.length > 0) {
    console.log(`  Active Events: ${summary.activeEvents.join(', ')}`);
  }
}

main().catch((error) => {
  console.error('Simulation failed:', error);
  process.exit(1);
});
