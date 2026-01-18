'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { LLMMetricsSummary } from '@/lib/types';
import { formatNumber } from '@/lib/utils';

interface LLMMetricsPanelProps {
  metrics: LLMMetricsSummary | null;
  enabled: boolean;
}

export function LLMMetricsPanel({ metrics, enabled }: LLMMetricsPanelProps) {
  if (!metrics) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <span className="text-lg">🤖</span> LLM Metrics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {enabled ? 'Waiting for LLM calls...' : 'LLM disabled (mock mode)'}
          </p>
        </CardContent>
      </Card>
    );
  }

  const costDisplay = metrics.totalCostUsd < 0.01
    ? `$${metrics.totalCostUsd.toFixed(6)}`
    : `$${metrics.totalCostUsd.toFixed(4)}`;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span className="text-lg">🤖</span> LLM Metrics
          </span>
          <span className={`text-xs px-2 py-0.5 rounded ${enabled ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
            {enabled ? 'LIVE' : 'MOCK'}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="bg-secondary/50 rounded p-2">
            <div className="text-muted-foreground text-xs">Calls</div>
            <div className="font-mono font-medium">{metrics.totalCalls}</div>
          </div>
          <div className="bg-secondary/50 rounded p-2">
            <div className="text-muted-foreground text-xs">Total Cost</div>
            <div className="font-mono font-medium text-green-400">{costDisplay}</div>
          </div>
          <div className="bg-secondary/50 rounded p-2">
            <div className="text-muted-foreground text-xs">Tokens</div>
            <div className="font-mono font-medium">{formatNumber(metrics.totalTokens, 0)}</div>
          </div>
          <div className="bg-secondary/50 rounded p-2">
            <div className="text-muted-foreground text-xs">Avg Latency</div>
            <div className="font-mono font-medium">{metrics.avgLatencyMs}ms</div>
          </div>
        </div>

        {/* Token Breakdown */}
        <div className="text-xs text-muted-foreground">
          <span className="text-blue-400">{formatNumber(metrics.totalInputTokens, 0)} in</span>
          {' / '}
          <span className="text-purple-400">{formatNumber(metrics.totalOutputTokens, 0)} out</span>
          {metrics.callsPerMinute > 0 && (
            <span className="ml-2">({metrics.callsPerMinute.toFixed(1)} calls/min)</span>
          )}
        </div>

        {/* Recent Calls */}
        {metrics.recentCalls.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground font-medium">Recent Calls</div>
            <div className="max-h-32 overflow-y-auto space-y-1">
              {metrics.recentCalls.slice(0, 5).map((call) => (
                <div
                  key={call.id}
                  className="text-xs bg-secondary/30 rounded p-1.5 flex justify-between items-center"
                >
                  <span className="truncate flex-1 mr-2 text-muted-foreground">
                    {call.promptSummary.slice(0, 40)}...
                  </span>
                  <span className="flex-shrink-0 font-mono">
                    <span className="text-blue-400">{call.inputTokens}</span>
                    <span className="text-muted-foreground">/</span>
                    <span className="text-purple-400">{call.outputTokens}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
