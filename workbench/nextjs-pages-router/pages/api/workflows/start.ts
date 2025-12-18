import type { NextApiRequest, NextApiResponse } from 'next';
import { start } from 'workflow/api';
import { allWorkflows } from '@/_workflows';
import {
  WORKFLOW_DEFINITIONS,
  type WorkflowName,
} from '@/app/workflows/definitions';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { workflowName, args } = req.body as {
      workflowName: WorkflowName;
      args?: unknown[];
    };

    // Find workflow definition
    const definition = WORKFLOW_DEFINITIONS.find(
      (w) => w.name === workflowName
    );
    if (!definition) {
      res.status(404).json({ error: `Workflow "${workflowName}" not found` });
      return;
    }

    // Get the workflow file
    const workflows =
      allWorkflows[definition.workflowFile as keyof typeof allWorkflows];
    if (!workflows) {
      res.status(404).json({
        error: `Workflow file "${definition.workflowFile}" not found`,
      });
      return;
    }

    // Get the workflow function
    const workflowFn = workflows[
      workflowName as keyof typeof workflows
    ] as () => Promise<unknown>;
    if (typeof workflowFn !== 'function') {
      res
        .status(400)
        .json({ error: `Workflow "${workflowName}" is not a function` });
      return;
    }

    // Use provided args or default args
    const workflowArgs = args !== undefined ? args : definition.defaultArgs;

    // Start the workflow
    // @ts-expect-error - we're doing arbitrary calls to unknown functions
    const run = await start(workflowFn, workflowArgs);

    if (!run) {
      res.status(500).json({ error: 'Failed to get workflow run' });
      return;
    }

    // Set headers for streaming response
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Workflow-Run-Id', run.runId);

    // Stream the workflow output
    const reader = run.readable.getReader();

    const streamData = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            res.write(value);
          }
        }
      } catch (error) {
        console.error('Error streaming workflow:', error);
      }
    };

    // Race between stream completion and workflow completion
    await Promise.race([streamData(), run.returnValue]);

    // Give a moment for any final stream data
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Close the stream
    reader.releaseLock();
    res.end();
  } catch (error) {
    console.error('Error starting workflow:', error);
    res.status(500).json({
      error: 'Failed to start workflow',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}
