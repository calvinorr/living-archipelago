/**
 * Route composition
 * Creates and configures the main router with all route modules
 */

import { Router } from './router.js';
import { registerHealthRoutes } from './health.js';
import { registerSimulationRoutes } from './simulation.js';
import { registerDbRoutes } from './db.js';
import { registerAnalystRoutes } from './analyst.js';
import { registerConfigRoutes } from './config.js';
import { registerAdminRoutes } from './admin.js';

/**
 * Create and configure the main router with all routes
 */
export function createRouter(): Router {
  const router = new Router();

  // Register all route modules
  registerHealthRoutes(router);
  registerSimulationRoutes(router);
  registerDbRoutes(router);
  registerAnalystRoutes(router);
  registerConfigRoutes(router);
  registerAdminRoutes(router);

  return router;
}

// Re-export Router for convenience
export { Router } from './router.js';
export type { HttpMethod, RouteHandler, RouteParams } from './router.js';
