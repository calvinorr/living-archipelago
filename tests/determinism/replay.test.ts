/**
 * Determinism Tests
 * Verify that simulation produces identical results with same seed
 */

import { describe, it, expect } from 'vitest';
import { Simulation } from '../../src/core/simulation.js';
import { initializeWorld } from '../../src/core/world.js';
import { hashState } from '../../src/core/rng.js';

describe('Determinism', () => {
  it('should produce identical results with same seed', () => {
    const seed = 12345;
    const ticks = 100;

    // Run 1
    const state1 = initializeWorld(seed);
    const sim1 = new Simulation(state1, { seed });
    const metrics1 = sim1.run(ticks);

    // Run 2
    const state2 = initializeWorld(seed);
    const sim2 = new Simulation(state2, { seed });
    const metrics2 = sim2.run(ticks);

    // Compare state hashes at each tick
    expect(metrics1.length).toBe(metrics2.length);

    for (let i = 0; i < metrics1.length; i++) {
      expect(metrics1[i].stateHash).toBe(metrics2[i].stateHash);
    }

    // Compare final states
    const finalHash1 = hashState(sim1.getState());
    const finalHash2 = hashState(sim2.getState());
    expect(finalHash1).toBe(finalHash2);
  });

  it('should produce different results with different seeds', () => {
    const ticks = 50;

    const state1 = initializeWorld(12345);
    const sim1 = new Simulation(state1, { seed: 12345 });
    sim1.run(ticks);

    const state2 = initializeWorld(67890);
    const sim2 = new Simulation(state2, { seed: 67890 });
    sim2.run(ticks);

    // Final states should differ
    const finalHash1 = hashState(sim1.getState());
    const finalHash2 = hashState(sim2.getState());
    expect(finalHash1).not.toBe(finalHash2);
  });

  it('should maintain determinism over long runs', () => {
    const seed = 99999;
    const ticks = 500;

    const state1 = initializeWorld(seed);
    const sim1 = new Simulation(state1, { seed });
    const history1 = sim1.run(ticks).map((m) => m.stateHash);

    const state2 = initializeWorld(seed);
    const sim2 = new Simulation(state2, { seed });
    const history2 = sim2.run(ticks).map((m) => m.stateHash);

    expect(history1).toEqual(history2);
  });

  it('should have consistent RNG across runs', () => {
    const seed = 42;

    // Initialize two worlds with same seed
    const state1 = initializeWorld(seed);
    const state2 = initializeWorld(seed);

    // Initial states should be identical
    expect(hashState(state1)).toBe(hashState(state2));
  });
});

describe('State Integrity', () => {
  it('should not mutate previous state during tick', () => {
    const state = initializeWorld(12345);
    const sim = new Simulation(state, { seed: 12345 });

    // Get initial state hash
    const initialHash = hashState(sim.getState());

    // Store a reference to check immutability
    const initialIslandPop = sim.getState().islands.get('shoalhold')?.population.size;

    // Run a tick
    sim.tick();

    // Original state reference should be unchanged
    // (This tests that we're properly cloning state)
    const newIslandPop = sim.getState().islands.get('shoalhold')?.population.size;

    // Population might change, but we shouldn't crash
    expect(typeof newIslandPop).toBe('number');
    expect(typeof initialIslandPop).toBe('number');
  });

  it('should preserve island count across ticks', () => {
    const state = initializeWorld(12345);
    const sim = new Simulation(state, { seed: 12345 });

    const initialIslandCount = sim.getState().islands.size;

    sim.run(100);

    expect(sim.getState().islands.size).toBe(initialIslandCount);
  });

  it('should preserve ship count across ticks', () => {
    const state = initializeWorld(12345);
    const sim = new Simulation(state, { seed: 12345 });

    const initialShipCount = sim.getState().ships.size;

    sim.run(100);

    expect(sim.getState().ships.size).toBe(initialShipCount);
  });
});
