'use client';

import { useEffect, useState } from 'react';
import { useAnalyst } from '@/hooks/useAnalyst';

export function RunSelector() {
  const { runs, selectedRunId, fetchRuns, selectRun, deleteRun, isAnalyzing } = useAnalyst();
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  const handleDelete = async (e: React.MouseEvent, runId: number) => {
    e.stopPropagation();
    if (!confirm(`Delete run #${runId}? This cannot be undone.`)) return;

    setDeletingId(runId);
    await deleteRun(runId);
    setDeletingId(null);
  };

  return (
    <div className="bg-card border rounded-lg p-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Select Run
        </h3>
        <button
          onClick={() => fetchRuns()}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Refresh
        </button>
      </div>

      {runs.length === 0 ? (
        <div className="text-sm text-muted-foreground py-2">
          No runs available. Run a simulation first.
        </div>
      ) : (
        <div className="space-y-2 max-h-[200px] overflow-y-auto">
          {runs.map((run) => (
            <div
              key={run.id}
              className={`relative p-3 rounded-md border transition-colors ${
                selectedRunId === run.id
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:border-primary/50 hover:bg-muted/50'
              } ${isAnalyzing || deletingId === run.id ? 'opacity-50' : ''}`}
            >
              <button
                onClick={() => selectRun(run.id)}
                disabled={isAnalyzing || deletingId === run.id}
                className="w-full text-left"
              >
                <div className="flex justify-between items-start pr-6">
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

              {/* Delete button */}
              <button
                onClick={(e) => handleDelete(e, run.id)}
                disabled={isAnalyzing || deletingId === run.id}
                className="absolute top-2 right-2 p-1 text-muted-foreground hover:text-red-500 transition-colors"
                title="Delete run"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 6h18" />
                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
