import { createFeedbackTask } from '../lib/feedback-tracker'
import { version } from '../lib/version'

export type FeedbackType = 'bug' | 'feature'

interface CreateFeedbackParams {
  type: FeedbackType
  title: string
  description: string
  userEmail: string
}

export async function createFeedbackIssue(params: CreateFeedbackParams) {
  return createFeedbackTask({
    title: params.title,
    description: `${params.description}\n\nSubmitted by: ${params.userEmail}\nVersion: ${version}`,
    labels: ['user-feedback', params.type],
  })
}
