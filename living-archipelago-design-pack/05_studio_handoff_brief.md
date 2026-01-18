# Living Archipelago – Studio / Contractor Handoff Brief

## 1. Objective
Build a web-based, real-time simulation game prototype demonstrating a living eco-economic archipelago. Deliver an MVP that is playable, stable, and extensible.

---

## 2. Deliverables
### 2.1 Product deliverables
- Playable MVP (3 islands / 5 goods) with:
  - Map view + ship routing
  - Island dashboards (population/ecology/inventory/prices)
  - Trade UI (buy/sell, cargo, cash)
  - Events (storm/blight/festival)
  - Time controls (pause/1×/2×/4×)

### 2.2 Engineering deliverables
- Deterministic simulation core (seed + replay)
- Headless test harness executable
- Basic telemetry logs (CSV/JSON)
- Configuration-driven world definitions (JSON/YAML)
- Documentation:
  - Architecture overview
  - Tuning guide (parameters and effects)

---

## 3. Team Roles (suggested)
- **Game designer / systems designer:** economy tuning, progression, UX loop.
- **Simulation engineer:** deterministic core, stability, parameterization.
- **Frontend engineer:** map UI, dashboards, interaction.
- **UI/UX designer (part-time):** readability, information hierarchy, tooltips.

---

## 4. Recommended Architecture
- **Simulation core**: pure functions, deterministic, decoupled from UI.
- **State store**: single authoritative sim state; UI subscribes to snapshots.
- **Data-driven config**: islands, goods, and archetypes defined in JSON/YAML.
- **Replay log**: record player inputs; reproduce runs exactly.

---

## 5. Key Risks and Mitigations
1. **Runaway prices/oscillation**
   - Mitigation: EMA smoothing, careful pressure curve, clamps during tuning.
2. **Too opaque to players**
   - Mitigation: “Why this changed” decomposition tooltips and trend cues.
3. **Simulation/UI coupling**
   - Mitigation: strict boundary; sim tick independent; UI renders at its own FPS.
4. **Scope creep**
   - Mitigation: MVP cut is mandatory; piracy/politics deferred.

---

## 6. Milestone Plan (Outcome-based)
### Milestone 1: Core sim + CLI (Foundation)
- World loads from config
- Tick loop stable
- Headless runner and determinism tests

### Milestone 2: MVP gameplay loop (Playable)
- Map + ship routing
- Buy/sell
- Prices and inventories visible

### Milestone 3: “Living” feedback (Emergence)
- Ecology impacts production
- Population health responds to deficits
- Events perturb state

### Milestone 4: Polish + tuning (Hand-off quality)
- Tooltips and decomposition
- Parameter tuning pass
- Bug fixing and documentation

---

## 7. Definition of Done (MVP)
- Player can play for 60–120 minutes without hard failure.
- System produces at least 2–3 distinct emergent narratives per run:
  - shortage spiral
  - ecological collapse and recovery
  - migration shift and new trade hub formation
- Deterministic replay works for a recorded input log.

