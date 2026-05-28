import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeWebglPreloadManifest,
  shouldStartWebglPreload
} from './webgl-preload'

const validManifest = {
  releaseId: 'release-1',
  versionLabel: 'v0.31',
  runtimeUrl: '/uploads/game-releases/webgl/release-1/build/index.html',
  totalBytes: 10,
  assets: [
    {
      url: '/uploads/game-releases/webgl/release-1/build/Build/game.loader.js',
      kind: 'script',
      bytes: 6,
      priority: 'high'
    },
    {
      url: '/uploads/game-releases/webgl/release-1/build/Build/game.data.br',
      kind: 'data',
      bytes: 4,
      priority: 'high'
    }
  ]
}

test('normalizeWebglPreloadManifest accepts only public uploaded WebGL release assets', () => {
  assert.deepEqual(normalizeWebglPreloadManifest(validManifest), validManifest)

  assert.equal(
    normalizeWebglPreloadManifest({
      ...validManifest,
      assets: [
        {
          url: 'https://evil.example/game.data.br',
          kind: 'data',
          bytes: 1,
          priority: 'high'
        }
      ]
    }),
    null
  )

  assert.equal(
    normalizeWebglPreloadManifest({
      ...validManifest,
      assets: [
        {
          url: '/uploads/game-releases/webgl/%252e%252e/api/auth/me',
          kind: 'data',
          bytes: 1,
          priority: 'high'
        }
      ]
    }),
    null
  )

  assert.equal(
    normalizeWebglPreloadManifest({
      ...validManifest,
      assets: [
        {
          url: '/api/auth/webgl-token',
          kind: 'data',
          bytes: 1,
          priority: 'high'
        }
      ]
    }),
    null
  )

  assert.equal(
    normalizeWebglPreloadManifest({
      ...validManifest,
      assets: [
        {
          url: '/uploads/game-releases/webgl/%2e%2e/api/auth/me',
          kind: 'data',
          bytes: 1,
          priority: 'high'
        }
      ]
    }),
    null
  )

  assert.equal(
    normalizeWebglPreloadManifest({
      ...validManifest,
      runtimeUrl: '/uploads/game-releases/webgl/release-1/build/%ZZ.html'
    }),
    null
  )
})

test('shouldStartWebglPreload gates background work but allows launch-time warming', () => {
  assert.equal(
    shouldStartWebglPreload({
      mode: 'background',
      visibilityState: 'visible',
      saveData: false,
      effectiveType: '4g',
      deviceMemory: 8
    }),
    true
  )

  assert.equal(
    shouldStartWebglPreload({
      mode: 'background',
      visibilityState: 'hidden',
      saveData: false,
      effectiveType: '4g',
      deviceMemory: 8
    }),
    false
  )

  assert.equal(
    shouldStartWebglPreload({
      mode: 'background',
      visibilityState: 'visible',
      saveData: true,
      effectiveType: '4g',
      deviceMemory: 8
    }),
    false
  )

  assert.equal(
    shouldStartWebglPreload({
      mode: 'background',
      visibilityState: 'visible',
      saveData: false,
      effectiveType: '2g',
      deviceMemory: 8
    }),
    false
  )

  assert.equal(
    shouldStartWebglPreload({
      mode: 'launch',
      visibilityState: 'hidden',
      saveData: true,
      effectiveType: '2g',
      deviceMemory: 1
    }),
    true
  )
})
