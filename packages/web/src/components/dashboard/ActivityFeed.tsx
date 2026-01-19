'use client';

import { useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import type { EventSnapshot, AgentDecision, ShipSnapshot } from '@/lib/types';
import { formatNumber } from '@/lib/utils';

interface ActivityItem {
  id: string;
  type: 'event' | 'trade' | 'movement' | 'decision';
  tick: number;
  icon: string;
  title: string;
  description: string;
  color: string;
}

const EVENT_ICONS: Record<string, string> = {
  storm: 'wave',
  blight: 'bug',
  festival: 'party',
  discovery: 'science',
};

const EVENT_COLORS: Record<string, string> = {
  storm: 'text-blue-400',
  blight: 'text-red-400',
  festival: 'text-yellow-400',
  discovery: 'text-green-400',
};

function buildActivityItems(
  events: EventSnapshot[],
  decisions: AgentDecision[],
  ships: ShipSnapshot[],
  islandNames: Record<string, string>,
  currentTick: number
): ActivityItem[] {
  const items: ActivityItem[] = [];

  // Add active events
  for (const event of events) {
    if (event.remainingHours > 0) {
      const targetName = islandNames[event.targetId] || event.targetId;
      items.push({
        id: `event-${event.id}`,
        type: 'event',
        tick: event.startTick,
        icon: EVENT_ICONS[event.type] || 'question',
        title: `${event.type.charAt(0).toUpperCase()}${event.type.slice(1)} at ${targetName}`,
        description: `${formatNumber(event.remainingHours, 1)}h remaining`,
        color: EVENT_COLORS[event.type] || 'text-muted-foreground',
      });
    }
  }

  // Add recent agent decisions with trades
  for (const decision of decisions.slice(0, 10)) {
    const tradeActions = decision.actions.filter(
      (a) => a.type === 'buy' || a.type === 'sell'
    );
    for (const action of tradeActions) {
      items.push({
        id: `trade-${decision.agentId}-${decision.tick}-${action.type}`,
        type: 'trade',
        tick: decision.tick,
        icon: action.type === 'buy' ? 'cart' : 'sell',
        title: `${decision.agentName}: ${action.type.toUpperCase()}`,
        description: action.details,
        color: action.type === 'buy' ? 'text-emerald-400' : 'text-amber-400',
      });
    }

    // Add movement actions
    const moveActions = decision.actions.filter((a) => a.type === 'sail');
    for (const action of moveActions) {
      items.push({
        id: `move-${decision.agentId}-${decision.tick}`,
        type: 'movement',
        tick: decision.tick,
        icon: 'ship',
        title: `${decision.agentName}: Sailing`,
        description: action.details,
        color: 'text-primary',
      });
    }
  }

  // Add ships currently in transit
  for (const ship of ships) {
    if (ship.location.kind === 'at_sea') {
      const route = ship.location.route;
      const toName = islandNames[route.toIslandId] || route.toIslandId;
      const fromName = islandNames[route.fromIslandId] || route.fromIslandId;
      items.push({
        id: `transit-${ship.id}`,
        type: 'movement',
        tick: currentTick,
        icon: 'ship',
        title: `${ship.name} in transit`,
        description: `${fromName} -> ${toName} (${Math.round(route.progress * 100)}%)`,
        color: 'text-primary',
      });
    }
  }

  // Sort by tick descending (most recent first)
  items.sort((a, b) => b.tick - a.tick);

  return items;
}

function getActivityIcon(item: ActivityItem): string {
  switch (item.type) {
    case 'event':
      if (item.icon === 'wave') return 'wave';
      if (item.icon === 'bug') return 'bug';
      if (item.icon === 'party') return 'party';
      if (item.icon === 'science') return 'science';
      return 'bell';
    case 'trade':
      return item.icon === 'cart' ? 'cart' : 'sell';
    case 'movement':
      return 'ship';
    case 'decision':
      return 'brain';
    default:
      return 'info';
  }
}

function getIconEmoji(iconType: string): string {
  switch (iconType) {
    case 'wave':
      return '';
    case 'bug':
      return '';
    case 'party':
      return '';
    case 'science':
      return '';
    case 'cart':
      return '';
    case 'sell':
      return '';
    case 'ship':
      return 'sail';
    case 'brain':
      return '';
    default:
      return 'bell';
  }
}

interface ActivityFeedProps {
  events: EventSnapshot[];
  decisions: AgentDecision[];
  ships: ShipSnapshot[];
  islandNames: Record<string, string>;
  currentTick: number;
  maxItems?: number;
}

export function ActivityFeed({
  events,
  decisions,
  ships,
  islandNames,
  currentTick,
  maxItems = 6,
}: ActivityFeedProps) {
  const items = useMemo(
    () =>
      buildActivityItems(events, decisions, ships, islandNames, currentTick).slice(
        0,
        maxItems
      ),
    [events, decisions, ships, islandNames, currentTick, maxItems]
  );

  return (
    <Card className="w-full h-full">
      <CardHeader className="pb-2 pt-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <span>Activity</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-3">
        {items.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-2">
            No recent activity
          </div>
        ) : (
          <div className="space-y-1.5 max-h-[180px] overflow-y-auto">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-2 text-sm bg-secondary/30 rounded px-2 py-1.5"
              >
                <div className="flex-1 min-w-0">
                  <div className={`font-medium truncate ${item.color}`}>
                    {item.title}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {item.description}
                  </div>
                </div>
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  T{item.tick}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
