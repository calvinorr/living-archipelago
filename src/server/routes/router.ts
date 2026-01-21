/**
 * Simple HTTP router for the API server
 * Supports exact paths, parameterized paths, and regex patterns
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { matchPath } from '../utils/http.js';

export type HttpMethod = 'GET' | 'POST' | 'DELETE' | 'PUT' | 'PATCH';

export type RouteParams = Record<string, string>;

export type RouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  params: RouteParams
) => void | Promise<void>;

interface ParamRouteEntry {
  method: HttpMethod;
  pattern: string;
  handler: RouteHandler;
}

interface RegexRouteEntry {
  method: HttpMethod;
  pattern: RegExp;
  handler: RouteHandler;
}

/**
 * Simple router that matches HTTP requests to handlers
 *
 * Priority order:
 * 1. Exact path matches (fastest, checked first)
 * 2. Parameterized paths (e.g., /api/runs/:runId)
 * 3. Regex patterns (most flexible, checked last)
 */
export class Router {
  private exactRoutes: Map<string, RouteHandler> = new Map();
  private paramRoutes: ParamRouteEntry[] = [];
  private regexRoutes: RegexRouteEntry[] = [];

  /**
   * Add a route with an exact path match
   * Example: router.add('GET', '/health', handler)
   */
  add(method: HttpMethod, path: string, handler: RouteHandler): void {
    const key = `${method}:${path}`;
    this.exactRoutes.set(key, handler);
  }

  /**
   * Add a route with URL parameters
   * Example: router.addParam('GET', '/api/runs/:runId/summary', handler)
   * Parameters are extracted and passed to the handler
   */
  addParam(method: HttpMethod, pattern: string, handler: RouteHandler): void {
    this.paramRoutes.push({ method, pattern, handler });
  }

  /**
   * Add a route with a regex pattern
   * Example: router.addRegex('GET', /^\/api\/runs\/\d+$/, handler)
   * Named groups are extracted as parameters
   */
  addRegex(method: HttpMethod, pattern: RegExp, handler: RouteHandler): void {
    this.regexRoutes.push({ method, pattern, handler });
  }

  /**
   * Attempt to handle a request
   * Returns true if a matching route was found and handled
   * Returns false if no matching route was found (caller should 404)
   */
  handle(req: IncomingMessage, res: ServerResponse, pathname: string): boolean {
    const method = req.method as HttpMethod;

    // 1. Try exact match first (fastest)
    const exactKey = `${method}:${pathname}`;
    const exactHandler = this.exactRoutes.get(exactKey);
    if (exactHandler) {
      exactHandler(req, res, {});
      return true;
    }

    // 2. Try parameterized routes
    for (const route of this.paramRoutes) {
      if (route.method !== method) continue;

      const params = matchPath(pathname, route.pattern);
      if (params) {
        route.handler(req, res, params);
        return true;
      }
    }

    // 3. Try regex routes
    for (const route of this.regexRoutes) {
      if (route.method !== method) continue;

      const match = pathname.match(route.pattern);
      if (match) {
        // Extract named groups as params, or use positional matches
        const params: RouteParams = match.groups
          ? { ...match.groups }
          : match.slice(1).reduce((acc, val, idx) => {
              acc[`$${idx + 1}`] = val;
              return acc;
            }, {} as RouteParams);
        route.handler(req, res, params);
        return true;
      }
    }

    return false;
  }

  /**
   * Get stats about registered routes (for debugging)
   */
  getStats(): { exact: number; param: number; regex: number } {
    return {
      exact: this.exactRoutes.size,
      param: this.paramRoutes.length,
      regex: this.regexRoutes.length,
    };
  }
}
