/**
 * Events System
 * Handles event generation and application of temporary modifiers
 * Based on 02_spec.md Section 7
 */

import type {
  WorldEvent,
  EventType,
  EventModifiers,
  IslandState,
  WorldState,
} from '../core/types.js';
import type { SeededRNG } from '../core/rng.js';

/**
 * Event templates with their modifiers and durations
 */
interface EventTemplate {
  type: EventType;
  durationRange: [number, number]; // [min, max] hours
  modifiers: EventModifiers;
  probability: number; // base probability per tick
}

const EVENT_TEMPLATES: Record<EventType, EventTemplate> = {
  storm: {
    type: 'storm',
    durationRange: [12, 48], // 12-48 hours
    modifiers: {
      shipSpeedMultiplier: 0.5,
      spoilageMultiplier: 2.0,
    },
    probability: 0.001, // ~1% per hour
  },
  blight: {
    type: 'blight',
    durationRange: [48, 168], // 2-7 days
    modifiers: {
      soilFertilityRegenMultiplier: 0.3,
      grainProductionMultiplier: 0.6,
    },
    probability: 0.0005,
  },
  festival: {
    type: 'festival',
    durationRange: [24, 72], // 1-3 days
    modifiers: {
      luxuryDemandMultiplier: 2.0,
      foodDemandMultiplier: 1.2,
    },
    probability: 0.001,
  },
  discovery: {
    type: 'discovery',
    durationRange: [168, 336], // 1-2 weeks
    modifiers: {
      toolEfficiencyBoost: 0.2, // 20% boost
    },
    probability: 0.0002,
  },
};

/**
 * Generate a unique event ID
 */
function generateEventId(rng: SeededRNG, tick: number): string {
  return `evt_${tick}_${Math.floor(rng.random() * 10000)}`;
}

/**
 * Calculate event probability based on world state
 */
function calculateEventProbability(
  template: EventTemplate,
  island: IslandState,
  _state: WorldState
): number {
  let probability = template.probability;

  switch (template.type) {
    case 'storm':
      // Storms more likely in certain conditions (could add seasonality)
      break;

    case 'blight':
      // Blight more likely with low soil fertility
      if (island.ecosystem.soilFertility < 0.3) {
        probability *= 2;
      }
      break;

    case 'festival':
      // Festivals more likely with healthy, stable populations
      if (island.population.health > 0.7) {
        probability *= 1.5;
      }
      break;

    case 'discovery':
      // Discoveries more likely with industrial focus
      if (island.population.labour.industry > 0.2) {
        probability *= 1.5;
      }
      break;
  }

  return probability;
}

/**
 * Check if an event type is already active for a target
 */
function isEventTypeActive(
  events: WorldEvent[],
  type: EventType,
  targetId: string,
  currentTick: number
): boolean {
  return events.some(
    (e) =>
      e.type === type &&
      e.targetId === targetId &&
      e.startTick <= currentTick &&
      e.endTick > currentTick
  );
}

/**
 * Generate new events based on world state
 */
export function generateEvents(
  state: WorldState,
  rng: SeededRNG,
  dt: number
): WorldEvent[] {
  const newEvents: WorldEvent[] = [];
  const currentTick = state.tick;

  // Check each island for potential events
  for (const [islandId, island] of state.islands) {
    for (const template of Object.values(EVENT_TEMPLATES)) {
      // Skip if this event type is already active for this island
      if (isEventTypeActive(state.events, template.type, islandId, currentTick)) {
        continue;
      }

      // Skip storm for individual islands (storms are global)
      if (template.type === 'storm') continue;

      const probability = calculateEventProbability(template, island, state);

      if (rng.randomBool(probability * dt)) {
        const duration = rng.randomInt(
          template.durationRange[0],
          template.durationRange[1]
        );

        newEvents.push({
          id: generateEventId(rng, currentTick),
          type: template.type,
          targetId: islandId,
          startTick: currentTick,
          endTick: currentTick + duration,
          modifiers: { ...template.modifiers },
        });
      }
    }
  }

  // Check for global events (storms)
  const stormTemplate = EVENT_TEMPLATES.storm;
  if (!isEventTypeActive(state.events, 'storm', 'global', currentTick)) {
    if (rng.randomBool(stormTemplate.probability * dt)) {
      const duration = rng.randomInt(
        stormTemplate.durationRange[0],
        stormTemplate.durationRange[1]
      );

      newEvents.push({
        id: generateEventId(rng, currentTick),
        type: 'storm',
        targetId: 'global',
        startTick: currentTick,
        endTick: currentTick + duration,
        modifiers: { ...stormTemplate.modifiers },
      });
    }
  }

  return newEvents;
}

/**
 * Get active events (filter out expired)
 */
export function getActiveEvents(
  events: WorldEvent[],
  currentTick: number
): WorldEvent[] {
  return events.filter(
    (e) => e.startTick <= currentTick && e.endTick > currentTick
  );
}

/**
 * Update events (add new, remove expired)
 */
export function updateEvents(
  currentEvents: WorldEvent[],
  newEvents: WorldEvent[],
  currentTick: number
): WorldEvent[] {
  // Filter out expired events
  const activeEvents = getActiveEvents(currentEvents, currentTick);

  // Add new events
  return [...activeEvents, ...newEvents];
}

/**
 * Get events affecting a specific island
 */
export function getIslandEvents(
  events: WorldEvent[],
  islandId: string,
  currentTick: number
): WorldEvent[] {
  return events.filter(
    (e) =>
      (e.targetId === islandId || e.targetId === 'global') &&
      e.startTick <= currentTick &&
      e.endTick > currentTick
  );
}

/**
 * Get combined modifiers for an island from all active events
 */
export function getCombinedModifiers(
  events: WorldEvent[],
  islandId: string,
  currentTick: number
): EventModifiers {
  const activeEvents = getIslandEvents(events, islandId, currentTick);

  const combined: EventModifiers = {};

  for (const event of activeEvents) {
    for (const [key, value] of Object.entries(event.modifiers)) {
      const modKey = key as keyof EventModifiers;
      if (combined[modKey] === undefined) {
        (combined as Record<string, number>)[modKey] = value as number;
      } else {
        // Multiply modifiers together
        (combined as Record<string, number>)[modKey] =
          (combined[modKey] as number) * (value as number);
      }
    }
  }

  return combined;
}

/**
 * Get event summary for UI/agents
 */
export function getEventSummary(
  event: WorldEvent,
  currentTick: number
): {
  type: EventType;
  target: string;
  remainingHours: number;
  isNew: boolean;
  modifiers: EventModifiers;
} {
  return {
    type: event.type,
    target: event.targetId,
    remainingHours: Math.max(0, event.endTick - currentTick),
    isNew: event.startTick === currentTick,
    modifiers: event.modifiers,
  };
}

/**
 * Create a manual event (for testing or scripted scenarios)
 */
export function createEvent(
  type: EventType,
  targetId: string,
  startTick: number,
  duration: number,
  customModifiers?: Partial<EventModifiers>
): WorldEvent {
  const template = EVENT_TEMPLATES[type];

  return {
    id: `manual_${startTick}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    targetId,
    startTick,
    endTick: startTick + duration,
    modifiers: {
      ...template.modifiers,
      ...customModifiers,
    },
  };
}
