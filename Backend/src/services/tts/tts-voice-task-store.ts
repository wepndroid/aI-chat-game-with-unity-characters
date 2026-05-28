import { EventEmitter } from 'node:events'
import { type AiProviderPlayerTier } from '../ai-provider-player-tier'

type VoiceTaskStatus = 'queued' | 'processing' | 'complete' | 'error' | 'cancelled'

type VoiceTaskRole = 'character' | 'narrator'
type VoiceTaskKind = 'normal' | 'gameplay' | 'session_voice'
type VoiceTaskParentKind = 'visible_turn' | 'session_voice'
type VoiceTaskUsageKind = 'sex_phrase'
type VoiceTaskControlAction = 'pause' | 'resume' | 'cancel'

type VoiceTaskControlResult =
  | {
      ok: true
      deferred?: boolean
    }
  | {
      ok: false
      code: string
      message: string
    }

/**
 * Process-local bridge from a SecretWaifu public voice task to one private
 * provider websocket. The store owns public task lifecycle and cancellation;
 * the adapter owns provider ids and sockets, so provider-specific state cannot
 * leak through `/api/tts/stream/{voice_task_id}`.
 */
type VoiceTaskProviderControlHandle = {
  requestControl: (action: VoiceTaskControlAction, reason?: string | null) => VoiceTaskControlResult
  dispose: () => void
}

type StreamFrame = {
  data: Buffer | string
  isBinary: boolean
  createdAtMs: number
}

type PublicVoiceTask = {
  voiceTaskId: string
  userId: string
  providerPlayerTier: AiProviderPlayerTier
  sessionId: string
  storyId: string
  kind: VoiceTaskKind
  parentKind: VoiceTaskParentKind
  clientTurnId: string | null
  clientRequestId: string | null
  usageKind: VoiceTaskUsageKind | null
  segmentId: string
  sequenceIndex: number
  role: VoiceTaskRole
  text: string
  voiceRefPath: string
  uploadedVoiceRegistrationId: string | null
  providerVoiceAlias: string | null
  providerVoiceAliasRefreshAttempted: boolean
  emotion: string | null
  emoText: string | null
  emoAlpha: number | null
  emotionVector: string | null
  requestId: string
  providerTaskId: string | null
  status: VoiceTaskStatus
  createdAtMs: number
  updatedAtMs: number
  terminalAtMs: number | null
  terminalExpiresAtMs: number | null
  audioBufferEvicted: boolean
  attachedClientCount: number
  detachGraceTimer: ReturnType<typeof setTimeout> | null
  providerControlHandle: VoiceTaskProviderControlHandle | null
  streamTokenHashes: Map<string, number>
  frames: StreamFrame[]
  bufferedAudioBytes: number
  emitter: EventEmitter
}

type CreateVoiceTaskInput = Omit<
  PublicVoiceTask,
  | 'providerTaskId'
  | 'status'
  | 'createdAtMs'
  | 'updatedAtMs'
  | 'terminalAtMs'
  | 'terminalExpiresAtMs'
  | 'audioBufferEvicted'
  | 'attachedClientCount'
  | 'detachGraceTimer'
  | 'providerControlHandle'
  | 'streamTokenHashes'
  | 'frames'
  | 'bufferedAudioBytes'
  | 'emitter'
>

const TERMINAL_RETENTION_MS = 5 * 60 * 1000
const PER_TASK_AUDIO_BUFFER_CAP_BYTES = 256 * 1024
const GLOBAL_AUDIO_BUFFER_CAP_BYTES = 512 * 1024 * 1024
const DETACH_GRACE_MS = 2_500

const voiceTasks = new Map<string, PublicVoiceTask>()

let globalBufferedAudioBytes = 0

const estimateFrameBytes = (frame: StreamFrame) => {
  if (!frame.isBinary) {
    return 0
  }
  return Buffer.isBuffer(frame.data) ? frame.data.byteLength : Buffer.byteLength(frame.data)
}

const purgeExpiredVoiceTasks = (nowMs: number = Date.now()) => {
  for (const [voiceTaskId, task] of voiceTasks.entries()) {
    if (task.terminalExpiresAtMs && task.terminalExpiresAtMs <= nowMs) {
      if (task.detachGraceTimer) {
        clearTimeout(task.detachGraceTimer)
      }
      task.providerControlHandle?.dispose()
      globalBufferedAudioBytes -= task.bufferedAudioBytes
      voiceTasks.delete(voiceTaskId)
    }
  }
  globalBufferedAudioBytes = Math.max(0, globalBufferedAudioBytes)
}

const evictOldestBinaryFrame = (task: PublicVoiceTask) => {
  const index = task.frames.findIndex((frame) => frame.isBinary)
  if (index < 0) {
    return false
  }

  const [removed] = task.frames.splice(index, 1)
  const removedBytes = removed ? estimateFrameBytes(removed) : 0
  task.bufferedAudioBytes = Math.max(0, task.bufferedAudioBytes - removedBytes)
  globalBufferedAudioBytes = Math.max(0, globalBufferedAudioBytes - removedBytes)
  task.audioBufferEvicted = true
  return true
}

const enforceTaskBufferCap = (task: PublicVoiceTask) => {
  while (task.bufferedAudioBytes > PER_TASK_AUDIO_BUFFER_CAP_BYTES) {
    if (!evictOldestBinaryFrame(task)) {
      break
    }
  }
}

const enforceGlobalBufferCap = () => {
  if (globalBufferedAudioBytes <= GLOBAL_AUDIO_BUFFER_CAP_BYTES) {
    return
  }

  const candidates = Array.from(voiceTasks.values()).sort((a, b) => a.createdAtMs - b.createdAtMs)
  while (globalBufferedAudioBytes > GLOBAL_AUDIO_BUFFER_CAP_BYTES) {
    const next = candidates.find((task) => task.bufferedAudioBytes > 0)
    if (!next || !evictOldestBinaryFrame(next)) {
      break
    }
  }
}

const clearDetachGraceTimer = (task: PublicVoiceTask) => {
  if (!task.detachGraceTimer) {
    return
  }

  clearTimeout(task.detachGraceTimer)
  task.detachGraceTimer = null
}

const disposeProviderControlHandle = (task: PublicVoiceTask) => {
  const handle = task.providerControlHandle
  task.providerControlHandle = null
  handle?.dispose()
}

const createVoiceTask = (input: CreateVoiceTaskInput) => {
  purgeExpiredVoiceTasks()
  const nowMs = Date.now()
  const task: PublicVoiceTask = {
    ...input,
    providerTaskId: null,
    status: 'queued',
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    terminalAtMs: null,
    terminalExpiresAtMs: null,
    audioBufferEvicted: false,
    attachedClientCount: 0,
    detachGraceTimer: null,
    providerControlHandle: null,
    streamTokenHashes: new Map(),
    frames: [],
    bufferedAudioBytes: 0,
    emitter: new EventEmitter()
  }
  task.emitter.setMaxListeners(64)
  voiceTasks.set(task.voiceTaskId, task)
  return task
}

const getVoiceTask = (voiceTaskId: string) => {
  purgeExpiredVoiceTasks()
  return voiceTasks.get(voiceTaskId) ?? null
}

const deleteVoiceTask = (voiceTaskId: string) => {
  const task = voiceTasks.get(voiceTaskId)
  if (!task) {
    return false
  }

  if (task.detachGraceTimer) {
    clearTimeout(task.detachGraceTimer)
  }
  task.providerControlHandle?.dispose()
  globalBufferedAudioBytes = Math.max(0, globalBufferedAudioBytes - task.bufferedAudioBytes)
  voiceTasks.delete(voiceTaskId)
  return true
}

const countActiveVoiceTasksForUser = (userId: string) => {
  purgeExpiredVoiceTasks()
  let count = 0
  for (const task of voiceTasks.values()) {
    if (task.userId === userId && !task.terminalAtMs) {
      count += 1
    }
  }
  return count
}

const findSessionVoiceTask = (input: {
  userId: string
  sessionId: string
  clientRequestId: string
  segmentId: string
}) => {
  purgeExpiredVoiceTasks()
  for (const task of voiceTasks.values()) {
    if (
      task.parentKind === 'session_voice' &&
      task.userId === input.userId &&
      task.sessionId === input.sessionId &&
      task.clientRequestId === input.clientRequestId &&
      task.segmentId === input.segmentId
    ) {
      return task
    }
  }

  return null
}

const setVoiceTaskProviderTaskId = (voiceTaskId: string, providerTaskId: string) => {
  const task = getVoiceTask(voiceTaskId)
  if (!task || task.terminalAtMs) {
    return
  }
  task.providerTaskId = providerTaskId
  task.status = 'processing'
  task.updatedAtMs = Date.now()
}

const addVoiceTaskStreamTokenHash = (voiceTaskId: string, tokenHash: string, expiresAtMs: number) => {
  const task = getVoiceTask(voiceTaskId)
  if (!task) {
    return false
  }
  task.streamTokenHashes.set(tokenHash, expiresAtMs)
  return true
}

const consumeVoiceTaskStreamTokenHash = (voiceTaskId: string, tokenHash: string, nowMs: number = Date.now()) => {
  const task = getVoiceTask(voiceTaskId)
  if (!task) {
    return { ok: false as const, reason: 'missing_task' as const }
  }

  for (const [hash, expiresAtMs] of task.streamTokenHashes.entries()) {
    if (expiresAtMs <= nowMs) {
      task.streamTokenHashes.delete(hash)
    }
  }

  const expiresAtMs = task.streamTokenHashes.get(tokenHash)
  if (!expiresAtMs || expiresAtMs <= nowMs) {
    return { ok: false as const, reason: 'invalid_token' as const }
  }

  task.streamTokenHashes.delete(tokenHash)
  return { ok: true as const, task }
}

const appendVoiceTaskFrame = (voiceTaskId: string, frame: { data: Buffer | string; isBinary: boolean }) => {
  const task = getVoiceTask(voiceTaskId)
  if (!task || task.terminalAtMs) {
    return null
  }

  const storedFrame: StreamFrame = {
    data: frame.isBinary ? Buffer.from(frame.data as Buffer) : String(frame.data),
    isBinary: frame.isBinary,
    createdAtMs: Date.now()
  }

  task.frames.push(storedFrame)
  if (storedFrame.isBinary) {
    const frameBytes = estimateFrameBytes(storedFrame)
    task.bufferedAudioBytes += frameBytes
    globalBufferedAudioBytes += frameBytes
    enforceTaskBufferCap(task)
    enforceGlobalBufferCap()
  }

  task.updatedAtMs = Date.now()
  task.emitter.emit('frame', storedFrame)
  return storedFrame
}

const markVoiceTaskTerminal = (
  voiceTaskId: string,
  input: {
    status: Extract<VoiceTaskStatus, 'complete' | 'error' | 'cancelled'>
    frame: { data: string; isBinary: false }
  }
) => {
  const task = getVoiceTask(voiceTaskId)
  if (!task || task.terminalAtMs) {
    return null
  }

  const nowMs = Date.now()
  clearDetachGraceTimer(task)
  disposeProviderControlHandle(task)
  const terminalFrame: StreamFrame = {
    data: input.frame.data,
    isBinary: false,
    createdAtMs: nowMs
  }

  task.frames.push(terminalFrame)
  task.status = input.status
  task.terminalAtMs = nowMs
  task.terminalExpiresAtMs = nowMs + TERMINAL_RETENTION_MS
  task.updatedAtMs = nowMs
  task.emitter.emit('frame', terminalFrame)
  task.emitter.emit('terminal', terminalFrame)
  return task
}

const cancelVoiceTaskLocally = (voiceTaskId: string, reason?: string | null) =>
  markVoiceTaskTerminal(voiceTaskId, {
    status: 'cancelled',
    frame: {
      isBinary: false,
      data: JSON.stringify({
        type: 'cancelled',
        task_id: voiceTaskId,
        reason: reason?.trim() || 'client_cancelled'
      })
    }
  })

const onVoiceTaskFrame = (task: PublicVoiceTask, listener: (frame: StreamFrame) => void) => {
  task.emitter.on('frame', listener)
  return () => {
    task.emitter.off('frame', listener)
  }
}

const registerVoiceTaskProviderControlHandle = (voiceTaskId: string, handle: VoiceTaskProviderControlHandle) => {
  const task = getVoiceTask(voiceTaskId)
  if (!task || task.terminalAtMs) {
    handle.dispose()
    return false
  }

  task.providerControlHandle?.dispose()
  task.providerControlHandle = handle
  task.updatedAtMs = Date.now()
  return true
}

const unregisterVoiceTaskProviderControlHandle = (voiceTaskId: string, handle: VoiceTaskProviderControlHandle) => {
  const task = getVoiceTask(voiceTaskId)
  if (!task || task.providerControlHandle !== handle) {
    return
  }

  task.providerControlHandle = null
  task.updatedAtMs = Date.now()
}

/**
 * Applies a public task-scoped control after stream-token authorization. Pause
 * and resume are best-effort provider controls; cancel is authoritative at the
 * SecretWaifu boundary and always produces a public `cancelled` terminal frame
 * when the task is still alive.
 */
const controlVoiceTask = (voiceTaskId: string, action: VoiceTaskControlAction, reason?: string | null): VoiceTaskControlResult => {
  const task = getVoiceTask(voiceTaskId)
  if (!task) {
    return {
      ok: false,
      code: 'VOICE_TASK_EXPIRED',
      message: 'Voice task is no longer available.'
    }
  }

  if (task.terminalAtMs) {
    return {
      ok: false,
      code: 'VOICE_TASK_TERMINAL',
      message: 'Voice task already reached a terminal state.'
    }
  }

  if (!task.providerControlHandle) {
    if (action === 'cancel') {
      cancelVoiceTaskLocally(voiceTaskId, reason)
      return { ok: true }
    }

    return {
      ok: false,
      code: 'PROVIDER_CONTROL_UNAVAILABLE',
      message: 'Provider control channel is not available for this voice task.'
    }
  }

  return task.providerControlHandle.requestControl(action, reason)
}

/**
 * Tracks Unity/WebGL stream consumers so transient reconnects do not wastefully
 * cancel synthesis, while real session exits still stop provider GPU work after
 * the approved grace period.
 */
const attachVoiceTaskClient = (voiceTaskId: string) => {
  const task = getVoiceTask(voiceTaskId)
  if (!task) {
    return false
  }

  task.attachedClientCount += 1
  clearDetachGraceTimer(task)
  task.updatedAtMs = Date.now()
  return true
}

const detachVoiceTaskClient = (voiceTaskId: string, reason: string = 'last_client_detached') => {
  const task = getVoiceTask(voiceTaskId)
  if (!task) {
    return
  }

  task.attachedClientCount = Math.max(0, task.attachedClientCount - 1)
  task.updatedAtMs = Date.now()
  if (task.attachedClientCount > 0 || task.terminalAtMs || task.detachGraceTimer) {
    return
  }

  task.detachGraceTimer = setTimeout(() => {
    const latest = getVoiceTask(voiceTaskId)
    if (!latest || latest.terminalAtMs || latest.attachedClientCount > 0) {
      return
    }

    latest.detachGraceTimer = null
    controlVoiceTask(voiceTaskId, 'cancel', reason)
  }, DETACH_GRACE_MS)
}

export {
  addVoiceTaskStreamTokenHash,
  appendVoiceTaskFrame,
  attachVoiceTaskClient,
  cancelVoiceTaskLocally,
  controlVoiceTask,
  countActiveVoiceTasksForUser,
  consumeVoiceTaskStreamTokenHash,
  createVoiceTask,
  deleteVoiceTask,
  detachVoiceTaskClient,
  findSessionVoiceTask,
  getVoiceTask,
  markVoiceTaskTerminal,
  onVoiceTaskFrame,
  registerVoiceTaskProviderControlHandle,
  unregisterVoiceTaskProviderControlHandle,
  setVoiceTaskProviderTaskId
}
export { DETACH_GRACE_MS }
export type {
  PublicVoiceTask,
  StreamFrame,
  VoiceTaskControlAction,
  VoiceTaskControlResult,
  VoiceTaskProviderControlHandle,
  VoiceTaskKind,
  VoiceTaskParentKind,
  VoiceTaskRole,
  VoiceTaskStatus,
  VoiceTaskUsageKind
}
