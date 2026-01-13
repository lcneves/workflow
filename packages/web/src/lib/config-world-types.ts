/**
 * Types for world configuration.
 * This file contains only types and can be safely imported in client components.
 */

export interface WorkflowDataDirInfo {
  /** Absolute path to the workflow data directory, if found */
  dataDir?: string;
  /** Absolute path to the project root (parent of the workflow data folder) */
  projectDir: string;
  /** Short name for display: up to last two folder names of projectDir */
  shortName: string;
  /** Error message if the given path couldn't be accessed */
  error?: string;
}

export interface WorldConfig {
  backend?: string;
  env?: string;
  authToken?: string;
  project?: string;
  team?: string;
  port?: string;
  // Will always be defined (""./"" if not set by user), but only used for local world
  dataDir: string;
  // Path to the workflow manifest file (defaults to app/.well-known/workflow/v1/manifest.json)
  manifestPath?: string;
  // Postgres fields
  postgresUrl?: string;
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface WorldAvailability {
  id: string;
  displayName: string;
  packageName: string | null;
  description: string;
  isBuiltIn: boolean;
  isInstalled: boolean;
  installCommand?: string;
}

export interface ValidationWarning {
  field: string;
  message: string;
}

export interface ValidationResult {
  errors: ValidationError[];
  warnings: ValidationWarning[];
}
