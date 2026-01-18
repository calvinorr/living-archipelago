# Living Archipelago – Simulation Test Harness (Spec + Minimal Implementation Outline)

## Goal
Provide a repeatable way to validate that the simulation is:
- Deterministic
- Numerically stable (no runaway prices/resources under typical play)
- Producing intended dynamics (equilibrating arbitrage, recoverable collapse)

This harness is designed to be implemented quickly (Node/TS recommended), and to run headless in CI.

---

## 1. Determinism Tests

### 1.1 Seed replay
**Given:** seed S, input log L (player trades, route choices, time controls)  
**When:** run simulation twice  
**Then:** final snapshot hash must match.

**Implementation outline**
- Central RNG with seed
- All randomness uses RNG instance (no Math.random)
- State snapshot canonicalization (sort keys, fixed precision)
- Hash snapshots per tick (or every N ticks)

### 1.2 Floating point drift control
- Use fixed dt (integer hours)
- Clamp and round selected state values at controlled precision for hashing (e.g., 1e-6)
- Avoid time-based real-world clocks in sim core

---

## 2. Stability Tests

### 2.1 Price boundedness under baseline
Run the world with no player actions for 500 ticks:
- Assert prices remain within a tuning band (e.g., [0.2×, 5×] base_price)
- Assert no negative inventories
- Assert ecosystem stocks remain within [0, K]

### 2.2 Shock response
Inject a storm every 50 ticks:
- Assert fish spoilage increases (cargo reduction)
- Assert fish price increases temporarily then stabilizes when shocks stop

### 2.3 Collapse and recovery
Force over-harvest by boosting fish extraction:
- Assert fish_stock hits low levels
- Then reduce harvest to near zero
- Assert fish_stock recovers over time (logistic curve)

---

## 3. Behavioural / Dynamics Tests (Black-box)

### 3.1 Arbitrage erosion
Configure initial conditions with a strong price disparity:
- Simulate a scripted trader that repeatedly runs the “best” route for 100 ticks
- Assert route profit per trip decreases (market adapts)

### 3.2 Tool multiplier effect
Deliver tools to an island for 100 ticks:
- Assert production increases and food deficit decreases
- Assert price volatility reduces

---

## 4. Suggested Headless Runner Interface

### 4.1 CLI
- `simulate --seed 123 --ticks 500 --inputs inputs.json --out out.json`
- Output:
  - final snapshot
  - tick metrics time series
  - per-tick snapshot hashes (optional)

### 4.2 Output metrics
- For each island per tick:
  - population_size, health
  - fish_stock, forest_biomass, soil_fertility
  - inventory levels (food coverage)
  - prices (per good)
- For player per tick:
  - cash, cargo value, spoilage losses, trip profit

---

## 5. Minimal Reference Pseudocode (Implementation Guidance)

```text
initWorld(seed):
  rng = RNG(seed)
  world = buildIslands(rng)
  player = buildPlayer(rng)
  return {world, player, rng}

tick(state, dt=1):
  applyEvents(state)
  regenEcology(state, dt)
  produce(state, dt)
  consume(state, dt)
  updatePopulation(state, dt)
  updatePrices(state, dt)
  moveShips(state, dt)
  resolveArrivals(state)
  logMetrics(state)
  return state
```

---

## 6. CI Recommendations
- Run determinism tests on every commit
- Run stability suite nightly with longer horizons (e.g., 10,000 ticks)
- Capture tuning regression charts from metrics (optional)

