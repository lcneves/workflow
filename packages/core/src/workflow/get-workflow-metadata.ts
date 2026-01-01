import { Ansi } from '@workflow/errors';

export interface WorkflowMetadata {
  /**
   * Unique identifier for the workflow run.
   */
  workflowRunId: string;

  /**
   * Timestamp when the workflow run started.
   */
  workflowStartedAt: Date;

  /**
   * The URL where the workflow can be triggered.
   */
  url: string;

  /*
   * The name of the workflow.
   */
  workflowName: string;
}

export const WORKFLOW_CONTEXT_SYMBOL =
  /* @__PURE__ */ Symbol.for('WORKFLOW_CONTEXT');

export function getWorkflowMetadata(): WorkflowMetadata {
  // Inside the workflow VM, the context is stored in the globalThis object behind a symbol
  const ctx = (globalThis as any)[WORKFLOW_CONTEXT_SYMBOL] as WorkflowMetadata;
  if (!ctx) {
    throw new Error(
      Ansi.frame(
        '`getWorkflowMetadata()` can only be called inside a workflow or step function',
        [
          Ansi.help([
            'This function comes from Workflow DevKit, and requires to be used as a part of a workflow or a step,',
            'As it has no meaning outside of the workflow context.',
            'Read more: https://useworkflow.dev/docs/api-reference/workflow/get-workflow-metadata',
          ]),
        ]
      )
    );
  }
  return ctx;
}
