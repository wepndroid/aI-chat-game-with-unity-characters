import fs from 'node:fs/promises'
import path from 'node:path'
import { Router } from 'express'
import { z } from 'zod'
import { redactLogText } from '../lib/log-redaction'
import { getRuntimeLogEntries } from '../lib/runtime-log-buffer'
import { requireAdmin } from '../middleware/auth-middleware'

const adminLogRoutes = Router()

const MAX_TAIL_BYTES = 256 * 1024
const DEFAULT_LINE_COUNT = 120

const repoRoot = path.resolve(process.cwd(), '..')

const logFileList = [
  {
    id: 'backend-errors',
    label: 'Backend errors',
    absolutePath: path.join(repoRoot, 'backend-dev.err.log'),
    relativePath: 'backend-dev.err.log'
  },
  {
    id: 'backend-output',
    label: 'Backend output',
    absolutePath: path.join(repoRoot, 'backend-dev.out.log'),
    relativePath: 'backend-dev.out.log'
  },
  {
    id: 'backend-combined',
    label: 'Backend combined',
    absolutePath: path.join(process.cwd(), 'backend-dev.log'),
    relativePath: 'Backend/backend-dev.log'
  },
  {
    id: 'frontend-errors',
    label: 'Frontend errors',
    absolutePath: path.join(repoRoot, 'frontend-dev.err.log'),
    relativePath: 'frontend-dev.err.log'
  },
  {
    id: 'frontend-output',
    label: 'Frontend output',
    absolutePath: path.join(repoRoot, 'frontend-dev.out.log'),
    relativePath: 'frontend-dev.out.log'
  }
] as const

const logsQuerySchema = z.object({
  lines: z.coerce.number().int().min(20).max(400).default(DEFAULT_LINE_COUNT)
})

const readLogTail = async (absolutePath: string, maxLineCount: number) => {
  const stat = await fs.stat(absolutePath)
  const start = Math.max(0, stat.size - MAX_TAIL_BYTES)
  const byteLength = stat.size - start
  const fileHandle = await fs.open(absolutePath, 'r')

  try {
    const buffer = Buffer.alloc(byteLength)
    await fileHandle.read(buffer, 0, byteLength, start)
    const text = buffer.toString('utf8').replace(/\r\n/g, '\n')
    const lineList = text.split('\n')

    if (lineList.at(-1) === '') {
      lineList.pop()
    }

    const tailLineList = lineList.slice(-maxLineCount).map(redactLogText)
    return start > 0 ? ['... earlier log output omitted ...', ...tailLineList] : tailLineList
  } finally {
    await fileHandle.close()
  }
}

adminLogRoutes.get('/admin/logs/recent', requireAdmin, async (request, response, next) => {
  try {
    const query = logsQuerySchema.parse(request.query)
    const runtimeLogEntries = getRuntimeLogEntries(query.lines)
    const logs = await Promise.all(
      logFileList.map(async (logFile) => {
        try {
          const stat = await fs.stat(logFile.absolutePath)
          const lineList = await readLogTail(logFile.absolutePath, query.lines)

          return {
            id: logFile.id,
            label: logFile.label,
            relativePath: logFile.relativePath,
            exists: true,
            sizeBytes: stat.size,
            updatedAt: stat.mtime.toISOString(),
            lines: lineList
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return {
              id: logFile.id,
              label: logFile.label,
              relativePath: logFile.relativePath,
              exists: false,
              sizeBytes: 0,
              updatedAt: null,
              lines: []
            }
          }

          throw error
        }
      })
    )

    response.json({
      data: {
        generatedAt: new Date().toISOString(),
        runtimeLogs: runtimeLogEntries,
        logs
      }
    })
  } catch (error) {
    next(error)
  }
})

export default adminLogRoutes
