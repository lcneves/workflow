#!/usr/bin/env node

import { LocalBuilder, VercelBuilder } from '../builder.js';

if (process.env.VERCEL_DEPLOYMENT_ID) {
  console.log('Building workflows for Vercel...');
  await new VercelBuilder().build();
  console.log('Vercel workflow build complete.');
} else {
  console.log('Building workflows for local...');
  await new LocalBuilder().build();
  console.log('Local workflow build complete.');
}
