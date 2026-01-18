'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import type { EventSnapshot } from '@/lib/types';
import { formatNumber } from '@/lib/utils';

const EVENT_ICONS: Record<string, string> = {
  storm: '🌊',
  blight: '🦠',
  festival: '🎉',
  discovery: '🔬',
};

const EVENT_COLORS: Record<string, string> = {
  storm: 'text-blue-400',
  blight: 'text-red-400',
  festival: 'text-yellow-400',
  discovery: 'text-green-400',
};

interface EventFeedProps {
  events: EventSnapshot[];
}

export function EventFeed({ events }: EventFeedProps) {
  const activeEvents = events.filter((e) => e.remainingHours > 0);

  if (activeEvents.length === 0) {
    return (
      <Card className="w-full">
        <CardContent className="p-4 text-center text-muted-foreground text-sm">
          No active events
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-2 pt-3">
        <CardTitle className="text-sm">Active Events</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pb-3">
        {activeEvents.map((event) => (
          <div
            key={event.id}
            className="flex items-center justify-between text-sm bg-secondary/30 rounded px-2 py-1"
          >
            <div className="flex items-center gap-2">
              <span>{EVENT_ICONS[event.type] || '❓'}</span>
              <span className={EVENT_COLORS[event.type] || ''}>
                {event.type.charAt(0).toUpperCase() + event.type.slice(1)}
              </span>
              <span className="text-muted-foreground">at {event.targetId}</span>
            </div>
            <span className="text-xs text-muted-foreground">
              {formatNumber(event.remainingHours, 1)}h left
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
