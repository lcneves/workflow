import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import * as esbuild from 'esbuild';
import { BaseBuilder } from './base-builder.js';
import { STEP_QUEUE_TRIGGER, WORKFLOW_QUEUE_TRIGGER } from './constants.js';

export class VercelBuildOutputAPIBuilder extends BaseBuilder {
  async build(): Promise<void> {
    const outputDir = resolve(this.config.workingDir, '.vercel/output');
    const functionsDir = join(outputDir, 'functions');
    const workflowGeneratedDir = join(functionsDir, '.well-known/workflow/v1');

    // Ensure output directories exist
    await mkdir(workflowGeneratedDir, { recursive: true });

    const inputFiles = await this.getInputFiles();
    const tsconfigPath = await this.findTsConfigPath();
    const options = {
      inputFiles,
      workflowGeneratedDir,
      tsconfigPath,
    };
    const manifest = await this.buildStepsFunction(options);
    await this.buildWorkflowsFunction(options);
    await this.buildWebhookFunction(options);
    await this.createBuildOutputConfig(outputDir);

    // Generate unified manifest
    const workflowBundlePath = join(workflowGeneratedDir, 'flow.func/index.js');
    await this.createManifest({
      workflowBundlePath,
      manifestDir: workflowGeneratedDir,
      manifest,
    });

    await this.createClientLibrary();
  }

  private async buildStepsFunction({
    inputFiles,
    workflowGeneratedDir,
    tsconfigPath,
  }: {
    inputFiles: string[];
    workflowGeneratedDir: string;
    tsconfigPath?: string;
  }) {
    console.log('Creating Vercel Build Output API steps function');
    const stepsFuncDir = join(workflowGeneratedDir, 'step.func');
    await mkdir(stepsFuncDir, { recursive: true });

    const finalOutfile = join(stepsFuncDir, 'index.js');

    // Two-pass build approach (in-memory):
    // 1. First pass: Create intermediate bundle in memory (no outfile)
    //    This externalizes the 'workflow' package so we don't need it resolved
    //    from files outside the project directory (e.g. via path aliases)
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
      outfile: finalOutfile,
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

    // Create package.json and .vc-config.json for steps function
    await this.createPackageJson(stepsFuncDir, 'commonjs');
    await this.createVcConfig(stepsFuncDir, {
      shouldAddSourcemapSupport: true,
      experimentalTriggers: [STEP_QUEUE_TRIGGER],
    });

    return manifest;
  }

  private async buildWorkflowsFunction({
    inputFiles,
    workflowGeneratedDir,
    tsconfigPath,
  }: {
    inputFiles: string[];
    workflowGeneratedDir: string;
    tsconfigPath?: string;
  }): Promise<void> {
    console.log('Creating Vercel Build Output API workflows function');
    const workflowsFuncDir = join(workflowGeneratedDir, 'flow.func');
    await mkdir(workflowsFuncDir, { recursive: true });

    await this.createWorkflowsBundle({
      outfile: join(workflowsFuncDir, 'index.js'),
      inputFiles,
      tsconfigPath,
    });

    // Create package.json and .vc-config.json for workflows function
    await this.createPackageJson(workflowsFuncDir, 'commonjs');
    await this.createVcConfig(workflowsFuncDir, {
      experimentalTriggers: [WORKFLOW_QUEUE_TRIGGER],
    });
  }

  private async buildWebhookFunction({
    workflowGeneratedDir,
    bundle = true,
  }: {
    workflowGeneratedDir: string;
    bundle?: boolean;
  }): Promise<void> {
    console.log('Creating Vercel Build Output API webhook function');
    const webhookFuncDir = join(workflowGeneratedDir, 'webhook/[token].func');

    // Bundle the webhook route with dependencies resolved
    await this.createWebhookBundle({
      outfile: join(webhookFuncDir, 'index.js'),
      bundle, // Build Output API needs bundling (except in tests)
    });

    // Create package.json and .vc-config.json for webhook function
    await this.createPackageJson(webhookFuncDir, 'commonjs');
    await this.createVcConfig(webhookFuncDir, {
      shouldAddHelpers: false,
    });
  }

  private async createBuildOutputConfig(outputDir: string): Promise<void> {
    // Create config.json for Build Output API
    const buildOutputConfig = {
      version: 3,
      routes: [
        {
          src: '^\\/\\.well-known\\/workflow\\/v1\\/webhook\\/([^\\/]+)$',
          dest: '/.well-known/workflow/v1/webhook/[token]',
        },
      ],
    };

    await writeFile(
      join(outputDir, 'config.json'),
      JSON.stringify(buildOutputConfig, null, 2)
    );

    console.log(`Build Output API created at ${outputDir}`);
    console.log('Steps function available at /.well-known/workflow/v1/step');
    console.log(
      'Workflows function available at /.well-known/workflow/v1/flow'
    );
    console.log(
      'Webhook function available at /.well-known/workflow/v1/webhook/[token]'
    );
  }
}
