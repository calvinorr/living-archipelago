'use client';

import { Play, Pause, Bot, Zap, BarChart3 } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { SimulationStatus, LLMMetricsSummary } from '@/lib/types';
import { formatGameTime } from '@/lib/utils';

interface SimulationControlsProps {
  status: SimulationStatus;
  tick: number;
  gameDay: number;
  gameHour: number;
  timeScale: number;
  llmEnabled: boolean;
  llmMetrics: LLMMetricsSummary | null;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onSetSpeed: (scale: number) => void;
  onToggleLLM: (enabled: boolean) => void;
  onShowLLMStats: () => void;
}

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

export function SimulationControls({
  status,
  tick,
  gameDay,
  gameHour,
  timeScale,
  llmEnabled,
  llmMetrics,
  onStart,
  onPause,
  onResume,
  onSetSpeed,
  onToggleLLM,
  onShowLLMStats,
}: SimulationControlsProps) {
  const isConnected = status !== 'disconnected' && status !== 'connecting';
  const isRunning = status === 'running';

  return (
    <header className="bg-card border rounded-lg">
      <div className="flex items-center justify-between px-4 py-3">
        {/* Left: Branding */}
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold tracking-tight">Living Archipelago</h1>
          <StatusIndicator status={status} />
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
              <Button onClick={onStart} size="sm" className="h-8">
                <Play className="w-3.5 h-3.5 mr-1" /> Start
              </Button>
            )}
            {isRunning && (
              <Button onClick={onPause} variant="secondary" size="sm" className="h-8">
                <Pause className="w-3.5 h-3.5 mr-1" /> Pause
              </Button>
            )}
            {status === 'paused' && (
              <Button onClick={onResume} size="sm" className="h-8">
                <Play className="w-3.5 h-3.5 mr-1" /> Resume
              </Button>
            )}

            {/* Speed */}
            <div className="flex items-center bg-muted/50 rounded-md p-0.5 ml-1">
              {[1, 2, 4].map((speed) => (
                <button
                  key={speed}
                  onClick={() => onSetSpeed(speed)}
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
              onClick={() => onToggleLLM(!llmEnabled)}
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
              onClick={onShowLLMStats}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md bg-muted/50 hover:bg-muted transition-colors"
            >
              <Zap className="w-3.5 h-3.5 text-yellow-500" />
              <span className="font-mono">${(llmMetrics?.totalCostUsd ?? 0).toFixed(3)}</span>
            </button>
          </div>

          {/* Divider */}
          <div className="w-px h-6 bg-border" />

          {/* Analyst Link */}
          <Link
            href="/analyst"
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-purple-600 text-white hover:bg-purple-700 transition-colors"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            Analyst
          </Link>
        </div>
      </div>
    </header>
  );
}
