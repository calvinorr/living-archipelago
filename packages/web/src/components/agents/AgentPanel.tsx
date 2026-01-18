'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import type { AgentDecision } from '@/lib/types';

interface AgentPanelProps {
  decisions: AgentDecision[];
}

export function AgentPanel({ decisions }: AgentPanelProps) {
  if (decisions.length === 0) {
    return (
      <Card className="w-full h-full">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <span>🤖</span> Agent Decisions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground text-sm">
            No agent decisions yet. Enable AI agents to see their reasoning.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full h-full overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <span>🤖</span> Agent Decisions
        </CardTitle>
      </CardHeader>
      <CardContent className="max-h-[300px] overflow-y-auto space-y-3">
        {decisions.map((decision, idx) => (
          <div
            key={`${decision.agentId}-${decision.tick}-${idx}`}
            className="border-b border-border/50 pb-3 last:border-0"
          >
            <div className="flex justify-between items-start mb-1">
              <span className="font-medium text-sm">{decision.agentName}</span>
              <span className="text-xs text-muted-foreground">Tick {decision.tick}</span>
            </div>

            {decision.triggers.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {decision.triggers.map((trigger, tIdx) => (
                  <span
                    key={tIdx}
                    className="px-1.5 py-0.5 bg-primary/20 text-primary rounded text-xs"
                  >
                    {trigger}
                  </span>
                ))}
              </div>
            )}

            {decision.strategy && (
              <div className="text-sm mb-2">
                <span className="text-muted-foreground">Strategy: </span>
                <span className="text-foreground">{decision.strategy.type}</span>
                {decision.strategy.goal && (
                  <span className="text-muted-foreground"> — {decision.strategy.goal}</span>
                )}
              </div>
            )}

            {decision.actions.length > 0 && (
              <div className="space-y-1 mb-2">
                {decision.actions.map((action, aIdx) => (
                  <div key={aIdx} className="text-xs bg-secondary/50 rounded px-2 py-1">
                    <span className="font-medium">{action.type}:</span> {action.details}
                  </div>
                ))}
              </div>
            )}

            {decision.reasoning && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  Show LLM reasoning
                </summary>
                <pre className="mt-1 p-2 bg-secondary/30 rounded overflow-x-auto whitespace-pre-wrap text-muted-foreground">
                  {decision.reasoning}
                </pre>
              </details>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
