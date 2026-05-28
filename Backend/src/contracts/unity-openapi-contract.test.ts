import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

type OpenApiOperation = {
  requestBody?: unknown
  responses?: Record<string, unknown>
}

type OpenApiDocument = {
  servers?: Array<{ url?: string }>
  paths?: Record<string, Record<string, OpenApiOperation>>
  components?: {
    schemas?: Record<string, unknown>
  }
}

const readOpenApiDocument = (): OpenApiDocument => {
  const raw = readFileSync(path.resolve(process.cwd(), 'docs/unity-api.openapi.json'), 'utf8')
  return JSON.parse(raw) as OpenApiDocument
}

const normalizeServerPrefix = (document: OpenApiDocument) => {
  const serverUrl = document.servers?.[0]?.url ?? ''
  return serverUrl === '/' ? '' : serverUrl.replace(/\/$/, '')
}

const getOperation = (document: OpenApiDocument, method: string, fullPath: string) => {
  const serverPrefix = normalizeServerPrefix(document)
  const pathWithoutServer =
    serverPrefix.length > 0 && fullPath.startsWith(`${serverPrefix}/`)
      ? fullPath.slice(serverPrefix.length)
      : fullPath
  return document.paths?.[fullPath]?.[method] ?? document.paths?.[pathWithoutServer]?.[method] ?? null
}

const stringify = (value: unknown) => JSON.stringify(value)

test('OpenAPI snapshot declares the cutover-critical Unity route surfaces', () => {
  const document = readOpenApiDocument()
  const expectedRoutes = [
    ['post', '/api/auth/unity-token'],
    ['post', '/api/auth/webgl-launch-context/resolve'],
    ['get', '/api/characters'],
    ['get', '/api/characters/{character_id}/stories'],
    ['get', '/api/stories/{story_id}/sessions'],
    ['post', '/api/sessions'],
    ['post', '/api/chat/send'],
    ['post', '/api/chat/gameplay-send'],
    ['get', '/api/chat/quota/status'],
    ['post', '/api/unity/llm/structured-generate'],
    ['post', '/api/tts/request'],
    ['get', '/api/tts/stream/{voice_task_id}']
  ] as const

  for (const [method, route] of expectedRoutes) {
    assert.notEqual(getOperation(document, method, route), null, `${method.toUpperCase()} ${route} is not documented`)
  }
})

test('OpenAPI snapshot documents Unity chat and gameplay request contract fields', () => {
  const document = readOpenApiDocument()
  const chatOperation = getOperation(document, 'post', '/api/chat/send')
  const gameplayOperation = getOperation(document, 'post', '/api/chat/gameplay-send')

  assert.ok(chatOperation)
  assert.ok(gameplayOperation)

  const chatRequestBody = stringify(chatOperation.requestBody)
  const gameplayRequestBody = stringify(gameplayOperation.requestBody)
  const unityRuntimeContextSchema = stringify(document.components?.schemas?.UnityRuntimeContext)
  const animationCapabilitiesSchema = stringify(document.components?.schemas?.AnimationCapabilities)

  assert.match(chatRequestBody, /unity_runtime_context/)
  assert.match(chatRequestBody, /animation_capabilities/)
  assert.match(chatRequestBody, /client_message_id/)
  assert.match(gameplayRequestBody, /unity_runtime_context/)
  assert.match(gameplayRequestBody, /animation_capabilities/)
  assert.match(gameplayRequestBody, /client_event_id/)
  assert.match(unityRuntimeContextSchema, /contract_version/)
  assert.match(unityRuntimeContextSchema, /2/)
  assert.match(animationCapabilitiesSchema, /contract_version/)
  assert.match(animationCapabilitiesSchema, /1/)
})

test('OpenAPI snapshot documents task-scoped TTS stream credentials only on backend responses', () => {
  const document = readOpenApiDocument()
  const ttsRequestOperation = getOperation(document, 'post', '/api/tts/request')
  assert.ok(ttsRequestOperation)

  const ttsResponses = stringify([
    ttsRequestOperation.responses,
    document.components?.schemas?.TtsSegmentResponse,
    document.components?.schemas?.TtsSegmentData
  ])
  assert.match(ttsResponses, /stream_token/)
  assert.match(ttsResponses, /stream_token_expires_at/)
})

test('OpenAPI snapshot does not expose provider routing fields on public Unity request bodies', () => {
  const document = readOpenApiDocument()
  const publicUnityRoutes = [
    ['post', '/api/chat/send'],
    ['post', '/api/chat/gameplay-send'],
    ['post', '/api/unity/llm/structured-generate'],
    ['post', '/api/tts/request']
  ] as const

  for (const [method, route] of publicUnityRoutes) {
    const operation = getOperation(document, method, route)
    assert.ok(operation)
    assert.doesNotMatch(stringify(operation.requestBody), /player_tier/)
  }
})
