import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildDefaultHomepageSuccessMessage,
  getDefaultHomepageFallbackSelectValue,
  hasDefaultHomepageSelection,
  resolveDefaultHomepageLandingPageId,
  resolveDefaultHomepageSelectionValue
} from './default-homepage-selection'
import type { DefaultHomepageResponse } from './landing-page-api'

const fallbackSetting: DefaultHomepageResponse['data'] = {
  landingPage: null,
  fallbackKey: 'home2',
  fallbackPath: '/home2'
}

const concreteSetting: DefaultHomepageResponse['data'] = {
  landingPage: {
    id: 'landing-1',
    key: 'home1',
    name: 'Homepage Variant 1',
    basePath: '/',
    isActive: true
  },
  fallbackKey: 'home2',
  fallbackPath: '/home2'
}

test('default homepage selection maps fallback API state to a non-empty select value and null payload', () => {
  const fallbackValue = getDefaultHomepageFallbackSelectValue()

  assert.equal(resolveDefaultHomepageSelectionValue(fallbackSetting), fallbackValue)
  assert.equal(resolveDefaultHomepageLandingPageId(fallbackValue), null)
  assert.equal(hasDefaultHomepageSelection(fallbackValue), true)
})

test('default homepage selection maps concrete API state to a trimmed landing-page id payload', () => {
  assert.equal(resolveDefaultHomepageSelectionValue(concreteSetting), 'landing-1')
  assert.equal(resolveDefaultHomepageLandingPageId(' landing-1 '), 'landing-1')
  assert.equal(hasDefaultHomepageSelection(' landing-1 '), true)
})

test('default homepage selection rejects missing select state before building the API payload', () => {
  assert.equal(hasDefaultHomepageSelection(''), false)
  assert.throws(() => resolveDefaultHomepageLandingPageId('  '), /Select a landing page or the fallback homepage\./)
})

test('default homepage success message distinguishes concrete selection from fallback reset', () => {
  assert.equal(buildDefaultHomepageSuccessMessage(concreteSetting), 'Default homepage set to Homepage Variant 1.')
  assert.equal(buildDefaultHomepageSuccessMessage(fallbackSetting), 'Default homepage reset to fallback home2.')
})
