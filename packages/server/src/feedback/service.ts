import { sendFeedback } from '../lib/feedback-inbox'
import { version } from '../lib/version'

export type FeedbackType = 'bug' | 'feature'

interface CreateFeedbackParams {
  type: FeedbackType
  title: string
  description: string
  userEmail: string
}

export async function submitFeedback(params: CreateFeedbackParams) {
  return sendFeedback({ ...params, appVersion: version })
}
