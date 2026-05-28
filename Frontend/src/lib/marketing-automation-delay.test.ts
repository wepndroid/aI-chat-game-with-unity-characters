import assert from 'node:assert/strict'
import test from 'node:test'

import {
  MARKETING_AUTOMATION_MAX_DELAY_HOURS,
  formatMarketingAutomationDelayHours,
  resolveMarketingAutomationDelayHours
} from './marketing-automation-delay'

test('marketing automation delay resolves negative days to zero hours', () => {
  const resolvedHours = resolveMarketingAutomationDelayHours('-1', 'days')

  assert.equal(resolvedHours, 0)
  assert.equal(formatMarketingAutomationDelayHours(resolvedHours), '0 hours')
})

test('marketing automation delay resolves fractional days to the exact submitted hour payload', () => {
  const resolvedHours = resolveMarketingAutomationDelayHours('1.5', 'days')

  assert.equal(resolvedHours, 36)
  assert.equal(formatMarketingAutomationDelayHours(resolvedHours), '36 hours')
})

test('marketing automation delay resolves invalid input to zero hours', () => {
  const resolvedHours = resolveMarketingAutomationDelayHours('not-a-number', 'hours')

  assert.equal(resolvedHours, 0)
  assert.equal(formatMarketingAutomationDelayHours(resolvedHours), '0 hours')
})

test('marketing automation delay formats zero and singular hour values', () => {
  assert.equal(formatMarketingAutomationDelayHours(0), '0 hours')
  assert.equal(formatMarketingAutomationDelayHours(1), '1 hour')
})

test('marketing automation delay formats whole positive days when hours are day-aligned', () => {
  const resolvedHours = resolveMarketingAutomationDelayHours('1', 'days')

  assert.equal(resolvedHours, 24)
  assert.equal(formatMarketingAutomationDelayHours(resolvedHours), '1 day')
})

test('marketing automation delay clamps maximum overrun to the backend delay contract', () => {
  const resolvedHours = resolveMarketingAutomationDelayHours('3651', 'days')

  assert.equal(resolvedHours, MARKETING_AUTOMATION_MAX_DELAY_HOURS)
  assert.equal(resolvedHours, 87600)
  assert.equal(formatMarketingAutomationDelayHours(resolvedHours), '3,650 days')
})
