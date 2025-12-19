#!/usr/bin/env node

import { createRequire } from 'node:module';
import { execute } from '@oclif/core';
import { checkForUpdates } from '../dist/lib/update-check.js';

// Get version from the CLI package's own package.json
const require = createRequire(import.meta.url);
const { version } = require('../package.json');

// Start update check in background (don't await yet)
const updateCheckPromise = checkForUpdates(version).catch(() => {});

// Execute the CLI command
await execute({ type: 'esm', development: false, dir: import.meta.url });

// Wait for update check to complete and show warning if needed
await updateCheckPromise;
