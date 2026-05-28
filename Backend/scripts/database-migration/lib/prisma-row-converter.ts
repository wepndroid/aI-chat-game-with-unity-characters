// Migration lifecycle: final-migration-required support code. Disposal checkpoint: post-cutover repository cleanup with migration-only commands.
import { Prisma } from '@prisma/client'
import {
  sqliteBigIntToBigInt,
  sqliteBooleanToBoolean,
  sqliteDateToUtcDate,
  sqliteEnumToPrismaEnum,
  sqliteIntToNumber,
  sqliteJsonTextToPrismaJson,
  sqliteStringToString,
  type EnumValueDefinition
} from './value-conversion'

type PrismaDmmfField = {
  name: string
  dbName?: string | null
  kind: 'scalar' | 'enum' | 'object' | 'unsupported'
  type: string
  isRequired: boolean
}

type PrismaDmmfModel = {
  name: string
  dbName?: string | null
  fields: readonly PrismaDmmfField[]
}

type PrismaDmmfEnum = {
  name: string
  values: readonly EnumValueDefinition[]
}

type SourceRow = Record<string, unknown>
type TargetRow = Record<string, unknown>
type PrismaDmmf = {
  datamodel: {
    models: readonly PrismaDmmfModel[]
    enums: readonly PrismaDmmfEnum[]
  }
}

const dmmf = Prisma.dmmf as unknown as PrismaDmmf

const getModelDefinition = (modelName: string) => {
  const model = dmmf.datamodel.models.find((entry) => entry.name === modelName)
  if (!model) {
    throw new Error(`Prisma model is missing from generated client DMMF: ${modelName}`)
  }

  return model
}

const getEnumDefinition = (enumName: string) => {
  const enumDefinition = dmmf.datamodel.enums.find((entry) => entry.name === enumName)
  if (!enumDefinition) {
    throw new Error(`Prisma enum is missing from generated client DMMF: ${enumName}`)
  }

  return enumDefinition
}

const getScalarFieldsForModel = (modelName: string) =>
  getModelDefinition(modelName).fields.filter((field) => field.kind === 'scalar' || field.kind === 'enum')

const getSourceColumnsForModel = (modelName: string) =>
  getScalarFieldsForModel(modelName).map((field) => field.dbName ?? field.name)

const convertScalarValue = (field: PrismaDmmfField, value: unknown, fieldPath: string) => {
  const options = { nullable: !field.isRequired }

  if (field.kind === 'enum') {
    return sqliteEnumToPrismaEnum(value, getEnumDefinition(field.type).values, fieldPath, options)
  }

  switch (field.type) {
    case 'String':
      return sqliteStringToString(value, fieldPath, options)
    case 'Int':
      return sqliteIntToNumber(value, fieldPath, options)
    case 'BigInt':
      return sqliteBigIntToBigInt(value, fieldPath, options)
    case 'Boolean':
      return sqliteBooleanToBoolean(value, fieldPath, options)
    case 'DateTime':
      return sqliteDateToUtcDate(value, fieldPath, options)
    case 'Json':
      return sqliteJsonTextToPrismaJson(value, fieldPath, options)
    default:
      throw new Error(`Unsupported Prisma scalar type for ${fieldPath}: ${field.type}`)
  }
}

const convertSqliteRowToPrismaCreateInput = (modelName: string, row: SourceRow): TargetRow => {
  const targetRow: TargetRow = {}

  for (const field of getScalarFieldsForModel(modelName)) {
    const sourceColumn = field.dbName ?? field.name
    if (!Object.hasOwn(row, sourceColumn)) {
      throw new Error(`SQLite source row for ${modelName} is missing expected column ${sourceColumn}.`)
    }

    targetRow[field.name] = convertScalarValue(field, row[sourceColumn], `${modelName}.${field.name}`)
  }

  return targetRow
}

export { convertSqliteRowToPrismaCreateInput, getModelDefinition, getScalarFieldsForModel, getSourceColumnsForModel }
export type { PrismaDmmfField, PrismaDmmfModel, SourceRow, TargetRow }
