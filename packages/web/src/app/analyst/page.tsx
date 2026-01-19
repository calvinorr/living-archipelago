'use client';

import Link from 'next/link';
import { useAnalyst } from '@/hooks/useAnalyst';
import { RunSelector } from '@/components/analyst/RunSelector';
import { AnalysisReport } from '@/components/analyst/AnalysisReport';
import { AnalystChat } from '@/components/analyst/AnalystChat';
import { ImprovementQueue } from '@/components/analyst/ImprovementQueue';

export default function AnalystPage() {
  const { error, clearError } = useAnalyst();

  return (
    <div className="min-h-screen p-4">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Economic Analyst</h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI-powered analysis of simulation runs
          </p>
        </div>
        <Link
          href="/"
          className="px-4 py-2 text-sm bg-muted text-foreground rounded-md hover:bg-muted/80"
        >
          Back to Dashboard
        </Link>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex justify-between items-center">
          <span className="text-sm text-red-500">{error}</span>
          <button
            onClick={clearError}
            className="text-red-500 hover:text-red-400 text-sm"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Layout */}
      <div className="grid grid-cols-12 gap-4">
        {/* Left Column - Run Selection & Chat */}
        <div className="col-span-3 space-y-4">
          <RunSelector />
          <AnalystChat />
        </div>

        {/* Center Column - Analysis Results */}
        <div className="col-span-5">
          <AnalysisReport />
        </div>

        {/* Right Column - Improvements */}
        <div className="col-span-4">
          <ImprovementQueue />
        </div>
      </div>

      {/* Footer Info */}
      <div className="mt-6 text-center text-xs text-muted-foreground">
        Analysis powered by Gemini AI. Improvements can be applied directly to the simulation config.
      </div>
    </div>
  );
}
