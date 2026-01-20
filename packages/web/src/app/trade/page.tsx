'use client';

import { useMemo, useState } from 'react';
import { PageLayout } from '@/components/layout/PageLayout';
import { useSimulation } from '@/hooks/useSimulation';
import { GOODS } from '@/lib/types';
import type { GoodId, IslandSnapshot, ShipSnapshot, AgentDecision } from '@/lib/types';
import { formatPrice, formatNumber, formatPercent } from '@/lib/utils';

// ============================================================================
// KPI Summary Bar
// ============================================================================

function KPISummary({ ships, islands }: { ships: ShipSnapshot[]; islands: IslandSnapshot[] }) {
  const metrics = useMemo(() => {
    // Fleet cash
    const totalCash = ships.reduce((sum, s) => sum + s.cash, 0);

    // Cargo value (estimate using average prices)
    let cargoValue = 0;
    for (const ship of ships) {
      for (const [goodId, qty] of Object.entries(ship.cargo)) {
        if (qty > 0) {
          const avgPrice = islands.reduce((sum, i) => sum + (i.market.prices[goodId] ?? 0), 0) / islands.length;
          cargoValue += qty * avgPrice;
        }
      }
    }

    // Active routes
    const shipsAtSea = ships.filter(s => s.location.kind === 'at_sea').length;
    const shipsDocked = ships.filter(s => s.location.kind === 'at_island').length;

    // Total cargo utilization
    const totalCapacity = ships.reduce((sum, s) => sum + s.capacity, 0);
    const totalCargo = ships.reduce((sum, s) =>
      sum + Object.values(s.cargo).reduce((c, q) => c + q, 0), 0
    );
    const cargoUtilization = totalCapacity > 0 ? totalCargo / totalCapacity : 0;

    // Fleet health
    const avgCondition = ships.length > 0
      ? ships.reduce((sum, s) => sum + (s.condition ?? 1), 0) / ships.length
      : 1;

    // Total spoilage loss
    const totalSpoilageLoss = ships.reduce((sum, s) => sum + (s.cumulativeSpoilageLoss ?? 0), 0);

    // Fleet operating costs (burn rate)
    const fleetBurnRate = ships.reduce((sum, s) => sum + (s.operatingCosts?.total ?? 0), 0);

    // Total fleet debt
    const totalDebt = ships.reduce((sum, s) => sum + (s.credit?.debt ?? 0), 0);
    const totalCredit = ships.reduce((sum, s) => sum + (s.credit?.creditLimit ?? 0), 0);
    const avgDebtRatio = totalCredit > 0 ? totalDebt / totalCredit : 0;

    return {
      totalCash,
      cargoValue,
      totalValue: totalCash + cargoValue,
      shipsAtSea,
      shipsDocked,
      totalShips: ships.length,
      cargoUtilization,
      avgCondition,
      totalSpoilageLoss,
      fleetBurnRate,
      totalDebt,
      avgDebtRatio,
    };
  }, [ships, islands]);

  return (
    <div className="grid grid-cols-7 gap-2">
      <KPICard label="Fleet Value" value={formatPrice(metrics.totalValue)} subtext={`Cash: ${formatPrice(metrics.totalCash)}`} />
      <KPICard label="Cargo Value" value={formatPrice(metrics.cargoValue)} subtext={`${formatPercent(metrics.cargoUtilization)} utilized`} />
      <KPICard label="Ships Active" value={`${metrics.shipsAtSea}/${metrics.totalShips}`} subtext={`${metrics.shipsDocked} docked`} highlight={metrics.shipsAtSea > 0} />
      <KPICard label="Fleet Health" value={formatPercent(metrics.avgCondition)} subtext="Avg condition" color={metrics.avgCondition >= 0.7 ? 'green' : metrics.avgCondition >= 0.4 ? 'yellow' : 'red'} />
      <KPICard label="Burn Rate" value={formatPrice(metrics.fleetBurnRate)} subtext="Per tick" color={metrics.fleetBurnRate > 50 ? 'yellow' : undefined} />
      <KPICard label="Total Debt" value={formatPrice(metrics.totalDebt)} subtext={`${formatPercent(metrics.avgDebtRatio)} of limit`} color={metrics.avgDebtRatio > 0.5 ? 'red' : metrics.avgDebtRatio > 0 ? 'yellow' : 'green'} />
      <KPICard label="Islands" value={String(islands.length)} subtext="Trading posts" />
    </div>
  );
}

function KPICard({ label, value, subtext, highlight, color }: {
  label: string;
  value: string;
  subtext: string;
  highlight?: boolean;
  color?: 'green' | 'yellow' | 'red';
}) {
  const colorClass = color === 'green' ? 'text-green-400' : color === 'yellow' ? 'text-yellow-400' : color === 'red' ? 'text-red-400' : '';
  return (
    <div className={`bg-card border rounded-lg p-3 ${highlight ? 'border-primary' : ''}`}>
      <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className={`text-xl font-bold ${colorClass}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{subtext}</div>
    </div>
  );
}

// ============================================================================
// Price Matrix (Enhanced with Market Depth)
// ============================================================================

function PriceMatrix({ islands }: { islands: IslandSnapshot[] }) {
  const goodIds = Object.keys(GOODS) as GoodId[];

  // Find best buy/sell for each good
  const bestPrices = useMemo(() => {
    const result: Record<GoodId, { minIsland: string; maxIsland: string; min: number; max: number }> = {} as any;
    for (const goodId of goodIds) {
      let min = Infinity, max = -Infinity;
      let minIsland = '', maxIsland = '';
      for (const island of islands) {
        const price = island.market.prices[goodId] ?? 0;
        if (price > 0 && price < min) { min = price; minIsland = island.id; }
        if (price > max) { max = price; maxIsland = island.id; }
      }
      result[goodId] = { minIsland, maxIsland, min, max };
    }
    return result;
  }, [islands, goodIds]);

  // Get depth indicator for a good at an island
  const getDepthIndicator = (island: IslandSnapshot, goodId: string) => {
    const depth = island.market.depth;
    if (!depth) return null;
    const buyDepth = depth.buyDepth[goodId] ?? 0;
    const sellDepth = depth.sellDepth[goodId] ?? 0;
    const totalDepth = buyDepth + sellDepth;

    // Low depth warning (< 20 units)
    if (totalDepth < 20) return { level: 'low', color: 'text-red-400', icon: '!' };
    if (totalDepth < 50) return { level: 'medium', color: 'text-yellow-400', icon: '' };
    return { level: 'high', color: 'text-green-400', icon: '' };
  };

  return (
    <div className="bg-card border rounded-lg p-4">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
        Price Matrix
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 px-2 font-medium">Good</th>
              {islands.map(island => (
                <th key={island.id} className="text-right py-2 px-2 font-medium">
                  {island.name.slice(0, 8)}
                </th>
              ))}
              <th className="text-right py-2 px-2 font-medium text-muted-foreground">Spread</th>
            </tr>
          </thead>
          <tbody>
            {goodIds.map(goodId => {
              const best = bestPrices[goodId];
              const spreadPct = best.min > 0 ? ((best.max - best.min) / best.min) * 100 : 0;
              return (
                <tr key={goodId} className="border-b border-border/50 hover:bg-secondary/30">
                  <td className="py-2 px-2">
                    <span className="mr-2">{GOODS[goodId].emoji}</span>
                    {GOODS[goodId].name}
                  </td>
                  {islands.map(island => {
                    const price = island.market.prices[goodId] ?? 0;
                    const isBest = island.id === best.minIsland;
                    const isWorst = island.id === best.maxIsland;
                    const depthInfo = getDepthIndicator(island, goodId);
                    const depth = island.market.depth;
                    const buyDepth = depth?.buyDepth[goodId] ?? 0;
                    const sellDepth = depth?.sellDepth[goodId] ?? 0;

                    return (
                      <td
                        key={island.id}
                        className={`text-right py-2 px-2 font-mono group relative ${
                          isBest ? 'text-green-400 font-medium' :
                          isWorst ? 'text-red-400 font-medium' : ''
                        }`}
                      >
                        <div className="flex items-center justify-end gap-0.5">
                          {depthInfo?.level === 'low' && (
                            <span className="text-red-400 text-xs" title="Low market depth">!</span>
                          )}
                          {price > 0 ? formatPrice(price) : '-'}
                        </div>
                        {/* Depth tooltip */}
                        {depth && (
                          <div className="absolute z-10 hidden group-hover:block bg-popover border rounded-lg p-2 shadow-lg text-left min-w-36 bottom-full mb-1 right-0">
                            <div className="text-xs font-medium mb-1">Market Depth</div>
                            <div className="text-xs space-y-0.5">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Buy Depth:</span>
                                <span className="text-green-400">{formatNumber(buyDepth)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Sell Depth:</span>
                                <span className="text-red-400">{formatNumber(sellDepth)}</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className={`text-right py-2 px-2 font-mono ${
                    spreadPct >= 50 ? 'text-green-400' :
                    spreadPct >= 25 ? 'text-yellow-400' : 'text-muted-foreground'
                  }`}>
                    {spreadPct > 0 ? `${spreadPct.toFixed(0)}%` : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-2 text-xs text-muted-foreground">
        <span className="text-green-400">Green</span> = best buy, <span className="text-red-400">Red</span> = best sell, <span className="text-red-400">!</span> = low depth
      </div>
    </div>
  );
}

// ============================================================================
// Price Staleness Panel (Per-Ship Price Knowledge)
// ============================================================================

function PriceStalenessPanel({ ships, islands }: { ships: ShipSnapshot[]; islands: IslandSnapshot[] }) {
  // Get the first ship with price knowledge for display
  const shipWithPrices = ships.find(s => s.lastKnownPrices && Object.keys(s.lastKnownPrices).length > 0);

  const getStalenessColor = (age: number) => {
    if (age < 12) return 'bg-green-500';
    if (age < 24) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getStalenessTextColor = (age: number) => {
    if (age < 12) return 'text-green-400';
    if (age < 24) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getStalenessLabel = (age: number) => {
    if (age < 12) return 'Fresh';
    if (age < 24) return 'Aging';
    return 'Stale';
  };

  if (!shipWithPrices || !shipWithPrices.lastKnownPrices) {
    return null;
  }

  return (
    <div className="bg-card border rounded-lg p-4">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
        Price Intelligence ({shipWithPrices.name})
      </h3>
      <div className="space-y-2">
        {islands.map(island => {
          const knowledge = shipWithPrices.lastKnownPrices?.[island.id];
          const isUnknown = !knowledge;
          const age = knowledge?.age ?? 999;

          return (
            <div key={island.id} className="flex items-center justify-between bg-secondary/30 rounded px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="font-medium">{island.name}</span>
                {isUnknown ? (
                  <span className="text-muted-foreground text-lg">?</span>
                ) : (
                  <div className={`w-2 h-2 rounded-full ${getStalenessColor(age)}`} />
                )}
              </div>
              <div className="text-right">
                {isUnknown ? (
                  <span className="text-muted-foreground text-sm">Unknown</span>
                ) : (
                  <div>
                    <span className={`text-sm font-medium ${getStalenessTextColor(age)}`}>
                      {getStalenessLabel(age)}
                    </span>
                    <span className="text-xs text-muted-foreground ml-1">
                      ({age} ticks ago)
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 text-xs text-muted-foreground flex gap-3">
        <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1"></span>Fresh (&lt;12t)</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-yellow-500 mr-1"></span>Aging (12-24t)</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1"></span>Stale (&gt;24t)</span>
      </div>
    </div>
  );
}

// ============================================================================
// Island Treasury Panel (Enhanced with Import Budget & Affordability)
// ============================================================================

function IslandTreasuryPanel({ islands }: { islands: IslandSnapshot[] }) {
  // Calculate aggregate metrics
  const totals = useMemo(() => {
    let totalTreasury = 0;
    let totalExports = 0;
    let totalImports = 0;

    for (const island of islands) {
      if (island.treasury) {
        totalTreasury += island.treasury.balance;
        totalExports += island.treasury.cumulativeExportRevenue;
        totalImports += island.treasury.cumulativeImportCosts;
      }
    }

    return {
      totalTreasury,
      totalExports,
      totalImports,
      netTradeBalance: totalExports - totalImports,
    };
  }, [islands]);

  const getTreasuryColor = (balance: number) => {
    if (balance > 3000) return 'text-green-400';
    if (balance > 1000) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getTreasuryHealthColor = (balance: number, baseline: number = 5000) => {
    const ratio = balance / baseline;
    if (ratio >= 0.8) return 'bg-green-500';
    if (ratio >= 0.4) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  // Estimate typical cargo sale value (50 units at average price ~10)
  const typicalCargoValue = 500;

  // Estimate import budget as a portion of treasury available for imports
  const getImportBudget = (balance: number) => {
    // Islands typically spend up to 20% of treasury per tick on imports
    return balance * 0.2;
  };

  const canAffordTypicalCargo = (balance: number) => {
    return balance >= typicalCargoValue;
  };

  const getAffordabilityStatus = (balance: number) => {
    if (balance >= typicalCargoValue * 2) return { status: 'good', label: 'Can afford large cargo', color: 'text-green-400' };
    if (balance >= typicalCargoValue) return { status: 'ok', label: 'Can afford cargo', color: 'text-yellow-400' };
    if (balance >= typicalCargoValue * 0.5) return { status: 'low', label: 'Limited budget', color: 'text-orange-400' };
    return { status: 'critical', label: 'Cannot afford cargo', color: 'text-red-400' };
  };

  return (
    <div className="bg-card border rounded-lg p-4">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
        Island Economy
      </h3>

      {/* Aggregate stats */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        <div className="text-center">
          <div className="text-xs text-muted-foreground">Total Treasury</div>
          <div className={`font-mono font-bold ${getTreasuryColor(totals.totalTreasury)}`}>
            {formatPrice(totals.totalTreasury)}
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-muted-foreground">Exports</div>
          <div className="font-mono text-green-400">{formatPrice(totals.totalExports)}</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-muted-foreground">Imports</div>
          <div className="font-mono text-red-400">{formatPrice(totals.totalImports)}</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-muted-foreground">Trade Balance</div>
          <div className={`font-mono font-medium ${totals.netTradeBalance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {totals.netTradeBalance >= 0 ? '+' : ''}{formatPrice(totals.netTradeBalance)}
          </div>
        </div>
      </div>

      {/* Per-island breakdown */}
      <div className="space-y-2">
        {islands.map(island => {
          const treasury = island.treasury;
          const balance = treasury?.balance ?? 0;
          const income = treasury?.income ?? 0;
          const expenses = treasury?.expenses ?? 0;
          const exports = treasury?.cumulativeExportRevenue ?? 0;
          const imports = treasury?.cumulativeImportCosts ?? 0;
          const netFlow = income - expenses;
          const importBudget = getImportBudget(balance);
          const affordability = getAffordabilityStatus(balance);
          const canAfford = canAffordTypicalCargo(balance);

          return (
            <div key={island.id} className={`bg-secondary/30 rounded-lg p-2 ${!canAfford ? 'border border-red-500/30' : ''}`}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{island.name}</span>
                  {!canAfford && (
                    <span className="text-red-400 text-xs" title="Treasury too low to afford typical cargo sale">
                      !
                    </span>
                  )}
                </div>
                <span className={`font-mono font-bold ${getTreasuryColor(balance)}`}>
                  {formatPrice(balance)}
                </span>
              </div>

              {/* Treasury health bar */}
              <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden mb-2">
                <div
                  className={`h-full ${getTreasuryHealthColor(balance)} transition-all`}
                  style={{ width: `${Math.min(100, (balance / 5000) * 100)}%` }}
                />
              </div>

              <div className="grid grid-cols-4 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Pop: </span>
                  <span>{formatNumber(island.population.size)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Exp: </span>
                  <span className="text-green-400">{formatPrice(exports)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Imp: </span>
                  <span className="text-red-400">{formatPrice(imports)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Flow: </span>
                  <span className={netFlow >= 0 ? 'text-green-400' : 'text-red-400'}>
                    {netFlow >= 0 ? '+' : ''}{formatPrice(netFlow)}
                  </span>
                </div>
              </div>

              {/* Import Budget Row */}
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/30 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Import Budget:</span>
                  <span className="font-mono">{formatPrice(importBudget)}</span>
                </div>
                <span className={affordability.color}>
                  {affordability.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-2 text-xs text-muted-foreground">
        <span className="text-red-400">!</span> = cannot afford typical cargo (~{formatPrice(typicalCargoValue)})
      </div>
    </div>
  );
}

// ============================================================================
// Arbitrage Opportunities (Enhanced with Market Depth)
// ============================================================================

function ArbitrageOpportunities({ islands }: { islands: IslandSnapshot[] }) {
  const opportunities = useMemo(() => {
    if (islands.length < 2) return [];

    const opps: Array<{
      goodId: GoodId;
      buyIsland: IslandSnapshot;
      sellIsland: IslandSnapshot;
      buyPrice: number;
      sellPrice: number;
      profitPct: number;
      profitPerUnit: number;
      buyStock: number;
      buyDepth: number;
      sellDepth: number;
      depthWarning: boolean;
    }> = [];

    for (const goodId of Object.keys(GOODS) as GoodId[]) {
      let minPrice = Infinity, maxPrice = -Infinity;
      let buyIsland: IslandSnapshot | null = null;
      let sellIsland: IslandSnapshot | null = null;

      for (const island of islands) {
        const price = island.market.prices[goodId] ?? 0;
        if (price > 0 && price < minPrice) {
          minPrice = price;
          buyIsland = island;
        }
        if (price > maxPrice) {
          maxPrice = price;
          sellIsland = island;
        }
      }

      if (buyIsland && sellIsland && buyIsland.id !== sellIsland.id && minPrice > 0) {
        const profitPct = ((maxPrice - minPrice) / minPrice) * 100;
        if (profitPct >= 10) {
          // Get market depth info
          const buyDepth = buyIsland.market.depth?.sellDepth[goodId] ?? 0; // Sell depth = what you can buy
          const sellDepth = sellIsland.market.depth?.buyDepth[goodId] ?? 0; // Buy depth = what you can sell

          // Depth warning if either side has low liquidity relative to typical cargo (50 units)
          const depthWarning = buyDepth < 50 || sellDepth < 50;

          opps.push({
            goodId,
            buyIsland,
            sellIsland,
            buyPrice: minPrice,
            sellPrice: maxPrice,
            profitPct,
            profitPerUnit: maxPrice - minPrice,
            buyStock: buyIsland.inventory[goodId] ?? 0,
            buyDepth,
            sellDepth,
            depthWarning,
          });
        }
      }
    }

    return opps.sort((a, b) => b.profitPct - a.profitPct);
  }, [islands]);

  if (opportunities.length === 0) {
    return (
      <div className="bg-card border rounded-lg p-4 h-full">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Arbitrage Opportunities
        </h3>
        <div className="text-muted-foreground text-center py-8">
          No significant opportunities (&lt;10% spread)
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border rounded-lg p-4 h-full flex flex-col">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
        Arbitrage Opportunities ({opportunities.length})
      </h3>
      <div className="flex-1 overflow-y-auto space-y-2">
        {opportunities.map(opp => (
          <div key={opp.goodId} className={`bg-secondary/30 rounded-lg p-3 ${opp.depthWarning ? 'border border-yellow-500/30' : ''}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">{GOODS[opp.goodId].emoji}</span>
                <span className="font-medium">{GOODS[opp.goodId].name}</span>
                {opp.depthWarning && (
                  <span className="text-yellow-400 text-xs px-1.5 py-0.5 bg-yellow-500/20 rounded" title="Low market depth - may cause price slippage">
                    Low Depth
                  </span>
                )}
              </div>
              <span className={`font-mono font-bold ${
                opp.profitPct >= 100 ? 'text-green-400' :
                opp.profitPct >= 50 ? 'text-emerald-400' :
                'text-yellow-400'
              }`}>
                +{opp.profitPct.toFixed(0)}%
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground text-xs">Buy at</div>
                <div className="flex justify-between">
                  <span>{opp.buyIsland.name}</span>
                  <span className="text-green-400 font-mono">{formatPrice(opp.buyPrice)}</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Stock: {formatNumber(opp.buyStock)}</span>
                  {opp.buyDepth > 0 && (
                    <span className={opp.buyDepth < 50 ? 'text-yellow-400' : ''}>
                      Depth: {formatNumber(opp.buyDepth)}
                    </span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Sell at</div>
                <div className="flex justify-between">
                  <span>{opp.sellIsland.name}</span>
                  <span className="text-red-400 font-mono">{formatPrice(opp.sellPrice)}</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Profit: {formatPrice(opp.profitPerUnit)}/u</span>
                  {opp.sellDepth > 0 && (
                    <span className={opp.sellDepth < 50 ? 'text-yellow-400' : ''}>
                      Depth: {formatNumber(opp.sellDepth)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 text-xs text-muted-foreground">
        <span className="text-yellow-400">Low Depth</span> = may cause price slippage on large trades
      </div>
    </div>
  );
}

// ============================================================================
// Fleet Table (Enhanced with Economic Model V2 data)
// ============================================================================

function FleetTable({ ships, islands }: { ships: ShipSnapshot[]; islands: IslandSnapshot[] }) {
  const islandNames = useMemo(() => {
    const names: Record<string, string> = {};
    for (const island of islands) {
      names[island.id] = island.name;
    }
    return names;
  }, [islands]);

  // Calculate cargo value for each ship
  const getCargoValue = (ship: ShipSnapshot) => {
    let value = 0;
    for (const [goodId, qty] of Object.entries(ship.cargo)) {
      if (qty > 0) {
        const avgPrice = islands.reduce((sum, i) => sum + (i.market.prices[goodId] ?? 0), 0) / islands.length;
        value += qty * avgPrice;
      }
    }
    return value;
  };

  const getLocationInfo = (ship: ShipSnapshot) => {
    if (ship.location.kind === 'at_island') {
      return {
        status: 'Docked',
        location: islandNames[ship.location.islandId] || ship.location.islandId,
        progress: null,
        eta: null,
      };
    } else {
      const route = ship.location.route;
      return {
        status: 'En Route',
        location: `→ ${islandNames[route.toIslandId] || route.toIslandId}`,
        progress: route.progress,
        eta: route.etaHours,
      };
    }
  };

  const getConditionColor = (condition: number) => {
    if (condition >= 0.7) return 'bg-green-500';
    if (condition >= 0.4) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getDebtColor = (debtRatio: number) => {
    if (debtRatio === 0) return 'text-green-400';
    if (debtRatio < 0.5) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getDebtIcon = (debtRatio: number) => {
    if (debtRatio === 0) return '';
    if (debtRatio < 0.5) return '!';
    return '!!';
  };

  return (
    <div className="bg-card border rounded-lg p-4">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
        Fleet Status
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 px-2 font-medium">Ship</th>
              <th className="text-left py-2 px-2 font-medium">Status</th>
              <th className="text-left py-2 px-2 font-medium">Location</th>
              <th className="text-center py-2 px-2 font-medium">Condition</th>
              <th className="text-right py-2 px-2 font-medium">Cash</th>
              <th className="text-right py-2 px-2 font-medium">Debt</th>
              <th className="text-right py-2 px-2 font-medium">Op. Costs</th>
              <th className="text-right py-2 px-2 font-medium">Cargo</th>
              <th className="text-left py-2 px-2 font-medium">Manifest</th>
            </tr>
          </thead>
          <tbody>
            {ships.map(ship => {
              const info = getLocationInfo(ship);
              const cargoValue = getCargoValue(ship);
              const totalCargo = Object.values(ship.cargo).reduce((sum, q) => sum + q, 0);
              const cargoItems = Object.entries(ship.cargo).filter(([, qty]) => qty > 0);
              const condition = ship.condition ?? 1;
              const credit = ship.credit;
              const operatingCosts = ship.operatingCosts;
              const debtRatio = credit?.debtRatio ?? 0;

              return (
                <tr key={ship.id} className="border-b border-border/50 hover:bg-secondary/30">
                  <td className="py-2 px-2">
                    <div className="flex items-center gap-2">
                      <span>⛵</span>
                      <span className="font-medium">{ship.name}</span>
                    </div>
                  </td>
                  <td className="py-2 px-2">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      info.status === 'En Route' ? 'bg-blue-500/20 text-blue-400' : 'bg-secondary text-muted-foreground'
                    }`}>
                      {info.status}
                    </span>
                  </td>
                  <td className="py-2 px-2">
                    <div>{info.location}</div>
                    {info.progress !== null && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <div className="w-12 h-1 bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary transition-all"
                            style={{ width: `${info.progress * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {info.eta !== null ? `${info.eta.toFixed(1)}h` : ''}
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="py-2 px-2">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-12 h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div
                          className={`h-full ${getConditionColor(condition)} transition-all`}
                          style={{ width: `${condition * 100}%` }}
                        />
                      </div>
                      <span className="text-xs">{formatPercent(condition)}</span>
                    </div>
                  </td>
                  <td className="py-2 px-2 text-right font-mono">{formatPrice(ship.cash)}</td>
                  <td className="py-2 px-2 text-right">
                    {credit ? (
                      <div className="group relative">
                        <div className={`font-mono ${getDebtColor(debtRatio)}`}>
                          {credit.debt > 0 ? (
                            <>
                              <span className="text-xs mr-0.5">{getDebtIcon(debtRatio)}</span>
                              {formatPrice(credit.debt)}
                            </>
                          ) : (
                            <span className="text-green-400 text-xs">No debt</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatPrice(credit.availableCredit)} avail
                        </div>
                        {/* Tooltip */}
                        <div className="absolute z-10 hidden group-hover:block bg-popover border rounded-lg p-2 shadow-lg text-left min-w-48 bottom-full mb-1 right-0">
                          <div className="text-xs space-y-1">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Debt:</span>
                              <span className={getDebtColor(debtRatio)}>{formatPrice(credit.debt)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Credit Limit:</span>
                              <span>{formatPrice(credit.creditLimit)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Available:</span>
                              <span className="text-green-400">{formatPrice(credit.availableCredit)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Interest Rate:</span>
                              <span>{formatPercent(credit.interestRate)}/tick</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Total Interest Paid:</span>
                              <span className="text-red-400">{formatPrice(credit.cumulativeInterestPaid)}</span>
                            </div>
                            <div className="flex justify-between border-t border-border pt-1 mt-1">
                              <span className="text-muted-foreground">Debt Ratio:</span>
                              <span className={getDebtColor(debtRatio)}>{formatPercent(debtRatio)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">-</span>
                    )}
                  </td>
                  <td className="py-2 px-2 text-right">
                    {operatingCosts ? (
                      <div className="group relative">
                        <div className="font-mono text-orange-400">
                          {formatPrice(operatingCosts.total)}/t
                        </div>
                        {/* Tooltip */}
                        <div className="absolute z-10 hidden group-hover:block bg-popover border rounded-lg p-2 shadow-lg text-left min-w-44 bottom-full mb-1 right-0">
                          <div className="text-xs font-medium mb-1">Operating Costs/tick</div>
                          <div className="text-xs space-y-1">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Crew Wages:</span>
                              <span>{formatPrice(operatingCosts.crewWages)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Maintenance:</span>
                              <span>{formatPrice(operatingCosts.maintenance)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Port Fees:</span>
                              <span>{operatingCosts.portFees > 0 ? formatPrice(operatingCosts.portFees) : '-'}</span>
                            </div>
                            <div className="flex justify-between border-t border-border pt-1 mt-1 font-medium">
                              <span>Total:</span>
                              <span className="text-orange-400">{formatPrice(operatingCosts.total)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">-</span>
                    )}
                  </td>
                  <td className="py-2 px-2 text-right">
                    <div className="font-mono">{formatPrice(cargoValue)}</div>
                    <div className="text-xs text-muted-foreground">
                      {totalCargo}/{ship.capacity}
                    </div>
                    {(ship.cumulativeSpoilageLoss ?? 0) > 0 && (
                      <div className="text-red-400 font-mono text-xs">
                        -{formatPrice(ship.cumulativeSpoilageLoss ?? 0)} spoil
                      </div>
                    )}
                  </td>
                  <td className="py-2 px-2">
                    {cargoItems.length > 0 ? (
                      <div className="flex gap-1 flex-wrap">
                        {cargoItems.map(([goodId, qty]) => (
                          <span key={goodId} className="text-xs bg-secondary px-1.5 py-0.5 rounded">
                            {GOODS[goodId as GoodId]?.emoji} {formatNumber(qty)}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">Empty</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {ships.length === 0 && (
        <div className="text-center text-muted-foreground py-8">
          No ships in the simulation
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Activity Feed
// ============================================================================

function ActivityFeed({ decisions }: { decisions: AgentDecision[] }) {
  const recentDecisions = decisions.filter(d => d.actions.length > 0).slice(0, 8);

  const formatAction = (action: { type: string; details: string }) => {
    try {
      const data = JSON.parse(action.details);
      switch (action.type) {
        case 'trade': {
          const tx = data.transactions?.[0];
          if (!tx) return { text: 'Unknown trade', icon: '📦', color: '' };
          const isBuy = tx.quantity > 0;
          return {
            text: `${isBuy ? 'Bought' : 'Sold'} ${Math.abs(tx.quantity).toFixed(0)} ${tx.goodId}`,
            icon: isBuy ? '📥' : '📤',
            color: isBuy ? 'text-blue-400' : 'text-green-400',
          };
        }
        case 'navigate': {
          const dest = data.destinationId?.replace(/^\w/, (c: string) => c.toUpperCase());
          return { text: `Sailing to ${dest}`, icon: '⛵', color: 'text-orange-400' };
        }
        case 'wait':
          return { text: 'Waiting', icon: '⏸️', color: 'text-muted-foreground' };
        default:
          return { text: action.type, icon: '❓', color: '' };
      }
    } catch {
      return { text: action.details.slice(0, 30), icon: '❓', color: '' };
    }
  };

  return (
    <div className="bg-card border rounded-lg p-4 h-full flex flex-col">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
        Recent Activity
      </h3>
      {recentDecisions.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          No agent activity yet
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-1">
          {recentDecisions.flatMap(decision =>
            decision.actions.map((action, idx) => {
              const formatted = formatAction(action);
              return (
                <div
                  key={`${decision.tick}-${idx}`}
                  className="flex items-center gap-2 text-sm py-1 border-b border-border/30"
                >
                  <span className="text-xs text-muted-foreground w-12">T{decision.tick}</span>
                  <span>{formatted.icon}</span>
                  <span className={formatted.color}>{formatted.text}</span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Agent Strategy Panel
// ============================================================================

function AgentStrategyPanel({ decisions }: { decisions: AgentDecision[] }) {
  const latestWithStrategy = decisions.find(d => d.strategy);
  const latestWithReasoning = decisions.find(d => d.reasoning);
  const [showReasoning, setShowReasoning] = useState(false);

  return (
    <div className="bg-card border rounded-lg p-4 h-full flex flex-col">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
        AI Strategy
      </h3>
      {latestWithStrategy ? (
        <div className="flex-1 space-y-3">
          <div>
            <div className="text-xs text-muted-foreground">Current Strategy</div>
            <div className="font-medium capitalize">{latestWithStrategy.strategy?.type || 'Unknown'}</div>
          </div>
          {latestWithStrategy.strategy?.goal && (
            <div>
              <div className="text-xs text-muted-foreground">Goal</div>
              <div className="text-sm">{latestWithStrategy.strategy.goal}</div>
            </div>
          )}
          {latestWithStrategy.strategy?.targetRoute && (
            <div>
              <div className="text-xs text-muted-foreground">Target Route</div>
              <div className="text-sm">{latestWithStrategy.strategy.targetRoute}</div>
            </div>
          )}
          {latestWithStrategy.triggers.length > 0 && (
            <div>
              <div className="text-xs text-muted-foreground">Triggers</div>
              <div className="text-xs space-y-0.5 mt-1">
                {latestWithStrategy.triggers.slice(0, 3).map((t, i) => (
                  <div key={i} className="text-muted-foreground">{t}</div>
                ))}
              </div>
            </div>
          )}
          {latestWithReasoning?.reasoning && (
            <div>
              <button
                onClick={() => setShowReasoning(!showReasoning)}
                className="text-xs text-primary hover:underline"
              >
                {showReasoning ? 'Hide' : 'Show'} AI Reasoning
              </button>
              {showReasoning && (
                <div className="mt-2 text-xs text-muted-foreground bg-secondary/30 rounded p-2 max-h-32 overflow-y-auto">
                  {latestWithReasoning.reasoning}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          No strategy data yet
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Trade Page
// ============================================================================

function TradeContent() {
  const { world, agentDecisions } = useSimulation();

  const islands = world?.islands ?? [];
  const ships = world?.ships ?? [];

  // Check if any ship has price knowledge data
  const hasPriceKnowledge = ships.some(s => s.lastKnownPrices && Object.keys(s.lastKnownPrices).length > 0);

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
    <div className="h-full flex flex-col gap-4 overflow-hidden">
      {/* KPI Summary Bar */}
      <KPISummary ships={ships} islands={islands} />

      {/* Main Content: 3 columns */}
      <div className="flex-1 grid grid-cols-4 gap-4 min-h-0 overflow-hidden">
        {/* Left column: Price Matrix + Fleet Table */}
        <div className="col-span-2 flex flex-col gap-4 overflow-hidden">
          <PriceMatrix islands={islands} />
          <div className="flex-1 overflow-auto">
            <FleetTable ships={ships} islands={islands} />
          </div>
        </div>

        {/* Middle column: Island Economy + Price Intelligence */}
        <div className="flex flex-col gap-4 overflow-hidden">
          <div className="overflow-auto max-h-[45%]">
            <IslandTreasuryPanel islands={islands} />
          </div>
          {hasPriceKnowledge && (
            <div className="overflow-auto">
              <PriceStalenessPanel ships={ships} islands={islands} />
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-hidden">
            <ArbitrageOpportunities islands={islands} />
          </div>
        </div>

        {/* Right column: Activity + Strategy */}
        <div className="flex flex-col gap-4 overflow-hidden">
          <div className="flex-1 min-h-0">
            <ActivityFeed decisions={agentDecisions} />
          </div>
          <div className="h-56">
            <AgentStrategyPanel decisions={agentDecisions} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TradePage() {
  return (
    <PageLayout>
      <TradeContent />
    </PageLayout>
  );
}
