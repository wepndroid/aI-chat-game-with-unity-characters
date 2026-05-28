import { WebSocket, type RawData } from 'ws'
import {
  appendVoiceTaskFrame,
  cancelVoiceTaskLocally,
  markVoiceTaskTerminal,
  registerVoiceTaskProviderControlHandle,
  setVoiceTaskProviderTaskId,
  unregisterVoiceTaskProviderControlHandle,
  type PublicVoiceTask
} from './tts-voice-task-store'
import { getTtsProviderWsUrl, readTtsProviderBearerToken } from '../../lib/tts-provider-config'
import { forceRefreshUploadedVoiceProviderAlias } from '../../lib/tts-provider-uploaded-voice-alias'

const PROVIDER_CONNECT_TIMEOUT_MS = 12_000

const rawDataToBuffer = (rawData: RawData) => {
  if (Buffer.isBuffer(rawData)) {
    return rawData
  }
  if (Array.isArray(rawData)) {
    return Buffer.concat(rawData.map((entry) => (Buffer.isBuffer(entry) ? entry : Buffer.from(entry))))
  }
  return Buffer.from(rawData)
}

const emitTerminalError = (voiceTaskId: string, message: string) => {
  markVoiceTaskTerminal(voiceTaskId, {
    status: 'error',
    frame: {
      isBinary: false,
      data: JSON.stringify({
        type: 'error',
        task_id: voiceTaskId,
        message
      })
    }
  })
}

const rewriteProviderTextFrame = (task: PublicVoiceTask, text: string) => {
  try {
    const payload = JSON.parse(text) as Record<string, unknown>
    const providerTaskId = typeof payload.task_id === 'string' ? payload.task_id.trim() : ''
    if (providerTaskId.length > 0 && !task.providerTaskId) {
      setVoiceTaskProviderTaskId(task.voiceTaskId, providerTaskId)
    }

    payload.task_id = task.voiceTaskId
    return {
      text: JSON.stringify(payload),
      type: typeof payload.type === 'string' ? payload.type : null,
      providerTaskId: providerTaskId || null,
      payload
    }
  } catch {
    return {
      text,
      type: null,
      providerTaskId: null,
      payload: null
    }
  }
}

const providerErrorText = (payload: Record<string, unknown> | null, fallbackText: string) => {
  if (!payload) {
    return fallbackText
  }

  const candidates = [payload.message, payload.error, payload.detail, payload.reason]
  return candidates.find((candidate): candidate is string => typeof candidate === 'string') ?? fallbackText
}

const isUnknownProviderVoiceAliasError = (payload: Record<string, unknown> | null, fallbackText: string) => {
  const normalized = providerErrorText(payload, fallbackText).toLowerCase()
  return normalized.includes('unknown voice alias')
}

type ProviderTtsGenerateMessageInput = Pick<
  PublicVoiceTask,
  'text' | 'voiceRefPath' | 'emotion' | 'emoText' | 'emoAlpha' | 'emotionVector' | 'userId' | 'providerPlayerTier'
>

/**
 * Builds Ahmad-core's private `/tts/ws` generate frame. Keeping provider field
 * names here prevents public Unity DTOs and TTS lifecycle code from depending
 * on core-specific routing details.
 */
const buildProviderTtsGenerateMessage = (task: ProviderTtsGenerateMessageInput) => ({
  action: 'generate',
  raw_text: task.text,
  voice_ref_path: task.voiceRefPath,
  emotion: task.emotion ?? 'neutral',
  emo_text: task.emoText ?? undefined,
  emo_alpha: task.emoAlpha ?? undefined,
  emotion_vector: task.emotionVector ?? undefined,
  player_id: task.userId,
  player_tier: task.providerPlayerTier
})

/**
 * Starts one externally owned TTS provider websocket for one SecretWaifu segment.
 * SecretWaifu keeps the public task id stable while Ahmad's provider can create
 * its own internal task id; that internal id is stored only for future controls.
 */
const startProviderTtsStream = (task: PublicVoiceTask) => {
  const providerWsUrl = getTtsProviderWsUrl()
  if (!providerWsUrl) {
    emitTerminalError(task.voiceTaskId, 'TTS provider websocket is not configured')
    return
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(providerWsUrl)
  } catch {
    emitTerminalError(task.voiceTaskId, 'Invalid TTS provider websocket configuration')
    return
  }

  const bearerToken = readTtsProviderBearerToken()
  const socket = new WebSocket(parsedUrl.toString(), {
    headers: bearerToken
      ? {
          Authorization: `Bearer ${bearerToken}`
        }
      : undefined,
    perMessageDeflate: false,
    handshakeTimeout: PROVIDER_CONNECT_TIMEOUT_MS
  })

  let terminal = false
  let providerTaskId: string | null = null
  let pendingPaused = false

  const disposeSocket = () => {
    terminal = true
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close(1000, 'disposed')
    }
  }

  const sendProviderControl = (action: 'pause' | 'resume' | 'cancel') => {
    if (!providerTaskId) {
      return {
        ok: false as const,
        code: 'PROVIDER_TASK_ID_PENDING',
        message: 'Provider task id has not been received yet.'
      }
    }

    if (socket.readyState !== WebSocket.OPEN) {
      return {
        ok: false as const,
        code: 'PROVIDER_SOCKET_NOT_OPEN',
        message: 'Provider control socket is not open.'
      }
    }

    try {
      socket.send(
        JSON.stringify({
          action,
          task_id: providerTaskId
        })
      )
      return { ok: true as const }
    } catch {
      return {
        ok: false as const,
        code: 'PROVIDER_CONTROL_SEND_FAILED',
        message: 'Provider control message could not be sent.'
      }
    }
  }

  const applyPendingProviderState = () => {
    if (!pendingPaused) {
      return
    }

    sendProviderControl('pause')
  }

  const controlHandle = {
    requestControl: (action: 'pause' | 'resume' | 'cancel', reason?: string | null) => {
      if (terminal) {
        return {
          ok: false as const,
          code: 'PROVIDER_TASK_TERMINAL',
          message: 'Provider task already reached a terminal state.'
        }
      }

      if (action === 'pause') {
        pendingPaused = true
        if (!providerTaskId) {
          return { ok: true as const, deferred: true }
        }
        return sendProviderControl('pause')
      }

      if (action === 'resume') {
        pendingPaused = false
        if (!providerTaskId) {
          return { ok: true as const, deferred: true }
        }
        return sendProviderControl('resume')
      }

      if (providerTaskId) {
        sendProviderControl('cancel')
      }
      cancelVoiceTaskLocally(task.voiceTaskId, reason)
      return {
        ok: true as const,
        deferred: !providerTaskId
      }
    },
    dispose: disposeSocket
  }

  registerVoiceTaskProviderControlHandle(task.voiceTaskId, controlHandle)

  const finishWithError = (message: string) => {
    if (terminal) {
      return
    }
    terminal = true
    emitTerminalError(task.voiceTaskId, message)
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close()
    }
  }

  const refreshUploadedVoiceAliasAndRestart = (providerErrorFrame: string) => {
    if (!task.uploadedVoiceRegistrationId || task.providerVoiceAliasRefreshAttempted) {
      return false
    }

    task.providerVoiceAliasRefreshAttempted = true
    task.providerTaskId = null
    terminal = true
    unregisterVoiceTaskProviderControlHandle(task.voiceTaskId, controlHandle)

    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close(1000, 'refreshing_voice_alias')
    }

    void forceRefreshUploadedVoiceProviderAlias(task.uploadedVoiceRegistrationId)
      .then((refreshed) => {
        task.voiceRefPath = refreshed.providerVoiceRefPath
        task.providerVoiceAlias = refreshed.providerAlias
        startProviderTtsStream(task)
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : providerErrorFrame
        emitTerminalError(task.voiceTaskId, message || 'TTS provider voice alias refresh failed')
      })

    return true
  }

  socket.on('open', () => {
    socket.send(JSON.stringify(buildProviderTtsGenerateMessage(task)))
  })

  socket.on('message', (rawData, isBinary) => {
    if (terminal) {
      return
    }

    if (isBinary) {
      appendVoiceTaskFrame(task.voiceTaskId, {
        isBinary: true,
        data: rawDataToBuffer(rawData)
      })
      return
    }

    const { text, type, providerTaskId: nextProviderTaskId, payload } = rewriteProviderTextFrame(task, rawData.toString())
    if (nextProviderTaskId && providerTaskId !== nextProviderTaskId) {
      providerTaskId = nextProviderTaskId
      applyPendingProviderState()
    }

    if (type === 'error' && isUnknownProviderVoiceAliasError(payload, text)) {
      if (refreshUploadedVoiceAliasAndRestart(text)) {
        return
      }
    }

    if (type === 'complete' || type === 'error' || type === 'cancelled') {
      terminal = true
      markVoiceTaskTerminal(task.voiceTaskId, {
        status: type,
        frame: {
          isBinary: false,
          data: text
        }
      })
      if (socket.readyState === WebSocket.OPEN) {
        socket.close(1000, type)
      }
      unregisterVoiceTaskProviderControlHandle(task.voiceTaskId, controlHandle)
      return
    }

    appendVoiceTaskFrame(task.voiceTaskId, {
      isBinary: false,
      data: text
    })
  })

  socket.on('error', () => {
    finishWithError('TTS provider stream failed')
  })

  socket.on('close', (code) => {
    unregisterVoiceTaskProviderControlHandle(task.voiceTaskId, controlHandle)
    if (!terminal && code !== 1000) {
      finishWithError('TTS provider stream closed before completion')
    }
  })
}

export { buildProviderTtsGenerateMessage, startProviderTtsStream }
