'use client';

/**
 * Project context provider for managing the current project configuration.
 *
 * The project context provides:
 * - The current project configuration
 * - A way to update the current project
 * - A list of recent projects
 * - Functions to manage projects
 */

import {
  type EnvMap,
  type Project,
  type ProjectValidationResult,
  createProject,
  generateProjectId,
  projectToEnvMap,
} from '@workflow/utils/project';
import { getWorldById } from '@workflow/utils/worlds-manifest';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  addToRecentProjects,
  loadCurrentProject,
  loadRecentProjects,
  removeFromRecentProjects,
  saveCurrentProject,
} from './project-storage';

interface ProjectContextValue {
  /** The current project configuration */
  currentProject: Project | null;
  /** Whether the project is being loaded from storage */
  isLoading: boolean;
  /** Whether the app is in self-hosting mode */
  isSelfHosted: boolean;
  /** Set the current project */
  setCurrentProject: (project: Project | null) => void;
  /** Update the current project with partial changes */
  updateCurrentProject: (updates: Partial<Project>) => void;
  /** List of recent projects (sorted by lastUsed) */
  recentProjects: Project[];
  /** Add a project to recent projects */
  addRecentProject: (project: Project) => void;
  /** Remove a project from recent projects */
  removeRecentProject: (projectId: string) => void;
  /** Get the envMap for use with server actions */
  getEnvMap: () => EnvMap;
  /** Create a new project and set it as current */
  createAndSetProject: (
    worldId: string,
    envMap?: EnvMap,
    options?: { name?: string; projectDir?: string }
  ) => Project;
  /** Validation result for the current project */
  validationResult: ProjectValidationResult | null;
  /** Set the validation result */
  setValidationResult: (result: ProjectValidationResult | null) => void;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

interface ProjectProviderProps {
  children: ReactNode;
  /** Whether the app is in self-hosting mode */
  isSelfHosted?: boolean;
  /** Initial project to use (e.g., from query params) */
  initialProject?: Project | null;
}

export function ProjectProvider({
  children,
  isSelfHosted = false,
  initialProject = null,
}: ProjectProviderProps) {
  const [currentProject, setCurrentProjectState] = useState<Project | null>(
    initialProject
  );
  const [recentProjects, setRecentProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [validationResult, setValidationResult] =
    useState<ProjectValidationResult | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    if (isSelfHosted) {
      // In self-hosted mode, don't load from localStorage
      setIsLoading(false);
      return;
    }

    // If we have an initial project, use that
    if (initialProject) {
      setCurrentProjectState(initialProject);
      saveCurrentProject(initialProject);
    } else {
      // Otherwise load from localStorage
      const stored = loadCurrentProject();
      if (stored) {
        setCurrentProjectState(stored);
      }
    }

    setRecentProjects(loadRecentProjects());
    setIsLoading(false);
  }, [isSelfHosted, initialProject]);

  const setCurrentProject = useCallback(
    (project: Project | null) => {
      setCurrentProjectState(project);
      setValidationResult(null); // Clear validation when project changes

      if (!isSelfHosted && project) {
        saveCurrentProject(project);
        setRecentProjects(loadRecentProjects());
      }
    },
    [isSelfHosted]
  );

  const updateCurrentProject = useCallback(
    (updates: Partial<Project>) => {
      setCurrentProjectState((prev) => {
        if (!prev) return prev;
        const updated = { ...prev, ...updates };
        if (!isSelfHosted) {
          saveCurrentProject(updated);
        }
        return updated;
      });
      setValidationResult(null); // Clear validation when project changes
    },
    [isSelfHosted]
  );

  const addRecentProject = useCallback(
    (project: Project) => {
      if (isSelfHosted) return;
      addToRecentProjects(project);
      setRecentProjects(loadRecentProjects());
    },
    [isSelfHosted]
  );

  const removeRecentProject = useCallback(
    (projectId: string) => {
      if (isSelfHosted) return;
      removeFromRecentProjects(projectId);
      setRecentProjects(loadRecentProjects());

      // If this was the current project, clear it
      if (currentProject?.id === projectId) {
        setCurrentProjectState(null);
      }
    },
    [isSelfHosted, currentProject?.id]
  );

  const getEnvMap = useCallback((): EnvMap => {
    if (!currentProject) return {};
    return projectToEnvMap(currentProject);
  }, [currentProject]);

  const createAndSetProject = useCallback(
    (
      worldId: string,
      envMap: EnvMap = {},
      options: { name?: string; projectDir?: string } = {}
    ): Project => {
      const project = createProject(worldId, envMap, options);
      setCurrentProject(project);
      return project;
    },
    [setCurrentProject]
  );

  const value: ProjectContextValue = useMemo(
    () => ({
      currentProject,
      isLoading,
      isSelfHosted,
      setCurrentProject,
      updateCurrentProject,
      recentProjects,
      addRecentProject,
      removeRecentProject,
      getEnvMap,
      createAndSetProject,
      validationResult,
      setValidationResult,
    }),
    [
      currentProject,
      isLoading,
      isSelfHosted,
      setCurrentProject,
      updateCurrentProject,
      recentProjects,
      addRecentProject,
      removeRecentProject,
      getEnvMap,
      createAndSetProject,
      validationResult,
    ]
  );

  return (
    <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
  );
}

/**
 * Hook to access the project context.
 */
export function useProject(): ProjectContextValue {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
}

/**
 * Hook to get the envMap for server actions.
 * Returns an empty object if no project is set.
 */
export function useEnvMap(): EnvMap {
  const { getEnvMap } = useProject();
  return getEnvMap();
}
