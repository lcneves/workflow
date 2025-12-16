'use client';

import type { WorldConfig } from '@/lib/config-world';

const STORAGE_KEY = 'workflow-recent-configs';
const MAX_RECENT_CONFIGS = 10;

export interface RecentConfig {
  /** Unique identifier for this config */
  id: string;
  /** Display name for this config (auto-generated from backend + identifier) */
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
 * Generate a display name for a config
 */
function generateConfigName(config: WorldConfig): string {
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
 * Save a config to recent history
 */
export function saveRecentConfig(config: WorldConfig): RecentConfig {
  if (typeof window === 'undefined') {
    return {
      id: generateConfigId(config),
      name: generateConfigName(config),
      config,
      lastUsed: Date.now(),
      createdAt: Date.now(),
    };
  }

  const id = generateConfigId(config);
  const name = generateConfigName(config);
  const now = Date.now();

  try {
    const recent = getRecentConfigs();
    const existingIndex = recent.findIndex((r) => r.id === id);

    let entry: RecentConfig;

    if (existingIndex >= 0) {
      // Update existing entry
      entry = {
        ...recent[existingIndex],
        config, // Update with latest config
        name, // Regenerate name in case it changed
        lastUsed: now,
      };
      recent.splice(existingIndex, 1);
    } else {
      // Create new entry
      entry = {
        id,
        name,
        config,
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
      config,
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
