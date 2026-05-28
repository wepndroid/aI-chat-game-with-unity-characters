/**
 * Process-local background workload policy.
 *
 * PostgreSQL row claims, worker-local in-flight guards, and Prisma transaction
 * budgets now own runtime concurrency. This policy keeps only reusable batch and
 * backoff constants that are not global database critical-section controls.
 */

const databaseWorkloadPolicy = {
  startupBackgroundBatchSize: 100,
  providerAliasBaseBackoffMs: 15_000,
  providerAliasMaxBackoffMs: 120_000,
  backoffJitterRatio: 0.2
} as const

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

const calculateDatabasePressureBackoffMs = (
  pressureAttemptCount: number,
  random: () => number = Math.random
) => {
  const attempt = Math.max(0, pressureAttemptCount)
  const exponentialDelay = databaseWorkloadPolicy.providerAliasBaseBackoffMs * (2 ** attempt)
  const cappedDelay = Math.min(exponentialDelay, databaseWorkloadPolicy.providerAliasMaxBackoffMs)
  const jitter = 1 + clamp(random(), 0, 1) * databaseWorkloadPolicy.backoffJitterRatio
  return Math.min(Math.round(cappedDelay * jitter), databaseWorkloadPolicy.providerAliasMaxBackoffMs)
}

export {
  calculateDatabasePressureBackoffMs,
  databaseWorkloadPolicy
}
