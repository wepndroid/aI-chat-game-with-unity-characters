// Migration lifecycle: final-migration-required support code. Disposal checkpoint: post-cutover repository cleanup with migration-only commands.
import { redactLogText } from '../../../src/lib/log-redaction'

const REDACTED_VALUE = '[REDACTED]'

const secretKeyPattern =
  /authorization|cookie|api[-_]?key|apikey|token|secret|password|pass|credential|databaseurl|database_url|shadowdatabaseurl|shadow_database_url|connectionstring|connection_string/i

const redactText = (value: string) => redactLogText(value)

const redactMigrationValue = (value: unknown): unknown => {
  if (typeof value === 'string') {
    return redactText(value)
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactMigrationValue(entry))
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (value && typeof value === 'object') {
    const redactedObject: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value)) {
      redactedObject[key] =
        secretKeyPattern.test(key) && (typeof entry === 'string' || (entry !== null && typeof entry === 'object'))
          ? REDACTED_VALUE
          : redactMigrationValue(entry)
    }
    return redactedObject
  }

  return value
}

const redactLocalPath = (pathValue: string, showLocalPaths: boolean) => (showLocalPaths ? pathValue : '[LOCAL_PATH_REDACTED]')

export { REDACTED_VALUE, redactLocalPath, redactMigrationValue, redactText }
