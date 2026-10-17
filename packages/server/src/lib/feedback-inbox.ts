import type { FeedbackInboxConfig } from './env'
import { feedbackInboxConfig } from './env'

const TIMEOUT_MS = 10_000

interface FeedbackInput {
  type: 'bug' | 'feature'
  title: string
  description: string
  userEmail: string
  appVersion: string
}

export async function sendFeedback(input: FeedbackInput, config: FeedbackInboxConfig | null = feedbackInboxConfig): Promise<{ id: number }> {
  if (!config)
    throw new Error('Feedback inbox is not configured')

  const response = await fetch(`${config.url.replace(/\/$/, '')}/ingest/feedback`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Feedback inbox request failed (${response.status}): ${body}`)
  }

  return response.json() as Promise<{ id: number }>
}

export const feedbackEnabled = feedbackInboxConfig !== null
