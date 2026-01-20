'use client';

import { useState } from 'react';
import { useAnalyst } from '@/hooks/useAnalyst';
import { ConfirmModal } from '@/components/ui/Modal';

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const getColor = (c: number) => {
    if (c >= 0.8) return 'bg-green-500/20 text-green-500';
    if (c >= 0.5) return 'bg-yellow-500/20 text-yellow-500';
    return 'bg-red-500/20 text-red-500';
  };

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${getColor(confidence)}`}>
      {Math.round(confidence * 100)}%
    </span>
  );
}

function StatusBadge({ status }: { status: 'pending' | 'applying' | 'applied' | 'rejected' }) {
  const colors = {
    pending: 'bg-blue-500/20 text-blue-500',
    applying: 'bg-yellow-500/20 text-yellow-500',
    applied: 'bg-green-500/20 text-green-500',
    rejected: 'bg-gray-500/20 text-gray-500',
  };

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${colors[status]}`}>
      {status === 'applying' ? 'Applying...' : status}
    </span>
  );
}

export function ImprovementQueue() {
  const { improvements, applyImprovement, rejectImprovement, resetSimulation, hasAppliedChanges, isResetting } = useAnalyst();
  const [showResetModal, setShowResetModal] = useState(false);

  const pendingImprovements = improvements.filter((i) => i.status === 'pending' || i.status === 'applying');
  const appliedImprovements = improvements.filter((i) => i.status === 'applied');
  const rejectedImprovements = improvements.filter((i) => i.status === 'rejected');

  const handleReset = async () => {
    setShowResetModal(false);
    await resetSimulation();
  };

  return (
    <div className="bg-card border rounded-lg p-4 flex flex-col h-full">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
        Suggested Improvements
      </h3>

      {/* Reset Prompt when changes applied */}
      {hasAppliedChanges && appliedImprovements.length > 0 && (
        <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <div className="text-sm text-blue-400 mb-2">
            {appliedImprovements.length} change(s) applied to config
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Reset the simulation to start fresh with the new config and track the impact of your changes.
          </p>
          <button
            onClick={() => setShowResetModal(true)}
            disabled={isResetting}
            className="w-full px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {isResetting ? 'Resetting...' : 'Reset Simulation & Start New Run'}
          </button>
        </div>
      )}

      {improvements.length === 0 ? (
        <div className="text-sm text-muted-foreground py-4 text-center flex-1 flex items-center justify-center">
          Run an analysis to get improvement suggestions
        </div>
      ) : (
        <div className="space-y-4 flex-1 overflow-y-auto min-h-0">
          {/* Pending */}
          {pendingImprovements.length > 0 && (
            <div>
              <h4 className="text-xs text-muted-foreground mb-2">
                Pending ({pendingImprovements.length})
              </h4>
              <div className="space-y-2">
                {pendingImprovements.map((imp) => {
                  const isApplying = imp.status === 'applying';
                  return (
                    <div
                      key={imp.id}
                      className={`p-3 bg-muted/20 rounded-md border border-border ${isApplying ? 'opacity-70' : ''}`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="font-medium text-sm flex-1 pr-2">{imp.title}</div>
                        <ConfidenceBadge confidence={imp.confidence} />
                      </div>

                      {imp.configPath && (
                        <div className="text-xs font-mono bg-background p-2 rounded mb-2 overflow-x-auto">
                          <div className="text-muted-foreground mb-1">{imp.configPath}</div>
                          <span className="text-red-500 line-through mr-2">
                            {JSON.stringify(imp.currentValue)}
                          </span>
                          <span className="text-green-500">
                            {JSON.stringify(imp.suggestedValue)}
                          </span>
                        </div>
                      )}

                      <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{imp.rationale}</p>

                      <div className="flex gap-2">
                        <button
                          onClick={() => applyImprovement(imp.id)}
                          disabled={isApplying}
                          className="flex-1 px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isApplying ? 'Applying...' : 'Apply'}
                        </button>
                        <button
                          onClick={() => rejectImprovement(imp.id)}
                          disabled={isApplying}
                          className="flex-1 px-3 py-1.5 text-xs bg-muted text-foreground rounded hover:bg-muted/80 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  );
                })}
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

      {/* Reset Confirmation Modal */}
      <ConfirmModal
        isOpen={showResetModal}
        onClose={() => setShowResetModal(false)}
        onConfirm={handleReset}
        title="Reset Simulation"
        message="This will start a new simulation run with the updated config. The current run data will be preserved in the database for comparison.\n\nProceed with reset?"
        confirmText="Reset & Start New Run"
        confirmVariant="primary"
        isLoading={isResetting}
      />
    </div>
  );
}
