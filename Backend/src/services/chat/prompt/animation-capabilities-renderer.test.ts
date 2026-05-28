import assert from 'node:assert/strict'
import test from 'node:test'

import { renderAnimationCapabilities } from './animation-capabilities-renderer'
import { type AnimationCapabilities } from './visible-chat-prompt-types'

const makeCapabilities = (overrides: Partial<AnimationCapabilities> = {}): AnimationCapabilities => ({
  contract_version: 1,
  moods: [
    { id: 'shy', description: 'soft shy expression with a cautious gaze' },
    { id: 'warm', description: 'warm affectionate expression' }
  ],
  gestures: [
    { id: 'CoverMouth', description: 'covers mouth or hides embarrassment with one hand' },
    { id: 'ArmsCrossed', description: 'crossed arms, guarded posture, or defensive stance' }
  ],
  big_gestures: [
    { id: 'Surprised', description: 'full-body shock or sudden startled recoil' },
    { id: 'Hug', description: 'steps in for a clear embrace' }
  ],
  example_response: '',
  ...overrides
})

test('renders namespace rules that keep big gestures out of regular gesture tags', () => {
  const prompt = renderAnimationCapabilities(makeCapabilities())

  assert.match(prompt, /Tag namespace contract:/i)
  assert.match(prompt, /Surprised belongs to Valid big gestures/i)
  assert.match(prompt, /must stay a big_gesture tag/i)
  assert.match(prompt, /\[big_gesture:Surprised\]/)
  assert.doesNotMatch(prompt, /\[gesture:Surprised\]/)
})

test('treats overlapping ids as namespace-specific instead of globally interchangeable', () => {
  const prompt = renderAnimationCapabilities(
    makeCapabilities({
      gestures: [
        { id: 'Wave', description: 'small hand wave near the body' },
        { id: 'CoverMouth', description: 'covers mouth or hides embarrassment with one hand' }
      ],
      big_gestures: [
        { id: 'Wave', description: 'large full-body wave that interrupts the scene' },
        { id: 'Surprised', description: 'full-body shock or sudden startled recoil' }
      ]
    })
  )

  assert.match(prompt, /Wave appears in multiple Valid sections/i)
  assert.match(prompt, /namespace-specific/i)
  assert.match(prompt, /small hand wave near the body/)
  assert.match(prompt, /large full-body wave that interrupts the scene/)
})

test('renders semantic-fit rules from capability descriptions instead of id names alone', () => {
  const prompt = renderAnimationCapabilities(makeCapabilities())

  assert.match(prompt, /visible beat matches that tag's description/i)
  assert.match(prompt, /omit the animation tag/i)
  assert.match(prompt, /description conflicts with the ID name/i)
  assert.match(prompt, /If the visible beat matches "covers mouth or hides embarrassment with one hand", use \[gesture:CoverMouth\]/)
  assert.match(prompt, /If the visible beat matches "full-body shock or sudden startled recoil", use \[big_gesture:Surprised\]/)
})

test('encourages matched animation usage without weakening semantic-fit rules', () => {
  const prompt = renderAnimationCapabilities(makeCapabilities())

  assert.match(prompt, /Normal visible replies should usually start with exactly one valid mood tag/i)
  assert.match(
    prompt,
    /while writing each body-language, movement, reaction, or action beat, attach a valid regular gesture tag when a matching ID exists/i
  )
  assert.match(prompt, /expressive multi-beat replies usually contain several regular gestures/i)
  assert.match(prompt, /use a matching tag for each distinct matching beat/i)
  assert.match(prompt, /strong emotional or gameplay turns should usually use one matching big gesture/i)
  assert.match(prompt, /calm or simple replies may use zero big gestures/i)
  assert.match(prompt, /description conflicts with the ID name/i)
  assert.doesNotMatch(prompt, /\[[^\]]*(?:body|clothing|state|description)[^\]]*\]/i)
})

test('does not render hardcoded action examples that contradict supplied descriptions', () => {
  const prompt = renderAnimationCapabilities(makeCapabilities())

  assert.doesNotMatch(prompt, /ArmsCrossed[\s\S]{0,120}shoulders soften/i)
  assert.doesNotMatch(prompt, /ArmsCrossed[\s\S]{0,120}relax/i)
  assert.doesNotMatch(prompt, /richer example/i)
})
