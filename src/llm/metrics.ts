/**
 * LLM Metrics Tracker
 * Tracks token usage, costs, and latency for LLM calls
 */

/**
 * Record of a single LLM call
 */
export interface LLMCallRecord {
  id: string;
  timestamp: number;
  model: string;
  promptSummary: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
  estimatedCostUsd: number;
  finishReason: string;
}

/**
 * Summary of all LLM metrics for the session
 */
export interface LLMMetricsSummary {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  avgLatencyMs: number;
  callsPerMinute: number;
  recentCalls: LLMCallRecord[];
}

/**
 * Pricing per 1M tokens for supported models
 */
const PRICING: Record<string, { input: number; output: number }> = {
  // Gemini models
  'gemini-2.0-flash': { input: 0.10, output: 0.40 },
  'gemini-1.5-flash': { input: 0.075, output: 0.30 },
  'gemini-1.5-flash-8b': { input: 0.0375, output: 0.15 }, // Cheapest Gemini!
  'gemini-1.5-pro': { input: 1.25, output: 5.00 },
  // Groq (free tier)
  'llama-3.1-8b-instant': { input: 0, output: 0 },
  'llama-3.1-70b-versatile': { input: 0, output: 0 },
  'mixtral-8x7b-32768': { input: 0, output: 0 },
  // Mock
  'mock-llm': { input: 0, output: 0 },
};

type MetricsListener = (record: LLMCallRecord) => void;

/**
 * LLM Metrics Tracker
 * Singleton class for tracking all LLM call metrics
 */
export class LLMMetrics {
  private calls: LLMCallRecord[] = [];
  private listeners: Set<MetricsListener> = new Set();
  private sessionStartTime: number = Date.now();
  private callIdCounter: number = 0;

  /**
   * Calculate estimated cost for a call
   */
  calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    const pricing = PRICING[model] ?? PRICING['gemini-2.0-flash'];
    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;
    return inputCost + outputCost;
  }

  /**
   * Generate a unique call ID
   */
  generateCallId(): string {
    return `llm-${++this.callIdCounter}-${Date.now()}`;
  }

  /**
   * Record a completed LLM call
   */
  record(call: Omit<LLMCallRecord, 'id' | 'estimatedCostUsd'> & { id?: string }): LLMCallRecord {
    const id = call.id ?? this.generateCallId();
    const estimatedCostUsd = this.calculateCost(call.model, call.inputTokens, call.outputTokens);

    const record: LLMCallRecord = {
      ...call,
      id,
      estimatedCostUsd,
    };

    this.calls.push(record);

    // Keep only last 500 calls to prevent memory bloat
    if (this.calls.length > 500) {
      this.calls.shift();
    }

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(record);
      } catch (error) {
        console.error('[LLMMetrics] Listener error:', error);
      }
    }

    // Log to console
    this.logCall(record);

    return record;
  }

  /**
   * Log call to console
   */
  private logCall(record: LLMCallRecord): void {
    const costStr = `$${record.estimatedCostUsd.toFixed(6)}`;
    const promptPreview = record.promptSummary.length > 50
      ? record.promptSummary.slice(0, 50) + '...'
      : record.promptSummary;

    console.log(
      `[LLM] ${record.model} | in:${record.inputTokens} out:${record.outputTokens} | ` +
      `${costStr} | ${record.latencyMs}ms | "${promptPreview}"`
    );

    // Log session summary every 5 calls
    if (this.calls.length % 5 === 0) {
      const summary = this.getSummary();
      console.log(
        `[LLM] Session: ${summary.totalCalls} calls | ` +
        `${summary.totalTokens.toLocaleString()} tokens | ` +
        `$${summary.totalCostUsd.toFixed(4)} total`
      );
    }
  }

  /**
   * Get metrics summary
   */
  getSummary(): LLMMetricsSummary {
    const totalCalls = this.calls.length;
    const totalInputTokens = this.calls.reduce((sum, c) => sum + c.inputTokens, 0);
    const totalOutputTokens = this.calls.reduce((sum, c) => sum + c.outputTokens, 0);
    const totalTokens = totalInputTokens + totalOutputTokens;
    const totalCostUsd = this.calls.reduce((sum, c) => sum + c.estimatedCostUsd, 0);
    const avgLatencyMs = totalCalls > 0
      ? this.calls.reduce((sum, c) => sum + c.latencyMs, 0) / totalCalls
      : 0;

    // Calculate calls per minute
    const sessionDurationMin = (Date.now() - this.sessionStartTime) / 60000;
    const callsPerMinute = sessionDurationMin > 0 ? totalCalls / sessionDurationMin : 0;

    return {
      totalCalls,
      totalInputTokens,
      totalOutputTokens,
      totalTokens,
      totalCostUsd,
      avgLatencyMs: Math.round(avgLatencyMs),
      callsPerMinute: Math.round(callsPerMinute * 100) / 100,
      recentCalls: this.calls.slice(-50),
    };
  }

  /**
   * Get recent calls
   */
  getRecentCalls(limit: number = 50): LLMCallRecord[] {
    return this.calls.slice(-limit);
  }

  /**
   * Subscribe to new call records
   * @returns Unsubscribe function
   */
  subscribe(listener: MetricsListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.calls = [];
    this.sessionStartTime = Date.now();
    this.callIdCounter = 0;
  }
}

// Singleton instance
export const llmMetrics = new LLMMetrics();
