'use client';

import { Card, CardContent } from '@/components/ui/card';
import type { ShipSnapshot, GoodId } from '@/lib/types';
import { GOODS } from '@/lib/types';
import { formatNumber, formatPrice, formatPercent } from '@/lib/utils';

interface ShipCardProps {
  ship: ShipSnapshot;
  islandNames: Record<string, string>;
}

export function ShipCard({ ship, islandNames }: ShipCardProps) {
  const location = ship.location;

  let locationText: string;
  let progress: number | null = null;
  let eta: number | null = null;

  if (location.kind === 'at_sea') {
    locationText = `→ ${islandNames[location.route.toIslandId] || location.route.toIslandId}`;
    progress = location.route.progress;
    eta = location.route.etaHours;
  } else {
    locationText = `@ ${islandNames[location.islandId] || location.islandId}`;
  }

  // Calculate total cargo
  const totalCargo = Object.values(ship.cargo).reduce((sum, qty) => sum + qty, 0);
  const cargoPercent = (totalCargo / ship.capacity) * 100;

  return (
    <Card className="w-full">
      <CardContent className="p-4">
        <div className="flex justify-between items-start mb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg">⛵</span>
              <span className="font-medium">{ship.name}</span>
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              {locationText}
              {eta !== null && (
                <span className="ml-2 text-primary">
                  ({formatNumber(eta, 1)}h)
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-medium">{formatPrice(ship.cash)}</div>
            <div className="text-xs text-muted-foreground">cash</div>
          </div>
        </div>

        {/* Progress bar for ships at sea */}
        {progress !== null && (
          <div className="mb-3">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Journey Progress</span>
              <span>{formatPercent(progress)}</span>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Cargo */}
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>Cargo</span>
            <span>{formatNumber(totalCargo)} / {formatNumber(ship.capacity)}</span>
          </div>
          <div className="h-2 bg-secondary rounded-full overflow-hidden mb-2">
            <div
              className="h-full bg-amber-500 transition-all duration-300"
              style={{ width: `${Math.min(cargoPercent, 100)}%` }}
            />
          </div>

          {/* Cargo items */}
          <div className="flex flex-wrap gap-2">
            {(Object.entries(ship.cargo) as [GoodId, number][])
              .filter(([, qty]) => qty > 0)
              .map(([goodId, qty]) => (
                <span
                  key={goodId}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-secondary rounded text-xs"
                >
                  {GOODS[goodId]?.emoji || '📦'} {formatNumber(qty)}
                </span>
              ))}
            {totalCargo === 0 && (
              <span className="text-xs text-muted-foreground">Empty</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
