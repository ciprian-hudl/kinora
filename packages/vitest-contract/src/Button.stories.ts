import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { Button } from './Button'

const meta = { component: Button, args: { children: 'Save changes' } } satisfies Meta<typeof Button>
export default meta
type Story = StoryObj<typeof meta>

export const Primary: Story = {}

// Fails on purpose: its error carries Storybook's local "Click to debug" link.
export const Broken: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button')).toHaveTextContent('Something else')
  },
}
