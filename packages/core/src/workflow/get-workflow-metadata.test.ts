import { expect, test, vi } from 'vitest';
import { getWorkflowMetadata } from './get-workflow-metadata.js';

vi.mock('chalk');

test('throws an error if not in a workflow context', () => {
  expect(() => getWorkflowMetadata()).toThrowErrorMatchingInlineSnapshot(`
    [Error: \`getWorkflowMetadata()\` can only be called inside a workflow or step function
    ╰▶ <cyan><b>help:</b> This function comes from Workflow DevKit, and requires to be used as a part of a workflow or a step,
       As it has no meaning outside of the workflow context.
       Read more: https://useworkflow.dev/docs/api-reference/workflow/get-workflow-metadata</cyan>]
  `);
});
