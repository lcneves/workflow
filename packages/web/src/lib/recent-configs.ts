'use client';

import type { WorldConfig } from '@/lib/config-world';
import { getWorkflowDataDirInfo, resolveToAbsolutePath } from '@/lib/data-dir';

const STORAGE_KEY = 'workflow-recent-configs';
const MAX_RECENT_CONFIGS = 10;

export interface RecentConfig {
  /** Unique identifier for this config */
  id: string;
  /** Display name for this config (shortName from workflow data dir or auto-generated) */
  name: string;
  /** The complete world config */
  config: WorldConfig;
  /** When this config was last used */
  lastUsed: number;
  /** When this config was first added */
  createdAt: number;
}

/**
 * Generate a unique ID for a config based on its key properties
 */
function generateConfigId(config: WorldConfig): string {
  const backend = config.backend || 'local';

  if (backend === 'local') {
    return `local:${config.dataDir || 'default'}`;
  }
  if (backend === 'postgres') {
    // Use a hash of the URL to avoid storing sensitive info in ID
    const urlHash = config.postgresUrl
      ? btoa(config.postgresUrl).slice(0, 16)
      : 'default';
    return `postgres:${urlHash}`;
  }
  if (backend === 'vercel') {
    return `vercel:${config.team || 'unknown'}/${config.project || 'unknown'}`;
  }

  return `${backend}:${Date.now()}`;
}

/**
 * Generate a fallback display name for a config (used when shortName is not available)
 */
function generateFallbackConfigName(config: WorldConfig): string {
  const backend = config.backend || 'local';

  if (backend === 'local') {
    // Use the last part of the path as the name
    const dataDir = config.dataDir || '.next/workflow-data';
    const parts = dataDir.split('/').filter(Boolean);
    // Try to find a meaningful name from the path
    const projectDir = parts.find(
      (p) =>
        !['next', '.next', 'workflow-data', '.workflow-data'].includes(
          p.toLowerCase()
        )
    );
    return projectDir || dataDir;
  }

  if (backend === 'postgres') {
    // Try to extract database name from URL
    if (config.postgresUrl) {
      try {
        const url = new URL(config.postgresUrl);
        const dbName = url.pathname.slice(1); // Remove leading /
        return dbName || 'PostgreSQL';
      } catch {
        return 'PostgreSQL';
      }
    }
    return 'PostgreSQL';
  }

  if (backend === 'vercel') {
    if (config.project) {
      return config.team ? `${config.team}/${config.project}` : config.project;
    }
    return 'Vercel Project';
  }

  return backend;
}

/**
 * Generate a display name for a config using the workflow data directory info
 * Falls back to path-based name generation if the data dir info is not available
 */
async function generateConfigName(config: WorldConfig): Promise<string> {
  const backend = config.backend || 'local';

  // For local backend, try to get the shortName from the workflow data dir
  if (backend === 'local' && config.dataDir) {
    try {
      const info = await getWorkflowDataDirInfo(config.dataDir);
      if (info?.shortName) {
        return info.shortName;
      }
    } catch {
      // Fall through to fallback
    }
  }

  return generateFallbackConfigName(config);
}

/**
 * Get all recent configs from localStorage
 */
export function getRecentConfigs(): RecentConfig[] {
  if (typeof window === 'undefined') return [];

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored) as RecentConfig[];
  } catch {
    return [];
  }
}

/**
 * Migrate existing recent configs to ensure all dataDirs are absolute paths
 * and update names to use shortName format.
 * This runs once on page load to fix any legacy relative paths.
 */
export async function migrateRecentConfigs(): Promise<void> {
  if (typeof window === 'undefined') return;

  const configs = getRecentConfigs();
  if (configs.length === 0) return;

  let hasChanges = false;
  const migratedConfigs = await Promise.all(
    configs.map(async (recentConfig) => {
      const { config } = recentConfig;
      let updatedConfig = config;
      let needsUpdate = false;

      // Migrate relative paths to absolute
      if (config.dataDir && !config.dataDir.startsWith('/')) {
        try {
          const absolutePath = await resolveToAbsolutePath(config.dataDir);
          if (absolutePath !== config.dataDir) {
            updatedConfig = { ...config, dataDir: absolutePath };
            needsUpdate = true;
          }
        } catch {
          // Keep original if resolution fails
        }
      }

      // Regenerate name using shortName
      if (needsUpdate || !recentConfig.name) {
        hasChanges = true;
        const newName = await generateConfigName(updatedConfig);
        return {
          ...recentConfig,
          id: generateConfigId(updatedConfig),
          name: newName,
          config: updatedConfig,
        };
      }

      return recentConfig;
    })
  );

  if (hasChanges) {
    // Deduplicate by ID (in case migration creates duplicates)
    const seen = new Set<string>();
    const deduped = migratedConfigs.filter((config) => {
      if (seen.has(config.id)) return false;
      seen.add(config.id);
      return true;
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(deduped));
  }
}

/**
 * Normalize a config by ensuring dataDir is an absolute path
 */
async function normalizeConfig(config: WorldConfig): Promise<WorldConfig> {
  if (!config.dataDir) return config;

  try {
    const absolutePath = await resolveToAbsolutePath(config.dataDir);
    if (absolutePath !== config.dataDir) {
      return { ...config, dataDir: absolutePath };
    }
  } catch {
    // If resolution fails, keep original path
  }
  return config;
}

/**
 * Save a config to recent history (async version that normalizes paths)
 */
export async function saveRecentConfig(
  config: WorldConfig
): Promise<RecentConfig> {
  // Normalize config to ensure absolute paths
  const normalizedConfig = await normalizeConfig(config);

  if (typeof window === 'undefined') {
    const name = await generateConfigName(normalizedConfig);
    return {
      id: generateConfigId(normalizedConfig),
      name,
      config: normalizedConfig,
      lastUsed: Date.now(),
      createdAt: Date.now(),
    };
  }

  const id = generateConfigId(normalizedConfig);
  const name = await generateConfigName(normalizedConfig);
  const now = Date.now();

  try {
    const recent = getRecentConfigs();
    const existingIndex = recent.findIndex((r) => r.id === id);

    let entry: RecentConfig;

    if (existingIndex >= 0) {
      // Update existing entry
      entry = {
        ...recent[existingIndex],
        config: normalizedConfig, // Update with latest config
        name, // Regenerate name in case it changed
        lastUsed: now,
      };
      recent.splice(existingIndex, 1);
    } else {
      // Create new entry
      entry = {
        id,
        name,
        config: normalizedConfig,
        lastUsed: now,
        createdAt: now,
      };
    }

    // Add to front
    recent.unshift(entry);

    // Keep only the most recent entries
    const trimmed = recent.slice(0, MAX_RECENT_CONFIGS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));

    return entry;
  } catch {
    return {
      id,
      name,
      config: normalizedConfig,
      lastUsed: now,
      createdAt: now,
    };
  }
}

/**
 * Remove a config from recent history
 */
export function removeRecentConfig(id: string): void {
  if (typeof window === 'undefined') return;

  try {
    const recent = getRecentConfigs().filter((r) => r.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(recent));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Get the backend icon name for a config
 */
export function getBackendType(
  config: WorldConfig
): 'local' | 'postgres' | 'vercel' | 'other' {
  const backend = config.backend || 'local';

  if (backend === 'local' || backend === '@workflow/world-local') {
    return 'local';
  }
  if (backend === 'postgres' || backend === '@workflow/world-postgres') {
    return 'postgres';
  }
  if (backend === 'vercel' || backend === '@workflow/world-vercel') {
    return 'vercel';
  }

  return 'other';
}
