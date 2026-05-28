// Migration lifecycle: final-migration-required. Disposal checkpoint: post-cutover repository cleanup unless promoted to permanent maintenance tooling.
import { constants } from 'node:fs'
import { copyFile, mkdir, stat } from 'node:fs/promises'
import { basename, isAbsolute, resolve } from 'node:path'
import { calculateFileSha256 } from './lib/file-hash'
import { hasFlag, parseCliArgs, requireOption, runCli } from './lib/cli'
import { getMigrationLabPaths, labRelativePath, parseSafeLabel, reportPathForLabel, sourceDirectoryForLabel } from './lib/paths'
import { redactLocalPath } from './lib/redaction'
import { writeMigrationJsonReport } from './lib/report-writer'

type SidecarStatus = {
  kind: 'wal' | 'shm'
  exists: boolean
  sizeBytes: number | null
  modifiedAt: string | null
  path: string
}

const getSidecarStatus = async (sourcePath: string, kind: SidecarStatus['kind'], showLocalPaths: boolean): Promise<SidecarStatus> => {
  const sidecarPath = `${sourcePath}-${kind}`

  try {
    const sidecarStat = await stat(sidecarPath)
    return {
      kind,
      exists: true,
      sizeBytes: sidecarStat.size,
      modifiedAt: sidecarStat.mtime.toISOString(),
      path: redactLocalPath(sidecarPath, showLocalPaths)
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }

    return {
      kind,
      exists: false,
      sizeBytes: null,
      modifiedAt: null,
      path: redactLocalPath(sidecarPath, showLocalPaths)
    }
  }
}

const main = async () => {
  const args = parseCliArgs()
  const source = requireOption(args, 'source', 0)
  const label = parseSafeLabel(requireOption(args, 'label', 1))
  const showLocalPaths = hasFlag(args, 'show-local-paths')
  const sourcePath = resolve(source)

  if (!isAbsolute(source)) {
    throw new Error('--source must be an absolute path to the operator-provided SQLite database copy.')
  }

  const sourceStat = await stat(sourcePath)
  if (!sourceStat.isFile()) {
    throw new Error(`Source is not a file: ${redactLocalPath(sourcePath, showLocalPaths)}`)
  }

  const [walStatus, shmStatus] = await Promise.all([
    getSidecarStatus(sourcePath, 'wal', showLocalPaths),
    getSidecarStatus(sourcePath, 'shm', showLocalPaths)
  ])

  if (walStatus.exists && (walStatus.sizeBytes ?? 0) > 0) {
    throw new Error('Source SQLite -wal sidecar is non-empty. Provide a checkpointed/stable copy before lab inspection.')
  }

  const labPaths = getMigrationLabPaths()
  await mkdir(labPaths.sourceRoot, { recursive: true })
  const destinationDirectory = sourceDirectoryForLabel(label)
  await mkdir(destinationDirectory)

  const destinationPath = resolve(destinationDirectory, 'source.db')
  await copyFile(sourcePath, destinationPath, constants.COPYFILE_EXCL)
  const destinationStat = await stat(destinationPath)
  const sourceHash = await calculateFileSha256(sourcePath)
  const destinationHash = await calculateFileSha256(destinationPath)

  if (sourceHash !== destinationHash) {
    throw new Error('Copied SQLite source hash does not match the operator-provided source.')
  }

  const reportPath = await writeMigrationJsonReport({
    reportPath: reportPathForLabel(label, 'source-copy.json'),
    data: {
      reportVersion: 1,
      generatedAt: new Date().toISOString(),
      label,
      source: {
        path: redactLocalPath(sourcePath, showLocalPaths),
        fileName: basename(sourcePath),
        sizeBytes: sourceStat.size,
        modifiedAt: sourceStat.mtime.toISOString(),
        sha256: sourceHash
      },
      destination: {
        labRelativePath: labRelativePath(destinationPath),
        sizeBytes: destinationStat.size,
        sha256: destinationHash
      },
      sidecars: {
        wal: walStatus,
        shm: shmStatus
      }
    }
  })

  console.log(`Copied SQLite source into ${labRelativePath(destinationPath)}`)
  console.log(`Source copy report wrote ${reportPath}`)
}

void runCli(main)
