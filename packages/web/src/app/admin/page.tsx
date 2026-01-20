'use client';

import { useState, useEffect, useCallback } from 'react';
import { Navigation } from '@/components/layout/Navigation';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface LLMCallRecord {
  id: string;
  timestamp: number;
  model: string;
  promptSummary: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
  estimatedCostUsd: number;
  finishReason: string;
}

interface LLMSummary {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  avgLatencyMs: number;
  callsPerMinute: number;
  recentCalls: LLMCallRecord[];
}

interface AgentStats {
  id: string;
  name: string;
  type: string;
  llmCalls?: number;
  rateLimiter?: {
    callsInWindow: number;
    tokensInWindow: number;
    windowStart: number;
    isLimited: boolean;
  };
  memory?: {
    lastReasoningTick: number;
    currentPlan: unknown;
    recentDecisions: unknown[];
  };
  traderStats?: {
    llmCalls: number;
    recentProfit: number;
    strategiesCreated: number;
    currentStrategy: unknown;
  };
}

interface ModelInfo {
  id: string;
  name: string;
  cost: string;
  recommended?: boolean;
}

interface ServerStatus {
  status: string;
  tick: number;
  runId: number | null;
  timeScale: number;
  llmEnabled: boolean;
  llmModel: string;
  availableModels: ModelInfo[];
  dbEnabled: boolean;
  connectedClients: number;
  uptime: number;
}

type Tab = 'llm' | 'agents' | 'config' | 'status';

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>('llm');
  const [llmData, setLlmData] = useState<{ summary: LLMSummary; agents: AgentStats[] } | null>(null);
  const [agentsData, setAgentsData] = useState<{ agents: AgentStats[]; tick: number } | null>(null);
  const [configData, setConfigData] = useState<{ activeConfig: unknown; overrides: unknown } | null>(null);
  const [statusData, setStatusData] = useState<ServerStatus | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);

      if (activeTab === 'llm') {
        const res = await fetch(`${API_BASE}/api/admin/llm`);
        if (!res.ok) throw new Error('Failed to fetch LLM data');
        setLlmData(await res.json());
      } else if (activeTab === 'agents') {
        const res = await fetch(`${API_BASE}/api/admin/agents`);
        if (!res.ok) throw new Error('Failed to fetch agents data');
        setAgentsData(await res.json());
      } else if (activeTab === 'config') {
        const res = await fetch(`${API_BASE}/api/admin/config`);
        if (!res.ok) throw new Error('Failed to fetch config data');
        setConfigData(await res.json());
      } else if (activeTab === 'status') {
        const res = await fetch(`${API_BASE}/api/admin/status`);
        if (!res.ok) throw new Error('Failed to fetch status data');
        setStatusData(await res.json());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, [activeTab]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'llm', label: 'LLM Logs' },
    { id: 'agents', label: 'Agents' },
    { id: 'config', label: 'Config' },
    { id: 'status', label: 'Status' },
  ];

  return (
    <div className="h-screen flex flex-col p-4">
      {/* Header */}
      <header className="bg-card border rounded-lg mb-4 flex-shrink-0">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold tracking-tight">Living Archipelago</h1>
            <Navigation />
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded"
              />
              Auto-refresh
            </label>
            <button
              onClick={fetchData}
              className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              Refresh
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-card border rounded-lg mb-4 px-4 py-2 flex-shrink-0">
        <div className="flex gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm rounded-md transition-colors ${
                activeTab === tab.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-500">
          {error}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'llm' && <LLMTab data={llmData} />}
        {activeTab === 'agents' && <AgentsTab data={agentsData} />}
        {activeTab === 'config' && <ConfigTab data={configData} />}
        {activeTab === 'status' && <StatusTab data={statusData} />}
      </div>
    </div>
  );
}

function LLMTab({ data }: { data: { summary: LLMSummary; agents: AgentStats[] } | null }) {
  if (!data) return <div className="text-muted-foreground">Loading...</div>;

  const { summary, agents } = data;

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-6 gap-3 flex-shrink-0">
        <div className="bg-card border rounded-lg p-3">
          <div className="text-xs text-muted-foreground">Total Calls</div>
          <div className="text-2xl font-bold">{summary.totalCalls}</div>
        </div>
        <div className="bg-card border rounded-lg p-3">
          <div className="text-xs text-muted-foreground">Total Tokens</div>
          <div className="text-2xl font-bold">{summary.totalTokens.toLocaleString()}</div>
        </div>
        <div className="bg-card border rounded-lg p-3">
          <div className="text-xs text-muted-foreground">Total Cost</div>
          <div className="text-2xl font-bold text-green-500">${summary.totalCostUsd.toFixed(4)}</div>
        </div>
        <div className="bg-card border rounded-lg p-3">
          <div className="text-xs text-muted-foreground">Avg Latency</div>
          <div className="text-2xl font-bold">{summary.avgLatencyMs}ms</div>
        </div>
        <div className="bg-card border rounded-lg p-3">
          <div className="text-xs text-muted-foreground">Calls/min</div>
          <div className="text-2xl font-bold">{summary.callsPerMinute}</div>
        </div>
        <div className="bg-card border rounded-lg p-3">
          <div className="text-xs text-muted-foreground">Active Agents</div>
          <div className="text-2xl font-bold">{agents.length}</div>
        </div>
      </div>

      {/* Agent Stats */}
      {agents.length > 0 && (
        <div className="bg-card border rounded-lg p-4 flex-shrink-0">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Agent LLM Usage
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {agents.map((agent) => (
              <div key={agent.id} className="p-3 bg-muted/20 rounded-md">
                <div className="font-medium text-sm">{agent.name}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {agent.llmCalls ?? 0} calls
                  {agent.rateLimiter && (
                    <span className={agent.rateLimiter.isLimited ? ' text-red-500' : ''}>
                      {' '} | {agent.rateLimiter.isLimited ? 'RATE LIMITED' : 'OK'}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Calls */}
      <div className="bg-card border rounded-lg p-4 flex-1 min-h-0 flex flex-col">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3 flex-shrink-0">
          Recent LLM Calls ({summary.recentCalls.length})
        </h3>
        <div className="flex-1 overflow-y-auto space-y-2">
          {summary.recentCalls.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 text-center">
              No LLM calls yet
            </div>
          ) : (
            [...summary.recentCalls].reverse().map((call) => (
              <div key={call.id} className="p-3 bg-muted/20 rounded-md text-sm">
                <div className="flex justify-between items-start mb-1">
                  <span className="font-mono text-xs text-muted-foreground">
                    {new Date(call.timestamp).toLocaleTimeString()}
                  </span>
                  <div className="flex gap-2 text-xs">
                    <span className="text-blue-400">{call.inputTokens} in</span>
                    <span className="text-green-400">{call.outputTokens} out</span>
                    <span className="text-yellow-400">{call.latencyMs}ms</span>
                    <span className="text-purple-400">${call.estimatedCostUsd.toFixed(6)}</span>
                  </div>
                </div>
                <div className="text-muted-foreground truncate" title={call.promptSummary}>
                  {call.promptSummary}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function AgentsTab({ data }: { data: { agents: AgentStats[]; tick: number } | null }) {
  if (!data) return <div className="text-muted-foreground">Loading...</div>;

  return (
    <div className="h-full overflow-y-auto space-y-4">
      <div className="text-sm text-muted-foreground">Current Tick: {data.tick}</div>

      {data.agents.map((agent) => (
        <div key={agent.id} className="bg-card border rounded-lg p-4">
          <div className="flex justify-between items-start mb-3">
            <div>
              <h3 className="font-medium">{agent.name}</h3>
              <div className="text-xs text-muted-foreground">{agent.type} | {agent.id}</div>
            </div>
            {agent.traderStats && (
              <div className="text-right text-xs">
                <div>LLM Calls: {agent.traderStats.llmCalls}</div>
                <div>Strategies: {agent.traderStats.strategiesCreated}</div>
              </div>
            )}
          </div>

          {agent.memory && (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">
                Last Reasoning: Tick {agent.memory.lastReasoningTick}
                {data.tick > 0 && (
                  <span> ({data.tick - agent.memory.lastReasoningTick} ticks ago)</span>
                )}
              </div>

              {agent.memory.currentPlan ? (
                <div className="p-2 bg-muted/20 rounded text-xs">
                  <div className="font-medium mb-1">Current Plan:</div>
                  <pre className="overflow-x-auto text-muted-foreground">
                    {JSON.stringify(agent.memory.currentPlan, null, 2)}
                  </pre>
                </div>
              ) : null}

              {agent.traderStats?.currentStrategy ? (
                <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded text-xs">
                  <div className="font-medium mb-1 text-blue-400">Current Strategy:</div>
                  <pre className="overflow-x-auto text-muted-foreground">
                    {JSON.stringify(agent.traderStats.currentStrategy, null, 2)}
                  </pre>
                </div>
              ) : null}

              {agent.memory.recentDecisions.length > 0 && (
                <div className="p-2 bg-muted/20 rounded text-xs">
                  <div className="font-medium mb-1">Recent Decisions ({agent.memory.recentDecisions.length}):</div>
                  <div className="max-h-[200px] overflow-y-auto">
                    {agent.memory.recentDecisions.map((decision, idx) => (
                      <pre key={idx} className="text-muted-foreground border-b border-border pb-1 mb-1">
                        {JSON.stringify(decision, null, 2)}
                      </pre>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {data.agents.length === 0 && (
        <div className="text-sm text-muted-foreground py-4 text-center">
          No agents active
        </div>
      )}
    </div>
  );
}

function ConfigTab({ data }: { data: { activeConfig: unknown; overrides: unknown } | null }) {
  if (!data) return <div className="text-muted-foreground">Loading...</div>;

  return (
    <div className="h-full overflow-y-auto space-y-4">
      {/* Overrides */}
      <div className="bg-card border rounded-lg p-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Active Overrides
        </h3>
        <pre className="text-xs bg-muted/20 p-3 rounded overflow-x-auto">
          {JSON.stringify(data.overrides, null, 2)}
        </pre>
      </div>

      {/* Full Config */}
      <div className="bg-card border rounded-lg p-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Active Configuration
        </h3>
        <pre className="text-xs bg-muted/20 p-3 rounded overflow-x-auto max-h-[500px]">
          {JSON.stringify(data.activeConfig, null, 2)}
        </pre>
      </div>
    </div>
  );
}

function StatusTab({ data }: { data: ServerStatus | null }) {
  const [changingModel, setChangingModel] = useState(false);

  if (!data) return <div className="text-muted-foreground">Loading...</div>;

  const formatUptime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h}h ${m}m ${s}s`;
  };

  const handleModelChange = async (model: string) => {
    setChangingModel(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/model`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Failed to change model');
      }
    } catch (err) {
      alert('Failed to change model');
    }
    setChangingModel(false);
  };

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="bg-card border rounded-lg p-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Server Status
        </h3>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Status</span>
            <span className={data.status === 'running' ? 'text-green-500' : 'text-yellow-500'}>
              {data.status.toUpperCase()}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Current Tick</span>
            <span>{data.tick}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Run ID</span>
            <span>{data.runId ?? 'N/A'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Time Scale</span>
            <span>{data.timeScale}x</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Uptime</span>
            <span>{formatUptime(data.uptime)}</span>
          </div>
        </div>
      </div>

      <div className="bg-card border rounded-lg p-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Features
        </h3>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">LLM Enabled</span>
            <span className={data.llmEnabled ? 'text-green-500' : 'text-muted-foreground'}>
              {data.llmEnabled ? 'YES' : 'NO (Mock)'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Database Enabled</span>
            <span className={data.dbEnabled ? 'text-green-500' : 'text-muted-foreground'}>
              {data.dbEnabled ? 'YES' : 'NO'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Connected Clients</span>
            <span>{data.connectedClients}</span>
          </div>
        </div>
      </div>

      {/* LLM Model Selection */}
      <div className="bg-card border rounded-lg p-4 col-span-2">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
          LLM Model Selection
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Current model: <span className="text-foreground font-medium">{data.llmModel || 'Not set'}</span>
          {!data.llmEnabled && <span className="text-yellow-500 ml-2">(Enable LLM in dashboard to use)</span>}
        </p>
        <div className="grid grid-cols-3 gap-3">
          {(data.availableModels || []).map((model) => (
            <button
              key={model.id}
              onClick={() => handleModelChange(model.id)}
              disabled={changingModel || model.id === data.llmModel}
              className={`p-3 rounded-lg border text-left transition-colors ${
                model.id === data.llmModel
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:border-primary/50 hover:bg-muted/50'
              } ${changingModel ? 'opacity-50' : ''}`}
            >
              <div className="font-medium text-sm flex items-center gap-2">
                {model.name}
                {model.recommended && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">
                    CHEAPEST
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-1">{model.cost}</div>
              {model.id === data.llmModel && (
                <div className="text-xs text-primary mt-1">Currently selected</div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
