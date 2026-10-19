---
title: Flaky and broken tests
description: How kinora tells a flaky test from a broken one, with or without retries.
---

The Tests and Components pages of a project flag each test (or story) that needs a look as
**Flaky** or **Broken**, over its last 20 runs. Hover the badge to see why; the page of a test
shows the same reason under its rates.

The two call for different actions:

- A **flaky** test passes and fails on the same code. Stabilize it, or quarantine it while you do
  so the rest of the suite stays readable.
- A **broken** test fails and keeps failing: a change broke it. Fix the code or the test.
  Quarantining it would hide a real failure.

## Flaky

A test is flaky when, over its last 20 runs, it:

1. **Passed and failed on the same commit.** The code did not change, the outcome did: the
   surest sign. It shows up when CI runs a commit more than once, for example a rerun, or a branch
   and its pull request building the same commit. kinora needs the commit of each run: the
   [reporter](/guides/reporter/) and the [CLI](/guides/cli/) read it from the CI environment.
2. **Needed a retry to pass.** This is Playwright's own `flaky` status (and Vitest's, with
   `retry` set): the test failed, then passed on a retry within the same run. A test that failed,
   then passed when you re-ran its shard in CI counts too: kinora keeps it as flaky, and marks it
   "passed on re-run" in the PR comment (see [Sharded runs](/guides/reporter/#sharded-runs)).
3. **Keeps flipping between pass and fail**, at least 3 times. Vitest runs without retries by
   default, so a flaky test there never gets a `flaky` status: it passes one run and fails the
   next. One bad run between two good ones is not enough, since that is often a regression the
   next commit fixed.

## Broken

A test is broken when its latest run failed and it is not flaky, or when it failed its last 3
runs (even if it flaked before, it no longer passes). The page of the test links to the first
failing run of that streak and names its commit, where the breakage started.

## New failures and new flakiness

On top of that, the Tests page marks a test **New failure** or **New flakiness** when it started
failing or flaking in its last 5 runs, without doing so before. These are the ones a recent
change most likely caused.

## Filters

Each page filters on **Needs attention** (flaky or broken, the default of the Tests page),
**Flaky**, or **Broken**. The filter is part of the URL, so a copied link opens the same list.

[Coding agents](/guides/mcp/) read the same verdicts: `test_history` and `component_health` return
a `health` of `stable`, `flaky` or `broken` with its reason.
