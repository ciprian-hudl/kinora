import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// Aliases mirror upstream Playwright so vendored engine files resolve unedited.
const alias = {
  '@trace': path.resolve(import.meta.dirname, 'src/core/trace'),
  '@isomorphic': path.resolve(import.meta.dirname, 'src/core/isomorphic'),
  '@protocol': path.resolve(import.meta.dirname, 'src/core/protocol'),
  '@': path.resolve(import.meta.dirname, 'src'),
}

// The service worker keeps loaded traces in memory keyed by URL, so the demo URL carries
// the fixture's content hash: a regenerated demo.zip is a new key (and a new HTTP cache entry).
const demoTraceVersion = createHash('sha1')
  .update(readFileSync(path.resolve(import.meta.dirname, 'public/fixtures/demo.zip')))
  .digest('hex')
  .slice(0, 8)

export default defineConfig(({ command }) => ({
  // Prod build is served by the dashboard under /trace/; dev runs at root.
  base: command === 'build' ? '/trace/' : '/',
  // Dedicated port so the service worker always lives on its own origin,
  // separate from the dashboard app (5173).
  server: { port: 5174 },
  plugins: [vue(), tailwindcss()],
  define: { __DEMO_TRACE_VERSION__: JSON.stringify(demoTraceVersion) },
  resolve: { alias },
  build: { outDir: 'dist' },
}))
