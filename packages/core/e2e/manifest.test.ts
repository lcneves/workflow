import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { getWorkbenchAppPath } from './utils';

interface ManifestStep {
  stepId: string;
}

interface ManifestWorkflow {
  workflowId: string;
  graph: {
    nodes: Array<{
      id: string;
      type: string;
      data: {
        label: string;
        nodeKind: string;
        stepId?: string;
      };
    }>;
    edges: Array<{
      id: string;
      source: string;
      target: string;
    }>;
  };
}

interface Manifest {
  version: string;
  steps: Record<string, Record<string, ManifestStep>>;
  workflows: Record<string, Record<string, ManifestWorkflow>>;
}

// Map project names to their manifest paths
const MANIFEST_PATHS: Record<string, string> = {
  'nextjs-webpack': 'app/.well-known/workflow/v1/manifest.json',
  'nextjs-turbopack': 'app/.well-known/workflow/v1/manifest.json',
  nitro: 'node_modules/.nitro/workflow/manifest.json',
  vite: 'node_modules/.nitro/workflow/manifest.json',
  sveltekit: 'src/routes/.well-known/workflow/v1/manifest.json',
  nuxt: 'node_modules/.nitro/workflow/manifest.json',
  hono: 'node_modules/.nitro/workflow/manifest.json',
  express: 'node_modules/.nitro/workflow/manifest.json',
};

function validateSteps(steps: Manifest['steps']) {
  expect(steps).toBeDefined();
  expect(typeof steps).toBe('object');

  const stepFiles = Object.keys(steps);
  expect(stepFiles.length).toBeGreaterThan(0);

  for (const filePath of stepFiles) {
    const fileSteps = steps[filePath];
    for (const [stepName, stepData] of Object.entries(fileSteps)) {
      expect(stepData.stepId).toBeDefined();
      expect(stepData.stepId).toContain('step//');
      expect(stepData.stepId).toContain(stepName);
    }
  }
}

function validateWorkflowGraph(graph: ManifestWorkflow['graph']) {
  expect(graph).toBeDefined();
  expect(graph.nodes).toBeDefined();
  expect(Array.isArray(graph.nodes)).toBe(true);
  expect(graph.edges).toBeDefined();
  expect(Array.isArray(graph.edges)).toBe(true);

  for (const node of graph.nodes) {
    expect(node.id).toBeDefined();
    expect(node.type).toBeDefined();
    expect(node.data).toBeDefined();
    expect(node.data.label).toBeDefined();
    expect(node.data.nodeKind).toBeDefined();
  }

  for (const edge of graph.edges) {
    expect(edge.id).toBeDefined();
    expect(edge.source).toBeDefined();
    expect(edge.target).toBeDefined();
  }

  const nodeTypes = graph.nodes.map((n) => n.type);
  expect(nodeTypes).toContain('workflowStart');
  expect(nodeTypes).toContain('workflowEnd');
}

function validateWorkflows(workflows: Manifest['workflows']) {
  expect(workflows).toBeDefined();
  expect(typeof workflows).toBe('object');

  const workflowFiles = Object.keys(workflows);
  expect(workflowFiles.length).toBeGreaterThan(0);

  for (const filePath of workflowFiles) {
    const fileWorkflows = workflows[filePath];
    for (const [workflowName, workflowData] of Object.entries(fileWorkflows)) {
      expect(workflowData.workflowId).toBeDefined();
      expect(workflowData.workflowId).toContain('workflow//');
      expect(workflowData.workflowId).toContain(workflowName);
      validateWorkflowGraph(workflowData.graph);
    }
  }
}

describe.each(Object.keys(MANIFEST_PATHS))('manifest generation', (project) => {
  test(
    `${project}: manifest.json exists and has valid structure`,
    { timeout: 30_000 },
    async () => {
      // Skip if we're targeting a specific app
      if (process.env.APP_NAME && project !== process.env.APP_NAME) {
        return;
      }

      const appPath = getWorkbenchAppPath(project);
      const manifestPath = path.join(appPath, MANIFEST_PATHS[project]);

      const manifestContent = await fs.readFile(manifestPath, 'utf8');
      const manifest: Manifest = JSON.parse(manifestContent);

      expect(manifest.version).toBe('1.0.0');
      validateSteps(manifest.steps);
      validateWorkflows(manifest.workflows);
    }
  );
});
