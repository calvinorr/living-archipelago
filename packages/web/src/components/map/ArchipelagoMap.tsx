'use client';

import { useState, useMemo } from 'react';
import type { IslandSnapshot, ShipSnapshot, Vector2 } from '@/lib/types';
import { IslandNode } from './IslandNode';
import { ShipMarker } from './ShipMarker';
import { TradeRoute } from './TradeRoute';
import { MapTooltip } from './MapTooltip';

interface ArchipelagoMapProps {
  islands: IslandSnapshot[];
  ships: ShipSnapshot[];
  selectedId: string | null;
  onSelectIsland: (id: string) => void;
  onSelectShip: (id: string) => void;
}

// Calculate ship position based on its location
function getShipPosition(ship: ShipSnapshot, islands: IslandSnapshot[]): Vector2 {
  const location = ship.location;

  if (location.kind === 'at_island') {
    const island = islands.find((i) => i.id === location.islandId);
    if (island) {
      // Offset slightly from island center so ship is visible
      return { x: island.position.x + 40, y: island.position.y - 15 };
    }
    return { x: 0, y: 0 };
  }

  // At sea - interpolate along route
  const route = location.route;
  const from = islands.find((i) => i.id === route.fromIslandId);
  const to = islands.find((i) => i.id === route.toIslandId);

  if (from && to) {
    const progress = route.progress;
    return {
      x: from.position.x + (to.position.x - from.position.x) * progress,
      y: from.position.y + (to.position.y - from.position.y) * progress,
    };
  }

  // Fallback to stored position
  return location.position;
}

// Get active routes (ships that are traveling)
function getActiveRoutes(
  ships: ShipSnapshot[],
  islands: IslandSnapshot[]
): Array<{ from: Vector2; to: Vector2; shipId: string }> {
  const routes: Array<{ from: Vector2; to: Vector2; shipId: string }> = [];

  for (const ship of ships) {
    const location = ship.location;
    if (location.kind !== 'at_sea') continue;

    const route = location.route;
    const from = islands.find((i) => i.id === route.fromIslandId);
    const to = islands.find((i) => i.id === route.toIslandId);

    if (from && to) {
      routes.push({
        from: from.position,
        to: to.position,
        shipId: ship.id,
      });
    }
  }

  return routes;
}

export function ArchipelagoMap({
  islands,
  ships,
  selectedId,
  onSelectIsland,
  onSelectShip,
}: ArchipelagoMapProps) {
  const [hoveredItem, setHoveredItem] = useState<{
    type: 'island' | 'ship';
    id: string;
    position: { x: number; y: number };
  } | null>(null);

  const activeRoutes = useMemo(() => getActiveRoutes(ships, islands), [ships, islands]);

  const shipPositions = useMemo(
    () =>
      ships.map((ship) => ({
        ship,
        position: getShipPosition(ship, islands),
      })),
    [ships, islands]
  );

  const handleMouseEnter = (
    type: 'island' | 'ship',
    id: string,
    event: React.MouseEvent<SVGElement>
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const svgRect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (svgRect) {
      setHoveredItem({
        type,
        id,
        position: {
          x: rect.left + rect.width / 2 - svgRect.left,
          y: rect.top - svgRect.top,
        },
      });
    }
  };

  const handleMouseLeave = () => {
    setHoveredItem(null);
  };

  const hoveredIsland =
    hoveredItem?.type === 'island'
      ? islands.find((i) => i.id === hoveredItem.id) ?? null
      : null;

  const hoveredShip =
    hoveredItem?.type === 'ship'
      ? ships.find((s) => s.id === hoveredItem.id) ?? null
      : null;

  return (
    <div className="relative w-full h-full bg-gradient-to-b from-slate-950 via-slate-900 to-blue-950 rounded-lg overflow-hidden">
      {/* Animated water background */}
      <div className="absolute inset-0 opacity-30">
        <svg width="100%" height="100%" className="animate-water-drift">
          <defs>
            <pattern id="waterWaves" x="0" y="0" width="60" height="30" patternUnits="userSpaceOnUse">
              <path
                d="M0 15 Q15 5, 30 15 T60 15"
                fill="none"
                stroke="#0ea5e9"
                strokeWidth="1"
                opacity="0.4"
              />
              <path
                d="M0 25 Q15 15, 30 25 T60 25"
                fill="none"
                stroke="#38bdf8"
                strokeWidth="0.5"
                opacity="0.3"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#waterWaves)" />
        </svg>
      </div>

      {/* Subtle vignette overlay */}
      <div className="absolute inset-0 pointer-events-none bg-radial-vignette opacity-40" />

      {/* Main SVG Map */}
      <svg
        viewBox="0 0 400 450"
        className="w-full h-full relative z-10"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Enhanced definitions for gradients and filters */}
        <defs>
          {/* Glow filter for elements */}
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Shadow filter for islands */}
          <filter id="islandShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="2" dy="3" stdDeviation="3" floodColor="#0f172a" floodOpacity="0.5" />
          </filter>

          {/* Route glow filter */}
          <filter id="routeGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Selection gradient */}
          <linearGradient id="selectionGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="50%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>

          {/* Route gradient */}
          <linearGradient id="routeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#1d4ed8" />
            <stop offset="50%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#1d4ed8" />
          </linearGradient>

          {/* Island terrain gradients */}
          <linearGradient id="terrain-shoalhold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#475569" />
            <stop offset="50%" stopColor="#334155" />
            <stop offset="100%" stopColor="#1e293b" />
          </linearGradient>

          <linearGradient id="terrain-greenbarrow" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#365314" />
            <stop offset="40%" stopColor="#3f6212" />
            <stop offset="100%" stopColor="#1a2e05" />
          </linearGradient>

          <linearGradient id="terrain-timberwake" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#166534" />
            <stop offset="50%" stopColor="#15803d" />
            <stop offset="100%" stopColor="#14532d" />
          </linearGradient>

          {/* Default terrain gradient */}
          <radialGradient id="islandGradient">
            <stop offset="0%" stopColor="#334155" />
            <stop offset="100%" stopColor="#1e293b" />
          </radialGradient>

          {/* Water depth gradient for background */}
          <radialGradient id="oceanDepth" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="#0c4a6e" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#082f49" stopOpacity="0.1" />
          </radialGradient>
        </defs>

        {/* Ocean depth effect */}
        <rect width="100%" height="100%" fill="url(#oceanDepth)" />

        {/* Decorative compass rose */}
        <g transform="translate(360, 420)" opacity="0.3">
          <circle r="20" fill="none" stroke="#64748b" strokeWidth="1" />
          <path d="M0,-18 L0,18 M-18,0 L18,0" stroke="#64748b" strokeWidth="0.5" />
          <path d="M0,-15 L3,0 L0,15 L-3,0 Z" fill="#94a3b8" opacity="0.5" />
          <text y="-22" textAnchor="middle" fill="#64748b" fontSize="6">N</text>
        </g>

        {/* Scale indicator */}
        <g transform="translate(30, 420)" opacity="0.4">
          <line x1="0" y1="0" x2="50" y2="0" stroke="#64748b" strokeWidth="2" />
          <line x1="0" y1="-3" x2="0" y2="3" stroke="#64748b" strokeWidth="1" />
          <line x1="50" y1="-3" x2="50" y2="3" stroke="#64748b" strokeWidth="1" />
          <text x="25" y="12" textAnchor="middle" fill="#64748b" fontSize="7">~50 leagues</text>
        </g>

        {/* Trade Routes (drawn first, behind everything) */}
        {activeRoutes.map((route) => (
          <TradeRoute key={route.shipId} from={route.from} to={route.to} />
        ))}

        {/* Islands */}
        {islands.map((island) => (
          <IslandNode
            key={island.id}
            island={island}
            isSelected={selectedId === island.id}
            onClick={() => onSelectIsland(island.id)}
            onMouseEnter={(e) => handleMouseEnter('island', island.id, e)}
            onMouseLeave={handleMouseLeave}
          />
        ))}

        {/* Ships */}
        {shipPositions.map(({ ship, position }) => (
          <ShipMarker
            key={ship.id}
            ship={ship}
            position={position}
            isSelected={selectedId === ship.id}
            onClick={() => onSelectShip(ship.id)}
            onMouseEnter={(e) => handleMouseEnter('ship', ship.id, e)}
            onMouseLeave={handleMouseLeave}
            islands={islands}
          />
        ))}

        {/* Map title */}
        <text
          x="200"
          y="25"
          textAnchor="middle"
          fill="#94a3b8"
          fontSize="14"
          fontWeight="600"
          letterSpacing="2"
          opacity="0.7"
        >
          THE ARCHIPELAGO
        </text>
      </svg>

      {/* Tooltip */}
      {hoveredItem && (hoveredIsland || hoveredShip) && (
        <MapTooltip
          island={hoveredIsland}
          ship={hoveredShip}
          position={hoveredItem.position}
        />
      )}
    </div>
  );
}
