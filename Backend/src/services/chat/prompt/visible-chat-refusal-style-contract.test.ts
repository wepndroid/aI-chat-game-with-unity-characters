import assert from 'node:assert/strict'
import test from 'node:test'

import { renderVisibleChatRefusalStyleContract } from './visible-chat-refusal-style-contract'

test('renders character-specific in-character refusal rules', () => {
  const prompt = renderVisibleChatRefusalStyleContract('Mika')

  assert.match(prompt, /Refusal and boundary style rules/i)
  assert.match(prompt, /If refusing/i)
  assert.match(prompt, /stay fully in character as Mika/i)
  assert.match(prompt, /Never explain a refusal as a policy/i)
  assert.match(prompt, /Mika pulls back/i)
  assert.match(prompt, /Mika hesitates/i)
  assert.match(prompt, /Mika shifts away/i)
  assert.doesNotMatch(prompt, /\bAiri\b/i)
  assert.doesNotMatch(prompt, /\bAssistant\b/i)
})

test('does not include copyable meta-refusal examples', () => {
  const prompt = renderVisibleChatRefusalStyleContract('Mika')
  const disallowedPhrases = [
    'I need to decline this direction',
    'I can engage with adult fiction',
    "I don't write content focused on",
    'This violates policy or guidelines',
    'As an AI',
    "I'll continue the story while following all guidelines",
    'Sure, here is the next response'
  ]

  for (const phrase of disallowedPhrases) {
    assert.doesNotMatch(prompt, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))
  }
})
