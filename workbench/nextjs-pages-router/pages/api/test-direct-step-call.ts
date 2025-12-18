// This route tests calling step functions directly outside of any workflow context
// After the SWC compiler changes, step functions in client mode have their directive removed
// and keep their original implementation, allowing them to be called as regular async functions

import type { NextApiRequest, NextApiResponse } from 'next';
import { add } from '@/workflows/99_e2e';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { x, y } = req.body;

  console.log(`Calling step function directly with x=${x}, y=${y}`);

  // Call step function directly as a regular async function (no workflow context)
  const result = await add(x, y);
  console.log(`add(${x}, ${y}) = ${result}`);

  res.json({ result });
}
