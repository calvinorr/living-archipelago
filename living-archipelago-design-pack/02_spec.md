# Living Archipelago – spec.md (Simulation & Technical Specification)

## 1. Simulation Model
**Type:** Deterministic, soft real-time simulation with a fixed tick and event perturbations.  
**Default Tick:** 1 second real time = 1 in-game hour (configurable).  
**Time Controls:** Pause, 1×, 2×, 4× (optionally 8× in dev mode).

### Determinism requirements
- Single authoritative simulation clock.
- Simulation state updates are pure and order-defined.
- RNG seeded; all random draws via a central RNG stream.

---

## 2. Canonical Data Structures

### 2.1 Goods
Each good has meta and mechanics properties.

```yaml
Good:
  id: string
  name: string
  category: [food, material, tool, luxury]
  base_price: float
  spoilage_rate_per_hour: float   # 0 for non-perishables
  bulkiness: float               # space per unit, affects capacity
```

### 2.2 Island State
```yaml
Island:
  id: string
  name: string
  pos: {x: float, y: float}

  ecosystem:
    fish_stock: float            # 0..K_fish
    forest_biomass: float        # 0..K_forest
    soil_fertility: float        # 0..1

  population:
    size: float                  # continuous for stability; render rounded
    health: float                # 0..1
    labour:
      fishing: float             # shares sum to 1
      forestry: float
      farming: float
      industry: float
      services: float

  inventory: {good_id: float}

  market:
    price: {good_id: float}
    ideal_stock: {good_id: float}     # tuning knob (per island)
    momentum: {good_id: float}        # for smoothing price change

  production_params:
    base_rate: {good_id: float}       # per hour
    tool_sensitivity: {good_id: float}
    ecosystem_sensitivity: {good_id: float}
```

### 2.3 Ship State
```yaml
Ship:
  id: string
  name: string
  capacity: float                   # capacity in cargo-volume units
  speed: float                      # distance per hour
  cash: float

  cargo: {good_id: float}
  location:
    kind: [at_island, at_sea]
    island_id: string|null
    pos: {x: float, y: float}|null

  route:
    from_island: string
    to_island: string
    eta_hours: float
    progress: float                 # 0..1 (optional)
```

### 2.4 Events (Perturbations)
```yaml
Event:
  id: string
  type: [storm, blight, festival, discovery]
  target: island_id|ship_id|region
  start_time: t
  end_time: t
  modifiers: dict
```

---

## 3. Ecology Model

### 3.1 Logistic regeneration
For each renewable resource R with carrying capacity K and regen rate r:

```
R_{t+1} = clamp( R_t + dt * ( r * R_t * (1 - R_t / K) - harvest_t ), 0, K )
```

Where:
- dt is in-game hours per tick (default 1)
- harvest_t is derived from production draw on the resource

### 3.2 Soil fertility dynamics (simplified)
Soil fertility is 0..1:

```
fert_{t+1} = clamp( fert_t + dt * ( regen - depletion ), 0, 1 )
depletion = a * farming_labor * intensity
regen = b * (1 - farming_intensity) + c * fallow_bonus
```

MVP simplification: represent soil fertility as:
- decreases with grain production, recovers slowly when grain production is low.

---

## 4. Production & Consumption

### 4.1 Effective production per good
```
effective_prod = base_rate[good] 
                 * labour_modifier(sector_share) 
                 * ecosystem_modifier(resource_level) 
                 * tool_modifier(tool_availability)
                 * health_modifier(pop_health)
```

Recommended modifiers:
- labour_modifier(s) = (s / s_ref) ^ alpha, capped
- ecosystem_modifier = 0.2 + 0.8 * (resource / resource_ref) (prevents total zeroing)
- tool_modifier = 1 + beta * log(1 + tools_per_capita)
- health_modifier = 0.5 + 0.5 * health

### 4.2 Consumption
Food consumption per hour:
```
food_needed = pop_size * food_per_capita
```
If food inventory < needed:
- consume what exists
- apply health penalty proportional to deficit
- if health below threshold for sustained period, reduce population size

Materials/luxury consumption optional:
- luxuries increase stability/health slightly (small bonus)

---

## 5. Market & Price Formation

### 5.1 Inventory pressure
Let s = current stock, s* = ideal stock:

```
pressure = (s* / max(s, eps)) ^ gamma
```

### 5.2 Velocity term
Let v be recent consumption rate estimate:
```
velocity = 1 + k_v * (v / max(v_ref, eps))
```

### 5.3 Momentum / smoothing
Use an EMA to smooth price updates:

```
raw_price = base_price * pressure * velocity * event_modifiers
price_{t+1} = price_t + lambda * (raw_price - price_t)
```

Constraints:
- price clamped within [min_price, max_price] to prevent explosions during tuning.
- Later: remove clamps once stability is validated.

---

## 6. Shipping, Spoilage, and Transactions

### 6.1 Ship movement
Each tick:
- reduce ETA by dt
- if ETA <= 0: arrive, transition to at_island, trigger dock actions

### 6.2 Spoilage
For perishable goods in cargo:
```
cargo_{t+1} = cargo_t * exp(-spoilage_rate_per_hour * dt * spoilage_weather_multiplier)
```

### 6.3 Trade execution (player action)
At an island:
- Buying decreases island inventory and increases ship cargo; pays island price.
- Selling increases island inventory; ship receives island price.
- Optional: port fee / tariff.

---

## 7. Event System

### 7.1 Event generation
Each tick, compute event probabilities dependent on current state:
- storm chance increases with seasonality and regional shipping density
- blight chance increases with low soil fertility
- festival chance increases with population health and stability

### 7.2 Event application
Events apply temporary modifiers:
- storm: ship speed multiplier < 1, spoilage multiplier > 1
- blight: soil fertility regen multiplier < 1, grain production cap < 1
- festival: luxury demand multiplier > 1, food demand multiplier slightly > 1

---

## 8. Migration (Population Flow)

Trigger conditions (evaluated per island):
- sustained food deficit (N ticks)
- high price volatility (stddev threshold)
- low health below threshold

Migration model (simple):
- fraction m leaves per hour
- destination chosen by weighted attractiveness:
  - food surplus
  - lower prices for food
  - higher employment productivity

---

## 9. Tick Order (Authoritative)
1. Apply event modifiers (start/end)
2. Ecology regeneration (fish/forest/soil)
3. Production (add goods, subtract resource harvest)
4. Consumption (subtract goods, apply deficit effects)
5. Population update (health, size, labour reallocation)
6. Price update (EMA smoothing)
7. Ship movement + spoilage
8. Arrival resolution (dock, optional auto-unload/load policies)
9. Metrics logging (telemetry/debug)

---

## 10. Observability & Debugging
- State snapshots every N ticks (dev)
- Deterministic replay: seed + input log
- Inspectors:
  - island dashboard (inventory, prices, ecosystem, population)
  - price decomposition (pressure, velocity, modifiers)
  - trade flow graph (per route)

---

## 11. Performance Targets
- 12 islands, 20 goods, 20 ships: ≤ 8ms/tick in JS on modern desktop.
- UI rendering decoupled from sim (e.g., render at 10–30 FPS; sim at 1 tick/sec).

---

## 12. Extensibility Hooks
- Piracy/security risk layer (route risk)
- Insurance market
- Contracts/futures (promises with penalties)
- Climate drift (long-term parameter shifts)

