import { expect, onTestFinished, test, vi } from 'vitest';
import {
  NotInStepContextError,
  NotInWorkflowContextError,
  UnavailableInWorkflowContextError,
} from './not-in-workflow-context-error.js';
import {
  WORKFLOW_CONTEXT_SYMBOL,
  type WorkflowMetadata,
} from './workflow/get-workflow-metadata.js';

// use html tags instead of actual ansi colors
vi.mock('chalk');

test('NotInStepContextError output', () => {
  expect(() => {
    throw new NotInStepContextError(
      'sleep()',
      'sleep(): https://example.vercel.sh'
    );
  }).toThrowErrorMatchingInlineSnapshot(`
    [NotInStepContextError: <i><dim>\`</dim>sleep()<dim>\`</dim></i> can only be called inside a step function
    ╰▶ <blue><b>note:</b> Read more about sleep(): https://example.vercel.sh</blue>]
  `);
});

test('NotInWorkflowContextError output', () => {
  expect(() => {
    throw new NotInWorkflowContextError(
      'createHook()',
      'creating hooks: https://useworkflow.dev/docs/foundations/hooks#creating-your-first-hook'
    );
  }).toThrowErrorMatchingInlineSnapshot(`
    [NotInWorkflowContextError: <i><dim>\`</dim>createHook()<dim>\`</dim></i> can only be called inside a workflow function
    ╰▶ <blue><b>note:</b> Read more about creating hooks: https://useworkflow.dev/docs/foundations/hooks#creating-your-first-hook</blue>]
  `);
});

test('UnavailableInWorkflowContextError output', () => {
  Object.assign(globalThis, {
    [WORKFLOW_CONTEXT_SYMBOL]: {
      workflowName: 'workflow//workflows/example.ts//myWorkflow',
    } as WorkflowMetadata,
  });
  onTestFinished(() => {
    delete (globalThis as any)[WORKFLOW_CONTEXT_SYMBOL];
  });
  expect(() => {
    throw new UnavailableInWorkflowContextError(
      `resumeHook()`,
      'resuming hooks: https://useworkflow.dev/docs/foundations/hooks#resuming-a-hook'
    );
  }).toThrowErrorMatchingInlineSnapshot(`
    [UnavailableInWorkflowContextError: <i><dim>\`</dim>resumeHook()<dim>\`</dim></i> cannot be called from a workflow context.
    ├▶ calling this in a workflow context can cause determinism issues.
    ╰▶ <blue><b>note:</b> this call was made from the <dim>workflow<dim>//</dim></dim>workflows/example.ts<dim>//</dim>myWorkflow workflow context.
       Read more about resuming hooks: https://useworkflow.dev/docs/foundations/hooks#resuming-a-hook</blue>]
  `);
});
