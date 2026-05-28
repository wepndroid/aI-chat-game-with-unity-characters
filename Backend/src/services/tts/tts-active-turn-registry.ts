type ActiveTtsTurnKind = 'normal' | 'gameplay'
type ActiveTtsTurnStatus = 'active' | 'pending' | 'committed' | 'aborted'

type ActiveTtsTurn = {
  userId: string
  sessionId: string
  storyId: string
  kind: ActiveTtsTurnKind
  clientTurnId: string
  requestId: string
  reservationId: string
  pendingTurnId: string | null
  status: ActiveTtsTurnStatus
  expiresAtMs: number
  firstVoiceTaskId: string | null
  acceptedSegments: Map<string, string>
}

type RegisterActiveTtsSegmentResult =
  | {
      status: 'missing'
    }
  | {
      status: 'replay'
      activeTurn: ActiveTtsTurn
      voiceTaskId: string
      firstVoiceTaskId: string | null
    }
  | {
      status: 'accepted'
      activeTurn: ActiveTtsTurn
      voiceTaskId: string
      acceptedAsFirstSegment: boolean
      firstVoiceTaskId: string
    }

type UnregisterActiveTtsSegmentResult = {
  removed: boolean
  firstVoiceTaskId: string | null
}

type StartActiveTtsTurnInput = {
  userId: string
  sessionId: string
  storyId: string
  kind: ActiveTtsTurnKind
  clientTurnId: string
  requestId: string
  reservationId: string
  ttlMs: number
}

const activeTurns = new Map<string, ActiveTtsTurn>()

const toKey = (userId: string, sessionId: string, clientTurnId: string) => `${userId}\n${sessionId}\n${clientTurnId}`

const purgeExpiredActiveTtsTurns = (nowMs: number = Date.now()) => {
  for (const [key, turn] of activeTurns.entries()) {
    if (turn.expiresAtMs <= nowMs) {
      activeTurns.delete(key)
    }
  }
}

/**
 * Process-local registry for active text turns that may receive Unity-owned TTS
 * segment requests before the assistant transcript row exists. The registry is
 * deliberately volatile: current production runs one Node process, and active
 * SSE/WebSocket work is already process-bound. Horizontal scaling must move this
 * state to SecretWaifu-owned shared infrastructure before multiple backend
 * instances accept the same live turn.
 */
const startActiveTtsTurn = (input: StartActiveTtsTurnInput) => {
  const nowMs = Date.now()
  purgeExpiredActiveTtsTurns(nowMs)
  const key = toKey(input.userId, input.sessionId, input.clientTurnId)

  activeTurns.set(key, {
    userId: input.userId,
    sessionId: input.sessionId,
    storyId: input.storyId,
    kind: input.kind,
    clientTurnId: input.clientTurnId,
    requestId: input.requestId,
    reservationId: input.reservationId,
    pendingTurnId: null,
    status: 'active',
    expiresAtMs: nowMs + Math.max(60_000, input.ttlMs),
    firstVoiceTaskId: null,
    acceptedSegments: new Map()
  })
}

const getActiveTtsTurn = (input: { userId: string; sessionId: string; clientTurnId: string }) => {
  purgeExpiredActiveTtsTurns()
  const turn = activeTurns.get(toKey(input.userId, input.sessionId, input.clientTurnId)) ?? null
  if (!turn || turn.status === 'committed' || turn.status === 'aborted') {
    return null
  }
  return turn
}

const linkActiveTtsTurnPending = (input: {
  userId: string
  sessionId: string
  clientTurnId: string
  pendingTurnId: string
}) => {
  const turn = getActiveTtsTurn(input)
  if (!turn) {
    return
  }
  turn.pendingTurnId = input.pendingTurnId
  turn.status = 'pending'
}

const abortActiveTtsTurn = (input: { userId: string; sessionId: string; clientTurnId: string }) => {
  const turn = activeTurns.get(toKey(input.userId, input.sessionId, input.clientTurnId))
  if (!turn) {
    return
  }
  turn.status = 'aborted'
  activeTurns.delete(toKey(input.userId, input.sessionId, input.clientTurnId))
}

const commitActiveTtsTurn = (input: { userId: string; sessionId: string; clientTurnId: string }) => {
  const turn = activeTurns.get(toKey(input.userId, input.sessionId, input.clientTurnId))
  if (!turn) {
    return
  }
  turn.status = 'committed'
  activeTurns.delete(toKey(input.userId, input.sessionId, input.clientTurnId))
}

const getActiveTtsTurnVoiceState = (input: { userId: string; sessionId: string; clientTurnId: string }) => {
  const turn = getActiveTtsTurn(input)
  return {
    voiceAccepted: Boolean(turn?.firstVoiceTaskId),
    firstVoiceTaskId: turn?.firstVoiceTaskId ?? null
  }
}

const registerActiveTtsSegment = (input: {
  userId: string
  sessionId: string
  clientTurnId: string
  segmentId: string
  voiceTaskId: string
}): RegisterActiveTtsSegmentResult => {
  const turn = getActiveTtsTurn(input)
  if (!turn) {
    return {
      status: 'missing'
    }
  }
  const existingVoiceTaskId = turn.acceptedSegments.get(input.segmentId)
  if (existingVoiceTaskId) {
    return {
      status: 'replay',
      activeTurn: turn,
      voiceTaskId: existingVoiceTaskId,
      firstVoiceTaskId: turn.firstVoiceTaskId
    }
  }

  const acceptedAsFirstSegment = !turn.firstVoiceTaskId
  turn.acceptedSegments.set(input.segmentId, input.voiceTaskId)
  const firstVoiceTaskId = turn.firstVoiceTaskId ?? input.voiceTaskId
  turn.firstVoiceTaskId = firstVoiceTaskId

  return {
    status: 'accepted',
    activeTurn: turn,
    voiceTaskId: input.voiceTaskId,
    acceptedAsFirstSegment,
    firstVoiceTaskId
  }
}

const unregisterActiveTtsSegment = (input: {
  userId: string
  sessionId: string
  clientTurnId: string
  segmentId: string
  voiceTaskId: string
}): UnregisterActiveTtsSegmentResult => {
  const turn = getActiveTtsTurn(input)
  if (!turn) {
    return {
      removed: false,
      firstVoiceTaskId: null
    }
  }

  const existingVoiceTaskId = turn.acceptedSegments.get(input.segmentId)
  if (!existingVoiceTaskId || existingVoiceTaskId !== input.voiceTaskId) {
    return {
      removed: false,
      firstVoiceTaskId: turn.firstVoiceTaskId
    }
  }

  turn.acceptedSegments.delete(input.segmentId)
  turn.firstVoiceTaskId = turn.acceptedSegments.values().next().value ?? null
  return {
    removed: true,
    firstVoiceTaskId: turn.firstVoiceTaskId
  }
}

export {
  abortActiveTtsTurn,
  commitActiveTtsTurn,
  getActiveTtsTurn,
  getActiveTtsTurnVoiceState,
  linkActiveTtsTurnPending,
  unregisterActiveTtsSegment,
  registerActiveTtsSegment,
  startActiveTtsTurn
}
export type { ActiveTtsTurn, ActiveTtsTurnKind, RegisterActiveTtsSegmentResult, UnregisterActiveTtsSegmentResult }
