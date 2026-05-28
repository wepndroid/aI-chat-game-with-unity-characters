import { Prisma } from '@prisma/client'

type PostgresJsonbInput = string | null
type PostgresTimestamptzInput = string | Date | null

const POSTGRES_ENUM_TYPE_NAMES = [
  'CharacterStatus',
  'CharacterVisibility',
  'ChatPendingTurnKind',
  'ChatPendingTurnStatus',
  'GameReleasePlatform',
  'MarketingEmailSendMode',
  'MarketingEmailSendStatus',
  'MarketingEmailTemplateCategory',
  'PatreonSyncLogLevel',
  'UserRole'
] as const

type PostgresEnumTypeName = (typeof POSTGRES_ENUM_TYPE_NAMES)[number]

const POSTGRES_ENUM_TYPE_NAME_SET = new Set<string>(POSTGRES_ENUM_TYPE_NAMES)
const POSTGRES_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

const quotePostgresIdentifier = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`

/**
 * Builds a typed JSONB value for Prisma raw SQL.
 *
 * Prisma binds JavaScript strings as PostgreSQL text parameters; raw SQL writes
 * to jsonb columns therefore need an explicit database-side cast. Keeping this
 * in one module prevents feature services from owning PostgreSQL binding rules.
 */
const postgresJsonbValue = (value: PostgresJsonbInput) => Prisma.sql`${value}::jsonb`

/**
 * Builds a typed timestamptz value for Prisma raw SQL.
 *
 * This keeps ISO string timestamps usable in raw statements without relying on
 * PostgreSQL's literal coercion, which does not apply to typed text parameters.
 */
const postgresTimestamptzValue = (value: PostgresTimestamptzInput) => Prisma.sql`${value}::timestamptz`

/**
 * Casts a bound value to a Prisma-owned PostgreSQL enum type.
 *
 * Enum type names cannot be parameterized, so this helper is intentionally
 * backed by a static allow-list from the Prisma schema. Callers pass only the
 * enum value; this module owns the SQL type-name interpolation.
 */
const postgresEnumValue = (value: string, enumTypeName: string) => {
  if (!POSTGRES_ENUM_TYPE_NAME_SET.has(enumTypeName)) {
    throw new Error(`PostgreSQL enum type is not allow-listed: ${enumTypeName}`)
  }

  return Prisma.sql`${value}::${Prisma.raw(quotePostgresIdentifier(enumTypeName))}`
}

/**
 * Returns a quoted SQL identifier from a caller-supplied allow-list.
 *
 * Identifiers cannot be bound parameters. Use this only for internal query
 * modules where a dynamic column/table name is unavoidable and every accepted
 * identifier is code-owned, not user-controlled.
 */
const postgresIdentifier = <T extends string>(identifier: string, allowedIdentifiers: readonly T[]) => {
  if (!POSTGRES_IDENTIFIER_PATTERN.test(identifier)) {
    throw new Error(`PostgreSQL identifier is invalid: ${identifier}`)
  }

  if (!allowedIdentifiers.includes(identifier as T)) {
    throw new Error(`PostgreSQL identifier is not allow-listed: ${identifier}`)
  }

  return Prisma.raw(quotePostgresIdentifier(identifier))
}

export {
  postgresEnumValue,
  postgresIdentifier,
  postgresJsonbValue,
  postgresTimestamptzValue,
  POSTGRES_ENUM_TYPE_NAMES
}
export type { PostgresEnumTypeName, PostgresJsonbInput, PostgresTimestamptzInput }
