import type { NextApiRequest, NextApiResponse } from 'next';
import { getRun } from 'workflow/api';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { runId } = req.body as { runId: string };

    if (!runId) {
      res.status(400).json({ error: 'runId is required' });
      return;
    }

    // Get the workflow run
    const run = await getRun(runId);

    if (!run) {
      res.status(404).json({ error: `Workflow run "${runId}" not found` });
      return;
    }

    // Set headers for streaming response
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Workflow-Run-Id', runId);

    // Get the readable stream and pipe it to the response
    const readable = run.getReadable();
    const reader = readable.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          res.write(value);
        }
      }
    } finally {
      reader.releaseLock();
    }

    res.end();
  } catch (error) {
    console.error('Error resuming stream:', error);
    res.status(500).json({
      error: 'Failed to resume stream',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}
