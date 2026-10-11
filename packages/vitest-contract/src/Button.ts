import type { ButtonHTMLAttributes } from 'react'
import { createElement } from 'react'

// Plain createElement, no JSX: the repo's lint setup has no React support.
export function Button(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return createElement('button', props)
}
