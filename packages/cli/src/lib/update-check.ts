import boxen from 'boxen';
import chalk from 'chalk';
import updateCheck from 'update-check';

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
 */
export async function checkForUpdates(currentVersion: string): Promise<void> {
  try {
    const updates: UpdateInfo[] = [];

    // Check both packages in parallel
    const results = await Promise.allSettled(
      PACKAGES_TO_CHECK.map(async (packageName) => {
        const pkg = { name: packageName, version: currentVersion };
        const update = await updateCheck(pkg);
        if (update) {
          return {
            packageName,
            currentVersion,
            latestVersion: update.latest,
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
