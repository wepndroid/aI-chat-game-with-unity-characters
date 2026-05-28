import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildEmbeddedWebglIndexHtml,
  normalizeWebglParentOrigin,
  resolveWebglParentOrigins
} from './webgl-index-instrumentation'

test('normalizeWebglParentOrigin accepts exact http and https origins only', () => {
  assert.equal(normalizeWebglParentOrigin('https://secretwaifu.com/'), 'https://secretwaifu.com')
  assert.equal(normalizeWebglParentOrigin('http://localhost:7000'), 'http://localhost:7000')
  assert.equal(normalizeWebglParentOrigin('https://secretwaifu.com/play'), null)
  assert.equal(normalizeWebglParentOrigin('https://secretwaifu.com?x=1'), null)
  assert.equal(normalizeWebglParentOrigin('*'), null)
  assert.equal(normalizeWebglParentOrigin('file:///tmp/build/index.html'), null)
})

test('resolveWebglParentOrigins prefers explicit WEBGL_PARENT_ORIGINS', () => {
  const origins = resolveWebglParentOrigins({
    env: {
      NODE_ENV: 'production',
      WEBGL_PARENT_ORIGINS: 'https://secretwaifu.com/,https://secretwaifu.com,http://localhost:7000',
      FRONTEND_URL: 'https://fallback.example',
      CORS_ORIGIN: 'https://dev.example'
    }
  })

  assert.deepEqual(origins, ['https://secretwaifu.com', 'http://localhost:7000'])
})

test('resolveWebglParentOrigins falls back to frontend and dev CORS origins outside production', () => {
  const origins = resolveWebglParentOrigins({
    env: {
      NODE_ENV: 'development',
      FRONTEND_URL: 'https://frontend.example',
      CORS_ORIGIN: 'http://127.0.0.1:7000,http://localhost:7000'
    }
  })

  assert.deepEqual(origins, ['https://frontend.example', 'http://127.0.0.1:7000', 'http://localhost:7000'])
})

test('resolveWebglParentOrigins fails closed in production without a parent origin', () => {
  assert.throws(
    () =>
      resolveWebglParentOrigins({
        env: {
          NODE_ENV: 'production'
        }
      }),
    /WEBGL_PARENT_ORIGINS must be configured/
  )
})

test('resolveWebglParentOrigins rejects invalid configured origins', () => {
  assert.throws(
    () =>
      resolveWebglParentOrigins({
        env: {
          NODE_ENV: 'production',
          WEBGL_PARENT_ORIGINS: 'https://secretwaifu.com/play'
        }
      }),
    /invalid WebGL parent origin/
  )
})

test('buildEmbeddedWebglIndexHtml hardens the browser bridge', () => {
  const html = buildEmbeddedWebglIndexHtml({
    title: 'SecretWaifu',
    loaderScriptPath: 'Build/game.loader.js',
    unityConfigObjectLiteral: '{ dataUrl: "Build/game.data", frameworkUrl: "Build/game.framework.js", codeUrl: "Build/game.wasm" }',
    allowedParentOrigins: ['https://secretwaifu.com']
  })

  assert.match(html, /"https:\/\/secretwaifu\.com"/)
  assert.match(html, /event\.source !== window\.parent/)
  assert.match(html, /isAllowedParentOrigin\(event\.origin\)/)
  assert.match(html, /isFutureTimestamp\(data\.expiresAt\)/)
  assert.match(html, /data\.tokenType !== "Bearer"/)
  assert.match(html, /data\.type === "secretwaifu-auth:api-token"/)
  assert.match(html, /data\.type === "secretwaifu-auth:api-token-refresh"/)
  assert.match(html, /data\.type === "secretwaifu-webgl:launch-token"/)
  assert.match(html, /receiverPayload = JSON\.stringify\(\{/)
  assert.match(html, /ReceiveWebGlApiToken/)
  assert.match(html, /ReceiveWebGlApiRefreshToken/)
  assert.match(html, /ReceiveWebGlLaunchToken/)
  assert.match(html, /window\.SecretWaifuWebglBridge = \{/)
  assert.match(html, /postAuthSessionReady: function \(expiresAt\)/)
  assert.match(html, /typeof expiresAt !== "string" \|\| expiresAt\.length === 0/)
  assert.match(html, /postToParent\("auth-session-ready", \{ expiresAt: expiresAt \}\)/)
  assert.match(html, /postToParent\("error", \{/)
  assert.match(html, /code: "unity-loader-error"/)
  assert.match(html, /message: "The browser game failed to load\. Please refresh the page and try again\."/)
  assert.doesNotMatch(html, /postMessage\([\s\S]*,\s*["']\*["']\s*\)/)
  assert.doesNotMatch(html, /secretwaifu-auth:user/)
  assert.doesNotMatch(html, /ReceiveWebGlUserJson/)
  assert.doesNotMatch(html, /SecretWaifuWebglBridge[\s\S]*postMessage/)
})
