'use client';

import { Play, Pause, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SimulationStatus } from '@/lib/types';
import { formatGameTime } from '@/lib/utils';

interface SimulationControlsProps {
  status: SimulationStatus;
  tick: number;
  gameDay: number;
  gameHour: number;
  timeScale: number;
  llmEnabled: boolean;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onSetSpeed: (scale: number) => void;
  onToggleLLM: (enabled: boolean) => void;
}

export function SimulationControls({
  status,
  tick,
  gameDay,
  gameHour,
  timeScale,
  llmEnabled,
  onStart,
  onPause,
  onResume,
  onSetSpeed,
  onToggleLLM,
}: SimulationControlsProps) {
  const isConnected = status !== 'disconnected' && status !== 'connecting';
  const isRunning = status === 'running';

  return (
    <div className="flex items-center justify-between bg-card border rounded-lg p-4">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-bold">Living Archipelago</h1>
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              status === 'running'
                ? 'bg-green-500'
                : status === 'paused'
                ? 'bg-yellow-500'
                : status === 'connected'
                ? 'bg-blue-500'
                : 'bg-gray-500'
            }`}
          />
          <span className="text-sm text-muted-foreground capitalize">{status}</span>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="text-center">
          <div className="text-lg font-mono">{formatGameTime(gameDay, gameHour)}</div>
          <div className="text-xs text-muted-foreground">Tick {tick}</div>
        </div>

        <div className="flex items-center gap-2">
          {status === 'connected' && (
            <Button onClick={onStart} size="sm">
              <Play className="w-4 h-4 mr-1" /> Start
            </Button>
          )}

          {isRunning && (
            <Button onClick={onPause} variant="secondary" size="sm">
              <Pause className="w-4 h-4 mr-1" /> Pause
            </Button>
          )}

          {status === 'paused' && (
            <Button onClick={onResume} size="sm">
              <Play className="w-4 h-4 mr-1" /> Resume
            </Button>
          )}

          <div className="flex items-center gap-1 ml-2">
            {[1, 2, 4].map((speed) => (
              <Button
                key={speed}
                variant={timeScale === speed ? 'default' : 'outline'}
                size="sm"
                onClick={() => onSetSpeed(speed)}
                disabled={!isConnected}
              >
                {speed}x
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-2 ml-4 pl-4 border-l border-border">
            <Button
              variant={llmEnabled ? 'default' : 'outline'}
              size="sm"
              onClick={() => onToggleLLM(!llmEnabled)}
              disabled={!isConnected}
              className={llmEnabled ? 'bg-green-600 hover:bg-green-700' : ''}
            >
              <Bot className="w-4 h-4 mr-1" />
              {llmEnabled ? 'LLM On' : 'LLM Off'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
