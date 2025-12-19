import boxen from 'boxen';
import chalk from 'chalk';
import latestVersion from 'latest-version';
import { lt, valid } from 'semver';

const PACKAGES_TO_CHECK = ['workflow', '@workflow/cli'] as const;

interface UpdateInfo {
  packageName: string;
  currentVersion: string;
  latestVersion: string;
}

/**
 * Check if a newer version of the CLI is available on npm.
 * This runs asynchronously and prints a warning if an update is available.
 * Errors are silently ignored to avoid disrupting the CLI experience.
 * Works for both global and local installations.
 */
export async function checkForUpdates(currentVersion: string): Promise<void> {
  try {
    const updates: UpdateInfo[] = [];

    // Check both packages in parallel
    const results = await Promise.allSettled(
      PACKAGES_TO_CHECK.map(async (packageName) => {
        const latest = await latestVersion(packageName);
        // Only report if current version is less than latest
        // Use semver comparison to handle pre-release versions correctly
        if (latest && isNewerVersion(currentVersion, latest)) {
          return {
            packageName,
            currentVersion,
            latestVersion: latest,
          };
        }
        return null;
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        updates.push(result.value);
      }
    }

    if (updates.length > 0) {
      printUpdateWarning(updates[0]);
    }
  } catch {
    // Silently ignore errors - don't disrupt the CLI experience
  }
}

/**
 * Check if the latest version is newer than the current version.
 * Handles pre-release versions (e.g., 4.0.1-beta.33).
 */
function isNewerVersion(current: string, latest: string): boolean {
  // If both are valid semver, use proper comparison
  if (valid(current) && valid(latest)) {
    return lt(current, latest);
  }
  // Fallback to string comparison if semver parsing fails
  return current !== latest;
}

function printUpdateWarning(update: UpdateInfo): void {
  const updateCommand =
    update.packageName === 'workflow'
      ? 'npm install workflow@latest'
      : 'npm install @workflow/cli@latest';

  const message = [
    chalk.yellow(
      `Update available: ${update.currentVersion} → ${chalk.green(update.latestVersion)}`
    ),
    '',
    `Run ${chalk.cyan(updateCommand)} to update`,
  ].join('\n');

  const box = boxen(message, {
    padding: 1,
    borderColor: 'yellow',
    textAlignment: 'center',
  });

  console.error(box);
}
