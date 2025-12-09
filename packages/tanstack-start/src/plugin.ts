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
  ];
}
