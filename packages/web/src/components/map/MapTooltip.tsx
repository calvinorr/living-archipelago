'use client';

import type { IslandSnapshot, ShipSnapshot } from '@/lib/types';
import { GOODS } from '@/lib/types';
import { formatNumber, formatPercent, formatPrice } from '@/lib/utils';

interface MapTooltipProps {
  island: IslandSnapshot | null;
  ship: ShipSnapshot | null;
  position: { x: number; y: number };
}

function HealthBar({ value, label }: { value: number; label: string }) {
  const color = value >= 0.7 ? 'bg-green-500' : value >= 0.4 ? 'bg-yellow-500' : 'bg-red-500';
  const bgColor = value >= 0.7 ? 'bg-green-900/30' : value >= 0.4 ? 'bg-yellow-900/30' : 'bg-red-900/30';

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground w-12">{label}</span>
      <div className={`flex-1 h-2 ${bgColor} rounded-full overflow-hidden`}>
        <div
          className={`h-full ${color} transition-all duration-300`}
          style={{ width: `${value * 100}%` }}
        />
      </div>
      <span className="text-xs font-mono w-10 text-right">{formatPercent(value)}</span>
    </div>
  );
}

function IslandTooltip({ island }: { island: IslandSnapshot }) {
  const fishRatio = island.ecosystem.fishStock / island.ecosystem.fishCapacity;
  const forestRatio = island.ecosystem.forestBiomass / island.ecosystem.forestCapacity;
  const health = island.population.health;

  return (
    <>
      {/* Header with icon */}
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/50">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-lg ${
          health >= 0.7 ? 'bg-green-500/20' :
          health >= 0.4 ? 'bg-yellow-500/20' : 'bg-red-500/20'
        }`}>
          🏝️
        </div>
        <div>
          <div className="font-bold text-sm">{island.name}</div>
          <div className="text-xs text-muted-foreground">
            {Math.round(island.population.size)} inhabitants
          </div>
        </div>
      </div>

      {/* Health indicators */}
      <div className="space-y-1.5 mb-3">
        <HealthBar value={health} label="Health" />
        <HealthBar value={fishRatio} label="Fish" />
        <HealthBar value={forestRatio} label="Forest" />
      </div>

      {/* Market prices */}
      <div className="bg-muted/30 rounded-md p-2">
        <div className="text-xs text-muted-foreground mb-1.5 font-medium">Market Prices</div>
        <div className="grid grid-cols-5 gap-1">
          {(['fish', 'grain', 'timber', 'tools', 'luxuries'] as const).map((goodId) => (
            <div key={goodId} className="text-center">
              <div className="text-sm">{GOODS[goodId].emoji}</div>
              <div className="text-xs font-mono text-muted-foreground">
                {formatPrice(island.market.prices[goodId] ?? 0)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function ShipTooltip({ ship }: { ship: ShipSnapshot }) {
  const cargoItems = Object.entries(ship.cargo).filter(([, qty]) => qty > 0);
  const isAtSea = ship.location.kind === 'at_sea';
  const totalCargo = Object.values(ship.cargo).reduce((sum, qty) => sum + qty, 0);
  const cargoPercent = totalCargo / ship.capacity;

  return (
    <>
      {/* Header with status */}
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/50">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-lg ${
          isAtSea ? 'bg-blue-500/20' : 'bg-gray-500/20'
        }`}>
          {isAtSea ? '⛵' : '🚢'}
        </div>
        <div className="flex-1">
          <div className="font-bold text-sm">{ship.name}</div>
          <div className={`text-xs ${isAtSea ? 'text-blue-400' : 'text-muted-foreground'}`}>
            {isAtSea ? 'Sailing' : 'Anchored'}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Cash</div>
          <div className="text-sm font-mono text-green-400">${formatNumber(Math.round(ship.cash))}</div>
        </div>
      </div>

      {/* Progress bar when at sea */}
      {isAtSea && ship.location.kind === 'at_sea' && (
        <div className="mb-3">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted-foreground">Journey Progress</span>
            <span className="font-mono">{formatPercent(ship.location.route.progress)}</span>
          </div>
          <div className="h-2 bg-blue-900/30 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-500"
              style={{ width: `${ship.location.route.progress * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Crew and condition */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        {ship.crew && (
          <div className="bg-muted/30 rounded-md p-2">
            <div className="text-xs text-muted-foreground">Crew</div>
            <div className="text-sm font-medium">{ship.crew.count}/{ship.crew.capacity}</div>
          </div>
        )}
        {ship.condition !== undefined && (
          <div className="bg-muted/30 rounded-md p-2">
            <div className="text-xs text-muted-foreground">Condition</div>
            <div className={`text-sm font-medium ${
              ship.condition >= 0.7 ? 'text-green-400' :
              ship.condition >= 0.4 ? 'text-yellow-400' : 'text-red-400'
            }`}>
              {formatPercent(ship.condition)}
            </div>
          </div>
        )}
      </div>

      {/* Cargo */}
      <div className="bg-muted/30 rounded-md p-2">
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-xs text-muted-foreground font-medium">Cargo Hold</span>
          <span className="text-xs font-mono">{totalCargo}/{ship.capacity}</span>
        </div>
        <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden mb-2">
          <div
            className={`h-full transition-all duration-300 ${
              cargoPercent > 0.8 ? 'bg-amber-500' :
              cargoPercent > 0.5 ? 'bg-green-500' : 'bg-slate-500'
            }`}
            style={{ width: `${cargoPercent * 100}%` }}
          />
        </div>
        {cargoItems.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {cargoItems.map(([goodId, qty]) => (
              <div
                key={goodId}
                className="flex items-center gap-1 bg-slate-800/50 px-1.5 py-0.5 rounded text-xs"
              >
                <span>{GOODS[goodId as keyof typeof GOODS]?.emoji ?? '📦'}</span>
                <span className="font-mono">{formatNumber(qty)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground text-center">Empty</div>
        )}
      </div>
    </>
  );
}

export function MapTooltip({ island, ship, position }: MapTooltipProps) {
  if (!island && !ship) return null;

  return (
    <div
      className="absolute z-50 bg-gradient-to-b from-slate-800 to-slate-900 border border-slate-700 rounded-xl shadow-2xl p-3 min-w-[220px] max-w-[280px] pointer-events-none"
      style={{
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, -100%) translateY(-16px)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.05)',
      }}
    >
      {/* Arrow pointing down */}
      <div
        className="absolute left-1/2 -bottom-2 w-4 h-4 bg-slate-900 border-b border-r border-slate-700 transform -translate-x-1/2 rotate-45"
      />

      {island && <IslandTooltip island={island} />}
      {ship && <ShipTooltip ship={ship} />}
    </div>
  );
}
