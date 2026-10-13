# @kinora/vitest-reporter

Vitest reporter that uploads your browser tests to a [kinora](https://github.com/kinora-dev/kinora) server: pass rates, flaky tests, history across runs, and the Playwright trace of each test. Storybook stories land on kinora's Components page.

It uploads the tests of Vitest projects running in a browser (browser mode, Storybook) at the end of the run, then their traces and screenshot comparisons. Upload never fails your test run.

## Install

```bash
npm i -D @kinora/vitest-reporter
# or: pnpm add -D @kinora/vitest-reporter
```

`vitest` (>=4.1) is a peer dependency. Traces need browser mode with the Playwright provider.

## Usage

Add it to `vitest.config.ts`, next to the default reporter:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    reporters: ['default', ['@kinora/vitest-reporter', { project: { slug: 'web-app' } }]],
  },
})
```

```bash
KINORA_TOKEN=<token> npx vitest run
```

Create an API token in the kinora dashboard (Settings → Workspace). Self-hosting? Point at your server with `KINORA_URL`.

## Node tests

Only browser tests are uploaded by default: Node unit tests are usually thousands of fast tests with no trace, and would eat your plan's monthly result quota. Upload them too with `include: 'all'`.

## Accessibility

With Storybook's a11y addon, each story's check is uploaded too: the rules broken, their impact
and the elements they hit, ranked by component on the Components page. Use the addon's `todo`
mode to keep the impact: in `error` mode, Storybook drops the check when the story fails and
kinora reads the violations from the failure instead.

## Documentation

**https://docs.kinora.dev/guides/vitest/**

## License

MIT
