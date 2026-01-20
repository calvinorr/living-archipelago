/**
 * Config Overrides Manager
 * Persists AI-suggested improvements to a JSON file
 * that gets merged with DEFAULT_CONFIG on startup
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to overrides file (relative to project root)
const OVERRIDES_PATH = resolve(__dirname, '../../config/simulation-overrides.json');

// ============================================================================
// Types
// ============================================================================

export interface ConfigOverride {
  path: string;
  oldValue: unknown;
  newValue: unknown;
  appliedAt: string;
  source: string; // e.g., "analyst-run-3"
  rationale?: string;
}

export interface OverridesFile {
  version: number;
  lastModified: string;
  overrides: ConfigOverride[];
}

// ============================================================================
// Load/Save Functions
// ============================================================================

/**
 * Load overrides from file
 */
export function loadOverrides(): OverridesFile {
  try {
    if (existsSync(OVERRIDES_PATH)) {
      const content = readFileSync(OVERRIDES_PATH, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.warn('[ConfigOverrides] Failed to load overrides:', error);
  }

  // Return empty overrides
  return {
    version: 1,
    lastModified: new Date().toISOString(),
    overrides: [],
  };
}

/**
 * Save overrides to file
 */
export function saveOverrides(data: OverridesFile): boolean {
  try {
    data.lastModified = new Date().toISOString();
    writeFileSync(OVERRIDES_PATH, JSON.stringify(data, null, 2), 'utf-8');
    console.log('[ConfigOverrides] Saved to', OVERRIDES_PATH);
    return true;
  } catch (error) {
    console.error('[ConfigOverrides] Failed to save:', error);
    return false;
  }
}

/**
 * Add a new override
 */
export function addOverride(override: Omit<ConfigOverride, 'appliedAt'>): boolean {
  const data = loadOverrides();

  // Remove any existing override for the same path
  data.overrides = data.overrides.filter(o => o.path !== override.path);

  // Add new override
  data.overrides.push({
    ...override,
    appliedAt: new Date().toISOString(),
  });

  return saveOverrides(data);
}

/**
 * Remove an override by path
 */
export function removeOverride(path: string): boolean {
  const data = loadOverrides();
  const initialLength = data.overrides.length;
  data.overrides = data.overrides.filter(o => o.path !== path);

  if (data.overrides.length < initialLength) {
    return saveOverrides(data);
  }
  return false;
}

/**
 * Clear all overrides
 */
export function clearOverrides(): boolean {
  const data: OverridesFile = {
    version: 1,
    lastModified: new Date().toISOString(),
    overrides: [],
  };
  return saveOverrides(data);
}

/**
 * Get current overrides as a flat object for merging
 * e.g., { "maxGrowthRate": 0.005, "laborConfig.wageResponsiveness": 1.5 }
 */
export function getOverridesAsObject(): Record<string, unknown> {
  const data = loadOverrides();
  const result: Record<string, unknown> = {};

  for (const override of data.overrides) {
    result[override.path] = override.newValue;
  }

  return result;
}

/**
 * Apply overrides to a config object (mutates the object)
 */
export function applyOverridesToConfig(config: Record<string, unknown>): void {
  const data = loadOverrides();

  for (const override of data.overrides) {
    setNestedValue(config, override.path, override.newValue);
    console.log(`[ConfigOverrides] Applied: ${override.path} = ${JSON.stringify(override.newValue)}`);
  }

  if (data.overrides.length > 0) {
    console.log(`[ConfigOverrides] Applied ${data.overrides.length} override(s)`);
  }
}

/**
 * Get the overrides file path (for display purposes)
 */
export function getOverridesPath(): string {
  return OVERRIDES_PATH;
}

// ============================================================================
// Helpers
// ============================================================================

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (current[part] === undefined) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  current[parts[parts.length - 1]] = value;
}
