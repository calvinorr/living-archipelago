'use client';

import { useState } from 'react';
import { PageLayout } from '@/components/layout/PageLayout';
import { useSimulation } from '@/hooks/useSimulation';
import { GOODS } from '@/lib/types';
import type { IslandSnapshot, GoodId } from '@/lib/types';
import { formatNumber, formatPercent, formatPrice, getHealthColor, getResourceColor } from '@/lib/utils';

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
      <div className="h-2 bg-secondary rounded-full overflow-hidden">
        <div
          className={`h-full transition-all ${getResourceColor(current, capacity)}`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  );
}

function IslandDetailCard({ island, isSelected, onSelect }: {
  island: IslandSnapshot;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className={`bg-card border rounded-lg p-4 cursor-pointer transition-all ${
        isSelected ? 'ring-2 ring-primary' : 'hover:border-primary/50'
      }`}
    >
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="font-semibold text-lg">{island.name}</h3>
          <p className="text-sm text-muted-foreground">
            Population: {formatNumber(Math.round(island.population.size))}
          </p>
        </div>
        <div className={`text-lg font-bold ${getHealthColor(island.population.health)}`}>
          {formatPercent(island.population.health)}
        </div>
      </div>

      {/* Ecosystem Health */}
      <div className="space-y-2 mb-4">
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
          label="Soil"
          emoji={GOODS.grain.emoji}
          current={island.ecosystem.soilFertility}
          capacity={1}
        />
      </div>

      {/* Labor Distribution */}
      <div className="mb-4">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Labor</h4>
        <div className="flex h-3 rounded-full overflow-hidden bg-secondary">
          {Object.entries(island.population.labour).map(([sector, share], i) => {
            const colors = ['bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-purple-500', 'bg-pink-500'];
            return (
              <div
                key={sector}
                className={`${colors[i]} transition-all`}
                style={{ width: `${share * 100}%` }}
                title={`${sector}: ${Math.round(share * 100)}%`}
              />
            );
          })}
        </div>
        <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
          <span>Fish</span>
          <span>Forest</span>
          <span>Farm</span>
          <span>Industry</span>
          <span>Services</span>
        </div>
      </div>

      {/* Market Prices */}
      <div>
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Market</h4>
        <div className="grid grid-cols-5 gap-1">
          {(Object.keys(GOODS) as GoodId[]).map(goodId => {
            const price = island.market.prices[goodId] ?? 0;
            const inventory = island.inventory[goodId] ?? 0;
            return (
              <div key={goodId} className="text-center p-1.5 bg-muted/30 rounded">
                <div className="text-sm mb-0.5">{GOODS[goodId].emoji}</div>
                <div className="text-xs font-mono font-medium">{formatPrice(price)}</div>
                <div className="text-[10px] text-muted-foreground">{formatNumber(inventory)}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function IslandComparison({ islands }: { islands: IslandSnapshot[] }) {
  // Calculate averages and identify best/worst for each metric
  const metrics = [
    {
      label: 'Population Health',
      getValue: (i: IslandSnapshot) => i.population.health,
      format: formatPercent,
    },
    {
      label: 'Fish Stock',
      getValue: (i: IslandSnapshot) => i.ecosystem.fishStock / i.ecosystem.fishCapacity,
      format: formatPercent,
    },
    {
      label: 'Forest Health',
      getValue: (i: IslandSnapshot) => i.ecosystem.forestBiomass / i.ecosystem.forestCapacity,
      format: formatPercent,
    },
    {
      label: 'Soil Fertility',
      getValue: (i: IslandSnapshot) => i.ecosystem.soilFertility,
      format: formatPercent,
    },
    {
      label: 'Population',
      getValue: (i: IslandSnapshot) => i.population.size,
      format: (v: number) => formatNumber(Math.round(v)),
    },
  ];

  return (
    <div className="bg-card border rounded-lg p-4">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
        Island Comparison
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 pr-4">Metric</th>
              {islands.map(i => (
                <th key={i.id} className="text-right py-2 px-2">{i.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.map(({ label, getValue, format }) => {
              const values = islands.map(i => getValue(i));
              const max = Math.max(...values);
              const min = Math.min(...values);

              return (
                <tr key={label} className="border-b border-border/50">
                  <td className="py-2 pr-4 text-muted-foreground">{label}</td>
                  {islands.map((island, idx) => {
                    const value = values[idx];
                    const isMax = value === max && max !== min;
                    const isMin = value === min && max !== min;
                    return (
                      <td
                        key={island.id}
                        className={`text-right py-2 px-2 font-mono ${
                          isMax ? 'text-green-400' : isMin ? 'text-red-400' : ''
                        }`}
                      >
                        {format(value)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function IslandsContent() {
  const { world } = useSimulation();
  const [selectedIslandId, setSelectedIslandId] = useState<string | null>(null);

  const islands = world?.islands ?? [];

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
    <div className="h-full flex flex-col gap-4">
      {/* Comparison Table */}
      <IslandComparison islands={islands} />

      {/* Island Cards */}
      <div className="flex-1 min-h-0">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">
          Island Details ({islands.length})
        </h2>
        <div className="grid grid-cols-3 gap-4 overflow-auto max-h-[calc(100%-2rem)]">
          {islands.map(island => (
            <IslandDetailCard
              key={island.id}
              island={island}
              isSelected={selectedIslandId === island.id}
              onSelect={() => setSelectedIslandId(
                selectedIslandId === island.id ? null : island.id
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function IslandsPage() {
  return (
    <PageLayout>
      <IslandsContent />
    </PageLayout>
  );
}
