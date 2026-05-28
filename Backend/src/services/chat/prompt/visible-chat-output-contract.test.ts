import assert from 'node:assert/strict'
import test from 'node:test'

import { renderVisibleChatOutputContract } from './visible-chat-output-contract'

const disallowedPromptPhrases = [
  'I need to decline this direction',
  'I can engage with adult fiction',
  "I don't write content focused on",
  'This violates policy or guidelines',
  'As an AI',
  "I'll continue the story while following all guidelines",
  'Sure, here is the next response'
]

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

test('renders output rules with the supplied character name only', () => {
  const prompt = renderVisibleChatOutputContract('Mika')

  assert.match(prompt, /Response format rules/i)
  assert.match(prompt, /Write only as Mika/i)
  assert.match(prompt, /brief Mika action/i)
  assert.match(prompt, /A valid animation ID is not enough/i)
  assert.match(prompt, /description must also match the visible beat/i)
  assert.doesNotMatch(prompt, /\bAiri\b/i)
  assert.doesNotMatch(prompt, /\[gesture:Surprised\]/i)
})

test('reserves square brackets for animation tags instead of body-state report parts', () => {
  const prompt = renderVisibleChatOutputContract('Mika')

  assert.match(prompt, /Use square brackets only for supported Unity animation tags/i)
  assert.match(prompt, /Body or clothing state belongs in normal character-owned prose/i)
  assert.match(prompt, /Do not create bracketed labels, report blocks, scene-state fields, or body-state fields/i)
  assert.doesNotMatch(prompt, /\[character body state description\]/i)
  assert.doesNotMatch(prompt, /\[[^\]]*(?:body|clothing|state|description)[^\]]*\]/i)
})

test('allows body and clothing state only as character-owned prose', () => {
  const prompt = renderVisibleChatOutputContract('Mika')

  assert.match(
    prompt,
    /Body or clothing state may be described when it is relevant, current, and owned by Mika's immediate action, emotion, body language, or dialogue/i
  )
  assert.match(
    prompt,
    /In single-asterisk narration, make the grammatical subject Mika, Mika's body language, or neutral visible scene state/i
  )
})

test('does not include copyable meta-refusal or assistant-preface examples', () => {
  const prompt = renderVisibleChatOutputContract('Mika')

  for (const phrase of disallowedPromptPhrases) {
    assert.doesNotMatch(prompt, new RegExp(escapeRegExp(phrase), 'i'))
  }

  assert.doesNotMatch(prompt, /\bAssistant:\s*"\.\.\."/i)
  assert.doesNotMatch(prompt, /\bMika:\s*"\.\.\."/i)
})
