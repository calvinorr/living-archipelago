/**
 * Trader Memory
 * Persistent memory for trader agents including strategies and trade history
 */

import type { GoodId, IslandId, ShipId } from '../../core/types.js';
import type { Plan } from '../interfaces/agent.js';

/**
 * Strategy set by the LLM strategist
 */
export interface Strategy {
  /** When this strategy was created */
  createdAt: number;
  /** Primary goal: maximize profit, stabilize markets, or explore opportunities */
  primaryGoal: 'profit' | 'stabilize' | 'explore';
  /** Target trade routes in priority order */
  targetRoutes: TradeRoute[];
  /** Risk tolerance affects quantity sizing */
  riskTolerance: 'low' | 'medium' | 'high';
  /** LLM's analysis when creating this strategy */
  analysis: string;
  /** Reason for this strategy */
  reasoning: string;
  /** Valid until this tick (for re-evaluation) */
  validUntil: number;
}

/**
 * A planned trade route
 */
export interface TradeRoute {
  from: IslandId;
  to: IslandId;
  goods: GoodId[];
  priority: number;
  expectedProfit?: number;
}

/**
 * Record of a completed trade
 */
export interface TradeRecord {
  tick: number;
  shipId: ShipId;
  islandId: IslandId;
  goodId: GoodId;
  quantity: number;
  price: number;
  type: 'buy' | 'sell';
  profit?: number; // Calculated when sold
}

/**
 * Record of a completed voyage
 */
export interface VoyageRecord {
  startTick: number;
  endTick: number;
  shipId: ShipId;
  from: IslandId;
  to: IslandId;
  cargoValue: number;
  profit: number;
}

/**
 * Price observation for tracking trends
 */
export interface PriceObservation {
  tick: number;
  islandId: IslandId;
  goodId: GoodId;
  price: number;
}

/**
 * Trader Memory - maintains context for LLM and rule-based decisions
 */
export class TraderMemory {
  /** Recent strategies (newest first) */
  private strategies: Strategy[] = [];
  /** Trade history */
  private trades: TradeRecord[] = [];
  /** Voyage history */
  private voyages: VoyageRecord[] = [];
  /** Price observations for trend analysis */
  private priceHistory: PriceObservation[] = [];
  /** Pending cargo purchases (for profit calculation) */
  private pendingCargo: Map<string, { tick: number; price: number; quantity: number }> = new Map();
  /** Current plan from agent memory */
  currentPlan: Plan | null = null;
  /** Last reasoning tick */
  lastReasoningTick: number = 0;
  /** Custom notes/observations */
  notes: string[] = [];

  private readonly maxStrategies = 5;
  private readonly maxTrades = 100;
  private readonly maxVoyages = 50;
  private readonly maxPriceHistory = 500;

  /**
   * Record a new strategy
   */
  recordStrategy(strategy: Strategy): void {
    this.strategies.unshift(strategy);
    if (this.strategies.length > this.maxStrategies) {
      this.strategies.pop();
    }
  }

  /**
   * Get the current active strategy
   */
  getCurrentStrategy(): Strategy | null {
    return this.strategies[0] ?? null;
  }

  /**
   * Check if strategy needs refresh
   */
  isStrategyStale(currentTick: number): boolean {
    const strategy = this.getCurrentStrategy();
    if (!strategy) return true;
    return currentTick > strategy.validUntil;
  }

  /**
   * Record a trade
   */
  recordTrade(trade: TradeRecord): void {
    this.trades.unshift(trade);
    if (this.trades.length > this.maxTrades) {
      this.trades.pop();
    }

    // Track pending cargo for profit calculation
    if (trade.type === 'buy') {
      const key = `${trade.shipId}-${trade.goodId}`;
      const existing = this.pendingCargo.get(key);
      if (existing) {
        // Average the price
        const totalQty = existing.quantity + trade.quantity;
        const avgPrice =
          (existing.price * existing.quantity + trade.price * trade.quantity) / totalQty;
        this.pendingCargo.set(key, { tick: trade.tick, price: avgPrice, quantity: totalQty });
      } else {
        this.pendingCargo.set(key, {
          tick: trade.tick,
          price: trade.price,
          quantity: trade.quantity,
        });
      }
    } else if (trade.type === 'sell') {
      // Calculate profit
      const key = `${trade.shipId}-${trade.goodId}`;
      const pending = this.pendingCargo.get(key);
      if (pending) {
        const profit = (trade.price - pending.price) * trade.quantity;
        // Update the trade record with profit
        trade.profit = profit;

        // Update pending quantity
        pending.quantity -= trade.quantity;
        if (pending.quantity <= 0) {
          this.pendingCargo.delete(key);
        }
      }
    }
  }

  /**
   * Record a completed voyage
   */
  recordVoyage(voyage: VoyageRecord): void {
    this.voyages.unshift(voyage);
    if (this.voyages.length > this.maxVoyages) {
      this.voyages.pop();
    }
  }

  /**
   * Record price observation
   */
  recordPrice(tick: number, islandId: IslandId, goodId: GoodId, price: number): void {
    this.priceHistory.push({ tick, islandId, goodId, price });
    if (this.priceHistory.length > this.maxPriceHistory) {
      this.priceHistory.shift();
    }
  }

  /**
   * Get recent trades
   */
  getRecentTrades(count: number = 20): TradeRecord[] {
    return this.trades.slice(0, count);
  }

  /**
   * Get total profit from recent trades
   */
  getRecentProfit(ticksBack: number = 100): number {
    const cutoff = (this.trades[0]?.tick ?? 0) - ticksBack;
    return this.trades
      .filter((t) => t.tick >= cutoff && t.profit !== undefined)
      .reduce((sum, t) => sum + (t.profit ?? 0), 0);
  }

  /**
   * Get price trend for a good at an island
   */
  getPriceTrend(islandId: IslandId, goodId: GoodId): 'rising' | 'falling' | 'stable' | 'unknown' {
    const relevant = this.priceHistory.filter(
      (p) => p.islandId === islandId && p.goodId === goodId
    );

    if (relevant.length < 3) return 'unknown';

    const recent = relevant.slice(-5);
    const first = recent[0].price;
    const last = recent[recent.length - 1].price;
    const change = (last - first) / first;

    if (change > 0.1) return 'rising';
    if (change < -0.1) return 'falling';
    return 'stable';
  }

  /**
   * Convert memory to token-efficient prompt context
   */
  toPromptContext(): string {
    const parts: string[] = [];

    // Current strategy
    const strategy = this.getCurrentStrategy();
    if (strategy) {
      parts.push(`## Current Strategy
Goal: ${strategy.primaryGoal}
Risk: ${strategy.riskTolerance}
Routes: ${strategy.targetRoutes.map((r) => `${r.from}→${r.to} (${r.goods.join(',')})`).join(', ')}
Analysis: ${strategy.analysis}`);
    } else {
      parts.push('## No current strategy');
    }

    // Recent performance
    const recentProfit = this.getRecentProfit(50);
    const recentTrades = this.getRecentTrades(5);
    if (recentTrades.length > 0) {
      parts.push(`## Recent Performance
Profit (last 50 ticks): ${recentProfit.toFixed(0)} gold
Recent trades:
${recentTrades
  .map((t) => `- ${t.type} ${t.quantity} ${t.goodId} at ${t.islandId} for ${t.price.toFixed(1)}`)
  .join('\n')}`);
    }

    // Voyage history summary
    if (this.voyages.length > 0) {
      const avgProfit = this.voyages.reduce((s, v) => s + v.profit, 0) / this.voyages.length;
      parts.push(`## Voyage Summary
Total voyages: ${this.voyages.length}
Average profit: ${avgProfit.toFixed(0)} gold`);
    }

    // Notes
    if (this.notes.length > 0) {
      parts.push(`## Notes\n${this.notes.slice(-3).join('\n')}`);
    }

    return parts.join('\n\n');
  }

  /**
   * Add a note
   */
  addNote(note: string): void {
    this.notes.push(note);
    if (this.notes.length > 10) {
      this.notes.shift();
    }
  }

  /**
   * Get strategies for analysis
   */
  getStrategies(): Strategy[] {
    return [...this.strategies];
  }

  /**
   * Serialize memory for persistence
   */
  serialize(): string {
    return JSON.stringify({
      strategies: this.strategies,
      trades: this.trades,
      voyages: this.voyages,
      priceHistory: this.priceHistory,
      pendingCargo: Array.from(this.pendingCargo.entries()),
      currentPlan: this.currentPlan,
      lastReasoningTick: this.lastReasoningTick,
      notes: this.notes,
    });
  }

  /**
   * Deserialize memory from persistence
   */
  static deserialize(data: string): TraderMemory {
    const parsed = JSON.parse(data);
    const memory = new TraderMemory();
    memory.strategies = parsed.strategies ?? [];
    memory.trades = parsed.trades ?? [];
    memory.voyages = parsed.voyages ?? [];
    memory.priceHistory = parsed.priceHistory ?? [];
    memory.pendingCargo = new Map(parsed.pendingCargo ?? []);
    memory.currentPlan = parsed.currentPlan ?? null;
    memory.lastReasoningTick = parsed.lastReasoningTick ?? 0;
    memory.notes = parsed.notes ?? [];
    return memory;
  }
}
