import { constants } from 'node:fs';
import { access, mkdir, stat, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import Watchpack from 'watchpack';

/**
 * Router detection result indicating which Next.js routers are available
 * in the project and their directory locations.
 */
interface RouterConfig {
  hasAppRouter: boolean;
  appRouterDir: string | null;
  hasPagesRouter: boolean;
  pagesRouterDir: string | null;
}

let CachedNextBuilder: any;

// Create the NextBuilder class dynamically by extending the ESM BaseBuilder
// This is exported as getNextBuilder() to allow CommonJS modules to import
// from the ESM @workflow/builders package via dynamic import at runtime
export async function getNextBuilder() {
  if (CachedNextBuilder) {
    return CachedNextBuilder;
  }

  const {
    BaseBuilder: BaseBuilderClass,
    STEP_QUEUE_TRIGGER,
    WORKFLOW_QUEUE_TRIGGER,
    // biome-ignore lint/security/noGlobalEval: Need to use eval here to avoid TypeScript from transpiling the import statement into `require()`
  } = (await eval(
    'import("@workflow/builders")'
  )) as typeof import('@workflow/builders');

  class NextBuilder extends BaseBuilderClass {
    async build() {
      const routers = await this.detectRouters();

      if (!routers.hasAppRouter && !routers.hasPagesRouter) {
        throw new Error(
          'Could not find Next.js router. Expected either "app", "src/app", "pages", or "src/pages" to exist.'
        );
      }

      const inputFiles = await this.getInputFiles();
      const tsConfig = await this.getTsConfigOptions();

      // Build for App Router if present
      let appRouterBuildResult:
        | {
            stepsBuildContext: import('esbuild').BuildContext | undefined;
            workflowsBundle:
              | void
              | {
                  interimBundleCtx: import('esbuild').BuildContext;
                  bundleFinal: (interimBundleResult: string) => Promise<void>;
                }
              | undefined;
            workflowGeneratedDir: string;
          }
        | undefined;

      if (routers.hasAppRouter && routers.appRouterDir) {
        appRouterBuildResult = await this.buildForAppRouter(
          routers.appRouterDir,
          inputFiles,
          tsConfig
        );
      }

      // Build for Pages Router if present
      if (routers.hasPagesRouter && routers.pagesRouterDir) {
        await this.buildForPagesRouter(
          routers.pagesRouterDir,
          inputFiles,
          tsConfig
        );
      }

      // Watch mode only supported for App Router currently
      // (Pages Router generates static files that don't need rebuild context)
      if (this.config.watch && appRouterBuildResult) {
        const { stepsBuildContext, workflowsBundle, workflowGeneratedDir } =
          appRouterBuildResult;
        if (!stepsBuildContext) {
          throw new Error(
            'Invariant: expected steps build context in watch mode'
          );
        }
        if (!workflowsBundle) {
          throw new Error('Invariant: expected workflows bundle in watch mode');
        }

        let stepsCtx = stepsBuildContext;
        let workflowsCtx = workflowsBundle;

        // Options object for rebuild functions
        const options = {
          inputFiles,
          workflowGeneratedDir,
          tsBaseUrl: tsConfig.baseUrl,
          tsPaths: tsConfig.paths,
        };

        const normalizePath = (pathname: string) =>
          pathname.replace(/\\/g, '/');
        const knownFiles = new Set<string>();
        type WatchpackTimeInfoEntry = {
          safeTime: number;
          timestamp?: number;
        };
        let previousTimeInfo = new Map<string, WatchpackTimeInfoEntry>();

        const watchableExtensions = new Set([
          '.js',
          '.jsx',
          '.ts',
          '.tsx',
          '.mts',
          '.cts',
          '.cjs',
          '.mjs',
        ]);
        const ignoredPathFragments = [
          '/.git/',
          '/node_modules/',
          '/.next/',
          '/.turbo/',
          '/.vercel/',
          '/dist/',
          '/build/',
          '/out/',
          '/.cache/',
          '/.yarn/',
          '/.pnpm-store/',
          '/.parcel-cache/',
          '/.well-known/workflow/',
        ];
        const normalizedGeneratedDir = workflowGeneratedDir.replace(/\\/g, '/');
        ignoredPathFragments.push(normalizedGeneratedDir);

        // There is a node.js bug on MacOS which causes closing file watchers to be really slow.
        // This limits the number of watchers to mitigate the issue.
        // https://github.com/nodejs/node/issues/29949
        process.env.WATCHPACK_WATCHER_LIMIT =
          process.platform === 'darwin' ? '20' : undefined;

        const watcher = new Watchpack({
          // Watchpack default is 200ms which adds 200ms of dead time on bootup.
          aggregateTimeout: 5,
          ignored: (pathname: string) => {
            const normalizedPath = pathname.replace(/\\/g, '/');
            const extension = extname(normalizedPath);
            if (extension && !watchableExtensions.has(extension)) {
              return true;
            }
            if (normalizedPath.startsWith(normalizedGeneratedDir)) {
              return true;
            }
            for (const fragment of ignoredPathFragments) {
              if (normalizedPath.includes(fragment)) {
                return true;
              }
            }
            return false;
          },
        });

        const readTimeInfoEntries = () => {
          const rawEntries = watcher.getTimeInfoEntries() as Map<
            string,
            WatchpackTimeInfoEntry
          >;
          const normalizedEntries = new Map<string, WatchpackTimeInfoEntry>();
          for (const [path, info] of rawEntries) {
            normalizedEntries.set(normalizePath(path), info);
          }
          return normalizedEntries;
        };

        let rebuildQueue = Promise.resolve();

        const enqueue = (task: () => Promise<void>) => {
          rebuildQueue = rebuildQueue.then(task).catch((error) => {
            console.error('Failed to process file change', error);
          });
          return rebuildQueue;
        };

        const fullRebuild = async () => {
          const newInputFiles = await this.getInputFiles();
          options.inputFiles = newInputFiles;

          await stepsCtx.dispose();
          const newStepsCtx = await this.buildStepsFunction(options);
          if (!newStepsCtx) {
            throw new Error(
              'Invariant: expected steps build context after rebuild'
            );
          }
          stepsCtx = newStepsCtx;

          await workflowsCtx.interimBundleCtx.dispose();
          const newWorkflowsCtx = await this.buildWorkflowsFunction(options);
          if (!newWorkflowsCtx) {
            throw new Error(
              'Invariant: expected workflows bundle context after rebuild'
            );
          }
          workflowsCtx = newWorkflowsCtx;
        };

        const logBuildMessages = (
          result: {
            errors?: import('esbuild').Message[];
            warnings?: import('esbuild').Message[];
          },
          label: string
        ) => {
          const logByType = (
            messages: import('esbuild').Message[] | undefined,
            method: 'error' | 'warn'
          ) => {
            if (!messages || messages.length === 0) {
              return;
            }
            const descriptor = method === 'error' ? 'errors' : 'warnings';
            console[method](`${descriptor} while rebuilding ${label}`);
            for (const message of messages) {
              console[method](message);
            }
          };

          logByType(result.errors, 'error');
          logByType(result.warnings, 'warn');
        };

        const rebuildExistingFiles = async () => {
          const rebuiltStepStart = Date.now();
          const stepsResult = await stepsCtx.rebuild();
          logBuildMessages(stepsResult, 'steps bundle');
          console.log(
            'Rebuilt steps bundle',
            `${Date.now() - rebuiltStepStart}ms`
          );

          const rebuiltWorkflowStart = Date.now();
          const workflowResult = await workflowsCtx.interimBundleCtx.rebuild();
          logBuildMessages(workflowResult, 'workflows bundle');

          if (
            !workflowResult.outputFiles ||
            workflowResult.outputFiles.length === 0
          ) {
            console.error(
              'No output generated while rebuilding workflows bundle'
            );
            return;
          }
          await workflowsCtx.bundleFinal(workflowResult.outputFiles[0].text);
          console.log(
            'Rebuilt workflow bundle',
            `${Date.now() - rebuiltWorkflowStart}ms`
          );
        };

        const isWatchableFile = (path: string) =>
          watchableExtensions.has(extname(path));

        const getComparableTimestamp = (entry: WatchpackTimeInfoEntry) =>
          entry.timestamp ?? entry.safeTime;

        const findRemovedFiles = (
          currentEntries: Map<string, WatchpackTimeInfoEntry>,
          previousEntries: Map<string, WatchpackTimeInfoEntry>
        ) => {
          const removed: string[] = [];
          for (const path of previousEntries.keys()) {
            if (!currentEntries.has(path) && isWatchableFile(path)) {
              removed.push(path);
            }
          }
          return removed;
        };

        const findAddedAndModifiedFiles = (
          currentEntries: Map<string, WatchpackTimeInfoEntry>,
          previousEntries: Map<string, WatchpackTimeInfoEntry>
        ) => {
          const added: string[] = [];
          const modified: string[] = [];

          for (const [path, info] of currentEntries) {
            if (!isWatchableFile(path)) {
              continue;
            }

            const previous = previousEntries.get(path);
            if (!previous) {
              added.push(path);
              continue;
            }

            if (
              getComparableTimestamp(info) !== getComparableTimestamp(previous)
            ) {
              modified.push(path);
            }
          }

          return { added, modified };
        };

        const determineFileChanges = (
          currentEntries: Map<string, WatchpackTimeInfoEntry>,
          previousEntries: Map<string, WatchpackTimeInfoEntry>
        ) => {
          const removedFiles = findRemovedFiles(
            currentEntries,
            previousEntries
          );
          const { added, modified } = findAddedAndModifiedFiles(
            currentEntries,
            previousEntries
          );

          return {
            addedFiles: added,
            modifiedFiles: modified,
            removedFiles,
          };
        };

        let isInitial = true;

        watcher.on('aggregated', () => {
          const currentEntries = readTimeInfoEntries();
          const { addedFiles, modifiedFiles, removedFiles } =
            determineFileChanges(currentEntries, previousTimeInfo);

          previousTimeInfo = currentEntries;

          if (isInitial) {
            isInitial = false;
            return;
          }

          if (
            addedFiles.length === 0 &&
            modifiedFiles.length === 0 &&
            removedFiles.length === 0
          ) {
            return;
          }

          for (const removal of removedFiles) {
            knownFiles.delete(removal);
          }
          for (const added of addedFiles) {
            knownFiles.add(added);
          }

          enqueue(async () => {
            if (addedFiles.length > 0 || removedFiles.length > 0) {
              await fullRebuild();
              return;
            }

            if (modifiedFiles.length > 0) {
              await rebuildExistingFiles();
            }
          });
        });

        watcher.watch({
          directories: [this.config.workingDir],
          startTime: 0,
        });
      }
    }

    protected async getInputFiles(): Promise<string[]> {
      const inputFiles = await super.getInputFiles();
      return inputFiles.filter(
        (item) =>
          // App Router: route.ts, page.ts, layout.ts
          item.match(/[/\\](route|page|layout)\./) ||
          // Pages Router: any file in pages/
          item.match(/[/\\]pages[/\\]/)
      );
    }

    private async writeFunctionsConfig(outputDir: string) {
      // we don't run this in development mode as it's not needed
      if (process.env.NODE_ENV === 'development') {
        return;
      }
      const generatedConfig = {
        version: '0',
        steps: {
          experimentalTriggers: [STEP_QUEUE_TRIGGER],
        },
        workflows: {
          experimentalTriggers: [WORKFLOW_QUEUE_TRIGGER],
        },
      };

      // We write this file to the generated directory for
      // the Next.js builder to consume
      await writeFile(
        join(outputDir, '.well-known/workflow/v1/config.json'),
        JSON.stringify(generatedConfig, null, 2)
      );
    }

    private async buildStepsFunction({
      inputFiles,
      workflowGeneratedDir,
      tsPaths,
      tsBaseUrl,
    }: {
      inputFiles: string[];
      workflowGeneratedDir: string;
      tsBaseUrl?: string;
      tsPaths?: Record<string, string[]>;
    }) {
      // Create steps bundle
      const stepsRouteDir = join(workflowGeneratedDir, 'step');
      await mkdir(stepsRouteDir, { recursive: true });
      return await this.createStepsBundle({
        // If any dynamic requires are used when bundling with ESM
        // esbuild will create a too dynamic wrapper around require
        // which turbopack/webpack fail to analyze. If we externalize
        // correctly this shouldn't be an issue although we might want
        // to use cjs as alternative to avoid
        format: 'esm',
        inputFiles,
        outfile: join(stepsRouteDir, 'route.js'),
        externalizeNonSteps: true,
        tsBaseUrl,
        tsPaths,
      });
    }

    private async buildWorkflowsFunction({
      inputFiles,
      workflowGeneratedDir,
      tsPaths,
      tsBaseUrl,
    }: {
      inputFiles: string[];
      workflowGeneratedDir: string;
      tsBaseUrl?: string;
      tsPaths?: Record<string, string[]>;
    }): Promise<void | {
      interimBundleCtx: import('esbuild').BuildContext;
      bundleFinal: (interimBundleResult: string) => Promise<void>;
    }> {
      const workflowsRouteDir = join(workflowGeneratedDir, 'flow');
      await mkdir(workflowsRouteDir, { recursive: true });
      return await this.createWorkflowsBundle({
        format: 'esm',
        outfile: join(workflowsRouteDir, 'route.js'),
        bundleFinalOutput: false,
        inputFiles,
        tsBaseUrl,
        tsPaths,
      });
    }

    private async buildWebhookRoute({
      workflowGeneratedDir,
    }: {
      workflowGeneratedDir: string;
    }): Promise<void> {
      const webhookRouteFile = join(
        workflowGeneratedDir,
        'webhook/[token]/route.js'
      );
      await this.createWebhookBundle({
        outfile: webhookRouteFile,
        bundle: false, // Next.js doesn't need bundling
      });
    }

    /**
     * Builds workflow routes for App Router.
     * Generates routes in app/.well-known/workflow/v1/
     */
    private async buildForAppRouter(
      appDir: string,
      inputFiles: string[],
      tsConfig: { baseUrl?: string; paths?: Record<string, string[]> }
    ): Promise<{
      stepsBuildContext: import('esbuild').BuildContext | undefined;
      workflowsBundle:
        | void
        | {
            interimBundleCtx: import('esbuild').BuildContext;
            bundleFinal: (interimBundleResult: string) => Promise<void>;
          }
        | undefined;
      workflowGeneratedDir: string;
    }> {
      const workflowGeneratedDir = join(appDir, '.well-known/workflow/v1');

      // Ensure output directories exist
      await mkdir(workflowGeneratedDir, { recursive: true });
      await writeFile(join(workflowGeneratedDir, '.gitignore'), '*');

      const options = {
        inputFiles,
        workflowGeneratedDir,
        tsBaseUrl: tsConfig.baseUrl,
        tsPaths: tsConfig.paths,
      };

      const stepsBuildContext = await this.buildStepsFunction(options);
      const workflowsBundle = await this.buildWorkflowsFunction(options);
      await this.buildWebhookRoute({ workflowGeneratedDir });
      await this.writeFunctionsConfig(appDir);

      return {
        stepsBuildContext,
        workflowsBundle,
        workflowGeneratedDir,
      };
    }

    /**
     * Builds workflow routes for Pages Router.
     * Generates routes in pages/.well-known/workflow/v1/
     */
    private async buildForPagesRouter(
      pagesDir: string,
      inputFiles: string[],
      tsConfig: { baseUrl?: string; paths?: Record<string, string[]> }
    ): Promise<void> {
      const workflowGeneratedDir = join(pagesDir, '.well-known/workflow/v1');

      // Ensure output directories exist
      await mkdir(workflowGeneratedDir, { recursive: true });
      await writeFile(join(workflowGeneratedDir, '.gitignore'), '*');

      // Build steps route for Pages Router
      await this.buildStepsFunctionPages({
        inputFiles,
        workflowGeneratedDir,
        tsBaseUrl: tsConfig.baseUrl,
        tsPaths: tsConfig.paths,
      });

      // Build workflows route for Pages Router
      await this.buildWorkflowsFunctionPages({
        inputFiles,
        workflowGeneratedDir,
        tsBaseUrl: tsConfig.baseUrl,
        tsPaths: tsConfig.paths,
      });

      // Build webhook route for Pages Router
      await this.buildWebhookRoutePages({ workflowGeneratedDir });

      // Write config.json
      await this.writeFunctionsConfig(pagesDir);
    }

    /**
     * Builds the steps function route for Pages Router.
     * Generates pages/api/.well-known/workflow/v1/step.js
     */
    private async buildStepsFunctionPages({
      inputFiles,
      workflowGeneratedDir,
      tsPaths,
      tsBaseUrl,
    }: {
      inputFiles: string[];
      workflowGeneratedDir: string;
      tsBaseUrl?: string;
      tsPaths?: Record<string, string[]>;
    }): Promise<void> {
      // Create steps bundle with Pages Router wrapper
      const stepsRouteFile = join(workflowGeneratedDir, 'step.js');

      // First, build the steps bundle to a temporary location
      const tempStepsFile = join(workflowGeneratedDir, '_temp_steps.js');
      await this.createStepsBundle({
        format: 'esm',
        inputFiles,
        outfile: tempStepsFile,
        externalizeNonSteps: true,
        tsBaseUrl,
        tsPaths,
      });

      // Read the generated bundle
      const { readFile: readFileFs } = await import('node:fs/promises');
      const stepsBundle = await readFileFs(tempStepsFile, 'utf-8');

      // Extract the POST handler and wrap it for Pages Router
      // The generated bundle exports `POST` which is the stepEntrypoint
      const pagesRouterWrapper = `// biome-ignore-all lint: generated file
/* eslint-disable */
import { convertPagesRequest, sendPagesResponse } from '@workflow/next/pages-adapter';

${stepsBundle.replace('export { stepEntrypoint as POST }', 'const POST = stepEntrypoint;')}

export default async function handler(req, res) {
  const webRequest = await convertPagesRequest(req);
  const webResponse = await POST(webRequest);
  await sendPagesResponse(res, webResponse);
}

export const config = {
  api: {
    bodyParser: false,
  },
};
`;

      await writeFile(stepsRouteFile, pagesRouterWrapper);

      // Clean up temp file
      const { unlink } = await import('node:fs/promises');
      await unlink(tempStepsFile).catch(() => {});
    }

    /**
     * Builds the workflows function route for Pages Router.
     * Generates pages/api/.well-known/workflow/v1/flow.js
     */
    private async buildWorkflowsFunctionPages({
      inputFiles,
      workflowGeneratedDir,
      tsPaths,
      tsBaseUrl,
    }: {
      inputFiles: string[];
      workflowGeneratedDir: string;
      tsBaseUrl?: string;
      tsPaths?: Record<string, string[]>;
    }): Promise<void> {
      // Create workflows bundle with Pages Router wrapper
      const workflowsRouteFile = join(workflowGeneratedDir, 'flow.js');

      // First, build the workflows bundle to a temporary location
      const tempWorkflowsFile = join(workflowGeneratedDir, '_temp_flow.js');
      await this.createWorkflowsBundle({
        format: 'esm',
        outfile: tempWorkflowsFile,
        bundleFinalOutput: false,
        inputFiles,
        tsBaseUrl,
        tsPaths,
      });

      // Read the generated bundle
      const { readFile: readFileFs } = await import('node:fs/promises');
      const workflowsBundle = await readFileFs(tempWorkflowsFile, 'utf-8');

      // Wrap for Pages Router
      const pagesRouterWrapper = `// biome-ignore-all lint: generated file
/* eslint-disable */
import { convertPagesRequest, sendPagesResponse } from '@workflow/next/pages-adapter';

${workflowsBundle.replace('export const POST =', 'const POST =')}

export default async function handler(req, res) {
  const webRequest = await convertPagesRequest(req);
  const webResponse = await POST(webRequest);
  await sendPagesResponse(res, webResponse);
}

export const config = {
  api: {
    bodyParser: false,
  },
};
`;

      await writeFile(workflowsRouteFile, pagesRouterWrapper);

      // Clean up temp file
      const { unlink } = await import('node:fs/promises');
      await unlink(tempWorkflowsFile).catch(() => {});
    }

    /**
     * Builds the webhook route for Pages Router.
     * Generates pages/api/.well-known/workflow/v1/webhook/[token].js
     */
    private async buildWebhookRoutePages({
      workflowGeneratedDir,
    }: {
      workflowGeneratedDir: string;
    }): Promise<void> {
      const webhookDir = join(workflowGeneratedDir, 'webhook');
      await mkdir(webhookDir, { recursive: true });

      const webhookRouteFile = join(webhookDir, '[token].js');

      // Create Pages Router webhook handler
      const routeContent = `// biome-ignore-all lint: generated file
/* eslint-disable */
import { resumeWebhook } from 'workflow/api';
import { convertPagesRequest, sendPagesResponse } from '@workflow/next/pages-adapter';

export default async function handler(req, res) {
  const webRequest = await convertPagesRequest(req);
  const { token } = req.query;

  if (!token || typeof token !== 'string') {
    res.status(400).send('Missing token');
    return;
  }

  try {
    const response = await resumeWebhook(decodeURIComponent(token), webRequest);
    await sendPagesResponse(res, response);
  } catch (error) {
    console.error('Error during resumeWebhook', error);
    res.status(404).end();
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};
`;

      await writeFile(webhookRouteFile, routeContent);
    }

    /**
     * Helper to check if a directory exists.
     */
    private async directoryExists(dirPath: string): Promise<boolean> {
      try {
        await access(dirPath, constants.F_OK);
        const stats = await stat(dirPath);
        return stats.isDirectory();
      } catch {
        return false;
      }
    }

    /**
     * Detects which Next.js routers are available in the project.
     * Checks for both App Router (app/, src/app/) and Pages Router (pages/, src/pages/).
     */
    private async detectRouters(): Promise<RouterConfig> {
      const possibleAppDirs = ['app', 'src/app'];
      const possiblePagesDirs = ['pages', 'src/pages'];

      let appRouterDir: string | null = null;
      let pagesRouterDir: string | null = null;

      // Check for App Router
      for (const dir of possibleAppDirs) {
        const fullPath = resolve(this.config.workingDir, dir);
        if (await this.directoryExists(fullPath)) {
          appRouterDir = fullPath;
          break;
        }
      }

      // Check for Pages Router
      for (const dir of possiblePagesDirs) {
        const fullPath = resolve(this.config.workingDir, dir);
        if (await this.directoryExists(fullPath)) {
          pagesRouterDir = fullPath;
          break;
        }
      }

      return {
        hasAppRouter: appRouterDir !== null,
        appRouterDir,
        hasPagesRouter: pagesRouterDir !== null,
        pagesRouterDir,
      };
    }
  }

  CachedNextBuilder = NextBuilder;
  return NextBuilder;
}
