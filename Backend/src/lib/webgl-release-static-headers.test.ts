import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveWebglReleaseStaticHeaders } from './webgl-release-static-headers'

test('resolveWebglReleaseStaticHeaders gives index html a short revalidating cache', () => {
  assert.deepEqual(resolveWebglReleaseStaticHeaders('game-releases/webgl/release-1/build/index.html'), {
    'Cache-Control': 'public, max-age=300, must-revalidate',
    'Content-Type': 'text/html; charset=utf-8'
  })
})

test('resolveWebglReleaseStaticHeaders gives immutable cache and encoding to compressed build artifacts', () => {
  assert.deepEqual(resolveWebglReleaseStaticHeaders('/game-releases/webgl/release-1/build/Build/game.wasm.br'), {
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Content-Encoding': 'br',
    'Content-Type': 'application/wasm',
    Vary: 'Accept-Encoding'
  })

  assert.deepEqual(resolveWebglReleaseStaticHeaders('/game-releases/webgl/release-1/build/Build/game.framework.js.gz'), {
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Content-Encoding': 'gzip',
    'Content-Type': 'application/javascript; charset=utf-8',
    Vary: 'Accept-Encoding'
  })

  assert.deepEqual(resolveWebglReleaseStaticHeaders('/game-releases/webgl/release-1/build/Build/game.data.br'), {
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Content-Encoding': 'br',
    'Content-Type': 'application/octet-stream',
    Vary: 'Accept-Encoding'
  })
})

test('resolveWebglReleaseStaticHeaders ignores non-WebGL uploads', () => {
  assert.deepEqual(resolveWebglReleaseStaticHeaders('/voice-clips/sample.wav'), {})
  assert.deepEqual(resolveWebglReleaseStaticHeaders('/game-releases/windows/game.zip'), {})
})
