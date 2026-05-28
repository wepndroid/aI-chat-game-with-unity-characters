// Migration lifecycle: final-migration-required. Disposal checkpoint: post-cutover repository cleanup unless promoted to permanent maintenance tooling.
import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseCliArgs, requireOption, runCli } from './lib/cli'
import { assertInsideLabSource, labRelativePath, parseSafeLabel, reportPathForLabel } from './lib/paths'
import { writeMigrationJsonReport } from './lib/report-writer'
import { inspectSqliteSource } from './lib/sqlite-source-inspector'
import { runTool } from './lib/tool-runner'

type LabSidecarStatus = {
  kind: 'wal' | 'shm'
  exists: boolean
  sizeBytes: number | null
  labRelativePath: string | null
}

const getGitHead = async () => {
  const result = await runTool('git', ['rev-parse', 'HEAD'])
  return result.exitCode === 0 ? result.stdout.trim() : null
}

const getLabSidecarStatus = async (sourcePath: string, kind: LabSidecarStatus['kind']): Promise<LabSidecarStatus> => {
  const sidecarPath = `${sourcePath}-${kind}`
  try {
    const sidecarStat = await stat(sidecarPath)
    return {
      kind,
      exists: true,
      sizeBytes: sidecarStat.size,
      labRelativePath: labRelativePath(sidecarPath)
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }

    return {
      kind,
      exists: false,
      sizeBytes: null,
      labRelativePath: null
    }
  }
}

const main = async () => {
  const args = parseCliArgs()
  const source = requireOption(args, 'source', 0)
  const label = parseSafeLabel(requireOption(args, 'label', 1))
  const sourcePath = assertInsideLabSource(resolve(source))
  const [inspection, walStatus, shmStatus, gitHead] = await Promise.all([
    inspectSqliteSource({ sourcePath }),
    getLabSidecarStatus(sourcePath, 'wal'),
    getLabSidecarStatus(sourcePath, 'shm'),
    getGitHead()
  ])

  const reportPath = await writeMigrationJsonReport({
    reportPath: reportPathForLabel(label, 'source-inspection.json'),
    data: {
      reportVersion: 1,
      generatedAt: new Date().toISOString(),
      gitHead,
      ...inspection,
      sourceSidecars: {
        wal: walStatus,
        shm: shmStatus
      }
    }
  })

  console.log(`Inspected SQLite source ${inspection.labRelativeSourcePath}`)
  console.log(`Tables: ${inspection.tables.length}`)
  console.log(`Source inspection report wrote ${reportPath}`)
}

void runCli(main)
