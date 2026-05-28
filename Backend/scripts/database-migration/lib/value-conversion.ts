// Migration lifecycle: final-migration-required support code. Disposal checkpoint: post-cutover repository cleanup with migration-only commands.

type NullableConversionOptions = {
  nullable?: boolean
}

type EnumValueDefinition = {
  name: string
  dbName?: string | null
}

const assertPresent = <T>(value: T | null | undefined, fieldPath: string, options: NullableConversionOptions): T | null => {
  if (value !== null && value !== undefined) {
    return value
  }

  if (options.nullable) {
    return null
  }

  throw new Error(`Missing required value for ${fieldPath}.`)
}

const sqliteBooleanToBoolean = (
  value: unknown,
  fieldPath: string,
  options: NullableConversionOptions = {}
): boolean | null => {
  const presentValue = assertPresent(value, fieldPath, options)
  if (presentValue === null) {
    return null
  }

  if (presentValue === true || presentValue === 1) {
    return true
  }

  if (presentValue === false || presentValue === 0) {
    return false
  }

  throw new Error(`Invalid boolean for ${fieldPath}: ${String(presentValue)}`)
}

const sqliteDateToUtcDate = (value: unknown, fieldPath: string, options: NullableConversionOptions = {}): Date | null => {
  const presentValue = assertPresent(value, fieldPath, options)
  if (presentValue === null) {
    return null
  }

  let date: Date
  if (typeof presentValue === 'number') {
    date = new Date(Math.abs(presentValue) < 1_000_000_000_000 ? presentValue * 1000 : presentValue)
  } else if (typeof presentValue === 'string' && presentValue.trim()) {
    const trimmed = presentValue.trim()
    if (/^-?\d+$/.test(trimmed)) {
      const epochValue = Number(trimmed)
      date = new Date(Math.abs(epochValue) < 1_000_000_000_000 ? epochValue * 1000 : epochValue)
    } else {
      date = new Date(trimmed)
    }
  } else {
    throw new Error(`Invalid date for ${fieldPath}: ${String(presentValue)}`)
  }

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date for ${fieldPath}: ${String(presentValue)}`)
  }

  return date
}

const sqliteJsonTextToPrismaJson = (
  value: unknown,
  fieldPath: string,
  options: NullableConversionOptions = {}
): unknown => {
  const presentValue = assertPresent(value, fieldPath, options)
  if (presentValue === null) {
    return null
  }

  if (typeof presentValue !== 'string') {
    return presentValue
  }

  try {
    return JSON.parse(presentValue)
  } catch (error) {
    throw new Error(`Invalid JSON for ${fieldPath}: ${(error as Error).message}`)
  }
}

const sqliteBigIntToBigInt = (value: unknown, fieldPath: string, options: NullableConversionOptions = {}): bigint | null => {
  const presentValue = assertPresent(value, fieldPath, options)
  if (presentValue === null) {
    return null
  }

  const normalized = typeof presentValue === 'number' ? String(presentValue) : String(presentValue).trim()
  if (!/^-?\d+$/.test(normalized)) {
    throw new Error(`Invalid bigint for ${fieldPath}: ${String(presentValue)}`)
  }

  return BigInt(normalized)
}

const sqliteIntToNumber = (value: unknown, fieldPath: string, options: NullableConversionOptions = {}): number | null => {
  const presentValue = assertPresent(value, fieldPath, options)
  if (presentValue === null) {
    return null
  }

  const numericValue = typeof presentValue === 'number' ? presentValue : Number(String(presentValue).trim())
  if (!Number.isInteger(numericValue)) {
    throw new Error(`Invalid integer for ${fieldPath}: ${String(presentValue)}`)
  }

  return numericValue
}

const sqliteStringToString = (value: unknown, fieldPath: string, options: NullableConversionOptions = {}): string | null => {
  const presentValue = assertPresent(value, fieldPath, options)
  if (presentValue === null) {
    return null
  }

  if (typeof presentValue === 'string') {
    return presentValue
  }

  if (typeof presentValue === 'number' || typeof presentValue === 'boolean' || typeof presentValue === 'bigint') {
    return String(presentValue)
  }

  throw new Error(`Invalid string for ${fieldPath}: ${String(presentValue)}`)
}

const assertKnownEnumValue = (value: unknown, allowedValues: readonly string[], fieldPath: string): string => {
  if (typeof value !== 'string' || !allowedValues.includes(value)) {
    throw new Error(`Invalid enum for ${fieldPath}: ${String(value)}. Allowed values: ${allowedValues.join(', ')}`)
  }

  return value
}

const sqliteEnumToPrismaEnum = (
  value: unknown,
  enumValues: readonly EnumValueDefinition[],
  fieldPath: string,
  options: NullableConversionOptions = {}
): string | null => {
  const presentValue = assertPresent(value, fieldPath, options)
  if (presentValue === null) {
    return null
  }

  if (typeof presentValue !== 'string') {
    throw new Error(`Invalid enum for ${fieldPath}: ${String(presentValue)}`)
  }

  const match = enumValues.find((entry) => entry.name === presentValue || entry.dbName === presentValue)
  if (!match) {
    const allowedValues = enumValues.flatMap((entry) => (entry.dbName ? [entry.name, entry.dbName] : [entry.name]))
    throw new Error(`Invalid enum for ${fieldPath}: ${presentValue}. Allowed values: ${allowedValues.join(', ')}`)
  }

  return match.name
}

export {
  assertKnownEnumValue,
  sqliteBigIntToBigInt,
  sqliteBooleanToBoolean,
  sqliteDateToUtcDate,
  sqliteEnumToPrismaEnum,
  sqliteIntToNumber,
  sqliteJsonTextToPrismaJson,
  sqliteStringToString
}
export type { EnumValueDefinition, NullableConversionOptions }
