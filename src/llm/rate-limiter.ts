/**
 * LLM Rate Limiter
 * Budgets LLM calls per session to control costs
 */

/**
 * Rate limiter configuration
 */
export interface RateLimiterConfig {
  /** Maximum calls per session */
  maxCallsPerSession: number;
  /** Session duration in milliseconds (default: 3 hours) */
  sessionDurationMs: number;
  /** Minimum interval between calls in ms (prevents bursts) */
  minIntervalMs: number;
  /** Warning threshold (fraction of budget remaining) */
  warningThreshold: number;
}

const DEFAULT_CONFIG: RateLimiterConfig = {
  maxCallsPerSession: 180, // Upper bound for 3-hour session
  sessionDurationMs: 3 * 60 * 60 * 1000, // 3 hours
  minIntervalMs: 1000, // 1 second between calls
  warningThreshold: 0.2, // Warn when 20% budget remaining
};

/**
 * Rate limiter status
 */
export interface RateLimiterStatus {
  callsRemaining: number;
  callsMade: number;
  percentUsed: number;
  sessionTimeRemaining: number;
  isLowBudget: boolean;
  canCall: boolean;
}

/**
 * Rate Limiter for LLM calls
 */
export class RateLimiter {
  private config: RateLimiterConfig;
  private callCount: number = 0;
  private sessionStartTime: number;
  private lastCallTime: number = 0;
  private callHistory: number[] = [];

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.sessionStartTime = Date.now();
  }

  /**
   * Check if a call is allowed
   */
  canCall(): boolean {
    // Check budget
    if (this.callCount >= this.config.maxCallsPerSession) {
      return false;
    }

    // Check session expiry
    if (this.isSessionExpired()) {
      return false;
    }

    // Check minimum interval
    const timeSinceLastCall = Date.now() - this.lastCallTime;
    if (timeSinceLastCall < this.config.minIntervalMs) {
      return false;
    }

    return true;
  }

  /**
   * Record a call
   * @returns true if call was recorded, false if budget exceeded
   */
  recordCall(): boolean {
    if (!this.canCall()) {
      return false;
    }

    this.callCount++;
    this.lastCallTime = Date.now();
    this.callHistory.push(this.lastCallTime);

    // Keep only last 100 calls in history
    if (this.callHistory.length > 100) {
      this.callHistory.shift();
    }

    return true;
  }

  /**
   * Get current status
   */
  getStatus(): RateLimiterStatus {
    const callsRemaining = Math.max(0, this.config.maxCallsPerSession - this.callCount);
    const percentUsed = this.callCount / this.config.maxCallsPerSession;
    const sessionTimeRemaining = Math.max(
      0,
      this.config.sessionDurationMs - (Date.now() - this.sessionStartTime)
    );

    return {
      callsRemaining,
      callsMade: this.callCount,
      percentUsed,
      sessionTimeRemaining,
      isLowBudget: callsRemaining / this.config.maxCallsPerSession <= this.config.warningThreshold,
      canCall: this.canCall(),
    };
  }

  /**
   * Check if budget is running low
   */
  isLowBudget(): boolean {
    const remaining = this.config.maxCallsPerSession - this.callCount;
    return remaining / this.config.maxCallsPerSession <= this.config.warningThreshold;
  }

  /**
   * Check if session has expired
   */
  isSessionExpired(): boolean {
    return Date.now() - this.sessionStartTime > this.config.sessionDurationMs;
  }

  /**
   * Get estimated calls per hour based on current usage
   */
  getCallsPerHour(): number {
    if (this.callHistory.length < 2) return 0;

    const duration = this.callHistory[this.callHistory.length - 1] - this.callHistory[0];
    if (duration <= 0) return 0;

    return (this.callHistory.length / duration) * 60 * 60 * 1000;
  }

  /**
   * Estimate if budget will last for remaining session
   */
  willBudgetLast(): boolean {
    const callsPerHour = this.getCallsPerHour();
    if (callsPerHour === 0) return true;

    const hoursRemaining =
      (this.config.sessionDurationMs - (Date.now() - this.sessionStartTime)) / (60 * 60 * 1000);

    const estimatedRemainingCalls = callsPerHour * hoursRemaining;
    return estimatedRemainingCalls <= this.config.maxCallsPerSession - this.callCount;
  }

  /**
   * Reset the rate limiter (new session)
   */
  reset(): void {
    this.callCount = 0;
    this.sessionStartTime = Date.now();
    this.lastCallTime = 0;
    this.callHistory = [];
  }

  /**
   * Get suggested delay before next call (for throttling)
   */
  getSuggestedDelay(): number {
    const timeSinceLastCall = Date.now() - this.lastCallTime;
    const remainingDelay = this.config.minIntervalMs - timeSinceLastCall;

    if (remainingDelay > 0) {
      return remainingDelay;
    }

    // If budget is low, suggest longer delays
    if (this.isLowBudget()) {
      const status = this.getStatus();
      const hoursRemaining = status.sessionTimeRemaining / (60 * 60 * 1000);

      if (hoursRemaining > 0 && status.callsRemaining > 0) {
        // Spread remaining calls evenly over remaining time
        const msPerCall = status.sessionTimeRemaining / status.callsRemaining;
        return Math.max(this.config.minIntervalMs, msPerCall);
      }
    }

    return 0;
  }

  /**
   * Format status for logging
   */
  formatStatus(): string {
    const status = this.getStatus();
    const hoursRemaining = (status.sessionTimeRemaining / (60 * 60 * 1000)).toFixed(1);

    return (
      `LLM Budget: ${status.callsMade}/${this.config.maxCallsPerSession} ` +
      `(${(status.percentUsed * 100).toFixed(0)}%) | ` +
      `${hoursRemaining}h remaining` +
      (status.isLowBudget ? ' [LOW BUDGET]' : '')
    );
  }
}

/**
 * Create a rate limiter with preset configurations
 */
export function createRateLimiter(
  preset: 'conservative' | 'balanced' | 'aggressive' = 'balanced'
): RateLimiter {
  const presets: Record<string, Partial<RateLimiterConfig>> = {
    conservative: {
      maxCallsPerSession: 60,
      minIntervalMs: 3000,
      warningThreshold: 0.3,
    },
    balanced: {
      maxCallsPerSession: 120,
      minIntervalMs: 2000,
      warningThreshold: 0.2,
    },
    aggressive: {
      maxCallsPerSession: 180,
      minIntervalMs: 1000,
      warningThreshold: 0.15,
    },
  };

  return new RateLimiter(presets[preset]);
}
