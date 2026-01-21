/**
 * HTTP utility functions for the API server
 */

import type { IncomingMessage, ServerResponse } from 'http';

/**
 * Send a JSON response with the given status code and payload
 */
export function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

/**
 * Send an error response with the given status code and message
 */
export function sendError(res: ServerResponse, status: number, message: string): void {
  sendJson(res, status, { error: message });
}

/**
 * Parse JSON body from an incoming request
 * Returns null if parsing fails or body is empty
 */
export function parseJsonBody<T = unknown>(req: IncomingMessage): Promise<T | null> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      if (!body) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(body) as T);
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => {
      resolve(null);
    });
  });
}

/**
 * Set CORS headers on a response
 */
export function setCorsHeaders(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, PUT, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

/**
 * Handle CORS preflight request
 * Returns true if this was a preflight request and it was handled
 */
export function handleCorsPreflightIfNeeded(req: IncomingMessage, res: ServerResponse): boolean {
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }
  return false;
}

/**
 * Parse a run ID from a string value
 * Returns null if the value is not a valid number
 */
export function parseRunId(value: string | undefined): number | null {
  if (!value) return null;
  const id = parseInt(value, 10);
  return isNaN(id) ? null : id;
}

/**
 * Type guard to check if database is available
 * Sends 503 error if not available
 */
export function requireDb<T>(db: T | null, res: ServerResponse): db is T {
  if (!db) {
    sendError(res, 503, 'Database not enabled');
    return false;
  }
  return true;
}

/**
 * Check if API key is available
 * Sends 503 error if not available
 */
export function requireApiKey(hasKey: boolean, res: ServerResponse): boolean {
  if (!hasKey) {
    sendError(res, 503, 'GEMINI_API_KEY not configured');
    return false;
  }
  return true;
}

/**
 * Extract path parameters from a URL pathname using a pattern
 * Pattern uses :param syntax, e.g., '/api/runs/:runId/summary'
 * Returns null if the pattern doesn't match
 */
export function matchPath(
  pathname: string,
  pattern: string
): Record<string, string> | null {
  const patternParts = pattern.split('/');
  const pathParts = pathname.split('/');

  if (patternParts.length !== pathParts.length) {
    return null;
  }

  const params: Record<string, string> = {};

  for (let i = 0; i < patternParts.length; i++) {
    const patternPart = patternParts[i];
    const pathPart = pathParts[i];

    if (patternPart.startsWith(':')) {
      // This is a parameter
      const paramName = patternPart.slice(1);
      params[paramName] = pathPart;
    } else if (patternPart !== pathPart) {
      // Static parts must match exactly
      return null;
    }
  }

  return params;
}
