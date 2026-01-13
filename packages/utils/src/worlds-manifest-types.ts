/**
 * World manifest type definitions.
 *
 * The manifest describes all known Workflow worlds and their environment requirements.
 */

export interface WorldService {
  name: string;
  image: string;
  ports: string[];
  env?: Record<string, string>;
  healthCheck?: {
    cmd: string;
    interval: string;
    timeout: string;
    retries: number;
  };
}

export interface WorldManifestEntry {
  /** Unique identifier for the world */
  id: string;
  /** Type of world: 'official' or 'community' */
  type: 'official' | 'community';
  /** npm package name */
  package: string;
  /** Human-readable name */
  name: string;
  /** Description of the world */
  description: string;
  /** Documentation URL */
  docs: string;
  /** Repository URL (for community worlds) */
  repository?: string;
  /** Default environment variables */
  env: Record<string, string>;
  /** Required services (Docker containers) */
  services: WorldService[];
  /** Setup command to run after installation */
  setup?: string;
  /** Whether the world requires deployment to a platform */
  requiresDeployment?: boolean;
  /** Whether the world requires external credentials */
  requiresCredentials?: boolean;
  /** Note about required credentials */
  credentialsNote?: string;
  /** Environment variables required for the world to function */
  requiredEnv: string[];
  /** Optional environment variables that can configure the world */
  optionalEnv: string[];
}

export interface WorldsManifest {
  worlds: WorldManifestEntry[];
}
