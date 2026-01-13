/**
 * World manifest utilities.
 *
 * The manifest describes all known Workflow worlds and their environment requirements.
 * It is generated from the root `worlds-manifest.json` during build.
 */

// Re-export types
export type {
  WorldService,
  WorldManifestEntry,
  WorldsManifest,
} from './worlds-manifest-types.js';

import type {
  WorldManifestEntry,
  WorldsManifest,
} from './worlds-manifest-types.js';
import { worldsManifestData } from './worlds-manifest-data.js';

/**
 * The worlds manifest containing all known world configurations.
 */
export const worldsManifest: WorldsManifest = worldsManifestData;

/**
 * Get a world entry by its ID.
 */
export function getWorldById(id: string): WorldManifestEntry | undefined {
  return worldsManifest.worlds.find((w) => w.id === id);
}

/**
 * Get a world entry by its package name.
 */
export function getWorldByPackage(
  packageName: string
): WorldManifestEntry | undefined {
  return worldsManifest.worlds.find((w) => w.package === packageName);
}

/**
 * Get all relevant environment variables for a world (required + optional).
 */
export function getWorldEnvVars(worldId: string): string[] {
  const world = getWorldById(worldId);
  if (!world) return [];
  return [...world.requiredEnv, ...world.optionalEnv];
}

/**
 * Check if a world ID is a known world.
 */
export function isKnownWorld(worldId: string): boolean {
  return worldsManifest.worlds.some((w) => w.id === worldId);
}

/**
 * Get all official worlds.
 */
export function getOfficialWorlds(): WorldManifestEntry[] {
  return worldsManifest.worlds.filter((w) => w.type === 'official');
}

/**
 * Get all community worlds.
 */
export function getCommunityWorlds(): WorldManifestEntry[] {
  return worldsManifest.worlds.filter((w) => w.type === 'community');
}
