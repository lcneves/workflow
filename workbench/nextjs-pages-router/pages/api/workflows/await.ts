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

    // Await the result
    const result = await run.returnValue;

    res.json({
      runId,
      status: 'completed',
      result,
    });
  } catch (error) {
    console.error('Error awaiting workflow:', error);
    res.status(500).json({
      error: 'Failed to await workflow',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}
