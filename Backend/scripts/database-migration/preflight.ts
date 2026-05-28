// Migration lifecycle: final-migration-required. Disposal checkpoint: post-cutover repository cleanup unless promoted to permanent maintenance tooling.
import { writeMigrationJsonReport } from './lib/report-writer'
import { runTool } from './lib/tool-runner'
import { hasFlag, parseCliArgs, runCli } from './lib/cli'
import { resolvePythonCommand } from './lib/sqlite-source-inspector'

type ToolCheck = {
  name: string
  command: string
  args: string[]
  available: boolean
  version: string | null
  error: string | null
}

const firstOutputLine = (stdout: string, stderr: string) => {
  const output = `${stdout}\n${stderr}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)

  return output ?? null
}

const checkTool = async (name: string, command: string, args: string[] = ['--version']): Promise<ToolCheck> => {
  const result = await runTool(command, args)
  const version = result.exitCode === 0 ? firstOutputLine(result.stdout, result.stderr) : null

  return {
    name,
    command,
    args,
    available: result.exitCode === 0,
    version,
    error: result.exitCode === 0 ? null : result.stderr || result.stdout || result.errorCode || 'Tool check failed.'
  }
}

const checkNpm = async (): Promise<ToolCheck> => {
  const npmExecPath = process.env.npm_execpath
  if (npmExecPath) {
    const result = await runTool(process.execPath, [npmExecPath, '--version'])
    if (result.exitCode === 0) {
      return {
        name: 'npm',
        command: process.execPath,
        args: [npmExecPath, '--version'],
        available: true,
        version: result.stdout.trim(),
        error: null
      }
    }
  }

  const userAgentVersion = process.env.npm_config_user_agent?.match(/npm\/([^\s]+)/)?.[1]
  if (userAgentVersion) {
    return {
      name: 'npm',
      command: 'npm_config_user_agent',
      args: [],
      available: true,
      version: userAgentVersion,
      error: null
    }
  }

  return checkTool('npm', 'npm', ['--version'])
}

const getGitHead = async () => {
  const result = await runTool('git', ['rev-parse', 'HEAD'])
  return result.exitCode === 0 ? result.stdout.trim() : null
}

const main = async () => {
  const args = parseCliArgs()
  const strict = hasFlag(args, 'strict')
  const toolChecks = await Promise.all([
    checkNpm(),
    checkTool('psql', 'psql'),
    checkTool('createdb', 'createdb'),
    checkTool('dropdb', 'dropdb'),
    checkTool('pg_isready', 'pg_isready'),
    checkTool('pg_dump', 'pg_dump'),
    checkTool('pg_restore', 'pg_restore'),
    checkTool('sqlite3', 'sqlite3')
  ])
  const pythonCommand = await resolvePythonCommand()
  const pythonCheck: ToolCheck = pythonCommand
    ? {
        name: 'python-sqlite3',
        command: pythonCommand.command,
        args: [...pythonCommand.args, '-c', 'import sqlite3; print(sqlite3.sqlite_version)'],
        available: true,
        version: pythonCommand.sqliteVersion ?? null,
        error: null
      }
    : {
        name: 'python-sqlite3',
        command: 'python | python3 | py -3',
        args: ['-c', 'import sqlite3; print(sqlite3.sqlite_version)'],
        available: false,
        version: null,
        error: 'Python 3 with sqlite3 is not available on PATH.'
      }

  const report = {
    reportVersion: 1,
    generatedAt: new Date().toISOString(),
    gitHead: await getGitHead(),
    node: {
      available: true,
      version: process.version,
      executable: process.execPath
    },
    tools: [...toolChecks, pythonCheck]
  }

  const reportPath = await writeMigrationJsonReport({
    reportPath: '.migration-lab/reports/preflight.json',
    data: report
  })

  const missingTools = report.tools.filter((tool) => !tool.available)
  console.log(`Migration lab preflight wrote ${reportPath}`)
  console.log(`Available tool checks: ${report.tools.length - missingTools.length}/${report.tools.length}`)
  if (missingTools.length > 0) {
    console.log(`Missing tool checks: ${missingTools.map((tool) => tool.name).join(', ')}`)
  }

  if (strict && missingTools.length > 0) {
    throw new Error(`Strict preflight failed. Missing tool checks: ${missingTools.map((tool) => tool.name).join(', ')}`)
  }
}

void runCli(main)
