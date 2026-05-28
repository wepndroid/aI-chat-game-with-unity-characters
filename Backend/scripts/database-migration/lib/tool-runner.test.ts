// Migration lifecycle: disposable validation scaffold. Disposal checkpoint: post-cutover repository cleanup with migration-only commands.
import test from 'node:test'
import assert from 'node:assert/strict'
import { runTool } from './tool-runner'

test('captures exit code and redacts stdout and stderr', async () => {
  const result = await runTool(process.execPath, [
    '-e',
    'console.log("API_KEY=super-secret"); console.error("Authorization: Bearer provider-secret-token-value"); process.exit(7)'
  ])

  assert.equal(result.exitCode, 7)
  assert.equal(result.stdout.includes('super-secret'), false)
  assert.equal(result.stderr.includes('provider-secret-token-value'), false)
  assert.match(result.stdout, /API_KEY=\[REDACTED\]/)
  assert.match(result.stderr, /Authorization: \[REDACTED\]/)
})

test('can preserve machine-readable stdout for local structured transport', async () => {
  const result = await runTool(
    process.execPath,
    ['-e', 'console.log(JSON.stringify({ content: "Cookie: keep valid JSON for parser" }))'],
    { redactOutput: false }
  )

  assert.equal(result.exitCode, 0)
  assert.deepEqual(JSON.parse(result.stdout), {
    content: 'Cookie: keep valid JSON for parser'
  })
})

test('reports missing tools without throwing from the runner', async () => {
  const result = await runTool('secretwaifu-missing-tool-for-tests', ['--version'])

  assert.equal(result.exitCode, null)
  assert.equal(result.errorCode, 'ENOENT')
  assert.match(result.stderr, /secretwaifu-missing-tool-for-tests/)
})
