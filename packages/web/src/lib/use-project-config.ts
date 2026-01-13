'use client';

import type { Project } from '@workflow/utils/project-types';
import { getWorldById } from '@workflow/utils/worlds-manifest';
import { useMemo } from 'react';
import useSWR from 'swr';
import type { WorldConfig, WorkflowDataDirInfo } from '@/lib/config-world';
import { resolveDataDirInfo } from '@/lib/config-world';
import { useProject } from '@/lib/project-context';

/**
 * Convert project state to the legacy WorldConfig format.
 * This maintains backward compatibility with existing components
 * while we migrate to the new project-based system.
 *
 * Returns null while project is loading to prevent premature data fetching.
 */
export function useProjectAsWorldConfig(): WorldConfig | null {
  const { currentProject, isLoading } = useProject();

  return useMemo(() => {
    // Return null while loading to prevent premature data fetching
    if (isLoading) {
      return null;
    }

    if (!currentProject) {
      return {
        backend: 'local',
        dataDir: './',
      };
    }

    const env = currentProject.envMap;
    return {
      backend: currentProject.worldId,
      env: env.WORKFLOW_VERCEL_ENV,
      authToken: env.WORKFLOW_VERCEL_AUTH_TOKEN,
      project: env.WORKFLOW_VERCEL_PROJECT,
      team: env.WORKFLOW_VERCEL_TEAM,
      port: env.PORT,
      dataDir: env.WORKFLOW_LOCAL_DATA_DIR || currentProject.projectDir || './',
      manifestPath: env.WORKFLOW_MANIFEST_PATH,
      postgresUrl: env.WORKFLOW_POSTGRES_URL,
    };
  }, [currentProject, isLoading]);
}

/**
 * Format a relative time string (e.g., "Just now", "2m ago", "1h ago")
 */
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

/**
 * Get a short path representation (last 2 segments)
 */
function getShortPath(path: string): string {
  const parts = path.replace(/\/$/, '').split('/').filter(Boolean);
  if (parts.length <= 2) return path;
  return parts.slice(-2).join('/');
}

/**
 * Display info for a project in the list view.
 */
export interface ProjectDisplayInfo {
  /** World name (e.g., "Local", "Vercel", "PostgreSQL") */
  worldName: string;
  /** Relative time since last used */
  relativeTime: string;
  /** Main identifier line (team/project for Vercel, shortName for local, connection URI for others) */
  title: string;
  /** Additional context line (environment for Vercel, full path for local, project dir shortName for others) */
  details: string;
  /** Whether data is still loading */
  isLoading: boolean;
}

/**
 * Hook to get display info for a project.
 * For local projects, this fetches the shortName from the server.
 */
export function useProjectDisplayTitle(
  project: Project | null
): ProjectDisplayInfo {
  const isLocal = project?.worldId === 'local';
  const dataDir = project?.envMap.WORKFLOW_LOCAL_DATA_DIR;

  const { data: dataDirInfo, isLoading } = useSWR<WorkflowDataDirInfo>(
    isLocal && dataDir ? `data-dir-info:${dataDir}` : null,
    () => resolveDataDirInfo(dataDir || './'),
    { revalidateOnFocus: false }
  );

  if (!project) {
    return {
      worldName: 'Unknown',
      relativeTime: '',
      title: 'No project',
      details: '',
      isLoading: false,
    };
  }

  const world = getWorldById(project.worldId);
  const worldName = world?.name || project.worldId;
  const relativeTime = formatRelativeTime(project.lastUsedAt);
  const env = project.envMap;

  // Local world
  if (project.worldId === 'local') {
    const shortName = dataDirInfo?.shortName;
    const fullPath = env.WORKFLOW_LOCAL_DATA_DIR || project.projectDir || './';
    return {
      worldName,
      relativeTime,
      title: shortName || getShortPath(fullPath),
      details: fullPath,
      isLoading: isLoading,
    };
  }

  // Vercel world
  if (project.worldId === 'vercel') {
    const team = env.WORKFLOW_VERCEL_TEAM;
    const proj = env.WORKFLOW_VERCEL_PROJECT;
    const envName = env.WORKFLOW_VERCEL_ENV || 'production';
    let title = 'Not configured';
    if (team && proj) {
      title = `${team}/${proj}`;
    } else if (proj) {
      title = proj;
    }
    return {
      worldName,
      relativeTime,
      title,
      details: envName.charAt(0).toUpperCase() + envName.slice(1),
      isLoading: false,
    };
  }

  // Postgres world
  if (project.worldId === 'postgres') {
    const url = env.WORKFLOW_POSTGRES_URL;
    let title = 'Not configured';
    if (url) {
      try {
        const parsed = new URL(url);
        title = `${parsed.host}${parsed.pathname || ''}`;
      } catch {
        title = 'Invalid URL';
      }
    }
    const projectDirShort = project.projectDir
      ? getShortPath(project.projectDir)
      : '';
    return {
      worldName,
      relativeTime,
      title,
      details: projectDirShort,
      isLoading: false,
    };
  }

  // Other known worlds - show connection URI and project dir
  let title = project.worldId;
  if (world && world.requiredEnv.length > 0) {
    const firstEnvVar = world.requiredEnv[0];
    const value = env[firstEnvVar];
    if (value) {
      title = value.length > 50 ? `${value.slice(0, 47)}...` : value;
    }
  } else {
    // Unknown world - show first env var
    const firstEnvEntry = Object.entries(env).find(([_, v]) => v);
    if (firstEnvEntry?.[1]) {
      const value = firstEnvEntry[1];
      title = value.length > 50 ? `${value.slice(0, 47)}...` : value;
    }
  }

  const projectDirShort = project.projectDir
    ? getShortPath(project.projectDir)
    : '';
  return {
    worldName,
    relativeTime,
    title,
    details: projectDirShort,
    isLoading: false,
  };
}
