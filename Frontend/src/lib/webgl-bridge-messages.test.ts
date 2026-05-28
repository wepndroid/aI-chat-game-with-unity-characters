import test from 'node:test'
import assert from 'node:assert/strict'
import { isWebglLoaderErrorMessage } from './webgl-bridge-messages'

test('isWebglLoaderErrorMessage accepts generic loader error messages only', () => {
  assert.equal(
    isWebglLoaderErrorMessage({
      type: 'secretwaifu-webgl:error',
      code: 'unity-loader-error',
      message: 'The browser game failed to load. Please refresh the page and try again.'
    }),
    true
  )

  assert.equal(
    isWebglLoaderErrorMessage({
      type: 'secretwaifu-webgl:error',
      code: 'https://secretwaifu.com/uploads/game?token=secret',
      message: 'The browser game failed to load.'
    }),
    false
  )

  assert.equal(
    isWebglLoaderErrorMessage({
      type: 'secretwaifu-webgl:error',
      code: 'unity-loader-error',
      message: 'Raw stack trace\nBearer secret'
    }),
    false
  )
})
