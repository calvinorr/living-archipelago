# Living Archipelago – PRD (Gameplay-Focused)

## 1. Product Overview
**Product Name:** Living Archipelago  
**Genre:** Real-time simulation / strategy / trading  
**Platform:** Web (desktop-first; responsive where feasible)  
**Typical Session Length:** 1–3 hours (soft real-time, pausable)  
**Primary Player Loop:** Observe → Plan routes → Trade → Stabilize/Exploit → Respond to shocks → Iterate

### High-level promise
A living archipelago where **ecology**, **population**, and **markets** co-evolve in real time. Player choices generate emergent narratives: boom–bust cycles, resource collapse and recovery, migration waves, and the rise/fall of trade hubs.

---

## 2. Goals and Non-Goals

### Goals
1. **Emergent, organic outcomes** driven by system dynamics, not scripts.
2. **Readable complexity**: deep but explainable; the player can form mental models.
3. **Meaningful logistics**: distance, time, capacity, spoilage, and weather influence decisions.
4. **Soft real-time**: the world keeps moving; the player can pause and change speed.
5. **No dominant strategy**: any profitable route should degrade over time as markets adapt.

### Non-Goals (initial releases)
- Full political simulation, warfare, diplomacy trees
- Multiplayer economies
- Hardcore “hard real-time” guarantees

---

## 3. Audience and Positioning (internal)
- Players who enjoy: economic sims, logistics puzzles, emergent ecology, “digital terrarium” worlds.
- Comparable feel (not direct clones): small-scale Anno-like trade loops, ecological feedback like classic ecosystem sims, systemic stories like colony sims.

---

## 4. Core Fantasy and Pillars

### Core fantasy
You are a trader-captain operating within a living world. You cannot directly control islands—only influence them through flows of goods and the consequences of scarcity/abundance.

### Design pillars
1. **Living systems first**: Ecology and population drive supply; markets respond locally.
2. **Consequences unfold over time**: Over-harvesting creates delayed pain; recovery is possible but slow.
3. **Local markets, not global prices**: Arbitrage exists but erodes as conditions change.
4. **Clarity through strong UI**: The player sees *why* prices and stocks change.
5. **Events perturb, not dictate**: Storms, blights, festivals nudge systems; they do not hard-script outcomes.

---

## 5. World Structure

### 5.1 Map
- 8–12 islands at start (MVP: 3 islands)
- 2D map with navigable sea lanes (continuous space; optional lane bias for readability)
- Travel time = distance / ship speed, modified by weather.

### 5.2 Island archetypes (templates)
| Archetype | Strengths | Dependencies | Typical failure mode |
|---|---|---|---|
| Fishing Isle | Food exports (fish) | Tools | Fish stock collapse → famine |
| Forest Isle | Timber exports | Food imports | Deforestation → timber crash |
| Agricultural Isle | Grain exports | Tools | Soil depletion → yield drop |
| Industrial Isle | Tools production | Food + timber | Input shortage → productivity crash |
| Trade Hub | High liquidity | Constant imports | Volatility spikes → unrest/migration |

---

## 6. Systems (Gameplay Requirements)

### 6.1 Ecology (renewable resources)
Each island has renewable resource pools (initial set):
- **Fish stock** (supports fish production)
- **Forest biomass** (supports timber production)
- **Soil fertility** (supports grain yield; degrades with overuse)

Requirements:
- Regeneration with carrying capacity and natural recovery.
- Over-harvest/overuse imposes *nonlinear* penalties.
- Collapse states are possible but recoverable with time and reduced pressure.

### 6.2 Population (demand + productivity)
Population is dynamic:
- **Size**
- **Health** (0–1)
- **Labour allocation** (shares across sectors)
- **Productivity** (derived from health and tools)

Population rules:
- Food deficit reduces health; severe deficit reduces population.
- Sustained surplus improves health and modestly increases population.
- Labour allocation shifts based on relative profitability and shortages (island AI).

### 6.3 Production & consumption
- **Production** depends on: ecosystem availability, labour allocation, and tools.
- **Consumption** is continuous and mandatory for food; optional for materials/luxuries.
- Tools act as a multiplier for primary production (with diminishing returns).

### 6.4 Local markets & price formation
- No global market; each island has its own inventory and price per good.
- Prices update continuously based on:
  - Inventory pressure (stock vs ideal)
  - Consumption velocity (drawdown rate)
  - Short-term momentum (to prevent jitter)
  - Transport friction (distance/latency effects optional)

### 6.5 Trade & logistics
Player controls:
- Ship routing and timing
- Buy/sell quantities
- Fleet expansion (later)

Constraints:
- Capacity and draft limits
- Spoilage for perishables (fish)
- Weather delays
- Port throughput (optional later; MVP: simplified)

### 6.6 Events & shocks
Event types:
- Storm (delays ships, increases spoilage risk)
- Blight (reduces soil fertility temporarily)
- Festival (temporary demand spike, especially for luxuries)
- Discovery (unlocks new good/efficiency modifier)

Design: Events adjust parameters for a duration; they do not directly set inventory/price.

---

## 7. Player Experience

### 7.1 Primary decisions
- Which island needs what now vs what will need soon
- Whether to stabilize (reduce volatility) or exploit (arbitrage)
- Risk management: perishables vs durable goods; long route vs short route

### 7.2 Feedback and readability
UI must communicate:
- Why prices changed (tooltip decomposition)
- Which constraint is binding (food, tools, ecology)
- Forecast signals (e.g., “fish stock declining”)

### 7.3 Difficulty curve
- Early: simple arbitrage, small fleet
- Mid: shocks + ecological constraints; player must plan
- Late: systemic complexity; stability becomes strategic

---

## 8. Progression and Unlocks
Progression is systemic, not XP:
- Unlock ship classes via sustained trade volume and stability.
- Unlock warehousing and contracts via reliability (fulfillment rate).
- Unlock “ecology projects” (fishery limits, replanting) via diplomacy/investment (later).

---

## 9. Victory / Loss
No hard “game over.”
- World can enter “stagnation” (low productivity, high volatility).
- Recovery remains possible; player must adapt.

---

## 10. Content Scope (Initial)
**Islands:** 8–12 (MVP: 3)  
**Goods:** 10–16 (MVP: 5)  
**Ship types:** 3 (MVP: 1–2)  
**Events:** 8–12 (MVP: 3–4)  

---

## 11. Acceptance Criteria (MVP)
1. Prices exhibit realistic movement (no unbounded spirals under normal play).
2. Over-trading a route reduces its profitability within 10–20 minutes of real play.
3. Ecological collapse can occur and is visible in UI signals.
4. Player can stabilize at least one island through trade decisions.
5. Deterministic replay from a seed produces identical outcomes (simulation core).

