'use client';

import { useEffect, useState } from 'react';
import { useAnalyst } from '@/hooks/useAnalyst';
import { ConfirmModal, AlertModal } from '@/components/ui/Modal';

interface ModalState {
  type: 'none' | 'delete' | 'deleteAll' | 'alert';
  runId?: number;
  message?: string;
}

export function RunSelector() {
  const { runs, selectedRunId, currentRunId, fetchRuns, selectRun, deleteRun, deleteAllRuns, isAnalyzing } = useAnalyst();
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [modal, setModal] = useState<ModalState>({ type: 'none' });

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  const handleDeleteClick = (e: React.MouseEvent, runId: number) => {
    e.stopPropagation();
    if (runId === currentRunId) {
      setModal({ type: 'alert', message: 'Cannot delete the currently active run.' });
      return;
    }
    setModal({ type: 'delete', runId });
  };

  const handleDeleteConfirm = async () => {
    if (modal.runId === undefined) return;
    const runId = modal.runId;
    setModal({ type: 'none' });
    setDeletingId(runId);
    await deleteRun(runId);
    setDeletingId(null);
  };

  const handleDeleteAllClick = () => {
    const deletableCount = runs.filter(r => r.id !== currentRunId).length;
    if (deletableCount === 0) {
      setModal({ type: 'alert', message: 'No runs to delete (only the current run exists).' });
      return;
    }
    setModal({
      type: 'deleteAll',
      message: `Delete ${deletableCount} run(s)? This cannot be undone.\n\nThe current run (#${currentRunId}) will be kept.`,
    });
  };

  const handleDeleteAllConfirm = async () => {
    setModal({ type: 'none' });
    setDeletingAll(true);
    await deleteAllRuns();
    setDeletingAll(false);
  };

  const closeModal = () => setModal({ type: 'none' });

  return (
    <>
      <div className="bg-card border rounded-lg p-4">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Select Run
          </h3>
          <div className="flex gap-2">
            <button
              onClick={handleDeleteAllClick}
              disabled={isAnalyzing || deletingAll || runs.length <= 1}
              className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Delete all runs except current"
            >
              {deletingAll ? 'Deleting...' : 'Delete All'}
            </button>
            <button
              onClick={() => fetchRuns()}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Refresh
            </button>
          </div>
        </div>

        {runs.length === 0 ? (
          <div className="text-sm text-muted-foreground py-2">
            No runs available. Run a simulation first.
          </div>
        ) : (
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {runs.map((run) => {
              const isCurrent = run.id === currentRunId;
              return (
                <div
                  key={run.id}
                  className={`relative p-3 rounded-md border transition-colors ${
                    selectedRunId === run.id
                      ? 'border-primary bg-primary/10'
                      : isCurrent
                      ? 'border-green-500/50 bg-green-500/5'
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
                        <div className="font-medium text-sm flex items-center gap-2">
                          Run #{run.id}
                          {isCurrent && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">
                              ACTIVE
                            </span>
                          )}
                        </div>
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

                  {/* Delete button - hidden for current run */}
                  {!isCurrent && (
                    <button
                      onClick={(e) => handleDeleteClick(e, run.id)}
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
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Single Run Confirmation */}
      <ConfirmModal
        isOpen={modal.type === 'delete'}
        onClose={closeModal}
        onConfirm={handleDeleteConfirm}
        title="Delete Run"
        message={`Delete run #${modal.runId}? This cannot be undone.`}
        confirmText="Delete"
        confirmVariant="danger"
      />

      {/* Delete All Runs Confirmation */}
      <ConfirmModal
        isOpen={modal.type === 'deleteAll'}
        onClose={closeModal}
        onConfirm={handleDeleteAllConfirm}
        title="Delete All Runs"
        message={modal.message || ''}
        confirmText="Delete All"
        confirmVariant="danger"
        isLoading={deletingAll}
      />

      {/* Alert Modal */}
      <AlertModal
        isOpen={modal.type === 'alert'}
        onClose={closeModal}
        title="Notice"
        message={modal.message || ''}
        variant="warning"
      />
    </>
  );
}
