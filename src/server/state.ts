/**
 * Server state and configuration
 * Centralized state management for the API server
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { WebSocket } from 'ws';
import type { Simulation } from '../core/simulation.js';
import type { AgentManager } from '../agents/core/agent-manager.js';
import type { SimulationDatabase } from '../storage/index.js';

// ============================================================================
// Types
// ============================================================================

export type SimulationStatus = 'stopped' | 'running' | 'paused';

export interface ServerState {
  status: SimulationStatus;
  simulation: Simulation | null;
  agentManager: AgentManager | null;
  timeScale: number;
  tickInterval: NodeJS.Timeout | null;
  llmEnabled: boolean;
  llmModel: string;
  database: SimulationDatabase | null;
  priceHistory: Array<{
    tick: number;
    gameDay: number;
    gameHour: number;
    prices: Record<string, Record<string, number>>;
  }>;
}

export interface ClientMessage {
  type: string;
  [key: string]: unknown;
}

export interface AgentDecisionEvent {
  agentId: string;
  agentName: string;
  tick: number;
  triggered: boolean;
  triggers: string[];
  strategy?: {
    type: string;
    goal: string;
    targetRoute?: string;
  };
  actions: Array<{
    type: string;
    details: string;
  }>;
  reasoning?: string;
}

// ============================================================================
// Configuration
// ============================================================================

export const config = {
  PORT: parseInt(process.env.PORT || '3001', 10),
  ENABLE_AGENTS: process.env.ENABLE_AGENTS !== 'false',
  HAS_API_KEY: !!process.env.GEMINI_API_KEY,
  DB_PATH: process.env.DB_PATH || 'simulation.db',
  DB_ENABLED: process.env.DB_ENABLED !== 'false',
  DB_SNAPSHOT_INTERVAL: parseInt(process.env.DB_SNAPSHOT_INTERVAL || '10', 10),
};

// ============================================================================
// Server State
// ============================================================================

export const state: ServerState = {
  status: 'stopped',
  simulation: null,
  agentManager: null,
  timeScale: 1,
  tickInterval: null,
  llmEnabled: false,
  llmModel: process.env.LLM_MODEL || 'gemini-1.5-flash-8b',
  database: null,
  priceHistory: [],
};

// ============================================================================
// WebSocket Clients
// ============================================================================

export const clients = new Set<WebSocket>();

/**
 * Broadcast a message to all connected WebSocket clients
 */
export function broadcast(message: object): void {
  const data = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}
