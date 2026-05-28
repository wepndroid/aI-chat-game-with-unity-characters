import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { buildWebglReleasePreloadManifest } from './webgl-release-preload-manifest'

const createReleaseFixture = async (indexHtml: string) => {
  const uploadsRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'webgl-preload-'))
  const releaseRoot = path.join(uploadsRoot, 'game-releases', 'webgl', 'release-1')
  const buildRoot = path.join(releaseRoot, 'build')
  const unityBuildRoot = path.join(buildRoot, 'Build')

  await fs.mkdir(unityBuildRoot, { recursive: true })
  await fs.writeFile(path.join(buildRoot, 'index.html'), indexHtml, 'utf8')
  await fs.writeFile(path.join(unityBuildRoot, 'game.loader.js'), 'loader')
  await fs.writeFile(path.join(unityBuildRoot, 'game.framework.js.br'), 'framework')
  await fs.writeFile(path.join(unityBuildRoot, 'game.wasm.br'), 'wasm')
  await fs.writeFile(path.join(unityBuildRoot, 'game.data.br'), 'data')
  await fs.writeFile(path.join(unityBuildRoot, 'game.symbols.json.br'), 'symbols')

  return {
    uploadsRoot,
    storagePath: 'game-releases/webgl/release-1'
  }
}

const unityIndexHtml = (unityConfigObjectLiteral: string) => `<!doctype html>
<html>
  <head><title>SecretWaifu</title></head>
  <body>
    <canvas id="unity-canvas"></canvas>
    <script src="Build/game.loader.js"></script>
    <script>
      createUnityInstance(document.querySelector("#unity-canvas"), ${unityConfigObjectLiteral});
    </script>
  </body>
</html>`

test('buildWebglReleasePreloadManifest derives safe public Unity build assets from the uploaded release', async () => {
  const fixture = await createReleaseFixture(
    unityIndexHtml(
      `{
        dataUrl: "Build/game.data.br",
        frameworkUrl: "Build/game.framework.js.br",
        codeUrl: "Build/game.wasm.br",
        symbolsUrl: "Build/game.symbols.json.br"
      }`
    )
  )

  const manifest = await buildWebglReleasePreloadManifest({
    releaseId: 'release-1',
    versionLabel: 'v0.31',
    runtimeUrl: 'https://secretwaifu.com/uploads/game-releases/webgl/release-1/build/index.html',
    storagePath: fixture.storagePath,
    uploadsRoot: fixture.uploadsRoot
  })

  assert.equal(manifest.releaseId, 'release-1')
  assert.equal(manifest.versionLabel, 'v0.31')
  assert.equal(manifest.runtimeUrl, '/uploads/game-releases/webgl/release-1/build/index.html')
  assert.deepEqual(
    manifest.assets.map((asset) => [asset.kind, asset.url, asset.bytes, asset.priority]),
    [
      ['script', '/uploads/game-releases/webgl/release-1/build/Build/game.loader.js', 6, 'high'],
      ['script', '/uploads/game-releases/webgl/release-1/build/Build/game.framework.js.br', 9, 'high'],
      ['wasm', '/uploads/game-releases/webgl/release-1/build/Build/game.wasm.br', 4, 'high'],
      ['data', '/uploads/game-releases/webgl/release-1/build/Build/game.data.br', 4, 'high'],
      ['symbols', '/uploads/game-releases/webgl/release-1/build/Build/game.symbols.json.br', 7, 'medium']
    ]
  )
  assert.equal(manifest.totalBytes, 30)
})

test('buildWebglReleasePreloadManifest omits missing optional symbols without dropping core assets', async () => {
  const fixture = await createReleaseFixture(
    unityIndexHtml('{ dataUrl: "Build/game.data.br", frameworkUrl: "Build/game.framework.js.br", codeUrl: "Build/game.wasm.br", symbolsUrl: "Build/missing.symbols.json.br" }')
  )

  const manifest = await buildWebglReleasePreloadManifest({
    releaseId: 'release-1',
    versionLabel: 'v0.31',
    runtimeUrl: '/uploads/game-releases/webgl/release-1/build/index.html',
    storagePath: fixture.storagePath,
    uploadsRoot: fixture.uploadsRoot
  })

  assert.deepEqual(manifest.assets.map((asset) => asset.kind), ['script', 'script', 'wasm', 'data'])
})

test('buildWebglReleasePreloadManifest rejects external and traversal Unity asset paths', async () => {
  const externalFixture = await createReleaseFixture(
    unityIndexHtml('{ dataUrl: "https://evil.example/game.data.br", frameworkUrl: "Build/game.framework.js.br", codeUrl: "Build/game.wasm.br" }')
  )
  const traversalFixture = await createReleaseFixture(
    unityIndexHtml('{ dataUrl: "../private.data.br", frameworkUrl: "Build/game.framework.js.br", codeUrl: "Build/game.wasm.br" }')
  )
  const encodedTraversalFixture = await createReleaseFixture(
    unityIndexHtml('{ dataUrl: "Build/%2e%2e/private.data.br", frameworkUrl: "Build/game.framework.js.br", codeUrl: "Build/game.wasm.br" }')
  )

  await assert.rejects(
    buildWebglReleasePreloadManifest({
      releaseId: 'release-1',
      versionLabel: 'v0.31',
      runtimeUrl: '/uploads/game-releases/webgl/release-1/build/index.html',
      storagePath: externalFixture.storagePath,
      uploadsRoot: externalFixture.uploadsRoot
    }),
    /external URLs/
  )

  await assert.rejects(
    buildWebglReleasePreloadManifest({
      releaseId: 'release-1',
      versionLabel: 'v0.31',
      runtimeUrl: '/uploads/game-releases/webgl/release-1/build/index.html',
      storagePath: traversalFixture.storagePath,
      uploadsRoot: traversalFixture.uploadsRoot
    }),
    /outside the WebGL release/
  )

  await assert.rejects(
    buildWebglReleasePreloadManifest({
      releaseId: 'release-1',
      versionLabel: 'v0.31',
      runtimeUrl: '/uploads/game-releases/webgl/release-1/build/index.html',
      storagePath: encodedTraversalFixture.storagePath,
      uploadsRoot: encodedTraversalFixture.uploadsRoot
    }),
    /outside the WebGL release/
  )
})

test('buildWebglReleasePreloadManifest rejects unsafe runtime URL encodings', async () => {
  const fixture = await createReleaseFixture(
    unityIndexHtml('{ dataUrl: "Build/game.data.br", frameworkUrl: "Build/game.framework.js.br", codeUrl: "Build/game.wasm.br" }')
  )

  await assert.rejects(
    buildWebglReleasePreloadManifest({
      releaseId: 'release-1',
      versionLabel: 'v0.31',
      runtimeUrl: '/uploads/game-releases/webgl/%2e%2e/api/auth/me',
      storagePath: fixture.storagePath,
      uploadsRoot: fixture.uploadsRoot
    }),
    /public uploaded WebGL release/
  )

  await assert.rejects(
    buildWebglReleasePreloadManifest({
      releaseId: 'release-1',
      versionLabel: 'v0.31',
      runtimeUrl: '/uploads/game-releases/webgl/%252e%252e/api/auth/me',
      storagePath: fixture.storagePath,
      uploadsRoot: fixture.uploadsRoot
    }),
    /public uploaded WebGL release/
  )
})
