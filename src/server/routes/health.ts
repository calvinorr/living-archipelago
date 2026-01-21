/**
 * Health check routes
 */

import type { Router } from './router.js';
import { sendJson } from '../utils/http.js';

export function registerHealthRoutes(router: Router): void {
  router.add('GET', '/health', (_req, res) => {
    sendJson(res, 200, { status: 'ok' });
  });
}
