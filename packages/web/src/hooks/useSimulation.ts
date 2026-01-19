'use client';

import { create } from 'zustand';
import type {
  SimulationState,
  SimulationStatus,
  WorldSnapshot,
  AgentDecision,
  PriceHistoryPoint,
  EconomyHistoryPoint,
  ServerMessage,
  ClientMessage,
  LLMMetricsSummary,
  LLMCallRecord,
} from '@/lib/types';

const MAX_HISTORY_POINTS = 500;
const MAX_AGENT_DECISIONS = 50;
const MAX_ECONOMY_HISTORY = 100;

interface SimulationStore extends SimulationState {
  // Connection
  connect: (url: string) => void;
  disconnect: () => void;

  // Control
  start: () => void;
  pause: () => void;
  resume: () => void;
  setSpeed: (scale: number) => void;

  // LLM Control
  llmEnabled: boolean;
  llmMetrics: LLMMetricsSummary | null;
  setLLMEnabled: (enabled: boolean) => void;

  // Internal state updates
  _setStatus: (status: SimulationStatus) => void;
  _setWorld: (world: WorldSnapshot) => void;
  _addAgentDecision: (decision: AgentDecision) => void;
  _addPriceHistoryPoint: (world: WorldSnapshot) => void;
  _addEconomyHistoryPoint: (world: WorldSnapshot) => void;
  _setLLMStatus: (enabled: boolean) => void;
  _setLLMMetrics: (metrics: LLMMetricsSummary) => void;
  _addLLMCall: (call: LLMCallRecord) => void;

  // WebSocket reference
  _ws: WebSocket | null;
}

export const useSimulation = create<SimulationStore>((set, get) => ({
  // Initial state
  status: 'disconnected',
  world: null,
  priceHistory: [],
  economyHistory: [],
  agentDecisions: [],
  timeScale: 1,
  llmEnabled: false,
  llmMetrics: null,
  _ws: null,

  connect: (url: string) => {
    const existing = get()._ws;
    if (existing) {
      existing.close();
    }

    set({ status: 'connecting' });

    const ws = new WebSocket(url);

    ws.onopen = () => {
      set({ status: 'connected', _ws: ws });
      // Subscribe to all updates
      const msg: ClientMessage = { type: 'subscribe', channels: ['ticks', 'agents', 'events'] };
      ws.send(JSON.stringify(msg));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as ServerMessage;

        switch (msg.type) {
          case 'tick':
            get()._setWorld(msg.data);
            get()._addPriceHistoryPoint(msg.data);
            get()._addEconomyHistoryPoint(msg.data);
            break;
          case 'agent-decision':
            get()._addAgentDecision(msg.data);
            break;
          case 'status':
            get()._setStatus(msg.data.status);
            break;
          case 'history':
            set({ priceHistory: msg.data.priceHistory });
            break;
          case 'llm-call':
            get()._addLLMCall(msg.data);
            break;
          case 'llm-stats':
            get()._setLLMMetrics(msg.data);
            break;
          case 'llm-status':
            get()._setLLMStatus(msg.data.enabled);
            break;
        }
      } catch (e) {
        console.error('Failed to parse message:', e);
      }
    };

    ws.onerror = () => {
      set({ status: 'disconnected' });
    };

    ws.onclose = () => {
      set({ status: 'disconnected', _ws: null });
    };

    set({ _ws: ws });
  },

  disconnect: () => {
    const ws = get()._ws;
    if (ws) {
      ws.close();
    }
    set({ status: 'disconnected', _ws: null });
  },

  start: () => {
    const ws = get()._ws;
    if (ws?.readyState === WebSocket.OPEN) {
      const msg: ClientMessage = { type: 'start' };
      ws.send(JSON.stringify(msg));
    }
  },

  pause: () => {
    const ws = get()._ws;
    if (ws?.readyState === WebSocket.OPEN) {
      const msg: ClientMessage = { type: 'pause' };
      ws.send(JSON.stringify(msg));
    }
  },

  resume: () => {
    const ws = get()._ws;
    if (ws?.readyState === WebSocket.OPEN) {
      const msg: ClientMessage = { type: 'resume' };
      ws.send(JSON.stringify(msg));
    }
  },

  setSpeed: (scale: number) => {
    const ws = get()._ws;
    if (ws?.readyState === WebSocket.OPEN) {
      const msg: ClientMessage = { type: 'speed', scale };
      ws.send(JSON.stringify(msg));
    }
    set({ timeScale: scale });
  },

  setLLMEnabled: (enabled: boolean) => {
    const ws = get()._ws;
    if (ws?.readyState === WebSocket.OPEN) {
      const msg: ClientMessage = { type: 'set-llm', enabled };
      ws.send(JSON.stringify(msg));
    }
    set({ llmEnabled: enabled });
  },

  _setStatus: (status: SimulationStatus) => {
    set({ status });
  },

  _setWorld: (world: WorldSnapshot) => {
    set({ world });
  },

  _addAgentDecision: (decision: AgentDecision) => {
    set((state) => ({
      agentDecisions: [decision, ...state.agentDecisions].slice(0, MAX_AGENT_DECISIONS),
    }));
  },

  _addPriceHistoryPoint: (world: WorldSnapshot) => {
    const point: PriceHistoryPoint = {
      tick: world.tick,
      gameDay: world.gameTime.gameDay,
      gameHour: world.gameTime.gameHour,
      prices: {},
    };

    for (const island of world.islands) {
      point.prices[island.id] = island.market.prices;
    }

    set((state) => ({
      priceHistory: [...state.priceHistory, point].slice(-MAX_HISTORY_POINTS),
    }));
  },

  _addEconomyHistoryPoint: (world: WorldSnapshot) => {
    // Track economy history
    const ships = world.ships || [];
    const islands = world.islands || [];
    const totalMoneySupply = ships.reduce((sum: number, s) => sum + (s.cash || 0), 0);
    const avgFishStock = islands.length > 0
      ? islands.reduce((sum: number, i) => sum + (i.ecosystem?.fishStock / i.ecosystem?.fishCapacity || 0), 0) / islands.length
      : 0;

    const economyPoint: EconomyHistoryPoint = {
      tick: world.tick,
      gameDay: world.gameTime?.gameDay || 1,
      totalTaxCollected: world.economyMetrics?.totalTaxCollected || 0,
      totalMoneySupply,
      avgFishStock,
      tradeVolume: 0, // We don't track individual trades yet
    };

    set((state) => ({
      economyHistory: [...state.economyHistory.slice(-99), economyPoint],
    }));
  },

  _setLLMStatus: (enabled: boolean) => {
    set({ llmEnabled: enabled });
  },

  _setLLMMetrics: (metrics: LLMMetricsSummary) => {
    set({ llmMetrics: metrics });
  },

  _addLLMCall: (call: LLMCallRecord) => {
    set((state) => {
      const currentMetrics = state.llmMetrics;
      if (!currentMetrics) {
        return {
          llmMetrics: {
            totalCalls: 1,
            totalInputTokens: call.inputTokens,
            totalOutputTokens: call.outputTokens,
            totalTokens: call.totalTokens,
            totalCostUsd: call.estimatedCostUsd,
            avgLatencyMs: call.latencyMs,
            callsPerMinute: 0,
            recentCalls: [call],
          },
        };
      }

      const recentCalls = [call, ...currentMetrics.recentCalls].slice(0, 50);
      const totalCalls = currentMetrics.totalCalls + 1;

      return {
        llmMetrics: {
          ...currentMetrics,
          totalCalls,
          totalInputTokens: currentMetrics.totalInputTokens + call.inputTokens,
          totalOutputTokens: currentMetrics.totalOutputTokens + call.outputTokens,
          totalTokens: currentMetrics.totalTokens + call.totalTokens,
          totalCostUsd: currentMetrics.totalCostUsd + call.estimatedCostUsd,
          avgLatencyMs: Math.round(
            (currentMetrics.avgLatencyMs * (totalCalls - 1) + call.latencyMs) / totalCalls
          ),
          recentCalls,
        },
      };
    });
  },
}));
