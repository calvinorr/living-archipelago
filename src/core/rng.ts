/**
 * Seeded Random Number Generator for deterministic simulation
 * Uses xorshift128+ algorithm for good statistical properties
 */

export interface RNGState {
  s0: number;
  s1: number;
}

export class SeededRNG {
  private state: RNGState;

  constructor(seed: number) {
    // Initialize state from seed using splitmix64
    this.state = this.initializeFromSeed(seed);
  }

  private initializeFromSeed(seed: number): RNGState {
    // Use splitmix64 to generate initial state
    let s = seed >>> 0;

    s = ((s >>> 16) ^ s) * 0x45d9f3b;
    s = ((s >>> 16) ^ s) * 0x45d9f3b;
    s = (s >>> 16) ^ s;
    const s0 = s >>> 0;

    s = ((s >>> 16) ^ s) * 0x45d9f3b;
    s = ((s >>> 16) ^ s) * 0x45d9f3b;
    s = (s >>> 16) ^ s;
    const s1 = s >>> 0;

    return { s0: s0 || 1, s1: s1 || 1 }; // Ensure non-zero
  }

  /**
   * Get current state for serialization
   */
  getState(): RNGState {
    return { ...this.state };
  }

  /**
   * Restore from serialized state
   */
  setState(state: RNGState): void {
    this.state = { ...state };
  }

  /**
   * Generate next random uint32
   */
  private next(): number {
    const s0 = this.state.s0;
    let s1 = this.state.s1;

    const result = (s0 + s1) >>> 0;

    s1 ^= s0;
    this.state.s0 = (((s0 << 55) | (s0 >>> 9)) ^ s1 ^ (s1 << 14)) >>> 0;
    this.state.s1 = ((s1 << 36) | (s1 >>> 28)) >>> 0;

    return result;
  }

  /**
   * Generate random float in [0, 1)
   */
  random(): number {
    return this.next() / 0x100000000;
  }

  /**
   * Generate random float in [min, max)
   */
  randomRange(min: number, max: number): number {
    return min + this.random() * (max - min);
  }

  /**
   * Generate random integer in [min, max] inclusive
   */
  randomInt(min: number, max: number): number {
    return Math.floor(this.randomRange(min, max + 1));
  }

  /**
   * Generate random boolean with given probability
   */
  randomBool(probability: number = 0.5): boolean {
    return this.random() < probability;
  }

  /**
   * Pick random element from array
   */
  pick<T>(array: readonly T[]): T {
    if (array.length === 0) {
      throw new Error('Cannot pick from empty array');
    }
    return array[this.randomInt(0, array.length - 1)];
  }

  /**
   * Shuffle array in place (Fisher-Yates)
   */
  shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = this.randomInt(0, i);
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  /**
   * Generate normally distributed random number (Box-Muller)
   */
  randomNormal(mean: number = 0, stddev: number = 1): number {
    const u1 = this.random();
    const u2 = this.random();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z0 * stddev;
  }

  /**
   * Sample from exponential distribution
   */
  randomExponential(lambda: number): number {
    return -Math.log(1 - this.random()) / lambda;
  }

  /**
   * Weighted random selection
   */
  weightedPick<T>(items: readonly T[], weights: readonly number[]): T {
    if (items.length !== weights.length) {
      throw new Error('Items and weights must have same length');
    }
    if (items.length === 0) {
      throw new Error('Cannot pick from empty array');
    }

    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    let threshold = this.random() * totalWeight;

    for (let i = 0; i < items.length; i++) {
      threshold -= weights[i];
      if (threshold <= 0) {
        return items[i];
      }
    }

    return items[items.length - 1];
  }
}

/**
 * Create a hash from state for determinism verification
 */
export function hashState(obj: unknown): string {
  const str = JSON.stringify(obj, (_, value) => {
    if (value instanceof Map) {
      return Array.from(value.entries()).sort((a, b) =>
        String(a[0]).localeCompare(String(b[0]))
      );
    }
    return value;
  });

  // Simple hash function (djb2)
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16);
}
