'use client';

import { useEffect, useState, useRef } from 'react';
import { useAnalyst } from '@/hooks/useAnalyst';
import { ConfirmModal, AlertModal } from '@/components/ui/Modal';

interface ModalState {
  type: 'none' | 'delete' | 'deleteAll' | 'alert';
  runId?: number;
  message?: string;
}

export function RunSelectorDropdown() {
  const { runs, selectedRunId, currentRunId, fetchRuns, selectRun, deleteRun, deleteAllRuns, isAnalyzing, analyzeRun } = useAnalyst();
  const [isOpen, setIsOpen] = useState(false);
  const [modal, setModal] = useState<ModalState>({ type: 'none' });
  const [isDeleting, setIsDeleting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedRun = runs.find(r => r.id === selectedRunId);
  const isCurrent = selectedRunId === currentRunId;

  const handleSelect = (runId: number) => {
    selectRun(runId);
    setIsOpen(false);
  };

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
    setIsDeleting(true);
    await deleteRun(runId);
    setIsDeleting(false);
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
    setIsDeleting(true);
    await deleteAllRuns();
    setIsDeleting(false);
  };

  const closeModal = () => setModal({ type: 'none' });

  return (
    <>
      <div className="flex items-center gap-3" ref={dropdownRef}>
        {/* Run Dropdown */}
        <div className="relative">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 border rounded-md hover:bg-muted transition-colors min-w-[180px]"
          >
            <span className="text-sm">
              {selectedRun ? (
                <>
                  Run #{selectedRun.id}
                  {selectedRunId === currentRunId && (
                    <span className="ml-2 text-xs text-green-400">(Active)</span>
                  )}
                </>
              ) : (
                <span className="text-muted-foreground">Select Run...</span>
              )}
            </span>
            <svg
              className={`w-4 h-4 ml-auto transition-transform ${isOpen ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Dropdown Menu */}
          {isOpen && (
            <div className="absolute top-full left-0 mt-1 w-64 bg-card border rounded-lg shadow-xl z-50 py-1 max-h-[300px] overflow-y-auto">
              {runs.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  No runs available
                </div>
              ) : (
                runs.map(run => {
                  const isRunCurrent = run.id === currentRunId;
                  const isSelected = run.id === selectedRunId;
                  return (
                    <div
                      key={run.id}
                      className={`flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-muted/50 ${
                        isSelected ? 'bg-primary/10' : ''
                      }`}
                      onClick={() => handleSelect(run.id)}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Run #{run.id}</span>
                        {isRunCurrent && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">
                            ACTIVE
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{run.duration}t</span>
                        {!isRunCurrent && (
                          <button
                            onClick={(e) => handleDeleteClick(e, run.id)}
                            className="p-1 text-muted-foreground hover:text-red-500 transition-colors"
                            title="Delete run"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}

              {/* Dropdown Actions */}
              <div className="border-t mt-1 pt-1">
                <button
                  onClick={handleDeleteAllClick}
                  disabled={runs.length <= 1 || isDeleting}
                  className="w-full px-3 py-2 text-left text-xs text-red-400 hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Delete All Runs (except active)
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Analyze Button */}
        <button
          onClick={() => selectedRunId && analyzeRun(selectedRunId)}
          disabled={!selectedRunId || isAnalyzing}
          className="px-4 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isAnalyzing ? 'Analyzing...' : 'Analyze Run'}
        </button>

        {/* Run Info */}
        {selectedRun && (
          <div className="text-xs text-muted-foreground">
            <span>Seed: {selectedRun.seed}</span>
            <span className="mx-2">|</span>
            <span>{selectedRun.duration} ticks</span>
            <span className="mx-2">|</span>
            <span>{new Date(selectedRun.startedAt).toLocaleDateString()}</span>
          </div>
        )}
      </div>

      {/* Modals */}
      <ConfirmModal
        isOpen={modal.type === 'delete'}
        onClose={closeModal}
        onConfirm={handleDeleteConfirm}
        title="Delete Run"
        message={`Delete run #${modal.runId}? This cannot be undone.`}
        confirmText="Delete"
        confirmVariant="danger"
      />

      <ConfirmModal
        isOpen={modal.type === 'deleteAll'}
        onClose={closeModal}
        onConfirm={handleDeleteAllConfirm}
        title="Delete All Runs"
        message={modal.message || ''}
        confirmText="Delete All"
        confirmVariant="danger"
        isLoading={isDeleting}
      />

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
