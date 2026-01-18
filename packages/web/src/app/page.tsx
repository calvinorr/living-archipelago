'use client';

import { useEffect } from 'react';
import { useSimulation } from '@/hooks/useSimulation';
import { SimulationControls } from '@/components/dashboard/SimulationControls';
import { IslandCard } from '@/components/islands/IslandCard';
import { ShipCard } from '@/components/ships/ShipCard';
import { PriceChart } from '@/components/charts/PriceChart';
import { AgentPanel } from '@/components/agents/AgentPanel';
import { EventFeed } from '@/components/dashboard/EventFeed';
import { LLMMetricsPanel } from '@/components/llm/LLMMetricsPanel';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001/ws';

export default function Dashboard() {
  const {
    status,
    world,
    priceHistory,
    agentDecisions,
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

  useEffect(() => {
    connect(WS_URL);
  }, [connect]);

  const tick = world?.tick ?? 0;
  const gameDay = world?.gameTime.gameDay ?? 1;
  const gameHour = world?.gameTime.gameHour ?? 0;

  // Build island name lookup
  const islandNames: Record<string, string> = {};
  for (const island of world?.islands ?? []) {
    islandNames[island.id] = island.name;
  }

  return (
    <div className="h-screen flex flex-col p-4 overflow-hidden">
      <SimulationControls
        status={status}
        tick={tick}
        gameDay={gameDay}
        gameHour={gameHour}
        timeScale={timeScale}
        llmEnabled={llmEnabled}
        onStart={start}
        onPause={pause}
        onResume={resume}
        onSetSpeed={setSpeed}
        onToggleLLM={setLLMEnabled}
      />

      <div className="grid grid-cols-12 gap-4 mt-4 flex-1 min-h-0">
        {/* Left column - Islands */}
        <div className="col-span-3 flex flex-col min-h-0">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Islands
          </h2>
          <div className="flex-1 overflow-y-auto space-y-3 pr-2">
            {world?.islands.map((island) => (
              <IslandCard key={island.id} island={island} />
            ))}
            {!world && (
              <div className="text-muted-foreground text-sm p-4 bg-card rounded-lg border">
                Connecting to simulation server...
              </div>
            )}
          </div>
        </div>

        {/* Middle column - Charts & Ships */}
        <div className="col-span-6 flex flex-col min-h-0">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Market Data
          </h2>
          <PriceChart
            history={priceHistory}
            islands={world?.islands.map((i) => ({ id: i.id, name: i.name })) ?? []}
          />

          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mt-4 mb-2">
            Ships & Events
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {world?.ships.map((ship) => (
              <ShipCard key={ship.id} ship={ship} islandNames={islandNames} />
            ))}
          </div>
          <div className="mt-2">
            <EventFeed events={world?.events ?? []} />
          </div>
        </div>

        {/* Right column - LLM & Agents */}
        <div className="col-span-3 flex flex-col min-h-0 gap-4">
          <div>
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">
              LLM Usage
            </h2>
            <LLMMetricsPanel metrics={llmMetrics} enabled={llmEnabled} />
          </div>
          <div className="flex-1 min-h-0 flex flex-col">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">
              AI Agents
            </h2>
            <div className="flex-1 overflow-y-auto">
              <AgentPanel decisions={agentDecisions} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
