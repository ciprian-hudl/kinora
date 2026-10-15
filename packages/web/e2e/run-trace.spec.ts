import { expect, test } from '@playwright/test'
import { findAnnotatedRun, findTracedRun, login } from './helpers'

test.beforeEach(async ({ page }) => {
  await login(page)
})

test('shows a View trace link wired to the viewer for a traced test', async ({ page }) => {
  const { slug, runId } = await findTracedRun(page)
  await page.goto(`/projects/${slug}/runs/${runId}`)

  const viewTrace = page.getByRole('link', { name: /View trace/i }).first()
  await expect(viewTrace).toBeVisible()

  const href = await viewTrace.getAttribute('href')
  expect(href).toContain('localhost:5174')
  expect(href).toContain('?trace=')
})

test('shows test annotations on the run page', async ({ page }) => {
  const { slug, runId } = await findAnnotatedRun(page)
  // Seeded annotations live on skipped tests.
  await page.goto(`/projects/${slug}/runs/${runId}?status=skipped`)
  await expect(page.getByText('skip: flaky on CI').first()).toBeVisible()
})

test('a trace the artifact retention deleted shows as expired, not as a dead badge', async ({ page }) => {
  const { slug, runId } = await findTracedRun(page)
  // What the run returns once the retention purged its files: no url, `expired` set.
  await page.route(url => url.pathname.includes('/trpc/') && url.pathname.includes('dashboard.run'), async (route) => {
    const res = await route.fetch()
    const json = await res.json()
    const expire = (node: unknown): void => {
      if (Array.isArray(node))
        return node.forEach(expire)
      if (node && typeof node === 'object') {
        const o = node as Record<string, unknown>
        if (o.name === 'trace' && 'contentType' in o) {
          delete o.url
          o.expired = true
        }
        Object.values(o).forEach(expire)
      }
    }
    expire(json)
    await route.fulfill({ response: res, json })
  })
  await page.goto(`/projects/${slug}/runs/${runId}`)

  await expect(page.getByTestId('expired-artifacts').first()).toHaveText(/Trace( and \d+ files?)? expired/)
  await expect(page.getByRole('link', { name: /View trace/i })).toHaveCount(0)
})
