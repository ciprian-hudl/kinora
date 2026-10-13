import type { A11yViolation } from '@kinora/core'

// Impact label and badge colors, most severe in red. A violation read from a failing story's error
// has no impact (see the Vitest reporter).
export const IMPACT_STYLE: Record<NonNullable<A11yViolation['impact']> | 'unknown', { label: string, class: string }> = {
  critical: { label: 'Critical', class: 'border-fail/30 bg-fail/15 text-fail' },
  serious: { label: 'Serious', class: 'border-signal/30 bg-signal/15 text-signal' },
  moderate: { label: 'Moderate', class: 'border-flaky/30 bg-flaky/15 text-flaky' },
  minor: { label: 'Minor', class: 'border-border bg-muted text-muted-foreground' },
  unknown: { label: 'Failing', class: 'border-fail/30 bg-fail/10 text-fail' },
}

export const impactStyle = (impact: A11yViolation['impact']) => IMPACT_STYLE[impact ?? 'unknown']
