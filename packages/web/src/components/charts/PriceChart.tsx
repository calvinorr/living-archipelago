'use client';

import { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { PriceHistoryPoint, GoodId } from '@/lib/types';
import { GOODS } from '@/lib/types';

interface PriceChartProps {
  history: PriceHistoryPoint[];
  islands: Array<{ id: string; name: string }>;
}

export function PriceChart({ history, islands }: PriceChartProps) {
  const [selectedGood, setSelectedGood] = useState<GoodId>('fish');

  // Transform data for the chart
  const chartData = history.map((point) => {
    const row: Record<string, number | string> = {
      tick: point.tick,
      time: `D${point.gameDay} ${point.gameHour}:00`,
    };

    for (const island of islands) {
      row[island.id] = point.prices[island.id]?.[selectedGood] ?? 0;
    }

    return row;
  });

  // Colors for each island
  const islandColors = ['#3b82f6', '#10b981', '#f59e0b'];

  return (
    <Card className="w-full h-full">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <CardTitle>Price History</CardTitle>
          <div className="flex gap-1">
            {(Object.keys(GOODS) as GoodId[]).map((goodId) => (
              <Button
                key={goodId}
                variant={selectedGood === goodId ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setSelectedGood(goodId)}
              >
                {GOODS[goodId].emoji}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="h-[250px]">
        {chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            No data yet - start the simulation
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="tick"
                stroke="hsl(var(--muted-foreground))"
                fontSize={10}
                tickLine={false}
              />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                fontSize={10}
                tickLine={false}
                tickFormatter={(v) => `$${v}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 'var(--radius)',
                  fontSize: '12px',
                }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              {islands.map((island, idx) => (
                <Line
                  key={island.id}
                  type="monotone"
                  dataKey={island.id}
                  name={island.name}
                  stroke={islandColors[idx % islandColors.length]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
