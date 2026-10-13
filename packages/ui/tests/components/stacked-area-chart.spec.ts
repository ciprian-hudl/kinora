import { expect, test } from '../fixtures'

test.describe('StackedAreaChart', () => {
  test('stacks one area per series', async ({ mount }) => {
    const component = await mount('StackedAreaChart/Normalized')
    // Unovis hashes its class names (`css-<hash>-area`).
    await expect(component.locator('path[class$="-area"]')).toHaveCount(3)
    await expect(component.getByText('Oct 1', { exact: true })).toBeVisible()
  })

  test('labels a normalized y axis in percent', async ({ mount }) => {
    const component = await mount('StackedAreaChart/Normalized')
    await expect(component.getByText('100%', { exact: true })).toBeVisible()
    await expect(component.getByText('0%', { exact: true })).toBeVisible()
  })

  test('exposes a color per series from its config', async ({ mount }) => {
    const component = await mount('StackedAreaChart/Absolute')
    const chart = component.locator('[data-slot="chart"]')
    for (const key of ['expected', 'flaky', 'unexpected']) {
      const color = await chart.evaluate((element, k) => getComputedStyle(element).getPropertyValue(`--color-${k}`).trim(), key)
      expect(color).not.toBe('')
    }
  })
})
