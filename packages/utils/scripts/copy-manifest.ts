#!/usr/bin/env node
/**
 * Script to copy worlds-manifest.json and generate a TypeScript module from it.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '../../..');
const srcDir = join(__dirname, '../src');

// Read the manifest
const manifestPath = join(rootDir, 'worlds-manifest.json');
const manifestContent = readFileSync(manifestPath, 'utf-8');
const manifest = JSON.parse(manifestContent);

// Generate TypeScript module
const tsContent = `/**
 * Auto-generated from worlds-manifest.json
 * DO NOT EDIT MANUALLY - Run 'pnpm prebuild' to regenerate
 */

import type { WorldsManifest } from './worlds-manifest-types.js';

export const worldsManifestData: WorldsManifest = ${JSON.stringify(manifest, null, 2)} as const;
`;

// Write the TypeScript file
const outputPath = join(srcDir, 'worlds-manifest-data.ts');
writeFileSync(outputPath, tsContent);

console.log('Generated worlds-manifest-data.ts');
