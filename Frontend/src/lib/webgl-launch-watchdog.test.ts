import test from 'node:test'
import assert from 'node:assert/strict'
import {
  WEBGL_INITIAL_ACTIVITY_STALL_MS,
  WEBGL_PROGRESS_STALL_MS,
  createWebglLaunchWatchdogState,
  getWebglLaunchWatchdogDelay,
  getWebglLaunchWatchdogFailure,
  failWebglLaunchWatchdog,
  isTerminalWebglLaunchFailure,
  recordWebglLaunchActivity
} from './webgl-launch-watchdog'

test('webgl launch watchdog waits for initial activity before failing', () => {
  const state = createWebglLaunchWatchdogState(1_000, 'launch-1')

  assert.equal(getWebglLaunchWatchdogFailure(state, 1_000 + WEBGL_INITIAL_ACTIVITY_STALL_MS - 1), null)
  assert.equal(getWebglLaunchWatchdogDelay(state, 1_000), WEBGL_INITIAL_ACTIVITY_STALL_MS)
})

test('webgl launch watchdog reports an initial no-activity stall', () => {
  const state = createWebglLaunchWatchdogState(1_000, 'launch-1')
  const failure = getWebglLaunchWatchdogFailure(state, 1_000 + WEBGL_INITIAL_ACTIVITY_STALL_MS)

  assert.deepEqual(failure, {
    code: 'initial-activity-stalled',
    message: 'The browser game did not start loading. Please refresh the page and try again.'
  })
})

test('webgl launch watchdog records timed stalls as terminal failures', () => {
  const state = createWebglLaunchWatchdogState(1_000, 'launch-1')
  const failure = getWebglLaunchWatchdogFailure(state, 1_000 + WEBGL_INITIAL_ACTIVITY_STALL_MS)
  assert.ok(failure)

  const failed = failWebglLaunchWatchdog(state, failure)

  assert.equal(failed.phase, 'failed')
  assert.equal(isTerminalWebglLaunchFailure(failed), true)
  assert.deepEqual(getWebglLaunchWatchdogFailure(failed, 100_000), failure)
})

test('webgl launch watchdog extends the stall deadline after Unity progress', () => {
  const loading = createWebglLaunchWatchdogState(1_000, 'launch-1')
  const progressing = recordWebglLaunchActivity(loading, 'unity-progress', 30_000)

  assert.equal(progressing.phase, 'progressing')
  assert.equal(getWebglLaunchWatchdogFailure(progressing, 30_000 + WEBGL_PROGRESS_STALL_MS - 1), null)
  assert.deepEqual(getWebglLaunchWatchdogFailure(progressing, 30_000 + WEBGL_PROGRESS_STALL_MS), {
    code: 'progress-stalled',
    message: 'The browser game stopped loading. Please refresh the page and try again.'
  })
})

test('webgl launch watchdog treats ready as terminal success', () => {
  const loading = createWebglLaunchWatchdogState(1_000, 'launch-1')
  const ready = recordWebglLaunchActivity(loading, 'unity-ready', 2_000)

  assert.equal(ready.phase, 'ready')
  assert.equal(isTerminalWebglLaunchFailure(ready), false)
  assert.equal(getWebglLaunchWatchdogDelay(ready, 200_000), null)
  assert.equal(getWebglLaunchWatchdogFailure(ready, 200_000), null)
})

test('webgl launch watchdog treats explicit loader errors as terminal failures', () => {
  const loading = createWebglLaunchWatchdogState(1_000, 'launch-1')
  const failed = recordWebglLaunchActivity(loading, 'unity-loader-error', 2_000)

  assert.equal(failed.phase, 'failed')
  assert.equal(isTerminalWebglLaunchFailure(failed), true)
  assert.deepEqual(getWebglLaunchWatchdogFailure(failed, 2_000), {
    code: 'loader-error',
    message: 'The browser game failed to load. Please refresh the page and try again.'
  })
})

test('webgl launch watchdog resets when the launch key changes', () => {
  const oldState = recordWebglLaunchActivity(createWebglLaunchWatchdogState(1_000, 'launch-1'), 'unity-progress', 30_000)
  const newState = createWebglLaunchWatchdogState(45_000, 'launch-2')

  assert.notEqual(oldState.key, newState.key)
  assert.equal(newState.phase, 'loading')
  assert.equal(newState.startedAtMs, 45_000)
  assert.equal(newState.lastActivityAtMs, null)
})
