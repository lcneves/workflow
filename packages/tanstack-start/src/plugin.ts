import type { Plugin } from 'vite';
import { LocalBuilder, VercelBuilder } from './builder.js';
import type {} from 'nitro/vite';
import type { Nitro, NitroModule } from 'nitro/types';
import type { RollupConfig } from 'nitro/types';
import { workflowTransformPlugin } from '@workflow/rollup';
import { workflowHotUpdatePlugin } from '@workflow/vite';
import { createBuildQueue } from '@workflow/builders';

const nitroModule = {
  name: 'workflow/nitro',
  async setup(nitro: Nitro) {
    const isVercelDeploy =
      !nitro.options.dev && nitro.options.preset === 'vercel';

    // Add transform plugin
    nitro.hooks.hook('rollup:before', (_nitro: Nitro, config: RollupConfig) => {
      (config.plugins as Array<unknown>).push(workflowTransformPlugin());
    });

    // Generate functions for vercel build
    if (isVercelDeploy) {
      nitro.hooks.hook('compiled', async () => {
        console.log('vercel deploy, building for vercel...');
        await new VercelBuilder().build();
      });
    }

    if (!isVercelDeploy) {
      console.log('not vercel deploy, building for local...');
      const builder = new LocalBuilder();
      nitro.hooks.hook('build:before', async () => {
        await builder.build();
      });
    }
  },
} satisfies NitroModule;

export function workflowPlugin(): Plugin[] {
  const builder = new LocalBuilder();
  const enqueue = createBuildQueue();

  return [
    {
      name: 'workflow:nitro',
      nitro: {
        setup: async (nitro: Nitro) => {
          return nitroModule.setup(nitro);
        },
      },
    },
    workflowTransformPlugin(),
    workflowHotUpdatePlugin({
      builder,
      enqueue,
    }) as any,
    // NOTE: This is a workaround because TanStack Start passes the 404 requests to the dev server to handle.
    // For workflow routes, we override to send an empty body to prevent Vite's SPA fallback.
    // Exactly like `packages/nitro/src/vite.ts`
    {
      name: 'workflow-404-middleware',
      configureServer(server) {
        // Add middleware to intercept 404s on workflow routes before Vite's SPA fallback
        return () => {
          server.middlewares.use((req, res, next) => {
            // Only handle workflow webhook routes
            if (!req.url?.startsWith('/.well-known/workflow/v1/')) {
              return next();
            }

            // Wrap writeHead to ensure we send empty body for 404s
            const originalWriteHead = res.writeHead;
            res.writeHead = function (this: typeof res, ...args: any[]) {
              const statusCode = typeof args[0] === 'number' ? args[0] : 200;

              // NOTE: Workaround because TSS passes 404 requests to the vite to handle.
              // Causes `webhook route with invalid token` test to fail.
              // For 404s on workflow routes, ensure we're sending the right headers
              if (statusCode === 404) {
                // Set content-length to 0 to prevent Vite from overriding
                res.setHeader('Content-Length', '0');
              }

              // @ts-expect-error - Complex overload signature
              return originalWriteHead.apply(this, args);
            } as any;

            next();
          });
        };
      },
    },
  ];
}
