/**
 * Gemini Flash LLM Client
 * Wrapper for @google/generative-ai with error handling and metrics
 */

import { GoogleGenerativeAI, type GenerativeModel } from '@google/generative-ai';
import { llmMetrics } from './metrics.js';

/**
 * LLM Client configuration
 */
export interface LLMClientConfig {
  /** API key (defaults to GEMINI_API_KEY env var) */
  apiKey?: string;
  /** Model to use (defaults to gemini-1.5-flash) */
  model?: string;
  /** Maximum tokens to generate */
  maxOutputTokens?: number;
  /** Temperature for generation (0-1) */
  temperature?: number;
}

const DEFAULT_CONFIG: Required<LLMClientConfig> = {
  apiKey: '',
  model: 'gemini-2.0-flash',
  maxOutputTokens: 1024,
  temperature: 0.7,
};

/**
 * Response from LLM completion
 */
export interface LLMResponse {
  text: string;
  finishReason: string;
  tokenCount?: {
    prompt?: number;
    response?: number;
    total?: number;
  };
}

/**
 * LLM Client for Gemini Flash
 */
export class LLMClient {
  private client: GoogleGenerativeAI;
  private model: GenerativeModel;
  private config: Required<LLMClientConfig>;
  private callCount: number = 0;

  constructor(config: LLMClientConfig = {}) {
    const apiKey = config.apiKey ?? process.env.GEMINI_API_KEY ?? '';

    if (!apiKey) {
      throw new Error(
        'GEMINI_API_KEY not provided. Set it via config or environment variable.'
      );
    }

    this.config = { ...DEFAULT_CONFIG, ...config, apiKey };
    this.client = new GoogleGenerativeAI(apiKey);
    this.model = this.client.getGenerativeModel({
      model: this.config.model,
      generationConfig: {
        maxOutputTokens: this.config.maxOutputTokens,
        temperature: this.config.temperature,
      },
    });
  }

  /**
   * Complete a prompt
   */
  async complete(prompt: string): Promise<LLMResponse> {
    const startTime = Date.now();

    try {
      this.callCount++;

      const result = await this.model.generateContent(prompt);
      const response = result.response;
      const text = response.text();
      const latencyMs = Date.now() - startTime;

      // Get token counts if available
      const usageMetadata = response.usageMetadata;
      const tokenCount = usageMetadata
        ? {
            prompt: usageMetadata.promptTokenCount,
            response: usageMetadata.candidatesTokenCount,
            total: usageMetadata.totalTokenCount,
          }
        : undefined;

      const finishReason = response.candidates?.[0]?.finishReason ?? 'unknown';

      // Record metrics
      llmMetrics.record({
        timestamp: Date.now(),
        model: this.config.model,
        promptSummary: prompt.slice(0, 100),
        inputTokens: tokenCount?.prompt ?? 0,
        outputTokens: tokenCount?.response ?? 0,
        totalTokens: tokenCount?.total ?? 0,
        latencyMs,
        finishReason,
      });

      return {
        text,
        finishReason,
        tokenCount,
      };
    } catch (error) {
      // Handle specific error types
      if (error instanceof Error) {
        if (error.message.includes('RATE_LIMIT')) {
          throw new LLMError('Rate limit exceeded', 'RATE_LIMIT', error);
        }
        if (error.message.includes('API_KEY')) {
          throw new LLMError('Invalid API key', 'AUTH_ERROR', error);
        }
        throw new LLMError(`LLM call failed: ${error.message}`, 'CALL_FAILED', error);
      }
      throw new LLMError('Unknown LLM error', 'UNKNOWN', error);
    }
  }

  /**
   * Complete a prompt and parse JSON response
   */
  async completeJSON<T>(prompt: string): Promise<T> {
    const response = await this.complete(prompt);

    try {
      // Try to extract JSON from the response
      const text = response.text.trim();

      // Look for JSON in code blocks
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1].trim()) as T;
      }

      // Try parsing the entire response as JSON
      return JSON.parse(text) as T;
    } catch (error) {
      throw new LLMError(
        `Failed to parse JSON from LLM response: ${response.text.slice(0, 200)}`,
        'PARSE_ERROR',
        error
      );
    }
  }

  /**
   * Get the number of calls made
   */
  getCallCount(): number {
    return this.callCount;
  }

  /**
   * Reset call count
   */
  resetCallCount(): void {
    this.callCount = 0;
  }
}

/**
 * Custom error type for LLM errors
 */
export class LLMError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

/**
 * Create a mock LLM client for testing
 */
export function createMockLLMClient(
  responses: Map<string, string> | ((prompt: string) => string)
): LLMClient {
  // Create a minimal mock that satisfies the interface
  const mock = {
    callCount: 0,
    async complete(prompt: string): Promise<LLMResponse> {
      mock.callCount++;
      const text =
        typeof responses === 'function'
          ? responses(prompt)
          : responses.get(prompt) ?? '{"error": "no mock response"}';
      return { text, finishReason: 'STOP' };
    },
    async completeJSON<T>(prompt: string): Promise<T> {
      const response = await mock.complete(prompt);
      return JSON.parse(response.text) as T;
    },
    getCallCount(): number {
      return mock.callCount;
    },
    resetCallCount(): void {
      mock.callCount = 0;
    },
  };

  return mock as unknown as LLMClient;
}
