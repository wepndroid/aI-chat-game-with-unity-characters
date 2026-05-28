import assert from 'node:assert/strict'
import test from 'node:test'

import { sanitizeVisibleAssistantHistoryForPrompt } from './visible-chat-history-sanitizer'

test('removes leading meta-refusal preamble and keeps the in-character continuation', () => {
  const sanitized = sanitizeVisibleAssistantHistoryForPrompt(
    'I need to decline this direction. I can engage with adult fiction, but not that.\n\n[mood:shy] *Mika pulls back, voice unsteady.* "Please stop. I need a moment."'
  )

  assert.equal(
    sanitized.text,
    '[mood:shy] *Mika pulls back, voice unsteady.* "Please stop. I need a moment."'
  )
  assert.equal(sanitized.bRemovedMetaRefusalPreamble, true)
  assert.equal(sanitized.bDroppedHistoryRow, false)
  assert.equal(sanitized.bRecoveredContinuation, true)
})

test('drops assistant history that contains only meta-refusal text', () => {
  const sanitized = sanitizeVisibleAssistantHistoryForPrompt(
    "I don't write content focused on that. This violates policy or guidelines."
  )

  assert.equal(sanitized.text, '')
  assert.equal(sanitized.bRemovedMetaRefusalPreamble, true)
  assert.equal(sanitized.bDroppedHistoryRow, true)
  assert.equal(sanitized.bRecoveredContinuation, false)
})

test('preserves valid in-character boundary dialogue', () => {
  const text = '[mood:shy] *Mika shifts away, trying to steady their breathing.* "Not like that. Stay with me for a second."'
  const sanitized = sanitizeVisibleAssistantHistoryForPrompt(text)

  assert.equal(sanitized.text, text)
  assert.equal(sanitized.bRemovedMetaRefusalPreamble, false)
  assert.equal(sanitized.bDroppedHistoryRow, false)
  assert.equal(sanitized.bRecoveredContinuation, false)
})
