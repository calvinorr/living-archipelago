/**
 * RNG Tests
 * Verify seeded random number generator behavior
 */

import { describe, it, expect } from 'vitest';
import { SeededRNG, hashState } from '../../src/core/rng.js';

describe('SeededRNG', () => {
  it('should produce deterministic sequences', () => {
    const rng1 = new SeededRNG(12345);
    const rng2 = new SeededRNG(12345);

    const seq1 = Array.from({ length: 100 }, () => rng1.random());
    const seq2 = Array.from({ length: 100 }, () => rng2.random());

    expect(seq1).toEqual(seq2);
  });

  it('should produce different sequences for different seeds', () => {
    const rng1 = new SeededRNG(12345);
    const rng2 = new SeededRNG(67890);

    const seq1 = Array.from({ length: 10 }, () => rng1.random());
    const seq2 = Array.from({ length: 10 }, () => rng2.random());

    expect(seq1).not.toEqual(seq2);
  });

  it('should produce values in [0, 1) range', () => {
    const rng = new SeededRNG(42);

    for (let i = 0; i < 1000; i++) {
      const value = rng.random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('should produce uniform distribution', () => {
    const rng = new SeededRNG(12345);
    const buckets = new Array(10).fill(0);

    for (let i = 0; i < 10000; i++) {
      const value = rng.random();
      const bucket = Math.floor(value * 10);
      buckets[bucket]++;
    }

    // Each bucket should have roughly 1000 values (10% tolerance)
    for (const count of buckets) {
      expect(count).toBeGreaterThan(800);
      expect(count).toBeLessThan(1200);
    }
  });

  it('should save and restore state correctly', () => {
    const rng = new SeededRNG(12345);

    // Generate some values
    for (let i = 0; i < 50; i++) {
      rng.random();
    }

    // Save state
    const savedState = rng.getState();

    // Generate more values
    const valuesAfterSave = Array.from({ length: 10 }, () => rng.random());

    // Create new RNG and restore state
    const rng2 = new SeededRNG(99999); // Different seed
    rng2.setState(savedState);

    // Should produce same values
    const restoredValues = Array.from({ length: 10 }, () => rng2.random());

    expect(restoredValues).toEqual(valuesAfterSave);
  });

  it('randomInt should produce integers in range', () => {
    const rng = new SeededRNG(42);

    for (let i = 0; i < 100; i++) {
      const value = rng.randomInt(5, 10);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(5);
      expect(value).toBeLessThanOrEqual(10);
    }
  });

  it('randomRange should produce values in range', () => {
    const rng = new SeededRNG(42);

    for (let i = 0; i < 100; i++) {
      const value = rng.randomRange(-5, 5);
      expect(value).toBeGreaterThanOrEqual(-5);
      expect(value).toBeLessThan(5);
    }
  });

  it('pick should select from array', () => {
    const rng = new SeededRNG(42);
    const items = ['a', 'b', 'c', 'd', 'e'];

    for (let i = 0; i < 100; i++) {
      const picked = rng.pick(items);
      expect(items).toContain(picked);
    }
  });

  it('shuffle should preserve all elements', () => {
    const rng = new SeededRNG(42);
    const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const shuffled = rng.shuffle([...original]);

    expect(shuffled.sort((a, b) => a - b)).toEqual(original);
  });

  it('weightedPick should respect weights', () => {
    const rng = new SeededRNG(42);
    const items = ['rare', 'common'];
    const weights = [1, 99]; // common should be picked ~99% of the time

    let rareCount = 0;
    let commonCount = 0;

    for (let i = 0; i < 1000; i++) {
      const picked = rng.weightedPick(items, weights);
      if (picked === 'rare') rareCount++;
      else commonCount++;
    }

    // Common should be much more frequent
    expect(commonCount).toBeGreaterThan(rareCount * 5);
  });
});

describe('hashState', () => {
  it('should produce consistent hashes', () => {
    const obj = { a: 1, b: 'test', c: [1, 2, 3] };

    const hash1 = hashState(obj);
    const hash2 = hashState(obj);

    expect(hash1).toBe(hash2);
  });

  it('should produce different hashes for different objects', () => {
    const obj1 = { a: 1 };
    const obj2 = { a: 2 };

    expect(hashState(obj1)).not.toBe(hashState(obj2));
  });

  it('should handle Maps correctly', () => {
    const map1 = new Map([
      ['a', 1],
      ['b', 2],
    ]);
    const map2 = new Map([
      ['b', 2],
      ['a', 1],
    ]); // Same content, different insertion order

    // Should produce same hash regardless of insertion order
    expect(hashState(map1)).toBe(hashState(map2));
  });
});
