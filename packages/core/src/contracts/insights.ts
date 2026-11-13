import { z } from 'zod'

// Which failures an insight counts: hard failures, flakes (passed on a retry), or both.
export const insightStatusSchema = z.enum(['failed', 'flaky', 'any'])
export type InsightStatus = z.infer<typeof insightStatusSchema>

const occurrenceSchema = z.object({
  runId: z.string(),
  startedAt: z.string(),
  status: z.enum(['expected', 'unexpected', 'flaky', 'skipped']),
  branch: z.string().optional(),
  sha: z.string().optional(),
  ciRunUrl: z.string().optional(),
  retries: z.number(),
  error: z.object({ message: z.string(), stack: z.string().optional() }).optional(),
  traceUrl: z.string().nullable(),
})
export type TestOccurrence = z.infer<typeof occurrenceSchema>

// One test's failures over a time window, across the runs it ran in.
export const testInsightSchema = z.object({
  project: z.string(),
  testKey: z.string(),
  title: z.string(),
  titlePath: z.array(z.string()),
  location: z.string(),
  runs: z.number(),
  fails: z.number(),
  flakes: z.number(),
  failRate: z.number(),
  flakeRate: z.number(),
  firstSeen: z.string(),
  lastSeen: z.string(),
  latest: occurrenceSchema,
})
export type TestInsight = z.infer<typeof testInsightSchema>

export const testInsightsResponseSchema = z.object({ since: z.string(), tests: z.array(testInsightSchema) })

// Failures grouped by their normalized error: one root cause across tests and projects.
export const rootCauseSchema = z.object({
  fingerprint: z.string(),
  title: z.string(),
  sample: z.string(),
  occurrences: z.number(),
  tests: z.number(),
  projects: z.array(z.string()),
  firstSeen: z.string(),
  lastSeen: z.string(),
  examples: z.array(z.object({ project: z.string(), testKey: z.string(), title: z.string(), runId: z.string(), startedAt: z.string(), traceUrl: z.string().nullable() })),
})
export type RootCause = z.infer<typeof rootCauseSchema>

export const rootCausesResponseSchema = z.object({
  since: z.string(),
  causes: z.array(rootCauseSchema),
  // Runs flagged as environment incidents (the app or browser was down), left out of the causes.
  incidents: z.array(z.object({ project: z.string(), runs: z.number(), reason: z.string() })),
  // Set when the window had more failures than were read.
  sampled: z.number().optional(),
})
export type RootCauses = z.infer<typeof rootCausesResponseSchema>

export const testOccurrencesSchema = z.object({
  since: z.string(),
  project: z.string(),
  testKey: z.string(),
  title: z.string().optional(),
  runs: z.number(),
  fails: z.number(),
  flakes: z.number(),
  occurrences: z.array(occurrenceSchema),
  // The newest run it passed in, to compare its trace with a failing one.
  lastPass: occurrenceSchema.nullable(),
})
export type TestOccurrences = z.infer<typeof testOccurrencesSchema>
