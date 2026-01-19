'use client';

import { useState, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import type { IslandSnapshot, GoodId, BuildingSnapshot } from '@/lib/types';
import { GOODS } from '@/lib/types';

// Building type metadata
const BUILDING_INFO: Record<BuildingSnapshot['type'], { name: string; emoji: string }> = {
  warehouse: { name: 'Warehouse', emoji: '📦' },
  market: { name: 'Market', emoji: '🏪' },
  port: { name: 'Port', emoji: '⚓' },
  workshop: { name: 'Workshop', emoji: '🔧' },
};
import { formatNumber, formatPercent, formatPrice, getHealthColor, getResourceColor } from '@/lib/utils';

interface CompactIslandCardProps {
  island: IslandSnapshot;
  onSelect?: (island: IslandSnapshot) => void;
}

// Find the primary resource (highest production potential) for an island
function getPrimaryResource(island: IslandSnapshot): { goodId: GoodId; emoji: string; level: number } {
  const fishRatio = island.ecosystem.fishStock / island.ecosystem.fishCapacity;
  const forestRatio = island.ecosystem.forestBiomass / island.ecosystem.forestCapacity;
  const soilLevel = island.ecosystem.soilFertility;

  if (fishRatio >= forestRatio && fishRatio >= soilLevel) {
    return { goodId: 'fish', emoji: GOODS.fish.emoji, level: fishRatio };
  }
  if (forestRatio >= fishRatio && forestRatio >= soilLevel) {
    return { goodId: 'timber', emoji: GOODS.timber.emoji, level: forestRatio };
  }
  return { goodId: 'grain', emoji: GOODS.grain.emoji, level: soilLevel };
}

// Resource bar component
function ResourceBar({
  label,
  current,
  capacity,
  emoji,
}: {
  label: string;
  current: number;
  capacity: number;
  emoji: string;
}) {
  const percent = (current / capacity) * 100;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-16 flex items-center gap-1 text-xs">
        {emoji} {label}
      </span>
      <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
        <div
          className={`h-full ${getResourceColor(current, capacity)} transition-all duration-300`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground w-10 text-right">
        {formatPercent(current / capacity)}
      </span>
    </div>
  );
}

// Hover popup component
function IslandHoverPopup({
  island,
  position,
}: {
  island: IslandSnapshot;
  position: { x: number; y: number };
}) {
  return (
    <div
      className="fixed z-50 bg-card border rounded-lg shadow-xl p-3 w-72 pointer-events-none"
      style={{
        left: position.x,
        top: position.y,
        transform: 'translateY(-100%) translateY(-8px)',
      }}
    >
      {/* Header */}
      <div className="flex justify-between items-center mb-2 pb-2 border-b">
        <span className="font-semibold">{island.name}</span>
        <span className={`text-sm font-medium ${getHealthColor(island.population.health)}`}>
          {formatPercent(island.population.health)} health
        </span>
      </div>

      {/* Population */}
      <div className="flex justify-between text-sm mb-2">
        <span className="text-muted-foreground">Population</span>
        <span className="font-medium">{formatNumber(Math.round(island.population.size))}</span>
      </div>

      {/* Resources */}
      <div className="space-y-1 mb-3">
        <ResourceBar
          label="Fish"
          current={island.ecosystem.fishStock}
          capacity={island.ecosystem.fishCapacity}
          emoji={GOODS.fish.emoji}
        />
        <ResourceBar
          label="Forest"
          current={island.ecosystem.forestBiomass}
          capacity={island.ecosystem.forestCapacity}
          emoji={GOODS.timber.emoji}
        />
        <div className="flex items-center gap-2 text-sm">
          <span className="w-16 flex items-center gap-1 text-xs">
            {GOODS.grain.emoji} Soil
          </span>
          <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
            <div
              className={`h-full ${getResourceColor(island.ecosystem.soilFertility, 1)}`}
              style={{ width: `${island.ecosystem.soilFertility * 100}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground w-10 text-right">
            {formatPercent(island.ecosystem.soilFertility)}
          </span>
        </div>
      </div>

      {/* Market Prices - compact grid */}
      <div className="text-xs">
        <div className="text-muted-foreground mb-1">Market Prices</div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
          {(Object.keys(GOODS) as GoodId[]).map((goodId) => {
            const price = island.market.prices[goodId] ?? 0;
            const inventory = island.inventory[goodId] ?? 0;
            return (
              <div key={goodId} className="flex justify-between">
                <span className="text-muted-foreground">
                  {GOODS[goodId].emoji} {GOODS[goodId].name}
                </span>
                <span className="font-mono">
                  {formatPrice(price)}
                  <span className="text-muted-foreground ml-1">({formatNumber(inventory)})</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Buildings section - only shown if buildings exist */}
      {island.buildings && island.buildings.length > 0 && (
        <div className="text-xs mt-3 pt-2 border-t">
          <div className="text-muted-foreground mb-1">Buildings</div>
          <div className="space-y-1">
            {island.buildings.map((building) => {
              const info = BUILDING_INFO[building.type];
              return (
                <div key={building.id} className="flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <span>{info.emoji}</span>
                    <span>{info.name}</span>
                    <span className="text-muted-foreground">Lv.{building.level}</span>
                  </span>
                  {building.condition < 1 && (
                    <div className="flex items-center gap-1">
                      <div className="w-12 h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            building.condition >= 0.7
                              ? 'bg-green-500'
                              : building.condition >= 0.4
                                ? 'bg-yellow-500'
                                : 'bg-red-500'
                          }`}
                          style={{ width: `${building.condition * 100}%` }}
                        />
                      </div>
                      <span className="text-muted-foreground w-8 text-right">
                        {formatPercent(building.condition)}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function CompactIslandCard({ island, onSelect }: CompactIslandCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });
  const cardRef = useRef<HTMLDivElement>(null);

  const primary = getPrimaryResource(island);
  const health = island.population.health;

  const handleMouseEnter = () => {
    if (cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      setPopupPosition({
        x: rect.left + rect.width / 2 - 144, // Center the 288px popup
        y: rect.top,
      });
    }
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  const handleClick = () => {
    if (onSelect) {
      onSelect(island);
    }
  };

  return (
    <>
      <Card
        ref={cardRef}
        className="w-full cursor-pointer hover:bg-secondary/20 transition-colors"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      >
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            {/* Left: Name and population */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="min-w-0">
                <div className="font-medium text-sm truncate">{island.name}</div>
                <div className="text-xs text-muted-foreground">
                  Pop: {formatNumber(Math.round(island.population.size))}
                </div>
              </div>
            </div>

            {/* Center: Health */}
            <div className="flex items-center gap-2">
              <span className={`text-sm font-medium ${getHealthColor(health)}`}>
                {formatPercent(health)}
              </span>
            </div>

            {/* Right: Primary resource indicator */}
            <div className="flex items-center gap-1">
              <span title={`Primary: ${GOODS[primary.goodId].name}`}>
                {primary.emoji}
              </span>
              <div className="w-12 h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className={`h-full ${getResourceColor(primary.level, 1)} transition-all`}
                  style={{ width: `${primary.level * 100}%` }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {isHovered && (
        <IslandHoverPopup island={island} position={popupPosition} />
      )}
    </>
  );
}

interface CompactIslandGridProps {
  islands: IslandSnapshot[];
}

export function CompactIslandGrid({ islands }: CompactIslandGridProps) {
  return (
    <div className="flex gap-2">
      {islands.map((island) => (
        <div key={island.id} className="flex-1 min-w-0">
          <CompactIslandCard island={island} />
        </div>
      ))}
    </div>
  );
}
