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
  // Actions
  fetchRuns: () => Promise<void>;
  selectRun: (runId: number) => Promise<void>;
  deleteRun: (runId: number) => Promise<void>;
  analyzeRun: (runId: number) => Promise<void>;
  sendChatMessage: (message: string) => Promise<void>;
  applyImprovement: (improvementId: string) => Promise<void>;
  rejectImprovement: (improvementId: string) => void;
  clearError: () => void;
  reset: () => void;
}

const initialState: AnalystState = {
  runs: [],
  selectedRunId: null,
  runData: null,
  analysis: null,
  isAnalyzing: false,
  chatMessages: [],
  isChatting: false,
  improvements: [],
  error: null,
};

export const useAnalyst = create<AnalystStore>((set, get) => ({
  ...initialState,

  fetchRuns: async () => {
    try {
      const response = await fetch(`${API_BASE}/api/analyst/runs`);
      if (!response.ok) throw new Error('Failed to fetch runs');
      const data = await response.json();
      set({ runs: data.runs || [], error: null });
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

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to delete run');
      }

      // Clear selection if we deleted the selected run
      const { selectedRunId } = get();
      if (selectedRunId === runId) {
        set({ selectedRunId: null, runData: null, analysis: null });
      }

      // Refresh runs list
      get().fetchRuns();
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to delete run' });
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

    try {
      const response = await fetch(`${API_BASE}/api/analyst/improvements/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          configPath: improvement.configPath,
          newValue: improvement.suggestedValue,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to apply improvement');
      }

      // Update improvement status
      set((state) => ({
        improvements: state.improvements.map((i) =>
          i.id === improvementId
            ? { ...i, status: 'applied' as const, appliedAt: new Date().toISOString() }
            : i
        ),
      }));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to apply improvement' });
    }
  },

  rejectImprovement: (improvementId: string) => {
    set((state) => ({
      improvements: state.improvements.map((i) =>
        i.id === improvementId ? { ...i, status: 'rejected' as const } : i
      ),
    }));
  },

  clearError: () => set({ error: null }),

  reset: () => set(initialState),
}));
