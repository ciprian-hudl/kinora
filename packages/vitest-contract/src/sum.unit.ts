import { expect, test } from 'vitest'

// A Node test: the reporter leaves it out by default.
test('adds two numbers', () => {
  expect(1 + 2).toBe(3)
})
