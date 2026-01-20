'use client';

import { useAnalyst } from '@/hooks/useAnalyst';
import { Navigation } from '@/components/layout/Navigation';
import { RunSelectorDropdown } from '@/components/analyst/RunSelectorDropdown';
import { AnalysisReport } from '@/components/analyst/AnalysisReport';
import { AnalystChat } from '@/components/analyst/AnalystChat';
import { ImprovementQueue } from '@/components/analyst/ImprovementQueue';

export default function AnalystPage() {
  const { error, clearError } = useAnalyst();

  return (
    <div className="h-screen flex flex-col p-4">
      {/* Header with Navigation */}
      <header className="bg-card border rounded-lg mb-4 flex-shrink-0">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold tracking-tight">Living Archipelago</h1>
            <Navigation />
          </div>
        </div>
      </header>

      {/* Run Selector Bar */}
      <div className="bg-card border rounded-lg mb-4 px-4 py-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Economic Analyst</span>
            <span className="text-muted-foreground">/</span>
            <RunSelectorDropdown />
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex justify-between items-start flex-shrink-0">
          <span className="text-sm text-red-500 flex-1 pr-4">{error}</span>
          <button
            onClick={clearError}
            className="text-red-500 hover:text-red-400 text-sm flex-shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Layout - Three Equal Columns */}
      <div className="grid grid-cols-3 gap-4 flex-1 min-h-0">
        {/* Left Column - Analysis Results */}
        <div className="min-h-0">
          <AnalysisReport />
        </div>

        {/* Center Column - Chat */}
        <div className="min-h-0">
          <AnalystChat />
        </div>

        {/* Right Column - Improvements */}
        <div className="min-h-0">
          <ImprovementQueue />
        </div>
      </div>

      {/* Footer Info */}
      <div className="mt-4 text-center text-xs text-muted-foreground flex-shrink-0">
        Analysis powered by Gemini AI. Improvements can be applied directly to the simulation config.
      </div>
    </div>
  );
}
