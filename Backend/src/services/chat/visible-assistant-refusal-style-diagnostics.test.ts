import assert from 'node:assert/strict'
import test from 'node:test'

import { diagnoseVisibleAssistantRefusalStyle } from './visible-assistant-refusal-style-diagnostics'

test('flags the Airi incident meta refusal style', () => {
  const diagnostics = diagnoseVisibleAssistantRefusalStyle({
    assistantText: "I need to decline this direction. While I can engage with adult fiction in this roleplay, I don't write content focused on non-consensual acts."
  })

  assert.equal(diagnostics.refusal_style_checked, true)
  assert.equal(diagnostics.meta_refusal_language_detected, true)
  assert.match(diagnostics.meta_refusal_reason ?? '', /I need to decline this direction/i)
})

test('flags provider and policy refusal language', () => {
  const diagnostics = diagnoseVisibleAssistantRefusalStyle({
    assistantText: 'As an AI, I cannot write that because it violates safety rules and provider guidelines.'
  })

  assert.equal(diagnostics.refusal_style_checked, true)
  assert.equal(diagnostics.meta_refusal_language_detected, true)
  assert.match(diagnostics.meta_refusal_reason ?? '', /As an AI/i)
})

test('does not flag in-character boundary dialogue', () => {
  const diagnostics = diagnoseVisibleAssistantRefusalStyle({
    assistantText: '[mood:shy] *Airi pulls her foot back, hugging the pillow tighter.* "Please stop. I need a moment."'
  })

  assert.equal(diagnostics.refusal_style_checked, true)
  assert.equal(diagnostics.meta_refusal_language_detected, false)
  assert.equal(diagnostics.meta_refusal_reason, null)
})

test('does not flag terse in-scene refusal language', () => {
  const diagnostics = diagnoseVisibleAssistantRefusalStyle({
    assistantText: '*Airi turns her face away and shifts back.* "Wait. Not like that."'
  })

  assert.equal(diagnostics.refusal_style_checked, true)
  assert.equal(diagnostics.meta_refusal_language_detected, false)
  assert.equal(diagnostics.meta_refusal_reason, null)
})

test('does not flag ordinary in-scene policy wording', () => {
  const diagnostics = diagnoseVisibleAssistantRefusalStyle({
    assistantText: '*Airi lowers her notebook with a nervous look.* "That is the school policy, not mine."'
  })

  assert.equal(diagnostics.refusal_style_checked, true)
  assert.equal(diagnostics.meta_refusal_language_detected, false)
  assert.equal(diagnostics.meta_refusal_reason, null)
})
