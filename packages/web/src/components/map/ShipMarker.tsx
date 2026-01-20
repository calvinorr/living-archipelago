'use client';

import type { ShipSnapshot, Vector2, IslandSnapshot } from '@/lib/types';

interface ShipMarkerProps {
  ship: ShipSnapshot;
  position: Vector2;
  isSelected: boolean;
  onClick: () => void;
  onMouseEnter: (e: React.MouseEvent<SVGGElement>) => void;
  onMouseLeave: () => void;
  islands?: IslandSnapshot[];
}

// Calculate the angle the ship should face based on its route
function getShipRotation(ship: ShipSnapshot, islands?: IslandSnapshot[]): number {
  const location = ship.location;
  if (location.kind !== 'at_sea' || !islands) return 0;

  const route = location.route;
  const from = islands.find((i) => i.id === route.fromIslandId);
  const to = islands.find((i) => i.id === route.toIslandId);

  if (from && to) {
    const dx = to.position.x - from.position.x;
    const dy = to.position.y - from.position.y;
    return (Math.atan2(dy, dx) * 180) / Math.PI + 90;
  }
  return 0;
}

export function ShipMarker({
  ship,
  position,
  isSelected,
  onClick,
  onMouseEnter,
  onMouseLeave,
  islands,
}: ShipMarkerProps) {
  const isAtSea = ship.location.kind === 'at_sea';
  const rotation = getShipRotation(ship, islands);

  return (
    <g
      transform={`translate(${position.x}, ${position.y})`}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="cursor-pointer"
      style={{ transition: 'transform 0.5s ease-out' }}
    >
      {/* Selection ring */}
      {isSelected && (
        <circle
          r="18"
          fill="none"
          stroke="#3b82f6"
          strokeWidth="2"
          strokeDasharray="4 2"
          className="animate-spin"
          style={{ animationDuration: '4s' }}
        />
      )}

      {/* Wake effect when sailing */}
      {isAtSea && (
        <g transform={`rotate(${rotation})`} opacity={0.4}>
          <path
            d="M-4,8 Q-6,16 -8,22 M4,8 Q6,16 8,22 M0,10 L0,24"
            stroke="#60a5fa"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
          />
        </g>
      )}

      {/* Ship body */}
      <g transform={`rotate(${rotation})`}>
        {/* Hull */}
        <path
          d="M0,-10 L6,-2 L5,8 L-5,8 L-6,-2 Z"
          fill={isAtSea ? '#1e40af' : '#475569'}
          stroke={isAtSea ? '#60a5fa' : '#64748b'}
          strokeWidth="1.5"
        />

        {/* Sail when at sea */}
        {isAtSea && (
          <path
            d="M0,-8 Q4,-4 3,0 L0,-1 Q-3,-4 0,-8"
            fill="#f8fafc"
            opacity={0.9}
          />
        )}
      </g>

      {/* Status dot */}
      <circle
        cx={8}
        cy={-8}
        r="4"
        fill={isAtSea ? '#22c55e' : '#64748b'}
        stroke="#0f172a"
        strokeWidth="1"
      />
    </g>
  );
}
