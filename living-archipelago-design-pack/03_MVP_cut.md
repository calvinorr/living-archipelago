# Living Archipelago – MVP Cut (3 islands, 5 goods)

## Purpose
Deliver a playable, stable prototype within 2–4 weeks that demonstrates:
- Local price formation
- Profitable arbitrage that self-erodes
- Ecology-driven supply constraints
- Population health feedback
- Shocks (storms/festival/blight) that perturb, not dictate

---

## Scope

### Islands (3)
1. **Shoalhold (Fishing Isle)**
   - Strong fish stock, weak soil fertility
   - Imports: tools, grain
   - Exports: fish

2. **Greenbarrow (Agricultural Isle)**
   - Strong soil fertility, limited forest
   - Imports: tools, timber (small)
   - Exports: grain

3. **Timberwake (Forest Isle)**
   - Strong forest biomass, weak food production
   - Imports: grain
   - Exports: timber

### Goods (5)
1. **Fish** (food, perishable, high spoilage)
2. **Grain** (food, low spoilage)
3. **Timber** (material, no spoilage)
4. **Tools** (tool, no spoilage; boosts production)
5. **Luxuries** (luxury, no spoilage; optional in MVP—can be a “festival-only” good)

### Ships
- Start with **1 sloop** (capacity moderate, speed moderate)
- Unlock 2nd ship after reliability milestone (optional)

### Events (3–4)
- **Storm**: slows ships, increases spoilage for fish
- **Blight**: reduces soil fertility regen temporarily on Greenbarrow
- **Festival**: demand spike for Luxuries + small food spike
- (Optional) **Discovery**: one-time boost to tool efficiency

---

## Core KPIs to show in UI
- Island: food days of cover, stock levels, fish/forest/soil health
- Market: prices with trend arrows + “why” tooltip
- Player: net worth, average route profit, spoilage losses

---

## Acceptance Criteria (MVP)
1. Player can profit by moving grain/timber/tools early, but routes equilibrate.
2. If player over-extracts fish (by making Shoalhold depend on fish export), fish stock declines and prices spike.
3. Importing tools to an island measurably improves its production and reduces volatility.
4. Storm events meaningfully change player decisions (fish spoilage risk).
5. Simulation is deterministic with a seed and input log.

