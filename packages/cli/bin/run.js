#!/usr/bin/env node

import { execute, Config } from '@oclif/core';
import { checkForUpdates } from '../dist/lib/update-check.js';

// Load config to get the version
const config = await Config.load({ root: import.meta.url });

// Start update check in background (don't await yet)
const updateCheckPromise = checkForUpdates(config.version).catch(() => {});

// Execute the CLI command
await execute({ type: 'esm', development: false, dir: import.meta.url });

// Wait for update check to complete and show warning if needed
await updateCheckPromise;
