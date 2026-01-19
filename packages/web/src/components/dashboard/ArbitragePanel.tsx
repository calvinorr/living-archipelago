'use client';

import { useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import type { IslandSnapshot, GoodId } from '@/lib/types';
import { GOODS } from '@/lib/types';
import { formatPrice } from '@/lib/utils';

interface ArbitrageOpportunity {
  goodId: GoodId;
  buyIsland: IslandSnapshot;
  sellIsland: IslandSnapshot;
  buyPrice: number;
  sellPrice: number;
  profitPercent: number;
  profitAbsolute: number;
}

function calculateArbitrageOpportunities(islands: IslandSnapshot[]): ArbitrageOpportunity[] {
  if (islands.length < 2) return [];

  const opportunities: ArbitrageOpportunity[] = [];
  const goodIds = Object.keys(GOODS) as GoodId[];

  for (const goodId of goodIds) {
    // Find min and max prices across all islands for this good
    let minPrice = Infinity;
    let maxPrice = -Infinity;
    let buyIsland: IslandSnapshot | null = null;
    let sellIsland: IslandSnapshot | null = null;

    for (const island of islands) {
      const price = island.market.prices[goodId];
      if (price && price > 0) {
        if (price < minPrice) {
          minPrice = price;
          buyIsland = island;
        }
        if (price > maxPrice) {
          maxPrice = price;
          sellIsland = island;
        }
      }
    }

    // Only add if we have valid buy and sell islands (different islands)
    if (buyIsland && sellIsland && buyIsland.id !== sellIsland.id && minPrice > 0) {
      const profitPercent = ((maxPrice - minPrice) / minPrice) * 100;
      const profitAbsolute = maxPrice - minPrice;

      // Only show opportunities with at least 10% profit
      if (profitPercent >= 10) {
        opportunities.push({
          goodId,
          buyIsland,
          sellIsland,
          buyPrice: minPrice,
          sellPrice: maxPrice,
          profitPercent,
          profitAbsolute,
        });
      }
    }
  }

  // Sort by profit percentage, descending
  return opportunities.sort((a, b) => b.profitPercent - a.profitPercent);
}

function formatProfitPercent(percent: number): string {
  if (percent >= 100) {
    return `+${Math.round(percent)}%`;
  }
  return `+${percent.toFixed(0)}%`;
}

function getProfitColor(percent: number): string {
  if (percent >= 100) return 'text-green-400';
  if (percent >= 50) return 'text-emerald-400';
  if (percent >= 25) return 'text-lime-400';
  return 'text-yellow-400';
}

interface ArbitragePanelProps {
  islands: IslandSnapshot[];
  maxItems?: number;
}

export function ArbitragePanel({ islands, maxItems = 5 }: ArbitragePanelProps) {
  const opportunities = useMemo(
    () => calculateArbitrageOpportunities(islands).slice(0, maxItems),
    [islands, maxItems]
  );

  return (
    <Card className="w-full h-full">
      <CardHeader className="pb-2 pt-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <span>Trade Opportunities</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-3">
        {opportunities.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-2">
            No significant arbitrage opportunities
          </div>
        ) : (
          <div className="space-y-2">
            {opportunities.map((opp) => (
              <div
                key={opp.goodId}
                className="flex items-center justify-between text-sm bg-secondary/30 rounded px-2 py-1.5"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span>{GOODS[opp.goodId].emoji}</span>
                  <span className="font-medium">{GOODS[opp.goodId].name}:</span>
                  <span className="text-muted-foreground truncate">
                    {opp.buyIsland.name} ({formatPrice(opp.buyPrice)})
                  </span>
                  <span className="text-muted-foreground">-&gt;</span>
                  <span className="text-muted-foreground truncate">
                    {opp.sellIsland.name} ({formatPrice(opp.sellPrice)})
                  </span>
                </div>
                <span className={`font-mono font-medium ${getProfitColor(opp.profitPercent)} ml-2 flex-shrink-0`}>
                  {formatProfitPercent(opp.profitPercent)}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
