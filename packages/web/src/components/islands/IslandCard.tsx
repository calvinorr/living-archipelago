'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import type { IslandSnapshot, GoodId } from '@/lib/types';
import { GOODS } from '@/lib/types';
import { formatNumber, formatPrice, formatPercent, getHealthColor, getResourceColor } from '@/lib/utils';

interface ResourceBarProps {
  label: string;
  current: number;
  capacity: number;
  emoji: string;
}

function ResourceBar({ label, current, capacity, emoji }: ResourceBarProps) {
  const percent = (current / capacity) * 100;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{emoji} {label}</span>
        <span>{formatNumber(current)} / {formatNumber(capacity)}</span>
      </div>
      <div className="h-2 bg-secondary rounded-full overflow-hidden">
        <div
          className={`h-full ${getResourceColor(current, capacity)} transition-all duration-300`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  );
}

interface PriceRowProps {
  goodId: GoodId;
  price: number;
  inventory: number;
}

function PriceRow({ goodId, price, inventory }: PriceRowProps) {
  const good = GOODS[goodId];
  return (
    <div className="flex items-center justify-between py-1 border-b border-border/50 last:border-0">
      <div className="flex items-center gap-2">
        <span>{good.emoji}</span>
        <span className="text-sm">{good.name}</span>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-xs text-muted-foreground">{formatNumber(inventory)} units</span>
        <span className="text-sm font-medium" style={{ color: good.color }}>
          {formatPrice(price)}
        </span>
      </div>
    </div>
  );
}

interface IslandCardProps {
  island: IslandSnapshot;
}

export function IslandCard({ island }: IslandCardProps) {
  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <CardTitle>{island.name}</CardTitle>
          <span className="text-xs text-muted-foreground">
            ({island.position.x}, {island.position.y})
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Population */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="text-lg">👥</span>
            <span className="font-medium">{formatNumber(Math.round(island.population.size))}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Health:</span>
            <span className={`font-medium ${getHealthColor(island.population.health)}`}>
              {formatPercent(island.population.health)}
            </span>
          </div>
        </div>

        {/* Resources */}
        <div className="space-y-2">
          <ResourceBar
            label="Fish"
            current={island.ecosystem.fishStock}
            capacity={island.ecosystem.fishCapacity}
            emoji="🐟"
          />
          <ResourceBar
            label="Forest"
            current={island.ecosystem.forestBiomass}
            capacity={island.ecosystem.forestCapacity}
            emoji="🌲"
          />
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>🌱 Soil</span>
              <span>{formatPercent(island.ecosystem.soilFertility)}</span>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-600 transition-all duration-300"
                style={{ width: `${island.ecosystem.soilFertility * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* Prices */}
        <div className="pt-2">
          <h4 className="text-xs font-medium text-muted-foreground mb-2">MARKET PRICES</h4>
          {(Object.keys(GOODS) as GoodId[]).map((goodId) => (
            <PriceRow
              key={goodId}
              goodId={goodId}
              price={island.market.prices[goodId] ?? 0}
              inventory={island.inventory[goodId] ?? 0}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
