/**
 * Project storage utilities for localStorage.
 *
 * Handles persisting and retrieving Project configurations.
 */

import type { Project } from '@workflow/utils/project';

const CURRENT_PROJECT_KEY = 'workflow-current-project';
const RECENT_PROJECTS_KEY = 'workflow-recent-projects';
const MAX_RECENT_PROJECTS = 10;

/**
 * Save the current project to localStorage.
 */
export function saveCurrentProject(project: Project): void {
  if (typeof window === 'undefined') return;

  try {
    // Update lastUsed timestamp
    const updatedProject = {
      ...project,
      lastUsed: Date.now(),
    };
    localStorage.setItem(CURRENT_PROJECT_KEY, JSON.stringify(updatedProject));

    // Also add to recent projects
    addToRecentProjects(updatedProject);
  } catch (error) {
    console.error('Failed to save current project:', error);
  }
}

/**
 * Load the current project from localStorage.
 */
export function loadCurrentProject(): Project | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = localStorage.getItem(CURRENT_PROJECT_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as Project;
  } catch (error) {
    console.error('Failed to load current project:', error);
    return null;
  }
}

/**
 * Clear the current project from localStorage.
 */
export function clearCurrentProject(): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(CURRENT_PROJECT_KEY);
  } catch (error) {
    console.error('Failed to clear current project:', error);
  }
}

/**
 * Load recent projects from localStorage.
 */
export function loadRecentProjects(): Project[] {
  if (typeof window === 'undefined') return [];

  try {
    const stored = localStorage.getItem(RECENT_PROJECTS_KEY);
    if (!stored) return [];
    const projects = JSON.parse(stored) as Project[];
    // Sort by lastUsed (most recent first)
    return projects.sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
  } catch (error) {
    console.error('Failed to load recent projects:', error);
    return [];
  }
}

/**
 * Add a project to the recent projects list.
 */
export function addToRecentProjects(project: Project): void {
  if (typeof window === 'undefined') return;

  try {
    const recent = loadRecentProjects();

    // Remove existing entry with same ID (if any)
    const filtered = recent.filter((p) => p.id !== project.id);

    // Add new project at the beginning
    const updated = [project, ...filtered].slice(0, MAX_RECENT_PROJECTS);

    localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('Failed to add to recent projects:', error);
  }
}

/**
 * Remove a project from the recent projects list.
 */
export function removeFromRecentProjects(projectId: string): void {
  if (typeof window === 'undefined') return;

  try {
    const recent = loadRecentProjects();
    const filtered = recent.filter((p) => p.id !== projectId);
    localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(filtered));

    // If this was the current project, clear it
    const current = loadCurrentProject();
    if (current?.id === projectId) {
      clearCurrentProject();
    }
  } catch (error) {
    console.error('Failed to remove from recent projects:', error);
  }
}

/**
 * Update a project in the recent projects list.
 */
export function updateRecentProject(project: Project): void {
  if (typeof window === 'undefined') return;

  try {
    const recent = loadRecentProjects();
    const updated = recent.map((p) => (p.id === project.id ? project : p));
    localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('Failed to update recent project:', error);
  }
}

/**
 * Find a recent project by matching envMap values.
 * Useful for finding an existing project when query params are provided.
 */
export function findRecentProjectByEnv(
  envMap: Record<string, string | undefined>,
  worldId?: string
): Project | null {
  const recent = loadRecentProjects();

  // First, try to find an exact match (same worldId and all env vars match)
  for (const project of recent) {
    if (worldId && project.worldId !== worldId) continue;

    // Check if all provided env vars match
    const envMatches = Object.entries(envMap).every(([key, value]) => {
      if (value === undefined || value === '') return true;
      return project.envMap[key] === value;
    });

    if (envMatches) {
      return project;
    }
  }

  return null;
}
