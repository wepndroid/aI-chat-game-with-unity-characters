import assert from 'node:assert/strict'
import test from 'node:test'

import { displayNameFromStoryCharacter } from './visible-chat-context-repository'

test('uses a generic character fallback when story character data is missing', () => {
  assert.equal(displayNameFromStoryCharacter(null), 'the character')
  assert.equal(displayNameFromStoryCharacter({ name: '   ' }), 'the character')
})

test('uses the story character name when it is present', () => {
  assert.equal(displayNameFromStoryCharacter({ name: '  Mika  ' }), 'Mika')
})
