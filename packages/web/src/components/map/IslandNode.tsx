'use client';

import type { IslandSnapshot } from '@/lib/types';

interface IslandNodeProps {
  island: IslandSnapshot;
  isSelected: boolean;
  onClick: () => void;
  onMouseEnter: (e: React.MouseEvent<SVGGElement>) => void;
  onMouseLeave: () => void;
}

// Get health-based color
function getHealthColor(health: number): string {
  if (health >= 0.7) return '#22c55e';
  if (health >= 0.4) return '#eab308';
  return '#ef4444';
}

// Calculate island size based on population
function getIslandSize(population: number): number {
  const baseSize = 24;
  const scaleFactor = Math.min(population / 300, 1.5);
  return baseSize + scaleFactor * 10;
}

// Island terrain shapes - unique per island
const ISLAND_SHAPES: Record<string, (s: number) => string> = {
  shoalhold: (s) => `M${-s},${s * 0.2}
    Q${-s * 0.6},${-s * 0.6} ${0},${-s * 0.7}
    Q${s * 0.6},${-s * 0.6} ${s},${s * 0.2}
    Q${s * 0.7},${s * 0.7} ${0},${s * 0.6}
    Q${-s * 0.7},${s * 0.7} ${-s},${s * 0.2} Z`,
  greenbarrow: (s) => `M${-s * 0.8},${s * 0.3}
    L${-s * 0.3},${-s * 0.8}
    L${s * 0.2},${-s * 0.5}
    Q${s * 0.8},${-s * 0.3} ${s * 0.7},${s * 0.4}
    Q${s * 0.4},${s * 0.7} ${-s * 0.3},${s * 0.5}
    Q${-s * 0.8},${s * 0.5} ${-s * 0.8},${s * 0.3} Z`,
  timberwake: (s) => `M${-s * 0.9},${0}
    Q${-s * 0.7},${-s * 0.5} ${0},${-s * 0.6}
    Q${s * 0.7},${-s * 0.5} ${s * 0.9},${0}
    Q${s * 0.7},${s * 0.6} ${0},${s * 0.7}
    Q${-s * 0.7},${s * 0.6} ${-s * 0.9},${0} Z`,
};

const DEFAULT_SHAPE = (s: number) => `M${-s},0
  Q${-s},${-s * 0.7} ${0},${-s * 0.8}
  Q${s},${-s * 0.7} ${s},0
  Q${s},${s * 0.7} ${0},${s * 0.8}
  Q${-s},${s * 0.7} ${-s},0 Z`;

export function IslandNode({
  island,
  isSelected,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: IslandNodeProps) {
  const { position, population, name } = island;
  const health = population.health;
  const healthColor = getHealthColor(health);
  const size = getIslandSize(population.size);
  const islandKey = name.toLowerCase().replace(/\s+/g, '');
  const shapePath = ISLAND_SHAPES[islandKey] || DEFAULT_SHAPE;

  return (
    <g
      transform={`translate(${position.x}, ${position.y})`}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="cursor-pointer"
    >
      {/* Selection ring */}
      {isSelected && (
        <circle
          r={size + 8}
          fill="none"
          stroke="#3b82f6"
          strokeWidth="2"
          strokeDasharray="6 3"
          className="animate-spin"
          style={{ animationDuration: '8s' }}
        />
      )}

      {/* Glow/shadow under island */}
      <ellipse
        rx={size * 1.1}
        ry={size * 0.5}
        cy={size * 0.5}
        fill={healthColor}
        opacity={0.15}
      />

      {/* Main island shape */}
      <path
        d={shapePath(size)}
        fill={`url(#terrain-${islandKey})`}
        stroke={healthColor}
        strokeWidth={isSelected ? 3 : 2}
        className="transition-all duration-200"
      />

      {/* Island name */}
      <text
        y={size + 14}
        textAnchor="middle"
        fill="#e2e8f0"
        fontSize="11"
        fontWeight="600"
        className="pointer-events-none select-none"
      >
        {name}
      </text>
    </g>
  );
}
