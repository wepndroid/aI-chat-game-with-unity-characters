'use client'

import AdminPageShell from '@/components/shared/admin-page-shell'
import { getRecentAdminLogs, type AdminLogFileRecord, type AdminRuntimeLogEntry } from '@/lib/admin-log-api'
import { useCallback, useEffect, useMemo, useState } from 'react'

const formatBytes = (value: number) => {
  if (value <= 0) {
    return '0 B'
  }

  const unitList = ['B', 'KB', 'MB', 'GB']
  const unitIndex = Math.min(unitList.length - 1, Math.floor(Math.log(value) / Math.log(1024)))
  const scaledValue = value / 1024 ** unitIndex
  return `${scaledValue.toFixed(unitIndex === 0 ? 0 : 1)} ${unitList[unitIndex]}`
}

const formatDateTime = (value: string | null) => {
  if (!value) {
    return 'Not found'
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'medium'
  }).format(new Date(value))
}

const LogFilePanel = ({ logFile }: { logFile: AdminLogFileRecord }) => {
  const renderedLogText = useMemo(() => {
    if (!logFile.exists) {
      return 'This log file does not exist in the current environment.'
    }

    if (logFile.lines.length === 0) {
      return 'No log lines found.'
    }

    return logFile.lines.join('\n')
  }, [logFile.exists, logFile.lines])

  return (
    <section className="overflow-hidden rounded-xl border border-white/10 bg-[#0b0f16]/95">
      <div className="flex flex-col gap-3 border-b border-white/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-white">{logFile.label}</h2>
          <p className="mt-1 truncate font-mono text-[11px] text-[#7f8ca7]">{logFile.relativePath}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#93a0bb]">
          <span
            className={`rounded-full border px-2 py-1 ${
              logFile.exists ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200' : 'border-amber-400/25 bg-amber-400/10 text-amber-200'
            }`}
          >
            {logFile.exists ? 'Available' : 'Missing'}
          </span>
          <span>{formatBytes(logFile.sizeBytes)}</span>
          <span>{formatDateTime(logFile.updatedAt)}</span>
        </div>
      </div>
      <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap break-words bg-black/45 p-4 font-mono text-[11px] leading-5 text-[#d8e0f2]">
        {renderedLogText}
      </pre>
    </section>
  )
}

const RuntimeLogPanel = ({ runtimeLogList }: { runtimeLogList: AdminRuntimeLogEntry[] }) => {
  const renderedRuntimeLogText = useMemo(() => {
    if (runtimeLogList.length === 0) {
      return 'No runtime errors have been captured since the backend process started.'
    }

    return runtimeLogList
      .map((entry) => {
        const timestamp = formatDateTime(entry.createdAt)
        return `[${timestamp}] ${entry.level.toUpperCase()}\n${entry.message}`
      })
      .join('\n\n')
  }, [runtimeLogList])

  return (
    <section className="overflow-hidden rounded-xl border border-ember-400/20 bg-[#110d09]/80">
      <div className="flex flex-col gap-3 border-b border-ember-400/15 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Backend runtime errors</h2>
          <p className="mt-1 text-xs text-[#b8a792]">Captured from this running API process after startup.</p>
        </div>
        <span className="rounded-full border border-ember-400/25 bg-ember-500/10 px-2 py-1 text-[11px] text-ember-100">
          {runtimeLogList.length} entries
        </span>
      </div>
      <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap break-words bg-black/45 p-4 font-mono text-[11px] leading-5 text-[#ffe7c7]">
        {renderedRuntimeLogText}
      </pre>
    </section>
  )
}

const AdminLogsPage = () => {
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [runtimeLogList, setRuntimeLogList] = useState<AdminRuntimeLogEntry[]>([])
  const [logFileList, setLogFileList] = useState<AdminLogFileRecord[]>([])

  const loadLogs = useCallback(async (options?: { showRefreshState?: boolean }) => {
    if (options?.showRefreshState) {
      setIsRefreshing(true)
    } else {
      setIsLoading(true)
    }
    setErrorMessage(null)

    try {
      const payload = await getRecentAdminLogs(160)
      setGeneratedAt(payload.data.generatedAt)
      setRuntimeLogList(payload.data.runtimeLogs)
      setLogFileList(payload.data.logs)
    } catch (error) {
      setGeneratedAt(null)
      setRuntimeLogList([])
      setLogFileList([])
      setErrorMessage(error instanceof Error ? error.message : 'Log files could not be loaded.')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    let isCancelled = false

    Promise.resolve().then(async () => {
      if (isCancelled) {
        return
      }

      await loadLogs()
    })

    return () => {
      isCancelled = true
    }
  }, [loadLogs])

  return (
    <AdminPageShell activeKey="logs">
      <div className="space-y-5">
        <div className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ember-300">System</p>
            <h1 className="mt-2 font-[family-name:var(--font-heading)] text-3xl font-normal text-white">Error Logs</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#9aa7bd]">
              Recent backend runtime errors plus known local log files. Live hosts may still keep older stdout and stderr logs in the provider dashboard.
            </p>
          </div>
          <button
            type="button"
            onClick={() => loadLogs({ showRefreshState: true })}
            disabled={isLoading || isRefreshing}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ember-400/35 bg-ember-500/15 px-4 py-2 text-sm font-semibold text-ember-100 transition hover:bg-ember-500/25 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {generatedAt ? <p className="text-xs text-[#7f8ca7]">Last loaded {formatDateTime(generatedAt)}</p> : null}

        {errorMessage ? (
          <div className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{errorMessage}</div>
        ) : null}

        {isLoading ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-8 text-sm text-[#9aa7bd]">Loading recent logs...</div>
        ) : (
          <div className="space-y-4">
            <RuntimeLogPanel runtimeLogList={runtimeLogList} />
            {logFileList.map((logFile) => (
              <LogFilePanel key={logFile.id} logFile={logFile} />
            ))}
          </div>
        )}
      </div>
    </AdminPageShell>
  )
}

export default AdminLogsPage
