/**
 * Economic Analyst Agent
 * AI-powered analysis of simulation data using Gemini
 */

import { LLMClient } from '../llm/client.js';
import { createRateLimiter, type RateLimiter } from '../llm/rate-limiter.js';
import { llmMetrics } from '../llm/metrics.js';
import type { SimulationDatabase } from '../storage/database.js';
import {
  getRunSummary,
  getEcosystemReports,
  getMarketEfficiencyMetrics,
  getTradeRouteAnalysis,
  type RunSummary,
} from '../storage/analyst-queries.js';
import {
  ANALYST_SYSTEM_PROMPT,
  buildAnalysisPrompt,
  buildChatPrompt,
  buildImprovementPrompt,
  parseAnalysisResponse,
  parseImprovementResponse,
  type AnalysisResponse,
  type ImprovementResponse,
} from './prompts.js';

// ============================================================================
// Types
// ============================================================================

export interface AnalystConfig {
  rateLimiterPreset?: 'conservative' | 'balanced' | 'aggressive' | 'unlimited';
  debug?: boolean;
}

export interface RunAnalysis {
  runId: number;
  analyzedAt: Date;
  healthScore: number;
  issues: AnalysisResponse['issues'];
  recommendations: AnalysisResponse['recommendations'];
  summary: string;
  rawResponse?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

// ============================================================================
// Analyst Agent Class
// ============================================================================

export class EconomicAnalyst {
  private llmClient: LLMClient;
  private rateLimiter: RateLimiter;
  private debug: boolean;
  private chatHistory: ChatMessage[] = [];
  private lastAnalysis: RunAnalysis | null = null;

  constructor(config: AnalystConfig = {}) {
    this.llmClient = new LLMClient({
      model: 'gemini-2.0-flash',
      maxOutputTokens: 2048,
      temperature: 0.3, // Lower temperature for more consistent analysis
    });
    this.rateLimiter = createRateLimiter(config.rateLimiterPreset || 'balanced');
    this.debug = config.debug || false;
  }

  /**
   * Analyze a simulation run
   */
  async analyzeRun(db: SimulationDatabase, runId: number): Promise<RunAnalysis | null> {
    // Check rate limiter
    if (!this.rateLimiter.canCall()) {
      console.warn('[Analyst] Rate limit reached');
      return null;
    }

    // Gather data
    const summary = getRunSummary(db, runId);
    if (!summary) {
      console.error('[Analyst] Run not found:', runId);
      return null;
    }

    const ecosystem = getEcosystemReports(db, runId);
    const market = getMarketEfficiencyMetrics(db, runId);
    const routes = getTradeRouteAnalysis(db, runId);

    // Build prompt
    const prompt = buildAnalysisPrompt({ summary, ecosystem, market, routes });
    const fullPrompt = `${ANALYST_SYSTEM_PROMPT}\n\n${prompt}`;

    if (this.debug) {
      console.log('[Analyst] Analyzing run', runId);
      console.log('[Analyst] Prompt length:', fullPrompt.length);
    }

    // Call LLM
    this.rateLimiter.recordCall();
    const startTime = Date.now();

    try {
      const response = await this.llmClient.complete(fullPrompt);
      const latency = Date.now() - startTime;

      if (this.debug) {
        console.log('[Analyst] Response received in', latency, 'ms');
      }

      // Record metrics
      llmMetrics.record({
        timestamp: Date.now(),
        model: 'gemini-2.0-flash',
        promptSummary: `Analyze run ${runId}`,
        inputTokens: response.tokenCount?.prompt || 0,
        outputTokens: response.tokenCount?.response || 0,
        totalTokens: response.tokenCount?.total || 0,
        latencyMs: latency,
        finishReason: response.finishReason,
      });

      // Parse response
      const parsed = parseAnalysisResponse(response.text);
      if (!parsed) {
        console.error('[Analyst] Failed to parse response');
        return null;
      }

      const analysis: RunAnalysis = {
        runId,
        analyzedAt: new Date(),
        healthScore: parsed.healthScore,
        issues: parsed.issues,
        recommendations: parsed.recommendations,
        summary: parsed.summary,
        rawResponse: response.text,
      };

      this.lastAnalysis = analysis;
      return analysis;
    } catch (error) {
      console.error('[Analyst] Analysis failed:', error);
      return null;
    }
  }

  /**
   * Chat with the analyst about simulation data
   */
  async chat(
    question: string,
    db?: SimulationDatabase,
    runId?: number
  ): Promise<string | null> {
    // Check rate limiter
    if (!this.rateLimiter.canCall()) {
      return 'Rate limit reached. Please wait before asking more questions.';
    }

    // Build context
    let summary: RunSummary | undefined;
    if (db && runId) {
      summary = getRunSummary(db, runId) || undefined;
    }

    const recentAnalysis = this.lastAnalysis
      ? `Health Score: ${this.lastAnalysis.healthScore}/100\nSummary: ${this.lastAnalysis.summary}`
      : undefined;

    // Build prompt with chat history
    const historyContext = this.chatHistory
      .slice(-6) // Last 3 exchanges
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n');

    const prompt = buildChatPrompt(question, { summary, recentAnalysis });
    const fullPrompt = `${ANALYST_SYSTEM_PROMPT}\n\n## Conversation History\n${historyContext}\n\n${prompt}`;

    if (this.debug) {
      console.log('[Analyst] Chat question:', question);
    }

    // Call LLM
    this.rateLimiter.recordCall();
    const startTime = Date.now();

    try {
      const response = await this.llmClient.complete(fullPrompt);
      const latency = Date.now() - startTime;

      // Record metrics
      llmMetrics.record({
        timestamp: Date.now(),
        model: 'gemini-2.0-flash',
        promptSummary: `Chat: ${question.slice(0, 50)}...`,
        inputTokens: response.tokenCount?.prompt || 0,
        outputTokens: response.tokenCount?.response || 0,
        totalTokens: response.tokenCount?.total || 0,
        latencyMs: latency,
        finishReason: response.finishReason,
      });

      // Update chat history
      this.chatHistory.push(
        { role: 'user', content: question, timestamp: new Date() },
        { role: 'assistant', content: response.text, timestamp: new Date() }
      );

      // Keep history manageable
      if (this.chatHistory.length > 20) {
        this.chatHistory = this.chatHistory.slice(-20);
      }

      return response.text;
    } catch (error) {
      console.error('[Analyst] Chat failed:', error);
      return 'Sorry, I encountered an error processing your question.';
    }
  }

  /**
   * Generate improvement suggestion for a specific issue
   */
  async suggestImprovement(
    issue: string,
    currentConfig: Record<string, unknown>
  ): Promise<ImprovementResponse | null> {
    // Check rate limiter
    if (!this.rateLimiter.canCall()) {
      console.warn('[Analyst] Rate limit reached');
      return null;
    }

    const prompt = buildImprovementPrompt(issue, currentConfig);
    const fullPrompt = `${ANALYST_SYSTEM_PROMPT}\n\n${prompt}`;

    if (this.debug) {
      console.log('[Analyst] Generating improvement for:', issue);
    }

    // Call LLM
    this.rateLimiter.recordCall();

    try {
      const response = await this.llmClient.complete(fullPrompt);
      return parseImprovementResponse(response.text);
    } catch (error) {
      console.error('[Analyst] Improvement suggestion failed:', error);
      return null;
    }
  }

  /**
   * Get the last analysis
   */
  getLastAnalysis(): RunAnalysis | null {
    return this.lastAnalysis;
  }

  /**
   * Get chat history
   */
  getChatHistory(): ChatMessage[] {
    return [...this.chatHistory];
  }

  /**
   * Clear chat history
   */
  clearChatHistory(): void {
    this.chatHistory = [];
  }

  /**
   * Get rate limiter status
   */
  getRateLimiterStatus(): ReturnType<RateLimiter['getStatus']> {
    return this.rateLimiter.getStatus();
  }
}

/**
 * Create an economic analyst instance
 */
export function createEconomicAnalyst(config?: AnalystConfig): EconomicAnalyst {
  return new EconomicAnalyst(config);
}
