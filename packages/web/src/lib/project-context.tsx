'use client';

import {
  type Project,
  createProject,
  generateProjectId,
  projectToEnvMap,
} from '@workflow/utils/project-types';
import { worldsManifest, getWorldById } from '@workflow/utils/worlds-manifest';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

const STORAGE_KEY_CURRENT = 'workflow-current-project';
const STORAGE_KEY_RECENT = 'workflow-recent-projects';
const MAX_RECENT_PROJECTS = 10;

/**
 * Project validation status from server-side check
 */
export interface ProjectValidationStatus {
  valid: boolean;
  errors: Array<{
    field: string;
    message: string;
    critical: boolean;
  }>;
  loading: boolean;
  lastChecked: Date | null;
}

/**
 * Context value for project management
 */
export interface ProjectContextValue {
  /** The current active project */
  currentProject: Project | null;
  /** List of recent projects (excluding current) */
  recentProjects: Project[];
  /** Whether the project provider is initializing */
  isLoading: boolean;
  /** Whether the app is in self-hosting mode */
  isSelfHosting: boolean;
  /** Current project validation status */
  validationStatus: ProjectValidationStatus;
  /** Set the current project */
  setCurrentProject: (project: Project) => void;
  /** Create and set a new project */
  createNewProject: (
    worldId: string,
    projectDir: string,
    envMap?: Record<string, string | undefined>,
    name?: string
  ) => Project;
  /** Update the current project */
  updateCurrentProject: (updates: Partial<Project>) => void;
  /** Delete a project from recent list */
  deleteRecentProject: (projectId: string) => void;
  /** Get the envMap for server actions */
  getEnvMap: () => Record<string, string | undefined>;
  /** Trigger validation of current project */
  validateCurrentProject: () => Promise<void>;
  /** Clear current project */
  clearCurrentProject: () => void;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

/**
 * Load projects from localStorage
 */
function loadFromStorage(): {
  current: Project | null;
  recent: Project[];
} {
  if (typeof window === 'undefined') {
    return { current: null, recent: [] };
  }

  try {
    const currentStr = localStorage.getItem(STORAGE_KEY_CURRENT);
    const recentStr = localStorage.getItem(STORAGE_KEY_RECENT);

    const current = currentStr ? JSON.parse(currentStr) : null;
    const recent = recentStr ? JSON.parse(recentStr) : [];

    return { current, recent };
  } catch (error) {
    console.error('Failed to load projects from localStorage:', error);
    return { current: null, recent: [] };
  }
}

/**
 * Save current project to localStorage
 */
function saveCurrentToStorage(project: Project | null): void {
  if (typeof window === 'undefined') return;

  try {
    if (project) {
      localStorage.setItem(STORAGE_KEY_CURRENT, JSON.stringify(project));
    } else {
      localStorage.removeItem(STORAGE_KEY_CURRENT);
    }
  } catch (error) {
    console.error('Failed to save current project to localStorage:', error);
  }
}

/**
 * Save recent projects to localStorage
 */
function saveRecentToStorage(projects: Project[]): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(STORAGE_KEY_RECENT, JSON.stringify(projects));
  } catch (error) {
    console.error('Failed to save recent projects to localStorage:', error);
  }
}

/**
 * Parse query params into project env vars
 */
function parseQueryParamsToEnvMap(
  searchParams: URLSearchParams
): Record<string, string | undefined> {
  const envMap: Record<string, string | undefined> = {};

  // Map query param names to env var names
  const paramMappings: Record<string, string> = {
    backend: 'WORKFLOW_TARGET_WORLD',
    dataDir: 'WORKFLOW_LOCAL_DATA_DIR',
    env: 'WORKFLOW_VERCEL_ENV',
    authToken: 'WORKFLOW_VERCEL_AUTH_TOKEN',
    project: 'WORKFLOW_VERCEL_PROJECT',
    team: 'WORKFLOW_VERCEL_TEAM',
    port: 'PORT',
    manifestPath: 'WORKFLOW_MANIFEST_PATH',
    postgresUrl: 'WORKFLOW_POSTGRES_URL',
    projectDir: 'WORKFLOW_PROJECT_DIR',
  };

  for (const [param, envVar] of Object.entries(paramMappings)) {
    const value = searchParams.get(param);
    if (value) {
      envMap[envVar] = value;
    }
  }

  return envMap;
}

/**
 * Extract projectDir from query params (separate from env vars)
 */
function getProjectDirFromParams(
  searchParams: URLSearchParams,
  envMap: Record<string, string | undefined>
): string {
  // First check explicit projectDir param
  const projectDirParam = searchParams.get('projectDir');
  if (projectDirParam) return projectDirParam;

  // Then check if it was set in env map
  if (envMap.WORKFLOW_PROJECT_DIR) return envMap.WORKFLOW_PROJECT_DIR;

  // Fall back to dataDir for local world
  const dataDir = envMap.WORKFLOW_LOCAL_DATA_DIR || searchParams.get('dataDir');
  if (dataDir) return dataDir;

  return './';
}

/**
 * Determine world ID from query params or env map
 */
function getWorldIdFromParams(
  searchParams: URLSearchParams,
  envMap: Record<string, string | undefined>
): string {
  const backend = searchParams.get('backend');
  if (backend) {
    // Check if it's a known world ID
    const world = getWorldById(backend);
    if (world) return backend;
    // Otherwise treat as custom package name
    return backend;
  }

  // Try to infer from target world
  const targetWorld = envMap.WORKFLOW_TARGET_WORLD;
  if (targetWorld) {
    // Check if it matches a known world package
    for (const world of worldsManifest.worlds) {
      if (world.package === targetWorld) {
        return world.id;
      }
    }
    return targetWorld;
  }

  return 'local';
}

interface ProjectProviderProps {
  children: ReactNode;
  /** Whether the app is in self-hosting mode (from server) */
  isSelfHosting?: boolean;
}

export function ProjectProvider({
  children,
  isSelfHosting = false,
}: ProjectProviderProps) {
  const [currentProject, setCurrentProjectState] = useState<Project | null>(
    null
  );
  const [recentProjects, setRecentProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [validationStatus, setValidationStatus] =
    useState<ProjectValidationStatus>({
      valid: true,
      errors: [],
      loading: false,
      lastChecked: null,
    });

  // Initialize from localStorage and query params
  useEffect(() => {
    const initializeProject = async () => {
      // Check for query params
      const searchParams = new URLSearchParams(window.location.search);
      const configParams = [
        'backend',
        'dataDir',
        'authToken',
        'project',
        'team',
        'env',
        'port',
        'manifestPath',
        'postgresUrl',
        'projectDir',
      ];
      const hasConfigParams = configParams.some((p) => searchParams.has(p));

      // Always remove config params from URL (keep view-related params)
      if (hasConfigParams) {
        const newParams = new URLSearchParams();
        const viewParams = [
          'resource',
          'id',
          'runId',
          'stepId',
          'hookId',
          'tab',
          'sidebar',
          'theme',
        ];
        for (const param of viewParams) {
          const value = searchParams.get(param);
          if (value) newParams.set(param, value);
        }

        const newUrl = newParams.toString()
          ? `${window.location.pathname}?${newParams.toString()}`
          : window.location.pathname;

        window.history.replaceState({}, '', newUrl);
      }

      // In self-hosting mode, don't use localStorage or query params for project config
      if (isSelfHosting) {
        setIsLoading(false);
        return;
      }

      const { current, recent } = loadFromStorage();

      if (hasConfigParams) {
        // Create/update project from query params
        const envMap = parseQueryParamsToEnvMap(searchParams);
        const worldId = getWorldIdFromParams(searchParams, envMap);
        const projectDir = getProjectDirFromParams(searchParams, envMap);

        // Check if we have a matching current project
        if (current && current.worldId === worldId) {
          // Update existing project with new env vars
          const updatedProject: Project = {
            ...current,
            envMap: { ...current.envMap, ...envMap },
            lastUsedAt: new Date().toISOString(),
          };
          setCurrentProjectState(updatedProject);
          saveCurrentToStorage(updatedProject);
        } else {
          // Create new project
          const newProject = createProject(worldId, projectDir, envMap);
          setCurrentProjectState(newProject);
          saveCurrentToStorage(newProject);

          // Add old current to recent if it exists
          if (current) {
            const updatedRecent = [current, ...recent]
              .filter(
                (p, i, arr) => arr.findIndex((pp) => pp.id === p.id) === i
              )
              .slice(0, MAX_RECENT_PROJECTS);
            setRecentProjects(updatedRecent);
            saveRecentToStorage(updatedRecent);
          }
        }
      } else {
        // Use stored project
        setCurrentProjectState(current);
        setRecentProjects(recent);
      }

      setIsLoading(false);
    };

    initializeProject();
  }, [isSelfHosting]);

  const setCurrentProject = useCallback(
    (project: Project) => {
      // Move old current to recent
      if (currentProject && currentProject.id !== project.id) {
        setRecentProjects((prev) => {
          const updated = [
            currentProject,
            ...prev.filter((p) => p.id !== currentProject.id),
          ].slice(0, MAX_RECENT_PROJECTS);
          saveRecentToStorage(updated);
          return updated;
        });
      }

      // Update project's lastUsedAt
      const updatedProject: Project = {
        ...project,
        lastUsedAt: new Date().toISOString(),
      };

      setCurrentProjectState(updatedProject);
      saveCurrentToStorage(updatedProject);

      // Remove from recent if it was there
      setRecentProjects((prev) => {
        const updated = prev.filter((p) => p.id !== project.id);
        if (updated.length !== prev.length) {
          saveRecentToStorage(updated);
        }
        return updated;
      });

      // Reset validation status
      setValidationStatus({
        valid: true,
        errors: [],
        loading: false,
        lastChecked: null,
      });
    },
    [currentProject]
  );

  const createNewProject = useCallback(
    (
      worldId: string,
      projectDir: string,
      envMap?: Record<string, string | undefined>,
      name?: string
    ) => {
      const newProject = createProject(worldId, projectDir, envMap, name);
      setCurrentProject(newProject);
      return newProject;
    },
    [setCurrentProject]
  );

  const updateCurrentProject = useCallback((updates: Partial<Project>) => {
    setCurrentProjectState((prev) => {
      if (!prev) return prev;
      const updated: Project = {
        ...prev,
        ...updates,
        lastUsedAt: new Date().toISOString(),
      };
      saveCurrentToStorage(updated);
      return updated;
    });
  }, []);

  const deleteRecentProject = useCallback((projectId: string) => {
    setRecentProjects((prev) => {
      const updated = prev.filter((p) => p.id !== projectId);
      saveRecentToStorage(updated);
      return updated;
    });
  }, []);

  const clearCurrentProject = useCallback(() => {
    setCurrentProjectState(null);
    saveCurrentToStorage(null);
  }, []);

  const getEnvMap = useCallback(() => {
    if (!currentProject) return {};
    return projectToEnvMap(currentProject);
  }, [currentProject]);

  const validateCurrentProject = useCallback(async () => {
    if (!currentProject) return;

    setValidationStatus((prev) => ({ ...prev, loading: true }));

    try {
      // Call server action for validation
      const { validateProjectConfig } = await import(
        '@workflow/web-shared/server'
      );
      const result = await validateProjectConfig(currentProject);

      if (result.success) {
        setValidationStatus({
          valid: result.data.valid,
          errors: result.data.errors,
          loading: false,
          lastChecked: new Date(),
        });
      } else {
        setValidationStatus({
          valid: false,
          errors: [
            {
              field: 'general',
              message: result.error.message,
              critical: true,
            },
          ],
          loading: false,
          lastChecked: new Date(),
        });
      }
    } catch (error) {
      setValidationStatus({
        valid: false,
        errors: [
          {
            field: 'general',
            message:
              error instanceof Error ? error.message : 'Validation failed',
            critical: true,
          },
        ],
        loading: false,
        lastChecked: new Date(),
      });
    }
  }, [currentProject]);

  const value = useMemo<ProjectContextValue>(
    () => ({
      currentProject,
      recentProjects,
      isLoading,
      isSelfHosting,
      validationStatus,
      setCurrentProject,
      createNewProject,
      updateCurrentProject,
      deleteRecentProject,
      getEnvMap,
      validateCurrentProject,
      clearCurrentProject,
    }),
    [
      currentProject,
      recentProjects,
      isLoading,
      isSelfHosting,
      validationStatus,
      setCurrentProject,
      createNewProject,
      updateCurrentProject,
      deleteRecentProject,
      getEnvMap,
      validateCurrentProject,
      clearCurrentProject,
    ]
  );

  return (
    <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
  );
}

/**
 * Hook to access the project context
 */
export function useProject(): ProjectContextValue {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
}

/**
 * Hook to get the current project's env map for server actions
 */
export function useProjectEnvMap(): Record<string, string | undefined> {
  const { getEnvMap } = useProject();
  return getEnvMap();
}
