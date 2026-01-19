'use client';

import { useAnalyst } from '@/hooks/useAnalyst';

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const getColor = (c: number) => {
    if (c >= 0.8) return 'bg-green-500/20 text-green-500';
    if (c >= 0.5) return 'bg-yellow-500/20 text-yellow-500';
    return 'bg-red-500/20 text-red-500';
  };

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${getColor(confidence)}`}>
      {Math.round(confidence * 100)}% confidence
    </span>
  );
}

function StatusBadge({ status }: { status: 'pending' | 'applied' | 'rejected' }) {
  const colors = {
    pending: 'bg-blue-500/20 text-blue-500',
    applied: 'bg-green-500/20 text-green-500',
    rejected: 'bg-gray-500/20 text-gray-500',
  };

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${colors[status]}`}>
      {status}
    </span>
  );
}

export function ImprovementQueue() {
  const { improvements, applyImprovement, rejectImprovement } = useAnalyst();

  const pendingImprovements = improvements.filter((i) => i.status === 'pending');
  const appliedImprovements = improvements.filter((i) => i.status === 'applied');
  const rejectedImprovements = improvements.filter((i) => i.status === 'rejected');

  return (
    <div className="bg-card border rounded-lg p-4">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
        Suggested Improvements
      </h3>

      {improvements.length === 0 ? (
        <div className="text-sm text-muted-foreground py-4 text-center">
          Run an analysis to get improvement suggestions
        </div>
      ) : (
        <div className="space-y-4">
          {/* Pending */}
          {pendingImprovements.length > 0 && (
            <div>
              <h4 className="text-xs text-muted-foreground mb-2">
                Pending ({pendingImprovements.length})
              </h4>
              <div className="space-y-2">
                {pendingImprovements.map((imp) => (
                  <div
                    key={imp.id}
                    className="p-3 bg-muted/20 rounded-md border border-border"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="font-medium text-sm">{imp.title}</div>
                      <ConfidenceBadge confidence={imp.confidence} />
                    </div>

                    {imp.configPath && (
                      <div className="text-xs font-mono bg-background p-2 rounded mb-2">
                        <span className="text-muted-foreground">{imp.configPath}:</span>{' '}
                        <span className="text-red-500 line-through">
                          {JSON.stringify(imp.currentValue)}
                        </span>{' '}
                        <span className="text-green-500">
                          {JSON.stringify(imp.suggestedValue)}
                        </span>
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground mb-3">{imp.rationale}</p>

                    <div className="flex gap-2">
                      <button
                        onClick={() => applyImprovement(imp.id)}
                        className="flex-1 px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                      >
                        Apply
                      </button>
                      <button
                        onClick={() => rejectImprovement(imp.id)}
                        className="flex-1 px-3 py-1.5 text-xs bg-muted text-foreground rounded hover:bg-muted/80"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Applied */}
          {appliedImprovements.length > 0 && (
            <div>
              <h4 className="text-xs text-muted-foreground mb-2">
                Applied ({appliedImprovements.length})
              </h4>
              <div className="space-y-2">
                {appliedImprovements.map((imp) => (
                  <div
                    key={imp.id}
                    className="p-3 bg-green-500/5 rounded-md border border-green-500/20"
                  >
                    <div className="flex justify-between items-start">
                      <div className="font-medium text-sm">{imp.title}</div>
                      <StatusBadge status="applied" />
                    </div>
                    {imp.appliedAt && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Applied: {new Date(imp.appliedAt).toLocaleString()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Rejected */}
          {rejectedImprovements.length > 0 && (
            <div>
              <h4 className="text-xs text-muted-foreground mb-2">
                Rejected ({rejectedImprovements.length})
              </h4>
              <div className="space-y-2">
                {rejectedImprovements.map((imp) => (
                  <div
                    key={imp.id}
                    className="p-3 bg-muted/10 rounded-md border border-border opacity-60"
                  >
                    <div className="flex justify-between items-start">
                      <div className="font-medium text-sm">{imp.title}</div>
                      <StatusBadge status="rejected" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
