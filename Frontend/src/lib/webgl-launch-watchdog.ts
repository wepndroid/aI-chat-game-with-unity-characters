const WEBGL_INITIAL_ACTIVITY_STALL_MS = 90_000
const WEBGL_PROGRESS_STALL_MS = 120_000

type WebglLaunchWatchdogPhase = 'idle' | 'loading' | 'progressing' | 'ready' | 'failed'
type WebglLaunchActivity = 'iframe-load' | 'unity-progress' | 'unity-ready' | 'unity-loader-error'

type WebglLaunchWatchdogFailureCode = 'initial-activity-stalled' | 'progress-stalled' | 'loader-error'

type WebglLaunchWatchdogFailure = {
  code: WebglLaunchWatchdogFailureCode
  message: string
}

type WebglLaunchWatchdogState = {
  key: string | null
  phase: WebglLaunchWatchdogPhase
  startedAtMs: number
  lastActivityAtMs: number | null
  terminalFailure: WebglLaunchWatchdogFailure | null
}

const WEBGL_INITIAL_ACTIVITY_STALL_FAILURE: WebglLaunchWatchdogFailure = {
  code: 'initial-activity-stalled',
  message: 'The browser game did not start loading. Please refresh the page and try again.'
}

const WEBGL_PROGRESS_STALL_FAILURE: WebglLaunchWatchdogFailure = {
  code: 'progress-stalled',
  message: 'The browser game stopped loading. Please refresh the page and try again.'
}

const WEBGL_LOADER_ERROR_FAILURE: WebglLaunchWatchdogFailure = {
  code: 'loader-error',
  message: 'The browser game failed to load. Please refresh the page and try again.'
}

/**
 * Creates the parent-frame launch watchdog state for one effective WebGL iframe session.
 *
 * The parent frame owns this policy because it owns iframe lifecycle, visible launch errors, and
 * the security gate that withholds auth and launch tokens until the Unity runtime announces it is
 * ready. A null key means no iframe launch is active.
 */
const createWebglLaunchWatchdogState = (nowMs: number, key: string | null): WebglLaunchWatchdogState => ({
  key,
  phase: key ? 'loading' : 'idle',
  startedAtMs: nowMs,
  lastActivityAtMs: null,
  terminalFailure: null
})

/**
 * Records browser or Unity loader activity without reading browser globals.
 *
 * Progress and iframe-load activity extend the stall window because large WebGL builds can keep
 * downloading, decompressing, or initializing long after a fixed startup deadline. Ready is a
 * terminal success; an explicit loader error is terminal failure.
 */
const recordWebglLaunchActivity = (
  state: WebglLaunchWatchdogState,
  activity: WebglLaunchActivity,
  nowMs: number
): WebglLaunchWatchdogState => {
  if (state.phase === 'ready' || state.phase === 'failed' || state.phase === 'idle') {
    return state
  }

  if (activity === 'unity-ready') {
    return {
      ...state,
      phase: 'ready',
      lastActivityAtMs: nowMs
    }
  }

  if (activity === 'unity-loader-error') {
    return {
      ...state,
      phase: 'failed',
      lastActivityAtMs: nowMs,
      terminalFailure: WEBGL_LOADER_ERROR_FAILURE
    }
  }

  return {
    ...state,
    phase: 'progressing',
    lastActivityAtMs: nowMs
  }
}

/**
 * Returns the delay until the next watchdog evaluation, or null when no timer is needed.
 */
const getWebglLaunchWatchdogDelay = (state: WebglLaunchWatchdogState, nowMs: number) => {
  if (state.phase === 'idle' || state.phase === 'ready' || state.phase === 'failed') {
    return null
  }

  const deadlineMs =
    state.phase === 'progressing' && state.lastActivityAtMs !== null
      ? state.lastActivityAtMs + WEBGL_PROGRESS_STALL_MS
      : state.startedAtMs + WEBGL_INITIAL_ACTIVITY_STALL_MS

  return Math.max(0, deadlineMs - nowMs)
}

/**
 * Resolves the terminal failure that should be surfaced to the user at the current time.
 */
const getWebglLaunchWatchdogFailure = (
  state: WebglLaunchWatchdogState,
  nowMs: number
): WebglLaunchWatchdogFailure | null => {
  if (state.phase === 'failed') {
    return state.terminalFailure
  }

  if (state.phase === 'loading' && nowMs - state.startedAtMs >= WEBGL_INITIAL_ACTIVITY_STALL_MS) {
    return WEBGL_INITIAL_ACTIVITY_STALL_FAILURE
  }

  if (
    state.phase === 'progressing' &&
    state.lastActivityAtMs !== null &&
    nowMs - state.lastActivityAtMs >= WEBGL_PROGRESS_STALL_MS
  ) {
    return WEBGL_PROGRESS_STALL_FAILURE
  }

  return null
}

const failWebglLaunchWatchdog = (
  state: WebglLaunchWatchdogState,
  failure: WebglLaunchWatchdogFailure
): WebglLaunchWatchdogState => {
  if (state.phase === 'idle' || state.phase === 'ready') {
    return state
  }

  return {
    ...state,
    phase: 'failed',
    terminalFailure: failure
  }
}

const isTerminalWebglLaunchFailure = (state: WebglLaunchWatchdogState) => state.phase === 'failed'

export {
  WEBGL_INITIAL_ACTIVITY_STALL_MS,
  WEBGL_PROGRESS_STALL_MS,
  createWebglLaunchWatchdogState,
  failWebglLaunchWatchdog,
  getWebglLaunchWatchdogDelay,
  getWebglLaunchWatchdogFailure,
  isTerminalWebglLaunchFailure,
  recordWebglLaunchActivity
}
export type {
  WebglLaunchActivity,
  WebglLaunchWatchdogFailure,
  WebglLaunchWatchdogFailureCode,
  WebglLaunchWatchdogPhase,
  WebglLaunchWatchdogState
}
