import type { StorybookConfig } from '@storybook/react-vite'

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.ts'],
  addons: ['@storybook/addon-vitest', '@storybook/addon-a11y'],
  framework: '@storybook/react-vite',
}
export default config
