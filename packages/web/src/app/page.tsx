'use client';

import { useState, useMemo } from 'react';
import { X } from 'lucide-react';
import { PageLayout } from '@/components/layout/PageLayout';
import { ArchipelagoMap } from '@/components/map/ArchipelagoMap';
import { useSimulation } from '@/hooks/useSimulation';
import { GOODS } from '@/lib/types';
import { formatNumber, formatPercent, formatPrice } from '@/lib/utils';

import type { IslandSnapshot, ShipSnapshot } from '@/lib/types';

// Floating stats overlay - top left
function StatsOverlay({ islands, ships }: {
  islands: IslandSnapshot[];
  ships: ShipSnapshot[];
}) {
  const totalPop = islands.reduce((sum, i) => sum + i.population.size, 0);
  const avgHealth = islands.length
    ? islands.reduce((sum, i) => sum + i.population.health, 0) / islands.length
    : 0;
  const shipsAtSea = ships.filter(s => s.location.kind === 'at_sea').length;

  return (
    <div className="absolute top-3 left-3 bg-slate-900/80 backdrop-blur-sm border border-slate-700/50 rounded-lg p-3 text-sm">
      <div className="grid grid-cols-3 gap-4">
        <div>
          <div className="text-xs text-slate-400">Population</div>
          <div className="font-semibold text-white">{formatNumber(Math.round(totalPop))}</div>
        </div>
        <div>
          <div className="text-xs text-slate-400">Avg Health</div>
          <div className={`font-semibold ${avgHealth >= 0.7 ? 'text-green-400' : avgHealth >= 0.4 ? 'text-yellow-400' : 'text-red-400'}`}>
            {formatPercent(avgHealth)}
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-400">Ships Sailing</div>
          <div className="font-semibold text-blue-400">{shipsAtSea}/{ships.length}</div>
        </div>
      </div>
    </div>
  );
}

// Floating selection panel - right side
function SelectionOverlay({
  island,
  ship,
  islandNames,
  onClose,
}: {
  island: IslandSnapshot | null;
  ship: ShipSnapshot | null;
  islandNames: Record<string, string>;
  onClose: () => void;
}) {
  if (!island && !ship) return null;

  return (
    <div className="absolute top-3 right-3 bottom-3 w-72 bg-slate-900/90 backdrop-blur-sm border border-slate-700/50 rounded-lg overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-slate-700/50">
        <h3 className="font-semibold text-white">
          {island ? island.name : ship?.name}
        </h3>
        <button
          onClick={onClose}
          className="p-1 hover:bg-slate-700/50 rounded transition-colors"
        >
          <X className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {island && <IslandDetails island={island} />}
        {ship && <ShipDetails ship={ship} islandNames={islandNames} />}
      </div>
    </div>
  );
}

function IslandDetails({ island }: { island: IslandSnapshot }) {
  const fishRatio = island.ecosystem.fishStock / island.ecosystem.fishCapacity;
  const forestRatio = island.ecosystem.forestBiomass / island.ecosystem.forestCapacity;

  return (
    <>
      {/* Population */}
      <div>
        <div className="text-xs text-slate-400 uppercase tracking-wider mb-2">Population</div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="bg-slate-800/50 rounded p-2">
            <div className="text-slate-400 text-xs">Size</div>
            <div className="font-medium">{formatNumber(Math.round(island.population.size))}</div>
          </div>
          <div className="bg-slate-800/50 rounded p-2">
            <div className="text-slate-400 text-xs">Health</div>
            <div className={`font-medium ${
              island.population.health >= 0.7 ? 'text-green-400' :
              island.population.health >= 0.4 ? 'text-yellow-400' : 'text-red-400'
            }`}>
              {formatPercent(island.population.health)}
            </div>
          </div>
        </div>
      </div>

      {/* Ecosystem */}
      <div>
        <div className="text-xs text-slate-400 uppercase tracking-wider mb-2">Ecosystem</div>
        <div className="space-y-2">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-400">Fish Stock</span>
              <span>{formatPercent(fishRatio)}</span>
            </div>
            <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-cyan-500 transition-all" style={{ width: `${fishRatio * 100}%` }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-400">Forest</span>
              <span>{formatPercent(forestRatio)}</span>
            </div>
            <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-green-500 transition-all" style={{ width: `${forestRatio * 100}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Market Prices */}
      <div>
        <div className="text-xs text-slate-400 uppercase tracking-wider mb-2">Market Prices</div>
        <div className="grid grid-cols-5 gap-1">
          {(['fish', 'grain', 'timber', 'tools', 'luxuries'] as const).map((goodId) => (
            <div key={goodId} className="bg-slate-800/50 rounded p-1.5 text-center">
              <div className="text-sm">{GOODS[goodId].emoji}</div>
              <div className="text-xs font-mono text-slate-300">
                {formatPrice(island.market.prices[goodId] ?? 0)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Inventory */}
      <div>
        <div className="text-xs text-slate-400 uppercase tracking-wider mb-2">Inventory</div>
        <div className="grid grid-cols-5 gap-1">
          {(['fish', 'grain', 'timber', 'tools', 'luxuries'] as const).map((goodId) => (
            <div key={goodId} className="bg-slate-800/50 rounded p-1.5 text-center">
              <div className="text-sm">{GOODS[goodId].emoji}</div>
              <div className="text-xs font-mono text-slate-300">
                {formatNumber(Math.round(island.inventory[goodId] ?? 0))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function ShipDetails({ ship, islandNames }: { ship: ShipSnapshot; islandNames: Record<string, string> }) {
  const isAtSea = ship.location.kind === 'at_sea';
  const cargoItems = Object.entries(ship.cargo).filter(([, qty]) => qty > 0);
  const totalCargo = Object.values(ship.cargo).reduce((sum, qty) => sum + qty, 0);

  return (
    <>
      {/* Status */}
      <div>
        <div className="text-xs text-slate-400 uppercase tracking-wider mb-2">Status</div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="bg-slate-800/50 rounded p-2">
            <div className="text-slate-400 text-xs">Location</div>
            <div className={`font-medium ${isAtSea ? 'text-blue-400' : 'text-slate-200'}`}>
              {isAtSea ? 'At Sea' : `At ${ship.location.kind === 'at_island' ? islandNames[ship.location.islandId] || 'Unknown' : 'Unknown'}`}
            </div>
          </div>
          <div className="bg-slate-800/50 rounded p-2">
            <div className="text-slate-400 text-xs">Cash</div>
            <div className="font-medium text-green-400">${formatNumber(Math.round(ship.cash))}</div>
          </div>
        </div>
      </div>

      {/* Journey Progress */}
      {isAtSea && ship.location.kind === 'at_sea' && (
        <div>
          <div className="text-xs text-slate-400 uppercase tracking-wider mb-2">Journey</div>
          <div className="bg-slate-800/50 rounded p-2">
            <div className="flex justify-between text-xs mb-1">
              <span>{islandNames[ship.location.route.fromIslandId] || '?'}</span>
              <span>{islandNames[ship.location.route.toIslandId] || '?'}</span>
            </div>
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all"
                style={{ width: `${ship.location.route.progress * 100}%` }}
              />
            </div>
            <div className="text-center text-xs text-slate-400 mt-1">
              {formatPercent(ship.location.route.progress)} complete
            </div>
          </div>
        </div>
      )}

      {/* Cargo */}
      <div>
        <div className="text-xs text-slate-400 uppercase tracking-wider mb-2">
          Cargo ({totalCargo}/{ship.capacity})
        </div>
        {cargoItems.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {cargoItems.map(([goodId, qty]) => (
              <div
                key={goodId}
                className="flex items-center gap-1 bg-slate-800/50 px-2 py-1 rounded text-sm"
              >
                <span>{GOODS[goodId as keyof typeof GOODS]?.emoji}</span>
                <span className="font-mono">{formatNumber(qty)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-slate-500 italic">Empty hold</div>
        )}
      </div>

      {/* Condition */}
      {ship.condition !== undefined && (
        <div>
          <div className="text-xs text-slate-400 uppercase tracking-wider mb-2">Condition</div>
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                ship.condition >= 0.7 ? 'bg-green-500' :
                ship.condition >= 0.4 ? 'bg-yellow-500' : 'bg-red-500'
              }`}
              style={{ width: `${ship.condition * 100}%` }}
            />
          </div>
          <div className="text-xs text-slate-400 text-center mt-1">
            {formatPercent(ship.condition)}
          </div>
        </div>
      )}
    </>
  );
}

// Legend overlay - bottom left
function LegendOverlay() {
  return (
    <div className="absolute bottom-3 left-3 bg-slate-900/80 backdrop-blur-sm border border-slate-700/50 rounded-lg p-2 text-xs">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span className="text-slate-400">Healthy</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-yellow-500" />
          <span className="text-slate-400">Stressed</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <span className="text-slate-400">Critical</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-3 bg-blue-500 rounded-sm" />
          <span className="text-slate-400">Ship</span>
        </div>
      </div>
    </div>
  );
}

function OverviewContent() {
  const { world } = useSimulation();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const islands = world?.islands ?? [];
  const ships = world?.ships ?? [];

  // Build island name lookup
  const islandNames = useMemo(() => {
    const names: Record<string, string> = {};
    for (const island of islands) {
      names[island.id] = island.name;
    }
    return names;
  }, [islands]);

  // Find selected item
  const selectedIsland = islands.find(i => i.id === selectedId) ?? null;
  const selectedShip = ships.find(s => s.id === selectedId) ?? null;

  const handleSelectIsland = (id: string) => {
    setSelectedId(prev => prev === id ? null : id);
  };

  const handleSelectShip = (id: string) => {
    setSelectedId(prev => prev === id ? null : id);
  };

  const handleClearSelection = () => {
    setSelectedId(null);
  };

  if (!world) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <div className="text-lg font-medium mb-2">Connecting to simulation...</div>
          <div className="text-sm">Make sure the server is running on port 3001</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full relative">
      {/* Full-size map */}
      <div className="absolute inset-0 rounded-lg overflow-hidden">
        <ArchipelagoMap
          islands={islands}
          ships={ships}
          selectedId={selectedId}
          onSelectIsland={handleSelectIsland}
          onSelectShip={handleSelectShip}
        />
      </div>

      {/* Floating overlays */}
      <StatsOverlay islands={islands} ships={ships} />
      <LegendOverlay />
      <SelectionOverlay
        island={selectedIsland}
        ship={selectedShip}
        islandNames={islandNames}
        onClose={handleClearSelection}
      />
    </div>
  );
}

export default function OverviewPage() {
  return (
    <PageLayout>
      <OverviewContent />
    </PageLayout>
  );
}
