'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import type { AgentDecision } from '@/lib/types';

interface AgentPanelProps {
  decisions: AgentDecision[];
  maxItems?: number;
}

// Parse action details into human-readable format
function formatAction(action: { type: string; details: string }): {
  icon: string;
  text: string;
  color: string;
} {
  try {
    const data = JSON.parse(action.details);

    switch (action.type) {
      case 'trade': {
        const tx = data.transactions?.[0];
        if (!tx) return { icon: '?', text: 'Unknown trade', color: 'text-muted-foreground' };
        const isBuy = tx.quantity > 0;
        const qty = Math.abs(tx.quantity).toFixed(0);
        const good = tx.goodId;
        const island = data.islandId?.replace(/^\w/, (c: string) => c.toUpperCase());
        return {
          icon: isBuy ? '+' : '-',
          text: `${isBuy ? 'Buy' : 'Sell'} ${qty} ${good} at ${island}`,
          color: isBuy ? 'text-blue-400' : 'text-green-400',
        };
      }
      case 'navigate': {
        const dest = data.destinationId?.replace(/^\w/, (c: string) => c.toUpperCase());
        return {
          icon: '~',
          text: `Sail to ${dest}`,
          color: 'text-orange-400',
        };
      }
      case 'wait':
        return {
          icon: '-',
          text: 'Waiting',
          color: 'text-muted-foreground',
        };
      default:
        return {
          icon: '?',
          text: action.details.slice(0, 50),
          color: 'text-muted-foreground',
        };
    }
  } catch {
    return {
      icon: '?',
      text: action.details.slice(0, 50),
      color: 'text-muted-foreground',
    };
  }
}

// Get ship name from action if available
function getShipName(action: { details: string }): string | null {
  try {
    const data = JSON.parse(action.details);
    const shipId = data.shipId;
    // Map known ship IDs to names
    const shipNames: Record<string, string> = {
      'sloop-1': 'Sea Trader',
      'sloop-2': 'Wave Runner',
    };
    return shipNames[shipId] || shipId;
  } catch {
    return null;
  }
}

export function AgentPanel({ decisions, maxItems = 5 }: AgentPanelProps) {
  // Take only recent decisions with actions
  const recentDecisions = decisions
    .filter(d => d.actions.length > 0)
    .slice(0, maxItems);

  if (recentDecisions.length === 0) {
    return (
      <Card className="w-full h-full">
        <CardHeader className="pb-2 pt-3">
          <CardTitle className="text-sm flex items-center gap-2">
            Agent Activity
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-3">
          <div className="text-muted-foreground text-sm text-center py-2">
            No agent actions yet
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full h-full overflow-hidden">
      <CardHeader className="pb-2 pt-3">
        <CardTitle className="text-sm flex items-center gap-2">
          Agent Activity
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-3 space-y-2">
        {recentDecisions.map((decision, idx) => (
          <div
            key={`${decision.agentId}-${decision.tick}-${idx}`}
            className="bg-secondary/30 rounded px-2 py-1.5"
          >
            <div className="flex justify-between items-center text-xs text-muted-foreground mb-1">
              <span>Tick {decision.tick}</span>
              <span>{decision.actions.length} action{decision.actions.length !== 1 ? 's' : ''}</span>
            </div>

            <div className="space-y-1">
              {decision.actions.map((action, aIdx) => {
                const formatted = formatAction(action);
                const shipName = getShipName(action);
                return (
                  <div key={aIdx} className="flex items-center gap-2 text-sm">
                    <span className={`font-mono font-bold w-4 text-center ${formatted.color}`}>
                      {formatted.icon}
                    </span>
                    <span className="flex-1">{formatted.text}</span>
                    {shipName && (
                      <span className="text-xs text-muted-foreground">
                        ({shipName})
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
