import process from 'node:process'
import { expect, test } from '../fixtures'

test.use({ baseURL: 'https://ui.demo.kinora.dev' })

// generate-demo-traces records the reference from the fixed story (DEMO_BASELINE), then runs
// the suite against the buggy one: the failure carries real expected / actual / diff images.
test('range highlights the selected days', { tag: '@visual' }, async ({ page }) => {
  await page.goto(`/stories/DatePicker/Range${process.env.DEMO_BASELINE ? '?fixed' : ''}`)
  await expect(page.getByRole('grid', { name: 'March 2026' })).toBeVisible()

  await expect(page.getByTestId('canvas')).toHaveScreenshot('date-picker-range.png')
})
