'use client';

import { useEffect, useState } from 'react';
import { useSimulation } from '@/hooks/useSimulation';
import { SimulationControls } from '@/components/dashboard/SimulationControls';
import { CompactIslandGrid } from '@/components/dashboard/CompactIslandCard';
import { ArbitragePanel } from '@/components/dashboard/ArbitragePanel';
import { ActivityFeed } from '@/components/dashboard/ActivityFeed';
import { ShipCard } from '@/components/ships/ShipCard';
import { AgentPanel } from '@/components/agents/AgentPanel';
import { LLMMetricsPanel } from '@/components/llm/LLMMetricsPanel';
import { EconomicsPanel } from '@/components/dashboard/EconomicsPanel';
import type { LLMMetricsSummary } from '@/lib/types';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001/ws';

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
      {title}
      {count !== undefined && (
        <span className="text-[10px] px-1.5 py-0.5 bg-muted rounded-full">{count}</span>
      )}
    </h2>
  );
}

function SettingsModal({
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

export default function Dashboard() {
  const {
    status,
    world,
    agentDecisions,
    economyHistory,
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
      {/* Header Controls */}
      <SimulationControls
        status={status}
        tick={tick}
        gameDay={gameDay}
        gameHour={gameHour}
        timeScale={timeScale}
        llmEnabled={llmEnabled}
        llmMetrics={llmMetrics}
        onStart={start}
        onPause={pause}
        onResume={resume}
        onSetSpeed={setSpeed}
        onToggleLLM={setLLMEnabled}
        onShowLLMStats={() => setShowLLMModal(true)}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col gap-3 mt-3 min-h-0">
        {/* Islands row */}
        <section>
          <SectionHeader title="Islands" count={world?.islands?.length} />
          {world?.islands ? (
            <CompactIslandGrid islands={world.islands} />
          ) : (
            <div className="text-muted-foreground text-sm p-4 bg-card rounded-lg border">
              Connecting to simulation server...
            </div>
          )}
        </section>

        {/* Middle row - Trade Routes + Activity + Agents */}
        <div className="grid grid-cols-3 gap-3">
          <section>
            <SectionHeader title="Trade Routes" />
            <ArbitragePanel islands={world?.islands ?? []} maxItems={5} />
          </section>

          <section>
            <SectionHeader title="Activity" />
            <ActivityFeed
              events={world?.events ?? []}
              decisions={agentDecisions}
              ships={world?.ships ?? []}
              islandNames={islandNames}
              currentTick={tick}
              maxItems={6}
            />
          </section>

          <section>
            <SectionHeader title="AI Agents" />
            <div className="max-h-[220px] overflow-y-auto">
              <AgentPanel decisions={agentDecisions.slice(0, 5)} />
            </div>
          </section>
        </div>

        {/* Economics Analytics */}
        <section>
          <SectionHeader title="Economic Analytics" />
          <EconomicsPanel
            islands={world?.islands ?? []}
            ships={world?.ships ?? []}
            economyHistory={economyHistory}
            taxCollected={world?.economyMetrics?.totalTaxCollected ?? 0}
          />
        </section>

        {/* Fleet row */}
        <section className="flex-1 min-h-0">
          <SectionHeader title="Fleet" count={world?.ships?.length} />
          <div className="grid grid-cols-3 gap-3">
            {world?.ships.map((ship) => (
              <ShipCard key={ship.id} ship={ship} islandNames={islandNames} />
            ))}
            {!world?.ships?.length && (
              <div className="col-span-3 text-muted-foreground text-sm p-4 bg-card rounded-lg border text-center">
                No ships in the simulation
              </div>
            )}
          </div>
        </section>
      </div>

      {/* LLM Metrics Modal */}
      {showLLMModal && (
        <SettingsModal
          onClose={() => setShowLLMModal(false)}
          llmMetrics={llmMetrics}
          llmEnabled={llmEnabled}
        />
      )}
    </div>
  );
}
