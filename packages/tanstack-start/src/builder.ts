import { constants } from 'node:fs';
import { access, mkdir, stat, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  BaseBuilder,
  createBaseBuilderConfig,
  VercelBuildOutputAPIBuilder,
  type TanStackConfig,
  NORMALIZE_REQUEST_CODE,
} from '@workflow/builders';

const WORKFLOW_ROUTES = [
  {
    src: '^/\\.well-known/workflow/v1/flow/?$',
    dest: '/.well-known/workflow/v1/flow',
  },
  {
    src: '^/\\.well-known/workflow/v1/step/?$',
    dest: '/.well-known/workflow/v1/step',
  },
  {
    src: '^/\\.well-known/workflow/v1/webhook/([^/]+?)/?$',
    dest: '/.well-known/workflow/v1/webhook/[token]',
  },
];

export class LocalBuilder extends BaseBuilder {
  constructor(config?: Partial<TanStackConfig>) {
    const workingDir = config?.workingDir || process.cwd();

    super({
      ...config,
      dirs: ['src'],
      buildTarget: 'tanstack' as const,
      stepsBundlePath: '', // unused in base
      workflowsBundlePath: '', // unused in base
      webhookBundlePath: '', // unused in base
      workingDir,
    });
  }

  override async build(): Promise<void> {
    // Find SvelteKit routes directory (src/routes or routes)
    const routesDir = await this.findRoutesDirectory();
    // TanStack Start requires `[.]` for escaping
    const workflowGeneratedDir = join(routesDir, '[.]well-known/workflow/v1');

    // Ensure output directories exist
    await mkdir(workflowGeneratedDir, { recursive: true });

    // Add .gitignore to exclude generated files from version control
    if (process.env.VERCEL_DEPLOYMENT_ID === undefined) {
      await writeFile(join(workflowGeneratedDir, '.gitignore'), '*');
    }

    // Get workflow and step files to bundle
    const inputFiles = await this.getInputFiles();
    const tsConfig = await this.getTsConfigOptions();

    const options = {
      inputFiles,
      workflowGeneratedDir,
      tsBaseUrl: tsConfig.baseUrl,
      tsPaths: tsConfig.paths,
    };

    // Generate the three SvelteKit route handlers
    await this.buildStepsRoute(options);
    await this.buildWorkflowsRoute(options);
    await this.buildWebhookRoute({ workflowGeneratedDir });
  }

  private async buildStepsRoute({
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
    // Write the step bundle to a separate non-route file.
    // The '-' prefix tells TanStack Router to ignore this file.
    const stepsBundleFile = join(workflowGeneratedDir, '-step-bundle.ts');
    await this.createStepsBundle({
      format: 'esm',
      inputFiles,
      outfile: stepsBundleFile,
      externalizeNonSteps: true,
      tsBaseUrl,
      tsPaths,
    });

    let bundleContent = await readFile(stepsBundleFile, 'utf-8');

    // Update the bundle file to export a handler function
    bundleContent = bundleContent.replace(
      /export\s*\{\s*stepEntrypoint\s+as\s+POST\s*\}\s*;?$/m,
      `${NORMALIZE_REQUEST_CODE}
export const handleStep = async (request: Request) => {
  const normalRequest = await normalizeRequest(request);
  return stepEntrypoint(normalRequest);
};`
    );
    bundleContent = `// @ts-nocheck\n${bundleContent}`;
    await writeFile(stepsBundleFile, bundleContent);

    // Create a small route file that imports from the bundle.
    const stepsRouteFile = join(workflowGeneratedDir, 'step.ts');
    const routeContent = `// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router"
import { handleStep } from "./-step-bundle"

export const Route = createFileRoute("/.well-known/workflow/v1/step")({
  server: {
    handlers: {
      POST: async ({ request }) => handleStep(request)
    }
  }
});
`;
    await writeFile(stepsRouteFile, routeContent);
  }

  private async buildWorkflowsRoute({
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
    // Write the large workflow bundle to a separate non-route file.
    // The '-' prefix tells TanStack Router to ignore this file, preventing
    // the parser from trying to parse the 3+ MB bundle which causes errors
    // when HMR triggers during dev mode.
    const workflowBundleFile = join(workflowGeneratedDir, '-flow-bundle.ts');
    await this.createWorkflowsBundle({
      format: 'esm',
      outfile: workflowBundleFile,
      bundleFinalOutput: false,
      inputFiles,
      tsBaseUrl,
      tsPaths,
    });

    let bundleContent = await readFile(workflowBundleFile, 'utf-8');

    // Update the bundle file to export a handler function instead of POST
    bundleContent = bundleContent.replace(
      /export const POST = workflowEntrypoint\(workflowCode\);?$/m,
      `${NORMALIZE_REQUEST_CODE}
export const handleWorkflow = async (request: Request) => {
  const normalRequest = await normalizeRequest(request);
  return workflowEntrypoint(workflowCode)(normalRequest);
};`
    );
    bundleContent = `// @ts-nocheck\n${bundleContent}`;
    await writeFile(workflowBundleFile, bundleContent);

    // Create a small route file that imports from the bundle.
    // This file is small enough for TanStack Router to parse without issues.
    const workflowRouteFile = join(workflowGeneratedDir, 'flow.ts');
    const routeContent = `// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router"
import { handleWorkflow } from "./-flow-bundle"

export const Route = createFileRoute("/.well-known/workflow/v1/flow")({
  server: {
    handlers: {
      POST: async ({ request }) => handleWorkflow(request)
    }
  }
});
`;
    await writeFile(workflowRouteFile, routeContent);
  }

  private async buildWebhookRoute({
    workflowGeneratedDir,
  }: {
    workflowGeneratedDir: string;
  }) {
    // Create webhook directory
    const webhookDir = join(workflowGeneratedDir, 'webhook');
    await mkdir(webhookDir, { recursive: true });

    // Create webhook route: .well-known/workflow/v1/webhook/$token.js
    const webhookRouteFile = join(webhookDir, '$token.ts');

    const webhookRouteContent = `// @ts-nocheck\nimport { createFileRoute } from "@tanstack/react-router";
import { resumeWebhook } from "workflow/api";

async function handler(request, token) {
  if (!token) {
    return new Response("Missing token", { status: 400 });
  }

  try {
    const response = await resumeWebhook(token, request);
    return response;
  } catch (error) {
    // TODO: differentiate between invalid token and other errors
    console.error("Error during resumeWebhook", error);
    return new Response(null, { status: 404 });
  }
}

async function normalizeRequest(request) {
  const options = {
    method: request.method,
    headers: new Headers(request.headers),
  };
  if (
    !["GET", "HEAD", "OPTIONS", "TRACE", "CONNECT"].includes(request.method)
  ) {
    options.body = await request.arrayBuffer();
  }
  return new Request(request.url, options);
}

const createTanStackHandler = (method) => async ({ request, params }) => {
  const normalRequest = await normalizeRequest(request);
  const response = await handler(normalRequest, params.token);
  return response;
};

export const GET = createTanStackHandler("GET");
export const POST = createTanStackHandler("POST");
export const PUT = createTanStackHandler("PUT");
export const PATCH = createTanStackHandler("PATCH");
export const DELETE = createTanStackHandler("DELETE");
export const HEAD = createTanStackHandler("HEAD");
export const OPTIONS = createTanStackHandler("OPTIONS");

export const Route = createFileRoute("/.well-known/workflow/v1/webhook/$token")({
  server: {
    handlers: {
      GET,
      POST,
      PUT,
      PATCH,
      DELETE,
      HEAD,
      OPTIONS,
    },
  },
});
`;

    await writeFile(webhookRouteFile, webhookRouteContent);
  }

  private async findRoutesDirectory(): Promise<string> {
    const routesDir = resolve(this.config.workingDir, 'src/routes');
    const rootRoutesDir = resolve(this.config.workingDir, 'routes');

    // Try src/routes first (standard SvelteKit convention)
    try {
      await access(routesDir, constants.F_OK);
      const routesStats = await stat(routesDir);
      if (!routesStats.isDirectory()) {
        throw new Error(`Path exists but is not a directory: ${routesDir}`);
      }
      return routesDir;
    } catch {
      // Try routes as fallback
      try {
        await access(rootRoutesDir, constants.F_OK);
        const rootRoutesStats = await stat(rootRoutesDir);
        if (!rootRoutesStats.isDirectory()) {
          throw new Error(
            `Path exists but is not a directory: ${rootRoutesDir}`
          );
        }
        return rootRoutesDir;
      } catch {
        throw new Error(
          'Could not find routes directory. Expected either "src/routes" or "routes" to exist.'
        );
      }
    }
  }
}

export class VercelBuilder extends VercelBuildOutputAPIBuilder {
  constructor() {
    const workingDir = process.cwd();
    super({
      ...createBaseBuilderConfig({
        workingDir,
        dirs: ['src/pages', 'src/workflows'],
      }),
      buildTarget: 'vercel-build-output-api',
    });
  }

  override async build(): Promise<void> {
    console.log('building for vercel');
    const configPath = join(
      this.config.workingDir,
      '.vercel/output/config.json'
    );

    // The config output by nitro
    const config = JSON.parse(await readFile(configPath, 'utf-8'));

    // Find the index right after the "filesystem" handler and "continue: true" routes
    let insertIndex = config.routes.findIndex(
      (route: any) => route.handle === 'filesystem'
    );

    // Move past any routes with "continue: true" (like _astro cache headers)
    while (
      insertIndex < config.routes.length - 1 &&
      config.routes[insertIndex + 1]?.continue === true
    ) {
      insertIndex++;
    }

    // Insert workflow routes right after
    config.routes.splice(insertIndex + 1, 0, ...WORKFLOW_ROUTES);

    // Bundles workflows for vercel
    await super.build();

    // Use old nitro config with updated routes
    await writeFile(configPath, JSON.stringify(config, null, 2));
  }
}
