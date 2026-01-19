'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import type { IslandSnapshot, ShipSnapshot, EconomyHistoryPoint } from '@/lib/types';

interface EconomicsPanelProps {
  islands: IslandSnapshot[];
  ships: ShipSnapshot[];
  economyHistory: EconomyHistoryPoint[];
  taxCollected: number;
}

export function EconomicsPanel({
  islands,
  ships,
  economyHistory,
  taxCollected,
}: EconomicsPanelProps) {
  // Calculate metrics
  const totalMoneySupply = ships.reduce((sum, s) => sum + s.cash, 0);

  // Calculate average fish stock ratio
  const avgFishStock = islands.length > 0
    ? islands.reduce((sum, i) => sum + i.ecosystem.fishStock / i.ecosystem.fishCapacity, 0) / islands.length
    : 0;

  // Price volatility by good category (std dev of prices across islands)
  const priceVolatility = calculatePriceVolatility(islands);

  // Labor distribution summary
  const laborDistribution = calculateLaborDistribution(islands);

  // Format currency
  const formatCurrency = (val: number) => `$${val.toFixed(0)}`;
  const formatPercent = (val: number) => `${(val * 100).toFixed(1)}%`;

  return (
    <div className="space-y-4">
      {/* Key Metrics Row */}
      <div className="grid grid-cols-4 gap-3">
        <MetricCard
          label="Money Supply"
          value={formatCurrency(totalMoneySupply)}
          trend={economyHistory.length > 1 ? totalMoneySupply - economyHistory[economyHistory.length - 2]?.totalMoneySupply : 0}
        />
        <MetricCard
          label="Tax Collected"
          value={formatCurrency(taxCollected)}
          subtext="Currency destroyed"
        />
        <MetricCard
          label="Avg Fish Stock"
          value={formatPercent(avgFishStock)}
          trend={null}
        />
        <MetricCard
          label="Active Ships"
          value={ships.length.toString()}
          subtext={`$${(totalMoneySupply / Math.max(ships.length, 1)).toFixed(0)} avg`}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-2 gap-3">
        {/* Money Supply Trend */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Money Supply & Tax</CardTitle>
          </CardHeader>
          <CardContent className="h-[180px]">
            {economyHistory.length > 2 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={economyHistory.slice(-50)} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="tick" fontSize={10} tickLine={false} stroke="hsl(var(--muted-foreground))" />
                  <YAxis fontSize={10} tickLine={false} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `$${v}`} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', fontSize: '12px' }} />
                  <Line type="monotone" dataKey="totalMoneySupply" name="Money" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="totalTaxCollected" name="Tax" stroke="#ef4444" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                Collecting data...
              </div>
            )}
          </CardContent>
        </Card>

        {/* Fish Stock by Island */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Fish Stock by Island</CardTitle>
          </CardHeader>
          <CardContent className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={islands.map(i => ({
                name: i.name.slice(0, 8),
                stock: (i.ecosystem.fishStock / i.ecosystem.fishCapacity * 100).toFixed(1),
              }))} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" fontSize={10} tickLine={false} stroke="hsl(var(--muted-foreground))" />
                <YAxis fontSize={10} tickLine={false} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `${v}%`} />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', fontSize: '12px' }} />
                <Bar dataKey="stock" name="Fish %" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Price Volatility & Labor */}
      <div className="grid grid-cols-2 gap-3">
        {/* Price Volatility by Category */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Price Spread by Good</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {priceVolatility.map(({ good, spread, emoji }) => (
                <div key={good} className="flex items-center gap-2">
                  <span className="text-sm w-6">{emoji}</span>
                  <span className="text-xs text-muted-foreground w-16">{good}</span>
                  <div className="flex-1 h-2 bg-muted rounded overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${Math.min(spread * 100, 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground w-12 text-right">{(spread * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Labor Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Avg Labor Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {laborDistribution.map(({ sector, share, emoji }) => (
                <div key={sector} className="flex items-center gap-2">
                  <span className="text-sm w-6">{emoji}</span>
                  <span className="text-xs text-muted-foreground w-16">{sector}</span>
                  <div className="flex-1 h-2 bg-muted rounded overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${share * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground w-12 text-right">{(share * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ label, value, trend, subtext }: { label: string; value: string; trend?: number | null; subtext?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-lg font-semibold flex items-center gap-2">
          {value}
          {trend !== undefined && trend !== null && trend !== 0 && (
            <span className={`text-xs ${trend > 0 ? 'text-green-500' : 'text-red-500'}`}>
              {trend > 0 ? '↑' : '↓'}
            </span>
          )}
        </div>
        {subtext && <div className="text-xs text-muted-foreground">{subtext}</div>}
      </CardContent>
    </Card>
  );
}

function calculatePriceVolatility(islands: IslandSnapshot[]): Array<{ good: string; spread: number; emoji: string }> {
  const goods = [
    { id: 'fish', emoji: '🐟' },
    { id: 'grain', emoji: '🌾' },
    { id: 'timber', emoji: '🪵' },
    { id: 'tools', emoji: '🔧' },
    { id: 'luxuries', emoji: '💎' },
  ];

  return goods.map(({ id, emoji }) => {
    const prices = islands.map(i => i.market.prices[id] || 10);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const spread = minPrice > 0 ? (maxPrice - minPrice) / minPrice : 0;
    return { good: id, spread, emoji };
  });
}

function calculateLaborDistribution(islands: IslandSnapshot[]): Array<{ sector: string; share: number; emoji: string }> {
  const sectors = [
    { id: 'fishing', emoji: '🎣' },
    { id: 'forestry', emoji: '🌲' },
    { id: 'farming', emoji: '🌾' },
    { id: 'industry', emoji: '🏭' },
    { id: 'services', emoji: '🏪' },
  ];

  if (islands.length === 0) return sectors.map(s => ({ sector: s.id, share: 0.2, emoji: s.emoji }));

  return sectors.map(({ id, emoji }) => {
    const avgShare = islands.reduce((sum, i) => sum + (i.population.labour[id as keyof typeof i.population.labour] || 0), 0) / islands.length;
    return { sector: id, share: avgShare, emoji };
  });
}
