export { pluralize } from './pluralize.js';
export { once, type PromiseWithResolvers, withResolvers } from './promise.js';
export { parseDurationToDate } from './time.js';

// Re-export from separate entry points for convenience
export type {
  WorldManifestEntry,
  WorldsManifest,
  WorldService,
} from './worlds-manifest.js';
export {
  worldsManifest,
  getWorldById,
  getWorldByPackage,
  getWorldEnvVars,
  isKnownWorld,
  getOfficialWorlds,
  getCommunityWorlds,
} from './worlds-manifest.js';

export type { EnvDisplayInfo } from './env-display-names.js';
export {
  ENV_DISPLAY_INFO,
  getEnvDisplayInfo,
  isEnvSensitive,
} from './env-display-names.js';

export type {
  EnvMap,
  Project,
  ProjectValidationError,
  ProjectValidationResult,
} from './project.js';
export {
  validateProject,
  generateProjectId,
  createProject,
  getProjectDisplayName,
  projectToEnvMap,
} from './project.js';
