import * as esbuild from 'esbuild';
import { BaseBuilder } from './base-builder.js';
import type { WorkflowConfig } from './types.js';

export class StandaloneBuilder extends BaseBuilder {
  constructor(config: WorkflowConfig) {
    super({
      ...config,
      dirs: ['.'],
    });
  }

  async build(): Promise<void> {
    const inputFiles = await this.getInputFiles();
    const tsconfigPath = await this.findTsConfigPath();

    const options = {
      inputFiles,
      tsconfigPath,
    };
    const manifest = await this.buildStepsBundle(options);
    await this.buildWorkflowsBundle(options);
    await this.buildWebhookFunction();

    // Build unified manifest from workflow bundle
    const workflowBundlePath = this.resolvePath(
      this.config.workflowsBundlePath
    );
    const manifestDir = this.resolvePath('.well-known/workflow/v1');
    await this.createManifest({
      workflowBundlePath,
      manifestDir,
      manifest,
    });

    await this.createClientLibrary();
  }

  private async buildStepsBundle({
    inputFiles,
    tsconfigPath,
  }: {
    inputFiles: string[];
    tsconfigPath?: string;
  }) {
    console.log('Creating steps bundle at', this.config.stepsBundlePath);

    const stepsBundlePath = this.resolvePath(this.config.stepsBundlePath);
    await this.ensureDirectory(stepsBundlePath);

    // Two-pass build approach (in-memory):
    // 1. First pass: Create intermediate bundle in memory (no outfile)
    // 2. Second pass: Bundle the in-memory output with all dependencies
    const { manifest, outputContent } = await this.createStepsBundle({
      inputFiles,
      tsconfigPath,
    });

    // Second pass: bundle the in-memory output with all dependencies
    await esbuild.build({
      stdin: {
        contents: outputContent,
        resolveDir: this.config.workingDir,
        sourcefile: 'steps-interim.js',
        loader: 'js',
      },
      outfile: stepsBundlePath,
      absWorkingDir: this.config.workingDir,
      bundle: true,
      format: 'cjs',
      platform: 'node',
      conditions: ['node'],
      target: 'es2022',
      treeShaking: true,
      keepNames: true,
      minify: false,
      logLevel: 'error',
      external: ['bun', 'bun:*', ...(this.config.externalPackages || [])],
    });

    return manifest;
  }

  private async buildWorkflowsBundle({
    inputFiles,
    tsconfigPath,
  }: {
    inputFiles: string[];
    tsconfigPath?: string;
  }): Promise<void> {
    console.log(
      'Creating workflows bundle at',
      this.config.workflowsBundlePath
    );

    const workflowBundlePath = this.resolvePath(
      this.config.workflowsBundlePath
    );
    await this.ensureDirectory(workflowBundlePath);

    await this.createWorkflowsBundle({
      outfile: workflowBundlePath,
      inputFiles,
      tsconfigPath,
    });
  }

  private async buildWebhookFunction(): Promise<void> {
    console.log('Creating webhook bundle at', this.config.webhookBundlePath);

    const webhookBundlePath = this.resolvePath(this.config.webhookBundlePath);
    await this.ensureDirectory(webhookBundlePath);

    await this.createWebhookBundle({
      outfile: webhookBundlePath,
    });
  }
}
