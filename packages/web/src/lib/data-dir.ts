'use server';

import { isAbsolute, resolve } from 'node:path';
import {
  findWorkflowDataDir as findWorkflowDataDirFromUtils,
  type WorkflowDataDirInfo,
} from '@workflow/utils/check-data-dir';

// Re-export for convenience
export type { WorkflowDataDirInfo };

export interface DataDirCheckResult {
  /** Whether a valid workflow data directory was found */
  found: boolean;
  /** The resolved absolute path to the workflow data directory */
  path: string | null;
  /** Short display name for the project (derived from project path) */
  shortName: string | null;
  /** The project directory (parent of the workflow data folder) */
  projectDir: string | null;
  /** The paths that were checked (for debugging) */
  checkedPaths: string[];
}

/**
 * Find a workflow data directory starting from a given path.
 * The path can be:
 * - A project directory containing workflow data in a known location
 * - The workflow data directory itself
 *
 * @param selectedPath - The path selected by the user (from folder picker or manual input)
 * @returns Result indicating whether data was found and where
 */
export async function findWorkflowDataDir(
  selectedPath: string
): Promise<DataDirCheckResult> {
  // If not absolute, resolve relative to cwd
  const basePath = isAbsolute(selectedPath)
    ? selectedPath
    : resolve(process.cwd(), selectedPath);

  // Use the utils function which handles all the cases:
  // 1. The path itself is a workflow data directory
  // 2. The path contains a workflow data directory
  // 3. Walking up the tree to find the project root
  const result = await findWorkflowDataDirFromUtils(basePath);

  if (result) {
    return {
      found: true,
      path: result.dataDir,
      shortName: result.shortName,
      projectDir: result.projectDir,
      checkedPaths: [basePath],
    };
  }

  return {
    found: false,
    path: null,
    shortName: null,
    projectDir: null,
    checkedPaths: [basePath],
  };
}

/**
 * Validate that a data directory path is accessible and contains workflow data
 */
export async function validateDataDir(
  dataDir: string
): Promise<{ valid: boolean; error?: string; info?: WorkflowDataDirInfo }> {
  if (!dataDir) {
    return { valid: false, error: 'Data directory path is required' };
  }

  const resolvedPath = isAbsolute(dataDir)
    ? dataDir
    : resolve(process.cwd(), dataDir);

  const result = await findWorkflowDataDirFromUtils(resolvedPath);

  if (!result) {
    return {
      valid: false,
      error: `Directory does not appear to contain workflow data: ${resolvedPath}`,
    };
  }

  return { valid: true, info: result };
}

/**
 * Resolve a path to an absolute path.
 * If the path is already absolute, returns it unchanged.
 * If relative, resolves it relative to the current working directory.
 */
export async function resolveToAbsolutePath(
  inputPath: string
): Promise<string> {
  if (!inputPath) return inputPath;

  if (isAbsolute(inputPath)) {
    return inputPath;
  }

  return resolve(process.cwd(), inputPath);
}

/**
 * Find workflow data directory and return the full info.
 * This is a thin wrapper around the utils function for use in server actions.
 */
export async function getWorkflowDataDirInfo(
  inputPath: string
): Promise<WorkflowDataDirInfo | null> {
  const resolvedPath = isAbsolute(inputPath)
    ? inputPath
    : resolve(process.cwd(), inputPath);

  return findWorkflowDataDirFromUtils(resolvedPath);
}
