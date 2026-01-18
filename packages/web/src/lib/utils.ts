import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(n: number, decimals = 0): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatPrice(price: number): string {
  return `$${formatNumber(price, 2)}`;
}

export function formatPercent(value: number): string {
  return `${formatNumber(value * 100, 1)}%`;
}

export function formatGameTime(day: number, hour: number): string {
  return `Day ${day}, ${hour.toString().padStart(2, '0')}:00`;
}

export function getHealthColor(health: number): string {
  if (health >= 0.8) return 'text-green-400';
  if (health >= 0.5) return 'text-yellow-400';
  return 'text-red-400';
}

export function getResourceColor(current: number, capacity: number): string {
  const ratio = current / capacity;
  if (ratio >= 0.7) return 'bg-green-500';
  if (ratio >= 0.3) return 'bg-yellow-500';
  return 'bg-red-500';
}

export function getPriceTrend(current: number, previous: number): 'up' | 'down' | 'stable' {
  const diff = current - previous;
  const threshold = previous * 0.02; // 2% threshold
  if (diff > threshold) return 'up';
  if (diff < -threshold) return 'down';
  return 'stable';
}
