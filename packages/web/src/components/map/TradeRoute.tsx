'use client';

import type { Vector2 } from '@/lib/types';

interface TradeRouteProps {
  from: Vector2;
  to: Vector2;
}

export function TradeRoute({ from, to }: TradeRouteProps) {
  // Calculate midpoint for curved path
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;

  // Add slight curve offset perpendicular to the line
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  const offsetX = (-dy / length) * 15; // Perpendicular offset
  const offsetY = (dx / length) * 15;

  const controlX = midX + offsetX;
  const controlY = midY + offsetY;

  const pathD = `M${from.x},${from.y} Q${controlX},${controlY} ${to.x},${to.y}`;

  return (
    <g>
      {/* Outer glow layer */}
      <path
        d={pathD}
        stroke="url(#routeGradient)"
        strokeWidth="8"
        fill="none"
        opacity={0.15}
        filter="url(#routeGlow)"
      />

      {/* Main route path with gradient */}
      <path
        d={pathD}
        stroke="url(#routeGradient)"
        strokeWidth="3"
        fill="none"
        opacity={0.6}
        strokeLinecap="round"
      />

      {/* Animated dash overlay */}
      <path
        d={pathD}
        stroke="#60a5fa"
        strokeWidth="2"
        fill="none"
        strokeDasharray="12 8"
        strokeLinecap="round"
        className="animate-dash"
      />

      {/* Particle effect dots along route */}
      <circle r="3" fill="#3b82f6" opacity={0.8}>
        <animateMotion
          dur="3s"
          repeatCount="indefinite"
          path={pathD}
        />
      </circle>
      <circle r="2" fill="#60a5fa" opacity={0.6}>
        <animateMotion
          dur="3s"
          repeatCount="indefinite"
          path={pathD}
          begin="1s"
        />
      </circle>
      <circle r="2" fill="#93c5fd" opacity={0.4}>
        <animateMotion
          dur="3s"
          repeatCount="indefinite"
          path={pathD}
          begin="2s"
        />
      </circle>
    </g>
  );
}
