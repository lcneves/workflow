// THIS FILE IS JUST FOR TESTING HMR AS AN ENTRY NEEDS
// TO IMPORT THE WORKFLOWS TO DISCOVER THEM AND WATCH
import type { NextApiRequest, NextApiResponse } from 'next';
import * as workflows from '@/workflows/3_streams';

export default async function handler(
  _req: NextApiRequest,
  res: NextApiResponse
) {
  console.log(workflows);
  res.json('hello world');
}
