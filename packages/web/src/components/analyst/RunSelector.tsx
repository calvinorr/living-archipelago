'use client';

import { useEffect } from 'react';
import { useAnalyst } from '@/hooks/useAnalyst';

export function RunSelector() {
  const { runs, selectedRunId, fetchRuns, selectRun, isAnalyzing } = useAnalyst();

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  return (
    <div className="bg-card border rounded-lg p-4">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
        Select Run
      </h3>

      {runs.length === 0 ? (
        <div className="text-sm text-muted-foreground py-2">
          No runs available. Run a simulation first.
        </div>
      ) : (
        <div className="space-y-2 max-h-[200px] overflow-y-auto">
          {runs.map((run) => (
            <button
              key={run.id}
              onClick={() => selectRun(run.id)}
              disabled={isAnalyzing}
              className={`w-full text-left p-3 rounded-md border transition-colors ${
                selectedRunId === run.id
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:border-primary/50 hover:bg-muted/50'
              } ${isAnalyzing ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-medium text-sm">Run #{run.id}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Seed: {run.seed}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">
                    {run.duration} ticks
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {new Date(run.startedAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
