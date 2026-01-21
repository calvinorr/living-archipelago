/**
 * Config overrides routes
 */

import type { Router } from './router.js';
import { sendJson, sendError, parseJsonBody } from '../utils/http.js';
import {
  loadOverrides,
  removeOverride,
  clearOverrides,
  getOverridesPath,
} from '../../config/overrides.js';

export function registerConfigRoutes(router: Router): void {
  // Get all config overrides
  router.add('GET', '/api/config/overrides', (_req, res) => {
    const data = loadOverrides();
    sendJson(res, 200, {
      ...data,
      filePath: getOverridesPath(),
    });
  });

  // Clear all overrides
  router.add('DELETE', '/api/config/overrides', (_req, res) => {
    const success = clearOverrides();
    if (success) {
      sendJson(res, 200, {
        success: true,
        message: 'All config overrides cleared. Restart server to apply default config.',
      });
    } else {
      sendError(res, 500, 'Failed to clear overrides');
    }
  });

  // Remove a specific override
  router.add('POST', '/api/config/overrides/remove', async (req, res) => {
    const body = await parseJsonBody<{ path?: string }>(req);
    if (!body) {
      sendError(res, 400, 'Invalid JSON body');
      return;
    }

    const { path } = body;
    if (!path) {
      sendError(res, 400, 'path is required');
      return;
    }

    const success = removeOverride(path);
    sendJson(res, 200, {
      success,
      message: success
        ? `Override for ${path} removed. Restart server to apply.`
        : `No override found for ${path}`,
    });
  });
}
