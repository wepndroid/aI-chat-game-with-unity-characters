import test from 'node:test'
import assert from 'node:assert/strict'
import { Prisma } from '@prisma/client'

import {
  buildMarketingEmailSendModeSql,
  buildMarketingEmailSendStatusSql,
  buildMarketingEmailTemplateCategorySql,
  buildMarketingEmailTimestampSql
} from './email-template-service'

const inspectSql = (fragment: Prisma.Sql) => ({
  sql: fragment.sql,
  values: fragment.values
})

test('marketing email raw SQL casts PostgreSQL enum parameters', () => {
  const category = inspectSql(buildMarketingEmailTemplateCategorySql('conversion'))
  const mode = inspectSql(buildMarketingEmailSendModeSql('automation'))
  const status = inspectSql(buildMarketingEmailSendStatusSql('sent'))

  assert.equal(category.sql, '?::"MarketingEmailTemplateCategory"')
  assert.deepEqual(category.values, ['conversion'])
  assert.equal(mode.sql, '?::"MarketingEmailSendMode"')
  assert.deepEqual(mode.values, ['automation'])
  assert.equal(status.sql, '?::"MarketingEmailSendStatus"')
  assert.deepEqual(status.values, ['sent'])
})

test('marketing email raw SQL casts timestamp parameters', () => {
  const createdAt = '2026-05-21T15:47:10.000Z'
  const fragment = inspectSql(buildMarketingEmailTimestampSql(createdAt))

  assert.equal(fragment.sql, '?::timestamptz')
  assert.deepEqual(fragment.values, [createdAt])
})
