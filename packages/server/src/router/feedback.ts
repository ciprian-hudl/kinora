import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { submitFeedback } from '../feedback/service'
import { feedbackEnabled } from '../lib/feedback-inbox'
import { authProcedure, router } from '../trpc/index'

export const feedbackRouter = router({
  create: authProcedure
    .input(z.object({
      type: z.enum(['bug', 'feature']),
      title: z.string().trim().min(1).max(200),
      description: z.string().trim().min(1).max(5000),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!feedbackEnabled)
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Feedback is not enabled' })

      const item = await submitFeedback({ ...input, userEmail: ctx.user.email })
      return { issueId: String(item.id) }
    }),
})
