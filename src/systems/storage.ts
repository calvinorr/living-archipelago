/**
 * Storage System
 * Handles spoilage of goods stored in island inventories
 * Storage conditions are better than ship cargo, so rates are reduced
 */

import type { IslandState, GoodId } from '../core/types.js';

/**
 * Storage spoilage rates per tick (much lower than cargo spoilage)
 * - Fish: 0.5% per tick (vs 2% on ships)
 * - Grain: 0.1% per tick (vs 0.5% on ships)
 * - Timber, Tools, Luxuries: 0% (don't spoil in storage)
 */
const STORAGE_SPOILAGE_RATES: Record<string, number> = {
  fish: 0.005,    // 0.5% per tick
  grain: 0.001,   // 0.1% per tick
  timber: 0,
  tools: 0,
  luxuries: 0,
};

/**
 * Result of storage spoilage calculation
 */
export interface StorageSpoilageResult {
  newInventory: Map<GoodId, number>;
  spoilageLoss: Map<GoodId, number>;
}

/**
 * Apply spoilage to island inventory
 * Uses simple percentage decay (not exponential like cargo)
 *
 * @param island - Island state with inventory to process
 * @param dt - Time delta (hours)
 * @returns New inventory and spoilage losses
 */
export function applyStorageSpoilage(
  island: IslandState,
  dt: number
): StorageSpoilageResult {
  const newInventory = new Map<GoodId, number>();
  const spoilageLoss = new Map<GoodId, number>();

  for (const [goodId, quantity] of island.inventory) {
    const rate = STORAGE_SPOILAGE_RATES[goodId] ?? 0;

    if (rate > 0 && quantity > 0) {
      // Apply simple percentage decay scaled by dt
      const spoiled = quantity * rate * dt;
      const remaining = Math.max(0, quantity - spoiled);

      newInventory.set(goodId, remaining);

      if (spoiled > 0.001) {
        spoilageLoss.set(goodId, spoiled);
      }
    } else {
      // Non-perishable or empty
      newInventory.set(goodId, quantity);
    }
  }

  return { newInventory, spoilageLoss };
}
