import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { index: 'src/index.ts', ct: 'src/ct.ts', a11y: 'src/a11y.ts' },
  platform: 'node',
  format: 'esm',
  dts: true,
})
