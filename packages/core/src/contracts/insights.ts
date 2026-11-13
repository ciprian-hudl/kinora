import { z } from 'zod'
import { ERROR_CATEGORIES } from '../lib/error-category'

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

const tallySchema = z.array(z.object({ value: z.string(), count: z.number() }))

// Failures grouped by their normalized error. A cluster is a symptom many failures share, not a
// diagnosis: its signals say where to look, and its traces say why.
export const errorClusterSchema = z.object({
  fingerprint: z.string(),
  category: z.enum(ERROR_CATEGORIES),
  title: z.string(),
  sample: z.string(),
  occurrences: z.number(),
  runs: z.number(),
  tests: z.number(),
  projects: z.array(z.string()),
  // The earliest occurrence in the window, and the newest run that test passed in before it:
  // the commits between the two are where the error came in.
  firstSeen: z.object({
    at: z.string(),
    project: z.string(),
    testKey: z.string(),
    runId: z.string(),
    branch: z.string().optional(),
    sha: z.string().optional(),
    lastPass: z.object({ at: z.string(), runId: z.string(), sha: z.string().optional() }).nullable(),
  }),
  lastSeen: z.string(),
  // How the occurrences spread: one branch, browser, shard or base URL only points at it.
  breakdown: z.object({ branches: tallySchema, browsers: tallySchema, shards: tallySchema, baseUrls: tallySchema }),
  // Where the errors point, and whether that is the test file itself or code it calls.
  locations: z.array(z.object({ file: z.string(), line: z.number().optional(), count: z.number(), inTestFile: z.boolean() })),
  // Medians over the runs it hit: many tests failing together points at shared infrastructure.
  testsPerRun: z.number(),
  failuresPerRun: z.number(),
  examples: z.array(z.object({ project: z.string(), testKey: z.string(), title: z.string(), runId: z.string(), startedAt: z.string(), traceUrl: z.string().nullable() })),
})
export type ErrorCluster = z.infer<typeof errorClusterSchema>

export const commonErrorsResponseSchema = z.object({
  since: z.string(),
  errors: z.array(errorClusterSchema),
  // Runs flagged as environment incidents (the app or browser was down), left out of the errors.
  incidents: z.array(z.object({ project: z.string(), runs: z.number(), reason: z.string() })),
  // Set when the window had more failures than were read.
  sampled: z.number().optional(),
})
export type CommonErrors = z.infer<typeof commonErrorsResponseSchema>

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
