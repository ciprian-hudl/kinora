import process from 'node:process'
import { defineConfig } from '@playwright/test'

// Nested sharded run launched by e2e/sharded-run.spec.ts: each shard writes a blob report, then
// merge.config.ts uploads the merged run with the real reporter (loaded from source). With
// SHARD_DIRECT set, each shard uploads itself instead and the server assembles the run.
export default defineConfig({
  testDir: '.',
  // Not `.spec.ts`, so the outer e2e run never collects these.
  testMatch: '*.shard.ts',
  outputDir: process.env.SHARD_OUTPUT_DIR,
  fullyParallel: true,
  reporter: process.env.SHARD_DIRECT
    ? [['../../../../reporter/src/index.ts', { project: { slug: process.env.SHARD_PROJECT_SLUG } }]]
    : [['blob', { outputDir: process.env.SHARD_BLOB_DIR }]],
  use: { trace: 'on' },
})
