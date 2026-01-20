'use client';

import type { IslandSnapshot, ShipSnapshot, GoodId } from '@/lib/types';
import { GOODS } from '@/lib/types';
import { formatNumber, formatPercent, formatPrice, getHealthColor, getResourceColor } from '@/lib/utils';

interface SelectionPanelProps {
  island: IslandSnapshot | null;
  ship: ShipSnapshot | null;
  islandNames: Record<string, string>;
  onClose: () => void;
}

function ResourceBar({ label, emoji, current, capacity }: {
  label: string;
  emoji: string;
  current: number;
  capacity: number;
}) {
  const percent = capacity > 0 ? (current / capacity) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{emoji} {label}</span>
        <span>{formatPercent(current / capacity)}</span>
      </div>
      <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
        <div
          className={`h-full transition-all ${getResourceColor(current, capacity)}`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  );
}

function IslandDetails({ island }: { island: IslandSnapshot }) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h3 className="font-semibold text-lg">{island.name}</h3>
        <p className="text-sm text-muted-foreground">Island</p>
      </div>

      {/* Population */}
      <div className="p-3 bg-muted/30 rounded-lg space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium">Population</span>
          <span className="text-lg font-semibold">{formatNumber(Math.round(island.population.size))}</span>
        </div>
        <div className="flex justify-between items-center text-sm">
          <span className="text-muted-foreground">Health</span>
          <span className={getHealthColor(island.population.health)}>
            {formatPercent(island.population.health)}
          </span>
        </div>
      </div>

      {/* Ecosystem */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Ecosystem</h4>
        <ResourceBar
          label="Fish Stock"
          emoji={GOODS.fish.emoji}
          current={island.ecosystem.fishStock}
          capacity={island.ecosystem.fishCapacity}
        />
        <ResourceBar
          label="Forest"
          emoji={GOODS.timber.emoji}
          current={island.ecosystem.forestBiomass}
          capacity={island.ecosystem.forestCapacity}
        />
        <ResourceBar
          label="Soil Fertility"
          emoji={GOODS.grain.emoji}
          current={island.ecosystem.soilFertility}
          capacity={1}
        />
      </div>

      {/* Labor Distribution */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Labor</h4>
        <div className="grid grid-cols-5 gap-1">
          {Object.entries(island.population.labour).map(([sector, share]) => (
            <div key={sector} className="text-center p-1.5 bg-muted/30 rounded">
              <div className="text-xs text-muted-foreground capitalize">{sector.slice(0, 4)}</div>
              <div className="text-sm font-medium">{Math.round(share * 100)}%</div>
            </div>
          ))}
        </div>
      </div>

      {/* Market Prices */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Market Prices</h4>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(GOODS) as GoodId[]).map((goodId) => {
            const price = island.market.prices[goodId] ?? 0;
            const inventory = island.inventory[goodId] ?? 0;
            return (
              <div key={goodId} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                <div className="flex items-center gap-1.5">
                  <span>{GOODS[goodId].emoji}</span>
                  <span className="text-xs">{GOODS[goodId].name}</span>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm">{formatPrice(price)}</div>
                  <div className="text-xs text-muted-foreground">{formatNumber(inventory)} units</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ShipDetails({ ship, islandNames }: { ship: ShipSnapshot; islandNames: Record<string, string> }) {
  const isAtSea = ship.location.kind === 'at_sea';
  const cargoItems = Object.entries(ship.cargo).filter(([, qty]) => qty > 0);
  const totalCargo = cargoItems.reduce((sum, [, qty]) => sum + qty, 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h3 className="font-semibold text-lg">{ship.name}</h3>
        <p className="text-sm text-muted-foreground">Trading Vessel</p>
      </div>

      {/* Status */}
      <div className="p-3 bg-muted/30 rounded-lg space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium">Status</span>
          <span className={`text-sm font-medium ${isAtSea ? 'text-yellow-400' : 'text-blue-400'}`}>
            {isAtSea ? 'En Route' : 'Docked'}
          </span>
        </div>

        {isAtSea && ship.location.kind === 'at_sea' && (
          <>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">From</span>
              <span>{islandNames[ship.location.route.fromIslandId] ?? 'Unknown'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">To</span>
              <span>{islandNames[ship.location.route.toIslandId] ?? 'Unknown'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Progress</span>
              <span>{formatPercent(ship.location.route.progress)}</span>
            </div>
            <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-yellow-500 transition-all"
                style={{ width: `${ship.location.route.progress * 100}%` }}
              />
            </div>
          </>
        )}

        {!isAtSea && ship.location.kind === 'at_island' && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Location</span>
            <span>{islandNames[ship.location.islandId] ?? 'Unknown'}</span>
          </div>
        )}
      </div>

      {/* Finances */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Finances</h4>
        <div className="p-3 bg-muted/30 rounded-lg">
          <div className="flex justify-between items-center">
            <span className="text-sm">Cash</span>
            <span className="text-lg font-semibold font-mono">${formatNumber(Math.round(ship.cash))}</span>
          </div>
        </div>
      </div>

      {/* Cargo */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Cargo ({totalCargo}/{ship.capacity})
        </h4>
        <div className="h-2 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all"
            style={{ width: `${(totalCargo / ship.capacity) * 100}%` }}
          />
        </div>
        {cargoItems.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {cargoItems.map(([goodId, qty]) => (
              <div key={goodId} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                <div className="flex items-center gap-1.5">
                  <span>{GOODS[goodId as keyof typeof GOODS]?.emoji ?? '📦'}</span>
                  <span className="text-xs">{GOODS[goodId as keyof typeof GOODS]?.name ?? goodId}</span>
                </div>
                <span className="font-mono text-sm">{formatNumber(qty)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground text-center p-2">Empty cargo hold</div>
        )}
      </div>

      {/* Crew & Condition */}
      {(ship.crew || ship.condition !== undefined) && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Ship Status</h4>
          <div className="grid grid-cols-2 gap-2">
            {ship.crew && (
              <div className="p-2 bg-muted/30 rounded">
                <div className="text-xs text-muted-foreground">Crew</div>
                <div className="text-sm font-medium">{ship.crew.count}/{ship.crew.capacity}</div>
              </div>
            )}
            {ship.condition !== undefined && (
              <div className="p-2 bg-muted/30 rounded">
                <div className="text-xs text-muted-foreground">Condition</div>
                <div className={`text-sm font-medium ${
                  ship.condition >= 0.7 ? 'text-green-400' :
                  ship.condition >= 0.4 ? 'text-yellow-400' : 'text-red-400'
                }`}>
                  {formatPercent(ship.condition)}
                </div>
              </div>
            )}
            {ship.crew && (
              <div className="p-2 bg-muted/30 rounded">
                <div className="text-xs text-muted-foreground">Morale</div>
                <div className={`text-sm font-medium ${
                  ship.crew.morale >= 0.7 ? 'text-green-400' :
                  ship.crew.morale >= 0.4 ? 'text-yellow-400' : 'text-red-400'
                }`}>
                  {formatPercent(ship.crew.morale)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function SelectionPanel({ island, ship, islandNames, onClose }: SelectionPanelProps) {
  if (!island && !ship) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm p-4">
        <div className="text-center">
          <p>Click an island or ship</p>
          <p>to view details</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-center pb-3 border-b mb-3">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {island ? 'Island Details' : 'Ship Details'}
        </span>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground text-sm"
        >
          x
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {island && <IslandDetails island={island} />}
        {ship && <ShipDetails ship={ship} islandNames={islandNames} />}
      </div>
    </div>
  );
}
