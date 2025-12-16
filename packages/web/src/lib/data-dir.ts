'use server';

import { existsSync, readdirSync } from 'node:fs';
import { join, resolve, isAbsolute, basename } from 'node:path';

export interface DataDirCheckResult {
  /** Whether a valid workflow data directory was found */
  found: boolean;
  /** The resolved path to the workflow data directory */
  path: string | null;
  /** The paths that were checked */
  checkedPaths: string[];
}

/**
 * Possible subdirectories where workflow data might be stored
 */
const WORKFLOW_DATA_SUBDIRS = ['.next/workflow-data', '.workflow-data', ''];

/**
 * Files/directories that indicate a valid workflow data directory
 */
const WORKFLOW_DATA_INDICATORS = ['runs', 'hooks', 'streams'];

/**
 * Check if a directory looks like a workflow data directory
 * by checking for expected subdirectories
 */
async function isWorkflowDataDir(dirPath: string): Promise<boolean> {
  const resolvedPath = resolve(dirPath);

  if (!existsSync(resolvedPath)) {
    return false;
  }

  try {
    const entries = readdirSync(resolvedPath);
    // A workflow data dir should have at least one of the indicator directories
    return WORKFLOW_DATA_INDICATORS.some((indicator) =>
      entries.includes(indicator)
    );
  } catch {
    return false;
  }
}

/**
 * Find a workflow data directory starting from a given path.
 * Checks the path itself and common subdirectories.
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

  const checkedPaths: string[] = [];

  // Check if the selected path itself is a workflow data directory
  if (await isWorkflowDataDir(basePath)) {
    return {
      found: true,
      path: basePath,
      checkedPaths: [basePath],
    };
  }
  checkedPaths.push(basePath);

  // Check common subdirectories
  for (const subdir of WORKFLOW_DATA_SUBDIRS) {
    if (!subdir) continue; // Skip empty string since we already checked basePath

    const fullPath = join(basePath, subdir);
    if (await isWorkflowDataDir(fullPath)) {
      return {
        found: true,
        path: fullPath,
        checkedPaths: [...checkedPaths, fullPath],
      };
    }
    checkedPaths.push(fullPath);
  }

  return {
    found: false,
    path: null,
    checkedPaths,
  };
}

/**
 * Validate that a data directory path is accessible and contains workflow data
 */
export async function validateDataDir(
  dataDir: string
): Promise<{ valid: boolean; error?: string }> {
  if (!dataDir) {
    return { valid: false, error: 'Data directory path is required' };
  }

  const resolvedPath = isAbsolute(dataDir)
    ? dataDir
    : resolve(process.cwd(), dataDir);

  if (!existsSync(resolvedPath)) {
    return {
      valid: false,
      error: `Directory does not exist: ${resolvedPath}`,
    };
  }

  if (!(await isWorkflowDataDir(resolvedPath))) {
    return {
      valid: false,
      error: `Directory does not appear to contain workflow data: ${resolvedPath}`,
    };
  }

  return { valid: true };
}
