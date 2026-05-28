// Migration lifecycle: final-migration-required support code. Disposal checkpoint: post-cutover repository cleanup with migration-only commands.
import { spawn } from 'node:child_process'
import { redactText } from './redaction'

type ToolRunResult = {
  command: string
  args: string[]
  exitCode: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
  errorCode?: string
}

type ToolRunOptions = {
  cwd?: string
  env?: NodeJS.ProcessEnv
  redactOutput?: boolean
  timeoutMs?: number
}

const runTool = async (command: string, args: string[] = [], options: ToolRunOptions = {}): Promise<ToolRunResult> => {
  return new Promise((resolveResult) => {
    const timeoutMs = options.timeoutMs ?? 30000
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: false,
      windowsHide: true
    })

    let stdout = ''
    let stderr = ''
    let settled = false

    const settle = (result: ToolRunResult) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)
      resolveResult(result)
    }

    const timeout = setTimeout(() => {
      child.kill()
      const safeStdout = options.redactOutput === false ? stdout : redactText(stdout)
      settle({
        command,
        args,
        exitCode: null,
        signal: null,
        stdout: safeStdout,
        stderr: redactText(`${command}: timed out after ${timeoutMs}ms`),
        errorCode: 'ETIMEDOUT'
      })
    }, timeoutMs)

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })

    child.on('error', (error: NodeJS.ErrnoException) => {
      const safeStdout = options.redactOutput === false ? stdout : redactText(stdout)
      settle({
        command,
        args,
        exitCode: null,
        signal: null,
        stdout: safeStdout,
        stderr: redactText(`${command}: ${error.message}`),
        errorCode: error.code
      })
    })

    child.on('close', (exitCode, signal) => {
      const safeStdout = options.redactOutput === false ? stdout : redactText(stdout)
      settle({
        command,
        args,
        exitCode,
        signal,
        stdout: safeStdout,
        stderr: redactText(stderr)
      })
    })
  })
}

const assertToolSucceeded = (result: ToolRunResult, label: string) => {
  if (result.exitCode === 0) {
    return
  }

  throw new Error(`${label} failed with exit code ${result.exitCode ?? 'not-started'}: ${result.stderr || result.stdout}`)
}

export { assertToolSucceeded, runTool }
export type { ToolRunResult }
