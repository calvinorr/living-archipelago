'use client';

import { create } from 'zustand';
import type {
  AnalystState,
  RunListItem,
  FullRunData,
  RunAnalysis,
  ChatMessage,
  Improvement,
} from '@/lib/analyst-types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface AnalystStore extends AnalystState {
  // Additional state
  currentRunId: number | null;
  hasAppliedChanges: boolean;
  isResetting: boolean;
  // Actions
  fetchRuns: () => Promise<void>;
  selectRun: (runId: number) => Promise<void>;
  deleteRun: (runId: number) => Promise<void>;
  deleteAllRuns: () => Promise<void>;
  analyzeRun: (runId: number) => Promise<void>;
  sendChatMessage: (message: string) => Promise<void>;
  applyImprovement: (improvementId: string) => Promise<void>;
  rejectImprovement: (improvementId: string) => void;
  resetSimulation: () => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

const initialState: AnalystState & { currentRunId: number | null; hasAppliedChanges: boolean; isResetting: boolean } = {
  runs: [],
  selectedRunId: null,
  currentRunId: null,
  runData: null,
  analysis: null,
  isAnalyzing: false,
  chatMessages: [],
  isChatting: false,
  improvements: [],
  error: null,
  hasAppliedChanges: false,
  isResetting: false,
};

export const useAnalyst = create<AnalystStore>((set, get) => ({
  ...initialState,

  fetchRuns: async () => {
    try {
      const response = await fetch(`${API_BASE}/api/analyst/runs`);
      if (!response.ok) throw new Error('Failed to fetch runs');
      const data = await response.json();
      set({ runs: data.runs || [], currentRunId: data.currentRunId || null, error: null });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to fetch runs' });
    }
  },

  selectRun: async (runId: number) => {
    set({ selectedRunId: runId, runData: null, analysis: null, error: null });

    try {
      const response = await fetch(`${API_BASE}/api/analyst/runs/${runId}/full`);
      if (!response.ok) throw new Error('Failed to fetch run data');
      const data = await response.json();
      set({ runData: data });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to fetch run data' });
    }
  },

  deleteRun: async (runId: number) => {
    try {
      const response = await fetch(`${API_BASE}/api/analyst/runs/${runId}`, {
        method: 'DELETE',
      });

      const data = await response.json().catch(() => ({ error: 'Invalid response from server' }));

      if (!response.ok) {
        // Show the specific error from the API (e.g., "Cannot delete the currently active run")
        set({ error: data.error || `Failed to delete run (status ${response.status})` });
        return;
      }

      // Clear selection if we deleted the selected run
      const { selectedRunId } = get();
      if (selectedRunId === runId) {
        set({ selectedRunId: null, runData: null, analysis: null });
      }

      // Refresh runs list
      get().fetchRuns();
    } catch (error) {
      // Network error or other fetch failure
      const message = error instanceof Error ? error.message : 'Network error';
      set({ error: `Failed to delete run: ${message}` });
    }
  },

  deleteAllRuns: async () => {
    try {
      const response = await fetch(`${API_BASE}/api/analyst/runs`, {
        method: 'DELETE',
      });

      const data = await response.json().catch(() => ({ error: 'Invalid response from server' }));

      if (!response.ok) {
        set({ error: data.error || 'Failed to delete runs' });
        return;
      }

      // Clear selection since runs are deleted
      set({ selectedRunId: null, runData: null, analysis: null });

      // Refresh runs list
      get().fetchRuns();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Network error';
      set({ error: `Failed to delete runs: ${message}` });
    }
  },

  analyzeRun: async (runId: number) => {
    set({ isAnalyzing: true, error: null });

    try {
      const response = await fetch(`${API_BASE}/api/analyst/runs/${runId}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Analysis failed');
      }

      const analysis: RunAnalysis = await response.json();

      // Convert recommendations to improvements
      const improvements: Improvement[] = analysis.recommendations.map((rec, idx) => ({
        id: `imp-${runId}-${idx}`,
        type: rec.type,
        title: rec.title,
        description: rec.expectedImpact,
        rationale: rec.rationale,
        configPath: rec.configPath,
        currentValue: rec.currentValue,
        suggestedValue: rec.suggestedValue,
        status: 'pending' as const,
        confidence: rec.confidence,
      }));

      set({ analysis, improvements, isAnalyzing: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Analysis failed',
        isAnalyzing: false,
      });
    }
  },

  sendChatMessage: async (message: string) => {
    const { selectedRunId, chatMessages } = get();

    // Add user message immediately
    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    };

    set({
      chatMessages: [...chatMessages, userMessage],
      isChatting: true,
      error: null,
    });

    try {
      const response = await fetch(`${API_BASE}/api/analyst/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, runId: selectedRunId }),
      });

      if (!response.ok) {
        throw new Error('Chat request failed');
      }

      const data = await response.json();

      const assistantMessage: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        content: data.response,
        timestamp: new Date().toISOString(),
      };

      set((state) => ({
        chatMessages: [...state.chatMessages, assistantMessage],
        isChatting: false,
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Chat failed',
        isChatting: false,
      });
    }
  },

  applyImprovement: async (improvementId: string) => {
    const { improvements } = get();
    const improvement = improvements.find((i) => i.id === improvementId);
    if (!improvement) return;

    // Mark as applying
    set((state) => ({
      improvements: state.improvements.map((i) =>
        i.id === improvementId ? { ...i, status: 'applying' as const } : i
      ),
    }));

    try {
      const response = await fetch(`${API_BASE}/api/analyst/improvements/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          configPath: improvement.configPath,
          newValue: improvement.suggestedValue,
        }),
      });

      const data = await response.json().catch(() => ({ error: 'Invalid response from server' }));

      if (!response.ok) {
        // Revert to pending status and show error
        set((state) => ({
          improvements: state.improvements.map((i) =>
            i.id === improvementId ? { ...i, status: 'pending' as const } : i
          ),
          error: `Failed to apply "${improvement.title}": ${data.error || 'Unknown error'}. Config path: ${improvement.configPath}`,
        }));
        return;
      }

      // Update improvement status to applied and flag that changes were made
      set((state) => ({
        improvements: state.improvements.map((i) =>
          i.id === improvementId
            ? { ...i, status: 'applied' as const, appliedAt: new Date().toISOString() }
            : i
        ),
        error: null,
        hasAppliedChanges: true,
      }));
    } catch (error) {
      // Revert to pending on network error
      set((state) => ({
        improvements: state.improvements.map((i) =>
          i.id === improvementId ? { ...i, status: 'pending' as const } : i
        ),
        error: `Network error applying "${improvement.title}": ${error instanceof Error ? error.message : 'Unknown error'}`,
      }));
    }
  },

  rejectImprovement: (improvementId: string) => {
    set((state) => ({
      improvements: state.improvements.map((i) =>
        i.id === improvementId ? { ...i, status: 'rejected' as const } : i
      ),
    }));
  },

  resetSimulation: async () => {
    set({ isResetting: true, error: null });

    try {
      const response = await fetch(`${API_BASE}/api/simulation/reset`, {
        method: 'POST',
      });

      const data = await response.json().catch(() => ({ error: 'Invalid response' }));

      if (!response.ok) {
        set({ error: data.error || 'Failed to reset simulation', isResetting: false });
        return;
      }

      // Reset analyst state for new run
      set({
        selectedRunId: data.newRunId,
        currentRunId: data.newRunId,
        runData: null,
        analysis: null,
        chatMessages: [],
        improvements: [],
        hasAppliedChanges: false,
        isResetting: false,
        error: null,
      });

      // Refresh runs list
      get().fetchRuns();
    } catch (error) {
      set({
        error: `Reset failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        isResetting: false,
      });
    }
  },

  clearError: () => set({ error: null }),

  reset: () => set(initialState),
}));
