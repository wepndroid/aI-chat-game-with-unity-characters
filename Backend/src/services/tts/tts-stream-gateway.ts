import type { IncomingMessage, Server as HttpServer } from 'node:http'
import type { Duplex } from 'node:stream'
import { URL } from 'node:url'
import { WebSocket, WebSocketServer, type RawData } from 'ws'
import { normalizeOrigin } from '../../middleware/csrf-origin-middleware'
import { consumeVoiceTaskStreamToken } from './tts-stream-token-service'
import {
  attachVoiceTaskClient,
  controlVoiceTask,
  detachVoiceTaskClient,
  getVoiceTask,
  onVoiceTaskFrame,
  type PublicVoiceTask,
  type StreamFrame,
  type VoiceTaskControlAction,
  type VoiceTaskControlResult
} from './tts-voice-task-store'

type UpgradeContext = {
  task: PublicVoiceTask
}

const UPGRADE_CONTEXT_KEY = Symbol('secretwaifu-tts-upgrade-context')
const CLIENT_MAX_PAYLOAD_BYTES = 64 * 1024
const HEARTBEAT_INTERVAL_MS = 30_000
const CLIENT_CONTROL_CLOSE_REASON = 'Unsupported TTS stream control'
const CLIENT_CONTROL_INVALID_REASON = 'Invalid TTS stream control'

const isProduction = () => process.env.NODE_ENV === 'production'

const getAllowedOrigins = () => {
  const configuredOrigins = process.env.CORS_ORIGIN?.split(',').map((origin) => normalizeOrigin(origin)).filter(Boolean) ?? []
  const devOrigins = isProduction() ? [] : ['http://127.0.0.1:7000', 'http://localhost:7000']
  return new Set([...configuredOrigins, ...devOrigins])
}

const rejectUpgrade = (socket: Duplex, statusCode: number, statusText: string) => {
  const payload = `${statusCode} ${statusText}`
  socket.write(
    `HTTP/1.1 ${statusCode} ${statusText}\r\n` +
      'Connection: close\r\n' +
      'Content-Type: text/plain; charset=utf-8\r\n' +
      `Content-Length: ${Buffer.byteLength(payload)}\r\n` +
      '\r\n' +
      payload
  )
  socket.destroy()
}

const parseStreamRequest = (request: IncomingMessage) => {
  const base = `http://${request.headers.host ?? '127.0.0.1'}`
  const parsedUrl = new URL(request.url ?? '/', base)
  const match = /^\/api\/tts\/stream\/([^/?#]+)$/.exec(parsedUrl.pathname)
  if (!match?.[1]) {
    return null
  }

  try {
    return {
      voiceTaskId: decodeURIComponent(match[1]),
      streamToken: parsedUrl.searchParams.get('stream_token')?.trim() ?? ''
    }
  } catch {
    return null
  }
}

const isOriginAllowed = (request: IncomingMessage) => {
  const origin = request.headers.origin
  if (!origin) {
    return true
  }
  return getAllowedOrigins().has(normalizeOrigin(origin))
}

const isTerminalFrame = (frame: StreamFrame) => {
  if (frame.isBinary) {
    return false
  }

  try {
    const parsed = JSON.parse(String(frame.data)) as { type?: string }
    return parsed.type === 'complete' || parsed.type === 'error' || parsed.type === 'cancelled'
  } catch {
    return false
  }
}

const sendFrame = (clientSocket: WebSocket, frame: StreamFrame) => {
  if (clientSocket.readyState !== WebSocket.OPEN) {
    return
  }
  clientSocket.send(frame.data, { binary: frame.isBinary })
}

const rawDataToString = (rawData: RawData) => {
  if (Buffer.isBuffer(rawData)) {
    return rawData.toString('utf8')
  }
  if (Array.isArray(rawData)) {
    return Buffer.concat(rawData.map((entry) => (Buffer.isBuffer(entry) ? entry : Buffer.from(entry)))).toString('utf8')
  }
  return Buffer.from(rawData).toString('utf8')
}

const sanitizeCancelReason = (value: unknown) => {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  return trimmed.slice(0, 128)
}

const parseControlMessage = (
  rawData: RawData,
  isBinary: boolean
):
  | {
      ok: true
      action: VoiceTaskControlAction
      reason: string | null
    }
  | {
      ok: false
      closeCode: number
      closeReason: string
    } => {
  if (isBinary) {
    return {
      ok: false,
      closeCode: 1003,
      closeReason: CLIENT_CONTROL_CLOSE_REASON
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawDataToString(rawData))
  } catch {
    return {
      ok: false,
      closeCode: 1007,
      closeReason: CLIENT_CONTROL_INVALID_REASON
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      ok: false,
      closeCode: 1007,
      closeReason: CLIENT_CONTROL_INVALID_REASON
    }
  }

  const payload = parsed as Record<string, unknown>
  const keys = Object.keys(payload)
  if (keys.some((key) => !['action', 'reason'].includes(key))) {
    return {
      ok: false,
      closeCode: 1003,
      closeReason: CLIENT_CONTROL_CLOSE_REASON
    }
  }

  const action = payload.action
  if (action !== 'pause' && action !== 'resume' && action !== 'cancel') {
    return {
      ok: false,
      closeCode: 1003,
      closeReason: CLIENT_CONTROL_CLOSE_REASON
    }
  }

  if (action !== 'cancel' && 'reason' in payload) {
    return {
      ok: false,
      closeCode: 1003,
      closeReason: CLIENT_CONTROL_CLOSE_REASON
    }
  }

  if ('reason' in payload && typeof payload.reason !== 'string') {
    return {
      ok: false,
      closeCode: 1007,
      closeReason: CLIENT_CONTROL_INVALID_REASON
    }
  }

  return {
    ok: true,
    action,
    reason: sanitizeCancelReason(payload.reason)
  }
}

const sendControlAcknowledgement = (
  clientSocket: WebSocket,
  task: PublicVoiceTask,
  action: VoiceTaskControlAction,
  result: VoiceTaskControlResult
) => {
  if (clientSocket.readyState !== WebSocket.OPEN) {
    return
  }

  const payload: Record<string, unknown> = {
    type: 'control',
    task_id: task.voiceTaskId,
    action,
    status: result.ok ? 'accepted' : 'failed'
  }

  if (result.ok && result.deferred) {
    payload.deferred = true
  }

  if (!result.ok) {
    payload.code = result.code
    payload.message = result.message
  }

  clientSocket.send(JSON.stringify(payload))
}

const flushRetainedFrames = (clientSocket: WebSocket, task: PublicVoiceTask) => {
  for (const frame of task.frames) {
    sendFrame(clientSocket, frame)
  }

  if (task.terminalAtMs && clientSocket.readyState === WebSocket.OPEN) {
    clientSocket.close(1000, task.status)
  }
}

/**
 * SecretWaifu public TTS stream gateway. The socket accepts only a short-lived
 * stream token minted for one voice task, never the app bearer token or provider
 * token. Browser Origins are checked when present; native Unity clients usually
 * omit Origin and are authorized by the task-scoped token itself. Client control
 * messages are task-scoped too: the public task id from the URL is translated to
 * provider ids only inside the backend adapter, so Unity never sees upstream ids.
 */
const setupTtsStreamGateway = (server: HttpServer) => {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: CLIENT_MAX_PAYLOAD_BYTES,
    perMessageDeflate: false
  })

  wss.on('connection', (clientSocket, request) => {
    const context = (request as IncomingMessage & { [UPGRADE_CONTEXT_KEY]?: UpgradeContext })[UPGRADE_CONTEXT_KEY]
    if (!context) {
      clientSocket.close(1011, 'Missing stream context')
      return
    }

    attachVoiceTaskClient(context.task.voiceTaskId)

    let alive = true
    const heartbeat = setInterval(() => {
      if (!alive) {
        clientSocket.terminate()
        return
      }
      alive = false
      clientSocket.ping()
    }, HEARTBEAT_INTERVAL_MS)

    clientSocket.on('pong', () => {
      alive = true
    })

    const unsubscribe = onVoiceTaskFrame(context.task, (frame) => {
      sendFrame(clientSocket, frame)
      if (isTerminalFrame(frame) && clientSocket.readyState === WebSocket.OPEN) {
        clientSocket.close(1000, context.task.status)
      }
    })

    clientSocket.on('message', (rawData, isBinary) => {
      const control = parseControlMessage(rawData, isBinary)
      if (!control.ok) {
        clientSocket.close(control.closeCode, control.closeReason)
        return
      }

      if (control.action === 'cancel' && clientSocket.readyState === WebSocket.OPEN) {
        clientSocket.send(
          JSON.stringify({
            type: 'control',
            task_id: context.task.voiceTaskId,
            action: control.action,
            status: 'accepted'
          })
        )
      }

      const result = controlVoiceTask(context.task.voiceTaskId, control.action, control.reason)
      if (control.action !== 'cancel' || !result.ok) {
        sendControlAcknowledgement(clientSocket, context.task, control.action, result)
      }
    })

    clientSocket.on('close', () => {
      clearInterval(heartbeat)
      unsubscribe()
      detachVoiceTaskClient(context.task.voiceTaskId)
    })

    flushRetainedFrames(clientSocket, context.task)
  })

  server.on('upgrade', (request, socket, head) => {
    const parsed = parseStreamRequest(request)
    if (!parsed) {
      return
    }

    if (!isOriginAllowed(request)) {
      rejectUpgrade(socket, 403, 'FORBIDDEN')
      return
    }

    if (!parsed.streamToken) {
      rejectUpgrade(socket, 401, 'AUTH_REQUIRED')
      return
    }

    const validation = consumeVoiceTaskStreamToken(parsed.voiceTaskId, parsed.streamToken)
    if (!validation.ok) {
      rejectUpgrade(socket, validation.reason === 'missing_task' ? 410 : 401, validation.reason === 'missing_task' ? 'VOICE_TASK_EXPIRED' : 'AUTH_REQUIRED')
      return
    }

    const task = getVoiceTask(parsed.voiceTaskId)
    if (!task || task.audioBufferEvicted) {
      rejectUpgrade(socket, 410, 'VOICE_TASK_EXPIRED')
      return
    }

    ;(request as IncomingMessage & { [UPGRADE_CONTEXT_KEY]?: UpgradeContext })[UPGRADE_CONTEXT_KEY] = {
      task
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request)
    })
  })
}

export { setupTtsStreamGateway }
