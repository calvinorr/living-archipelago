/**
 * Config Patcher
 * Safely apply configuration changes suggested by the AI analyst
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

// ============================================================================
// Types
// ============================================================================

export interface ConfigPatch {
  configPath: string;
  currentValue: unknown;
  newValue: unknown;
  rationale?: string;
}

export interface PatchResult {
  success: boolean;
  configPath: string;
  oldValue: unknown;
  newValue: unknown;
  error?: string;
}

// ============================================================================
// Config Structure (mirrors world.ts DEFAULT_CONFIG)
// ============================================================================

// Known config paths that can be safely patched
const PATCHABLE_PATHS = new Set([
  // Population
  'maxGrowthRate',
  'baseHealthDecay',
  'minHealthThreshold',
  'starvationThreshold',

  // Ecosystem
  'fishMigrationConfig.migrationRate',
  'fishMigrationConfig.minStockThreshold',
  'fishMigrationConfig.maxMigrationPercent',
  'baseStorageSpoilageRate',

  // Economy
  'transactionTaxRate',
  'baseVoyageCost',

  // Market (per-good configs)
  'goodMarketConfigs.fish.basePrice',
  'goodMarketConfigs.fish.elasticity',
  'goodMarketConfigs.grain.basePrice',
  'goodMarketConfigs.grain.elasticity',
  'goodMarketConfigs.timber.basePrice',
  'goodMarketConfigs.timber.elasticity',
  'goodMarketConfigs.tools.basePrice',
  'goodMarketConfigs.tools.elasticity',
  'goodMarketConfigs.luxuries.basePrice',
  'goodMarketConfigs.luxuries.elasticity',

  // Labor
  'laborConfig.wageResponsiveness',
  'laborConfig.laborMobility',
  'laborConfig.minWage',
  'laborConfig.maxWage',
]);

// ============================================================================
// Path Utilities
// ============================================================================

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): boolean {
  const parts = path.split('.');
  let current: Record<string, unknown> = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (current[part] === undefined) {
      current[part] = {};
    }
    if (typeof current[part] !== 'object' || current[part] === null) {
      return false;
    }
    current = current[part] as Record<string, unknown>;
  }

  current[parts[parts.length - 1]] = value;
  return true;
}

// ============================================================================
// Validation
// ============================================================================

export function validatePatch(patch: ConfigPatch): string | null {
  // Check if path is patchable
  if (!PATCHABLE_PATHS.has(patch.configPath)) {
    return `Config path '${patch.configPath}' is not in the allowed list of patchable values`;
  }

  // Basic type validation
  if (patch.newValue === undefined || patch.newValue === null) {
    return 'New value cannot be null or undefined';
  }

  // Numeric range validation for known paths
  if (typeof patch.newValue === 'number') {
    if (isNaN(patch.newValue)) {
      return 'New value cannot be NaN';
    }

    // Path-specific validation
    if (patch.configPath === 'maxGrowthRate') {
      if (patch.newValue < 0 || patch.newValue > 0.1) {
        return 'maxGrowthRate must be between 0 and 0.1 (0-10% per tick)';
      }
    }

    if (patch.configPath === 'transactionTaxRate') {
      if (patch.newValue < 0 || patch.newValue > 0.5) {
        return 'transactionTaxRate must be between 0 and 0.5 (0-50%)';
      }
    }

    if (patch.configPath.includes('elasticity')) {
      if (patch.newValue < 0.1 || patch.newValue > 5) {
        return 'elasticity must be between 0.1 and 5';
      }
    }

    if (patch.configPath.includes('basePrice')) {
      if (patch.newValue < 1 || patch.newValue > 1000) {
        return 'basePrice must be between 1 and 1000';
      }
    }
  }

  return null;
}

// ============================================================================
// Preview
// ============================================================================

export function previewPatch(
  configPath: string,
  currentConfig: Record<string, unknown>
): { path: string; currentValue: unknown } | null {
  const currentValue = getNestedValue(currentConfig, configPath);

  if (currentValue === undefined) {
    return null;
  }

  return {
    path: configPath,
    currentValue,
  };
}

// ============================================================================
// Apply Patch (in-memory)
// ============================================================================

export function applyPatchToConfig(
  config: Record<string, unknown>,
  patch: ConfigPatch
): PatchResult {
  // Validate first
  const error = validatePatch(patch);
  if (error) {
    return {
      success: false,
      configPath: patch.configPath,
      oldValue: getNestedValue(config, patch.configPath),
      newValue: patch.newValue,
      error,
    };
  }

  const oldValue = getNestedValue(config, patch.configPath);
  const success = setNestedValue(config, patch.configPath, patch.newValue);

  return {
    success,
    configPath: patch.configPath,
    oldValue,
    newValue: patch.newValue,
    error: success ? undefined : 'Failed to set value',
  };
}

// ============================================================================
// Generate Diff
// ============================================================================

export function generateDiff(patch: ConfigPatch): string {
  const currentStr = JSON.stringify(patch.currentValue, null, 2);
  const newStr = JSON.stringify(patch.newValue, null, 2);

  return `--- ${patch.configPath}
+++ ${patch.configPath}
- ${currentStr}
+ ${newStr}
${patch.rationale ? `\n// Rationale: ${patch.rationale}` : ''}`;
}

// ============================================================================
// File Operations (for persistent changes)
// ============================================================================

export function loadConfigFromFile(filePath: string): Record<string, unknown> | null {
  try {
    const absolutePath = resolve(filePath);
    const content = readFileSync(absolutePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export function saveConfigToFile(
  filePath: string,
  config: Record<string, unknown>
): boolean {
  try {
    const absolutePath = resolve(filePath);
    const content = JSON.stringify(config, null, 2);
    writeFileSync(absolutePath, content, 'utf-8');
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Batch Operations
// ============================================================================

export function applyPatches(
  config: Record<string, unknown>,
  patches: ConfigPatch[]
): PatchResult[] {
  const results: PatchResult[] = [];

  for (const patch of patches) {
    const result = applyPatchToConfig(config, patch);
    results.push(result);

    // Stop on first error if needed
    if (!result.success) {
      break;
    }
  }

  return results;
}

export function getPatchableConfigPaths(): string[] {
  return Array.from(PATCHABLE_PATHS);
}
