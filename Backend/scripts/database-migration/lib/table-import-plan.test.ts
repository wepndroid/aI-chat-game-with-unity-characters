// Migration lifecycle: disposable validation scaffold. Disposal checkpoint: post-cutover repository cleanup with migration-only commands.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildImportPlan,
  getMissingRequiredSourceTables,
  getSourceTablePolicy,
  getUnknownSourceTables
} from './table-import-plan'

test('buildImportPlan imports parent tables before dependent chat data', () => {
  const plan = buildImportPlan()
  const order = new Map(plan.map((entry, index) => [entry.sourceTable, index]))

  assert.ok(order.get('User')! < order.get('ChatSession')!)
  assert.ok(order.get('Character')! < order.get('ChatSession')!)
  assert.ok(order.get('ChatSession')! < order.get('ChatMessage')!)
  assert.ok(order.get('ChatMessageUsage')! < order.get('ChatQuotaReservation')!)
})

test('buildImportPlan imports marketing automations before their recipients', () => {
  const plan = buildImportPlan()
  const order = new Map(plan.map((entry, index) => [entry.sourceTable, index]))

  assert.ok(order.has('MarketingEmailAutomation'))
  assert.ok(order.has('MarketingEmailAutomationRecipient'))
  assert.ok(order.get('MarketingEmailAutomation')! < order.get('MarketingEmailAutomationRecipient')!)
})

test('getSourceTablePolicy marks transient and legacy tables as excluded', () => {
  assert.equal(getSourceTablePolicy('Session')?.mode, 'exclude')
  assert.equal(getSourceTablePolicy('UnityLaunchContext')?.mode, 'exclude')
  assert.equal(getSourceTablePolicy('CharacterChatDailyMetric')?.mode, 'exclude')
  assert.equal(getSourceTablePolicy('ChatPendingTurn')?.mode, 'transform')
  assert.equal(getSourceTablePolicy('User')?.mode, 'import')
})

test('getSourceTablePolicy marks marketing automation tables as optional imports', () => {
  assert.equal(getSourceTablePolicy('MarketingEmailAutomation')?.mode, 'import')
  assert.equal(getSourceTablePolicy('MarketingEmailAutomation')?.optional, true)
  assert.equal(getSourceTablePolicy('MarketingEmailAutomationRecipient')?.mode, 'import')
  assert.equal(getSourceTablePolicy('MarketingEmailAutomationRecipient')?.optional, true)
})

test('getMissingRequiredSourceTables ignores missing optional marketing automation tables', () => {
  const requiredTables = buildImportPlan().filter((entry) => !entry.optional).map((entry) => entry.sourceTable)

  assert.deepEqual(getMissingRequiredSourceTables(requiredTables), [])
})

test('getUnknownSourceTables fails closed on unplanned source tables', () => {
  assert.deepEqual(getUnknownSourceTables(['User', 'sqlite_sequence', 'UnexpectedRuntimeTable']), ['UnexpectedRuntimeTable'])
})
