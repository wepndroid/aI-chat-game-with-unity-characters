'use client'

import AdminPageShell from '@/components/shared/admin-page-shell'
import { apiGet } from '@/lib/api-client'
import { useEffect, useState } from 'react'

type DeploymentStatus = 'ready' | 'pending' | 'warning'

type DeploymentChecksResponse = {
  data: {
    checks: Array<{
      id: string
      label: string
      status: DeploymentStatus
      detail: string
    }>
    browserMatrix: Array<{
      browser: string
      status: DeploymentStatus
    }>
  }
}

const statusClassNameMap: Record<DeploymentStatus, string> = {
  ready: 'border-emerald-500/35 bg-emerald-500/15 text-emerald-200',
  pending: 'border-amber-500/35 bg-amber-500/15 text-amber-200',
  warning: 'border-rose-500/35 bg-rose-500/15 text-rose-200'
}

const statusLabelMap: Record<DeploymentStatus, string> = {
  ready: 'Ready',
  pending: 'Pending',
  warning: 'Warning'
}

const GlobalSettingsPage = () => {
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [deploymentChecks, setDeploymentChecks] = useState<DeploymentChecksResponse['data'] | null>(null)

  useEffect(() => {
    let isCancelled = false

    Promise.resolve().then(async () => {
      setIsLoading(true)
      setErrorMessage(null)

      try {
        const payload = await apiGet<DeploymentChecksResponse>('/stats/deployment-checks')

        if (!isCancelled) {
          setDeploymentChecks(payload.data)
        }
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Failed to load deployment checks.')
          setDeploymentChecks(null)
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    })

    return () => {
      isCancelled = true
    }
  }, [])

  return (
    <AdminPageShell activeKey="global-settings">
      <h1 className="font-[family-name:var(--font-heading)] text-[29px] font-normal leading-none text-white">Global Settings</h1>
      <p className="mt-2 text-sm text-[#95a6c1]">Deployment readiness and browser QA checks from live environment config.</p>

      {errorMessage ? (
        <p className="mt-4 rounded-md border border-rose-300/30 bg-rose-300/10 px-3 py-2 text-sm text-rose-100">{errorMessage}</p>
      ) : null}

      <section className="mt-6 rounded-2xl border border-white/10 bg-[#0c0f14]/95 px-5 py-5 sm:px-6">
        <h2 className="font-[family-name:var(--font-heading)] text-[21px] font-normal leading-none text-white">Service Checks</h2>
        {isLoading ? <p className="mt-4 text-sm text-white/70">Loading checks...</p> : null}
        {!isLoading && (deploymentChecks?.checks.length ?? 0) === 0 ? <p className="mt-4 text-sm text-white/70">No checks available.</p> : null}

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {deploymentChecks?.checks.map((checkItem) => (
            <article key={checkItem.id} className="rounded-lg border border-white/10 bg-black/25 px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-white">{checkItem.label}</p>
                <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] ${statusClassNameMap[checkItem.status]}`}>
                  {statusLabelMap[checkItem.status]}
                </span>
              </div>
              <p className="mt-2 text-xs text-white/65">{checkItem.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-5 rounded-2xl border border-white/10 bg-[#0c0f14]/95 px-5 py-5 sm:px-6">
        <h2 className="font-[family-name:var(--font-heading)] text-[21px] font-normal leading-none text-white">Browser Matrix</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[360px] w-full">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase tracking-[0.08em] text-[#6f809d]">
                <th className="px-3 py-2">Browser</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {(deploymentChecks?.browserMatrix.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={2} className="px-3 py-6 text-center text-sm text-white/70">
                    No browser QA rows available.
                  </td>
                </tr>
              ) : (
                deploymentChecks?.browserMatrix.map((browserItem) => (
                  <tr key={browserItem.browser} className="border-b border-white/10 last:border-b-0">
                    <td className="px-3 py-3 text-sm text-white">{browserItem.browser}</td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] ${statusClassNameMap[browserItem.status]}`}>
                        {statusLabelMap[browserItem.status]}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AdminPageShell>
  )
}

export default GlobalSettingsPage
