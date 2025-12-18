import type { NextApiRequest, NextApiResponse } from 'next';
import { getRun, start } from 'workflow/api';
import {
  WorkflowRunFailedError,
  WorkflowRunNotCompletedError,
} from 'workflow/internal/errors';
import { hydrateWorkflowArguments } from 'workflow/internal/serialization';
import { allWorkflows } from '@/_workflows';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === 'POST') {
    return handlePost(req, res);
  } else if (req.method === 'GET') {
    return handleGet(req, res);
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const workflowFile =
    (req.query.workflowFile as string) || 'workflows/99_e2e.ts';
  if (!workflowFile) {
    res.status(400).send('No workflowFile query parameter provided');
    return;
  }

  const workflows = allWorkflows[workflowFile as keyof typeof allWorkflows];
  if (!workflows) {
    res.status(400).send(`Workflow file "${workflowFile}" not found`);
    return;
  }

  const workflowFn = (req.query.workflowFn as string) || 'simple';
  if (!workflowFn) {
    res.status(400).send('No workflow query parameter provided');
    return;
  }

  const workflow = workflows[workflowFn as keyof typeof workflows];
  if (!workflow) {
    res.status(400).send(`Workflow "${workflowFn}" not found`);
    return;
  }

  let args: unknown[] = [];

  // Args from query string
  const argsParam = req.query.args as string;
  if (argsParam) {
    args = argsParam.split(',').map((arg) => {
      const num = parseFloat(arg);
      return Number.isNaN(num) ? arg.trim() : num;
    });
  } else {
    // Args from body
    const body = req.body;
    if (body && Object.keys(body).length > 0) {
      args = hydrateWorkflowArguments(
        typeof body === 'string' ? JSON.parse(body) : body,
        globalThis
      );
    } else {
      args = [42];
    }
  }

  console.log(`Starting "${workflowFn}" workflow with args: ${args}`);

  try {
    const run = await start(workflow as any, args as any);
    console.log('Run', run.runId);
    res.json(run);
  } catch (err) {
    console.error(`Failed to start!!`, err);
    throw err;
  }
}

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const runId = req.query.runId as string;
  if (!runId) {
    res.status(400).send('No runId provided');
    return;
  }

  const outputStreamParam = req.query['output-stream'] as string;
  if (outputStreamParam) {
    const namespace = outputStreamParam === '1' ? undefined : outputStreamParam;
    const run = getRun(runId);
    const stream = run.getReadable({
      namespace,
    });

    res.setHeader('Content-Type', 'application/octet-stream');

    const reader = stream.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Add JSON framing to the stream, wrapping binary data in base64
        const data =
          value instanceof Uint8Array
            ? { data: Buffer.from(value).toString('base64') }
            : value;
        res.write(`${JSON.stringify(data)}\n`);
      }
    } finally {
      reader.releaseLock();
    }
    res.end();
    return;
  }

  try {
    const run = getRun(runId);
    const returnValue = await run.returnValue;
    console.log('Return value:', returnValue);

    // Include run metadata in headers
    const [createdAt, startedAt, completedAt] = await Promise.all([
      run.createdAt,
      run.startedAt,
      run.completedAt,
    ]);

    res.setHeader('X-Workflow-Run-Created-At', createdAt?.toISOString() || '');
    res.setHeader('X-Workflow-Run-Started-At', startedAt?.toISOString() || '');
    res.setHeader(
      'X-Workflow-Run-Completed-At',
      completedAt?.toISOString() || ''
    );

    if (returnValue instanceof ReadableStream) {
      res.setHeader('Content-Type', 'application/octet-stream');
      const reader = returnValue.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      } finally {
        reader.releaseLock();
      }
      res.end();
    } else {
      res.json(returnValue);
    }
  } catch (error) {
    if (error instanceof Error) {
      if (WorkflowRunNotCompletedError.is(error)) {
        res.status(202).json({
          ...error,
          name: error.name,
          message: error.message,
        });
        return;
      }

      if (WorkflowRunFailedError.is(error)) {
        const cause = error.cause as Error & { code?: string };
        res.status(400).json({
          ...error,
          name: error.name,
          message: error.message,
          cause: {
            message: cause.message,
            stack: cause.stack,
            code: cause.code,
          },
        });
        return;
      }
    }

    console.error(
      'Unexpected error while getting workflow return value:',
      error
    );
    res.status(500).json({
      error: 'Internal server error',
    });
  }
}
