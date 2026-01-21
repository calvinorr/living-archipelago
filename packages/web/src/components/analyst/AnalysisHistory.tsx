'use client';

import { useState, useEffect } from 'react';
import { History, ChevronRight, AlertCircle, CheckCircle, Info } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface AnalysisSummary {
  id: number;
  runId: number;
  analyzedAt: string;
  healthScore: number;
  summary: string;
  issueCount: number;
  recommendationCount: number;
}

interface AnalysisDetails {
  analysis: {
    id: number;
    runId: number;
    analyzedAt: string;
    healthScore: number;
    summary: string;
  };
  issues: Array<{
    id: number;
    severity: string;
    category: string;
    description: string;
    evidence: string[];
  }>;
  recommendations: Array<{
    id: number;
    title: string;
    configPath: string;
    currentValue: unknown;
    suggestedValue: unknown;
    rationale: string;
    expectedImpact: string;
    confidence: number;
    status: string;
    appliedAt: string | null;
  }>;
}

function HealthBadge({ score }: { score: number }) {
  const getColor = (s: number) => {
    if (s >= 80) return 'bg-green-500/20 text-green-500';
    if (s >= 60) return 'bg-yellow-500/20 text-yellow-500';
    if (s >= 40) return 'bg-orange-500/20 text-orange-500';
    return 'bg-red-500/20 text-red-500';
  };

  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded ${getColor(score)}`}>
      {score}
    </span>
  );
}

function SeverityIcon({ severity }: { severity: string }) {
  switch (severity) {
    case 'critical':
      return <AlertCircle className="w-3.5 h-3.5 text-red-500" />;
    case 'warning':
      return <AlertCircle className="w-3.5 h-3.5 text-yellow-500" />;
    default:
      return <Info className="w-3.5 h-3.5 text-blue-500" />;
  }
}

function AnalysisCard({
  analysis,
  isSelected,
  onClick,
}: {
  analysis: AnalysisSummary;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-lg border transition-colors ${
        isSelected
          ? 'bg-primary/10 border-primary'
          : 'bg-muted/20 border-border hover:bg-muted/40'
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted-foreground">
          Run #{analysis.runId}
        </span>
        <HealthBadge score={analysis.healthScore} />
      </div>
      <div className="text-sm font-medium truncate mb-1">
        {new Date(analysis.analyzedAt).toLocaleString()}
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{analysis.issueCount} issues</span>
        <span>|</span>
        <span>{analysis.recommendationCount} recommendations</span>
      </div>
    </button>
  );
}

function AnalysisDetailsView({ details }: { details: AnalysisDetails }) {
  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="p-3 bg-muted/30 rounded-lg">
        <div className="flex items-center gap-2 mb-2">
          <HealthBadge score={details.analysis.healthScore} />
          <span className="text-xs text-muted-foreground">
            Run #{details.analysis.runId}
          </span>
        </div>
        <p className="text-sm">{details.analysis.summary}</p>
      </div>

      {/* Issues */}
      <div>
        <h4 className="text-sm font-medium mb-2">Issues ({details.issues.length})</h4>
        <div className="space-y-2">
          {details.issues.map((issue) => (
            <div
              key={issue.id}
              className="p-2 bg-muted/20 rounded border border-border"
            >
              <div className="flex items-center gap-2 mb-1">
                <SeverityIcon severity={issue.severity} />
                <span className="text-xs text-muted-foreground capitalize">
                  {issue.category}
                </span>
              </div>
              <p className="text-sm">{issue.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Recommendations */}
      <div>
        <h4 className="text-sm font-medium mb-2">
          Recommendations ({details.recommendations.length})
        </h4>
        <div className="space-y-2">
          {details.recommendations.map((rec) => (
            <div
              key={rec.id}
              className="p-2 bg-muted/20 rounded border border-border"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">{rec.title}</span>
                {rec.status === 'applied' ? (
                  <span className="flex items-center gap-1 text-xs text-green-500">
                    <CheckCircle className="w-3 h-3" />
                    Applied
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground capitalize">
                    {rec.status}
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground mb-1">
                {rec.configPath}: {JSON.stringify(rec.currentValue)} → {JSON.stringify(rec.suggestedValue)}
              </div>
              <p className="text-xs">{rec.rationale}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AnalysisHistory() {
  const [history, setHistory] = useState<AnalysisSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [details, setDetails] = useState<AnalysisDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch history on mount
  useEffect(() => {
    async function fetchHistory() {
      try {
        const response = await fetch(`${API_BASE}/api/analyst/history`);
        if (!response.ok) throw new Error('Failed to fetch history');
        const data = await response.json();
        setHistory(data.analyses || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load history');
      } finally {
        setLoading(false);
      }
    }
    fetchHistory();
  }, []);

  // Fetch details when selection changes
  useEffect(() => {
    if (!selectedId) {
      setDetails(null);
      return;
    }

    async function fetchDetails() {
      setLoadingDetails(true);
      try {
        const response = await fetch(`${API_BASE}/api/analyst/analyses/${selectedId}`);
        if (!response.ok) throw new Error('Failed to fetch details');
        const data = await response.json();
        setDetails(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load details');
      } finally {
        setLoadingDetails(false);
      }
    }
    fetchDetails();
  }, [selectedId]);

  if (loading) {
    return (
      <div className="bg-card border rounded-lg p-6 h-full flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card border rounded-lg p-6 h-full flex items-center justify-center text-red-500 text-sm">
        {error}
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="bg-card border rounded-lg p-6 h-full flex flex-col items-center justify-center text-muted-foreground">
        <History className="w-8 h-8 mb-2 opacity-50" />
        <span className="text-sm">No analysis history yet</span>
        <span className="text-xs mt-1">Run an analysis to see it here</span>
      </div>
    );
  }

  return (
    <div className="bg-card border rounded-lg p-4 flex flex-col h-full">
      <div className="flex items-center gap-2 mb-4 flex-shrink-0">
        <History className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Analysis History
        </h3>
        <span className="text-xs text-muted-foreground">({history.length})</span>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* List */}
        <div className="w-1/3 overflow-y-auto space-y-2 pr-2">
          {history.map((analysis) => (
            <AnalysisCard
              key={analysis.id}
              analysis={analysis}
              isSelected={selectedId === analysis.id}
              onClick={() => setSelectedId(analysis.id)}
            />
          ))}
        </div>

        {/* Details */}
        <div className="w-2/3 overflow-y-auto border-l pl-4">
          {loadingDetails ? (
            <div className="h-full flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : details ? (
            <AnalysisDetailsView details={details} />
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
              <div className="flex items-center gap-2">
                <ChevronRight className="w-4 h-4" />
                Select an analysis to view details
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
