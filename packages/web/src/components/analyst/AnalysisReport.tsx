'use client';

import { useAnalyst } from '@/hooks/useAnalyst';

function HealthScoreCircle({ score }: { score: number }) {
  const getColor = (s: number) => {
    if (s >= 80) return 'text-green-500';
    if (s >= 60) return 'text-yellow-500';
    if (s >= 40) return 'text-orange-500';
    return 'text-red-500';
  };

  return (
    <div className="flex flex-col items-center">
      <div className={`text-4xl font-bold ${getColor(score)}`}>{score}</div>
      <div className="text-xs text-muted-foreground">Health Score</div>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: 'critical' | 'warning' | 'info' }) {
  const colors = {
    critical: 'bg-red-500/20 text-red-500 border-red-500/30',
    warning: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30',
    info: 'bg-blue-500/20 text-blue-500 border-blue-500/30',
  };

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${colors[severity]}`}>
      {severity}
    </span>
  );
}

export function AnalysisReport() {
  const { analysis, runData, selectedRunId, isAnalyzing, analyzeRun } = useAnalyst();

  if (!selectedRunId) {
    return (
      <div className="bg-card border rounded-lg p-6 text-center text-muted-foreground">
        Select a run to view analysis
      </div>
    );
  }

  if (!runData && !analysis) {
    return (
      <div className="bg-card border rounded-lg p-6 text-center text-muted-foreground">
        Loading run data...
      </div>
    );
  }

  return (
    <div className="bg-card border rounded-lg p-4 space-y-4">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Analysis Results
          </h3>
          {analysis && (
            <div className="text-xs text-muted-foreground mt-1">
              Analyzed: {new Date(analysis.analyzedAt).toLocaleString()}
            </div>
          )}
        </div>

        <button
          onClick={() => analyzeRun(selectedRunId)}
          disabled={isAnalyzing}
          className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
        >
          {isAnalyzing ? 'Analyzing...' : analysis ? 'Re-Analyze' : 'Analyze Run'}
        </button>
      </div>

      {analysis ? (
        <>
          {/* Health Score */}
          <div className="flex items-center gap-6 p-4 bg-muted/30 rounded-lg">
            <HealthScoreCircle score={analysis.healthScore} />
            <p className="text-sm flex-1">{analysis.summary}</p>
          </div>

          {/* Issues */}
          <div>
            <h4 className="text-sm font-medium mb-2">
              Issues ({analysis.issues.length})
            </h4>
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {analysis.issues.map((issue, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-muted/20 rounded-md border border-border"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <SeverityBadge severity={issue.severity} />
                    <span className="text-xs text-muted-foreground">
                      {issue.category}
                    </span>
                  </div>
                  <p className="text-sm">{issue.description}</p>
                  {issue.evidence.length > 0 && (
                    <ul className="mt-2 text-xs text-muted-foreground list-disc list-inside">
                      {issue.evidence.slice(0, 3).map((ev, i) => (
                        <li key={i}>{ev}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
              {analysis.issues.length === 0 && (
                <div className="text-sm text-muted-foreground py-2">
                  No issues detected
                </div>
              )}
            </div>
          </div>
        </>
      ) : runData ? (
        /* Quick Summary without AI analysis */
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-muted/20 rounded-md">
              <div className="text-xs text-muted-foreground">Duration</div>
              <div className="font-medium">{runData.summary.duration} ticks</div>
            </div>
            <div className="p-3 bg-muted/20 rounded-md">
              <div className="text-xs text-muted-foreground">Total Trades</div>
              <div className="font-medium">{runData.summary.totalTrades}</div>
            </div>
            <div className="p-3 bg-muted/20 rounded-md">
              <div className="text-xs text-muted-foreground">Profitable Ratio</div>
              <div className="font-medium">
                {(runData.summary.profitableTradeRatio * 100).toFixed(1)}%
              </div>
            </div>
            <div className="p-3 bg-muted/20 rounded-md">
              <div className="text-xs text-muted-foreground">Ecosystem</div>
              <div className="font-medium capitalize">
                {runData.summary.ecosystemHealthTrend}
              </div>
            </div>
          </div>

          {runData.summary.anomalies.length > 0 && (
            <div>
              <h4 className="text-xs text-muted-foreground mb-2">
                Detected Anomalies
              </h4>
              <ul className="text-sm space-y-1">
                {runData.summary.anomalies.map((anomaly, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-yellow-500">!</span>
                    {anomaly}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="text-sm text-muted-foreground text-center pt-2 border-t">
            Click "Analyze Run" for AI-powered insights
          </div>
        </div>
      ) : null}
    </div>
  );
}
