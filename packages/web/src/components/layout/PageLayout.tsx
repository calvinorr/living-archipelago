'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Play, Pause, Bot, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Navigation } from './Navigation';
import { useSimulation } from '@/hooks/useSimulation';
import { LLMMetricsPanel } from '@/components/llm/LLMMetricsPanel';
import { formatGameTime } from '@/lib/utils';
import type { SimulationStatus, LLMMetricsSummary } from '@/lib/types';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001/ws';

function StatusIndicator({ status }: { status: SimulationStatus }) {
  const config = {
    running: { color: 'bg-green-500', pulse: true, label: 'Running' },
    paused: { color: 'bg-yellow-500', pulse: false, label: 'Paused' },
    connected: { color: 'bg-blue-500', pulse: false, label: 'Ready' },
    connecting: { color: 'bg-gray-400', pulse: true, label: 'Connecting' },
    disconnected: { color: 'bg-red-500', pulse: false, label: 'Disconnected' },
  }[status] || { color: 'bg-gray-500', pulse: false, label: status };

  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full ${config.color} ${config.pulse ? 'animate-pulse' : ''}`} />
      <span className="text-xs text-muted-foreground">{config.label}</span>
    </div>
  );
}

function LLMModal({
  onClose,
  llmMetrics,
  llmEnabled,
}: {
  onClose: () => void;
  llmMetrics: LLMMetricsSummary | null;
  llmEnabled: boolean;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-card border rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b flex justify-between items-center">
          <h2 className="text-lg font-semibold">LLM Metrics</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-xl"
          >
            x
          </button>
        </div>
        <div className="p-4">
          <LLMMetricsPanel metrics={llmMetrics} enabled={llmEnabled} />
        </div>
      </div>
    </div>
  );
}

interface PageLayoutProps {
  children: ReactNode;
}

export function PageLayout({ children }: PageLayoutProps) {
  const {
    status,
    world,
    timeScale,
    llmEnabled,
    llmMetrics,
    connect,
    start,
    pause,
    resume,
    setSpeed,
    setLLMEnabled,
  } = useSimulation();

  const [showLLMModal, setShowLLMModal] = useState(false);

  useEffect(() => {
    connect(WS_URL);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only connect once on mount

  const tick = world?.tick ?? 0;
  const gameDay = world?.gameTime.gameDay ?? 1;
  const gameHour = world?.gameTime.gameHour ?? 0;
  const isConnected = status !== 'disconnected' && status !== 'connecting';
  const isRunning = status === 'running';

  return (
    <div className="h-screen flex flex-col p-4 overflow-hidden">
      {/* Header */}
      <header className="bg-card border rounded-lg">
        <div className="flex items-center justify-between px-4 py-3">
          {/* Left: Branding + Navigation */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold tracking-tight">Living Archipelago</h1>
              <StatusIndicator status={status} />
            </div>
            <Navigation />
          </div>

          {/* Center: Game Time */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1 bg-muted/50 rounded-md">
              <span className="text-sm font-mono font-medium">{formatGameTime(gameDay, gameHour)}</span>
              <span className="text-xs text-muted-foreground">T{tick}</span>
            </div>
          </div>

          {/* Right: Controls */}
          <div className="flex items-center gap-3">
            {/* Playback */}
            <div className="flex items-center gap-1.5">
              {status === 'connected' && (
                <Button onClick={start} size="sm" className="h-8">
                  <Play className="w-3.5 h-3.5 mr-1" /> Start
                </Button>
              )}
              {isRunning && (
                <Button onClick={pause} variant="secondary" size="sm" className="h-8">
                  <Pause className="w-3.5 h-3.5 mr-1" /> Pause
                </Button>
              )}
              {status === 'paused' && (
                <Button onClick={resume} size="sm" className="h-8">
                  <Play className="w-3.5 h-3.5 mr-1" /> Resume
                </Button>
              )}

              {/* Speed */}
              <div className="flex items-center bg-muted/50 rounded-md p-0.5 ml-1">
                {[1, 2, 4].map((speed) => (
                  <button
                    key={speed}
                    onClick={() => setSpeed(speed)}
                    disabled={!isConnected}
                    className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                      timeScale === speed
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    } disabled:opacity-50`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            </div>

            {/* Divider */}
            <div className="w-px h-6 bg-border" />

            {/* LLM Controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setLLMEnabled(!llmEnabled)}
                disabled={!isConnected}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  llmEnabled
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                } disabled:opacity-50`}
              >
                <Bot className="w-3.5 h-3.5" />
                {llmEnabled ? 'AI On' : 'AI Off'}
              </button>
              <button
                onClick={() => setShowLLMModal(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md bg-muted/50 hover:bg-muted transition-colors"
              >
                <Zap className="w-3.5 h-3.5 text-yellow-500" />
                <span className="font-mono">${(llmMetrics?.totalCostUsd ?? 0).toFixed(3)}</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 mt-3 min-h-0 overflow-auto">
        {children}
      </main>

      {/* LLM Metrics Modal */}
      {showLLMModal && (
        <LLMModal
          onClose={() => setShowLLMModal(false)}
          llmMetrics={llmMetrics}
          llmEnabled={llmEnabled}
        />
      )}
    </div>
  );
}
