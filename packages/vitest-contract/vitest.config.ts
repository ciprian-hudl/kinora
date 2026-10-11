import process from 'node:process'
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

function browser() {
  return { enabled: true, headless: true, provider: playwright(), instances: [{ browser: 'chromium' as const }], trace: 'on' as const }
}

// The reporter is loaded from source, so the contract test needs no prior build.
export default defineConfig({
  define: { __SWATCH__: JSON.stringify(process.env.SWATCH ?? 'rgb(79, 70, 229)') },
  test: {
    reporters: ['default', ['../vitest-reporter/src/index.ts', { project: { slug: 'contract' } }]],
    projects: [
      { test: { name: 'unit', include: ['src/**/*.unit.ts'] } },
      { test: { name: 'browser', include: ['src/**/*.browser.test.ts'], browser: browser() } },
      {
        plugins: [storybookTest({ configDir: '.storybook' })],
        optimizeDeps: { include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime'] },
        test: { name: 'storybook', browser: browser() },
      },
    ],
  },
})
