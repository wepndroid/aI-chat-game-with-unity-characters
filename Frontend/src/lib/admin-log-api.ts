import { apiGet } from '@/lib/api-client'

type AdminLogFileRecord = {
  id: string
  label: string
  relativePath: string
  exists: boolean
  sizeBytes: number
  updatedAt: string | null
  lines: string[]
}

type AdminRuntimeLogEntry = {
  id: string
  level: 'error' | 'warn' | 'info'
  message: string
  createdAt: string
}

type AdminLogPayload = {
  data: {
    generatedAt: string
    runtimeLogs: AdminRuntimeLogEntry[]
    logs: AdminLogFileRecord[]
  }
}

const getRecentAdminLogs = async (lineCount = 120) => {
  return apiGet<AdminLogPayload>(`/admin/logs/recent?lines=${encodeURIComponent(String(lineCount))}`)
}

export { getRecentAdminLogs }
export type { AdminLogFileRecord, AdminLogPayload, AdminRuntimeLogEntry }
