import type { IngestRun, NormTest } from '@kinora/core'
import { makeTestKey, STORY_ANNOTATION } from '@kinora/core'
import { expect, test } from '@playwright/test'
import { createApiToken, login, SERVER_URL } from './helpers'

// Story tests carrying the a11y check of Storybook's addon, as @kinora/vitest-reporter uploads them.
function storyTest(story: string, a11y: NormTest['a11y']): NormTest {
  const file = 'src/Button.stories.ts'
  const titlePath = [file, story]
  return {
    testKey: makeTestKey(file, titlePath, 'storybook (chromium)'),
    title: story,
    titlePath,
    file,
    line: 10,
    column: 1,
    projectName: 'storybook (chromium)',
    status: 'expected',
    ok: true,
    duration: 120,
    retries: 0,
    tags: [],
    annotations: [{ type: STORY_ANNOTATION, description: `Button/${story}` }],
    errors: [],
    attachments: [],
    a11y,
  }
}

test('a11y checks show on the components, test and run pages', async ({ page }) => {
  await login(page)
  const slug = `a11y-${Date.now()}`
  const tests = [
    storyTest('Icon', {
      status: 'warning',
      violations: [
        { id: 'color-contrast', impact: 'serious', help: 'Elements must meet minimum color contrast ratio thresholds', helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/color-contrast', nodes: ['.a', '.b', '.c', '.d'], nodeCount: 5 },
        { id: 'button-name', impact: 'critical', help: 'Buttons must have discernible text', helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/button-name', nodes: ['#root > button'], nodeCount: 1 },
      ],
    }),
    storyTest('Primary', { status: 'passed', violations: [] }),
  ]
  const payload: IngestRun = {
    project: { slug, name: slug },
    run: { startedAt: new Date().toISOString(), duration: 240, counts: { total: 2, expected: 2, unexpected: 0, flaky: 0, skipped: 0 } },
    tests,
  }
  const res = await page.request.post(`${SERVER_URL}/api/v1/runs`, { headers: { Authorization: `Bearer ${await createApiToken(page)}` }, data: payload })
  expect(res.status()).toBe(201)

  // Components: a badge per story, the hotspots card, and a filter on stories with violations.
  await page.goto(`/projects/${slug}/components`)
  const button = page.getByRole('region', { name: 'Button', exact: true })
  await expect(button.locator('[data-a11y]')).toHaveText('2 a11y issues')
  const hotspots = page.getByRole('region', { name: 'Accessibility hotspots' })
  await expect(hotspots.getByText('Button')).toBeVisible()
  await hotspots.getByRole('button', { name: /Button/ }).click()
  await expect(page).toHaveURL(/a11y=true/)
  await expect(button.getByText('Icon', { exact: true })).toBeVisible()
  await expect(button.getByText('Primary', { exact: true })).toHaveCount(0)

  // Test page: the violations, most severe first, with the elements and the rule's docs.
  await button.getByRole('button', { name: /^Icon, / }).click()
  await button.getByRole('link', { name: /Icon/ }).click()
  const violations = page.getByTestId('a11y-violations')
  await expect(violations).toContainText('2 violations, reported as warnings')
  await expect(violations.getByRole('listitem').first()).toContainText('Buttons must have discernible text')
  await expect(violations.getByRole('link', { name: 'button-name' })).toHaveAttribute('href', 'https://dequeuniversity.com/rules/axe/4.10/button-name')
  await expect(violations).toContainText('+2 more elements')

  // Run page: the same list under the test, and nothing for a passed check.
  await page.goto(`/projects/${slug}`)
  await page.getByRole('row').nth(1).click()
  await expect(page.getByTestId('a11y-violations')).toHaveCount(1)
})
