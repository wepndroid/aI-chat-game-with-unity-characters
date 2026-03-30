'use client'

import AdminPageShell from '@/components/shared/admin-page-shell'
import { apiGet, apiPatch } from '@/lib/api-client'
import { useEffect, useState } from 'react'

type RuntimeAdminSettingsResponse = {
  data: {
    uploadLimits: {
      maxVrmSizeMb: number
      maxPreviewImageSizeMb: number
      allowedPreviewMimeTypes: string[]
    }
    requestLimits: {
      generalPerMinute: number
      authPerMinute: number
      uploadPerMinute: number
    }
    sessionLogin: {
      sessionTtlMinutes: number
    }
    featureSwitches: {
      publicUploadsEnabled: boolean
      communityPageEnabled: boolean
    }
    maintenance: {
      enabled: boolean
      message: string
      startAtIso: string | null
      endAtIso: string | null
      adminBypass: boolean
      readOnlyMode: boolean
      blockedRoutePrefixes: string[]
    }
    apiKeys: {
      googleClientId: string
      googleClientSecret: string
      googleRedirectUri: string
      patreonClientId: string
      patreonClientSecret: string
      patreonRedirectUri: string
      smtpHost: string
      smtpPort: number
      smtpUser: string
      smtpPass: string
      smtpFrom: string
    }
  }
}

type RuntimeAdminSettingsPatchPayload = RuntimeAdminSettingsResponse['data']

const sectionClassName = 'mt-6 rounded-2xl border border-white/10 bg-[#0c0f14]/95 px-5 py-5 sm:px-6'
const labelClassName = 'text-xs font-semibold uppercase tracking-[0.08em] text-white/65'
const inputClassName =
  'mt-1 w-full rounded-md border border-white/20 bg-[#0f1116]/90 px-3 py-2 text-sm text-white outline-none transition placeholder:text-white/45 focus:border-ember-300 focus:ring-2 focus:ring-ember-400/35'
const hintClassName = 'mt-1 text-xs text-white/50'

const parseCsv = (value: string) =>
  value
    .split(',')
    .map((row) => row.trim())
    .filter(Boolean)

const toLocalInputDateTime = (value: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

const fromLocalInputDateTime = (value: string) => (value.trim().length > 0 ? new Date(value).toISOString() : null)

const GlobalSettingsPage = () => {
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const [maxVrmSizeMb, setMaxVrmSizeMb] = useState('100')
  const [maxPreviewImageSizeMb, setMaxPreviewImageSizeMb] = useState('10')
  const [allowedPreviewMimeTypesCsv, setAllowedPreviewMimeTypesCsv] = useState('image/jpeg, image/png, image/webp, image/gif')
  const [generalPerMinute, setGeneralPerMinute] = useState('240')
  const [authPerMinute, setAuthPerMinute] = useState('60')
  const [uploadPerMinute, setUploadPerMinute] = useState('40')
  const [sessionTtlMinutes, setSessionTtlMinutes] = useState('10080')
  const [publicUploadsEnabled, setPublicUploadsEnabled] = useState(true)
  const [communityPageEnabled, setCommunityPageEnabled] = useState(true)
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(false)
  const [maintenanceMessage, setMaintenanceMessage] = useState('')
  const [maintenanceStartAt, setMaintenanceStartAt] = useState('')
  const [maintenanceEndAt, setMaintenanceEndAt] = useState('')
  const [maintenanceAdminBypass, setMaintenanceAdminBypass] = useState(true)
  const [maintenanceReadOnlyMode, setMaintenanceReadOnlyMode] = useState(false)
  const [googleClientId, setGoogleClientId] = useState('')
  const [googleClientSecret, setGoogleClientSecret] = useState('')
  const [googleRedirectUri, setGoogleRedirectUri] = useState('')
  const [patreonClientId, setPatreonClientId] = useState('')
  const [patreonClientSecret, setPatreonClientSecret] = useState('')
  const [patreonRedirectUri, setPatreonRedirectUri] = useState('')
  const [smtpHost, setSmtpHost] = useState('')
  const [smtpPort, setSmtpPort] = useState('587')
  const [smtpUser, setSmtpUser] = useState('')
  const [smtpPass, setSmtpPass] = useState('')
  const [smtpFrom, setSmtpFrom] = useState('')

  useEffect(() => {
    let isCancelled = false
    Promise.resolve().then(async () => {
      setIsLoading(true)
      setErrorMessage(null)
      try {
        const payload = await apiGet<RuntimeAdminSettingsResponse>('/admin/global-settings')
        if (isCancelled) return
        const settings = payload.data
        setMaxVrmSizeMb(String(settings.uploadLimits.maxVrmSizeMb))
        setMaxPreviewImageSizeMb(String(settings.uploadLimits.maxPreviewImageSizeMb))
        setAllowedPreviewMimeTypesCsv(settings.uploadLimits.allowedPreviewMimeTypes.join(', '))
        setGeneralPerMinute(String(settings.requestLimits.generalPerMinute))
        setAuthPerMinute(String(settings.requestLimits.authPerMinute))
        setUploadPerMinute(String(settings.requestLimits.uploadPerMinute))
        setSessionTtlMinutes(String(settings.sessionLogin.sessionTtlMinutes))
        setPublicUploadsEnabled(settings.featureSwitches.publicUploadsEnabled)
        setCommunityPageEnabled(settings.featureSwitches.communityPageEnabled)
        setMaintenanceEnabled(settings.maintenance.enabled)
        setMaintenanceMessage(settings.maintenance.message)
        setMaintenanceStartAt(toLocalInputDateTime(settings.maintenance.startAtIso))
        setMaintenanceEndAt(toLocalInputDateTime(settings.maintenance.endAtIso))
        setMaintenanceAdminBypass(settings.maintenance.adminBypass)
        setMaintenanceReadOnlyMode(settings.maintenance.readOnlyMode)
        setGoogleClientId(settings.apiKeys.googleClientId)
        setGoogleClientSecret(settings.apiKeys.googleClientSecret)
        setGoogleRedirectUri(settings.apiKeys.googleRedirectUri)
        setPatreonClientId(settings.apiKeys.patreonClientId)
        setPatreonClientSecret(settings.apiKeys.patreonClientSecret)
        setPatreonRedirectUri(settings.apiKeys.patreonRedirectUri)
        setSmtpHost(settings.apiKeys.smtpHost)
        setSmtpPort(String(settings.apiKeys.smtpPort))
        setSmtpUser(settings.apiKeys.smtpUser)
        setSmtpPass(settings.apiKeys.smtpPass)
        setSmtpFrom(settings.apiKeys.smtpFrom)
      } catch (error) {
        if (!isCancelled) setErrorMessage(error instanceof Error ? error.message : 'Failed to load global settings.')
      } finally {
        if (!isCancelled) setIsLoading(false)
      }
    })
    return () => {
      isCancelled = true
    }
  }, [])

  const handleSave = () => {
    Promise.resolve().then(async () => {
      setIsSaving(true)
      setErrorMessage(null)
      setSuccessMessage(null)
      try {
        const payload: RuntimeAdminSettingsPatchPayload = {
          uploadLimits: {
            maxVrmSizeMb: Number(maxVrmSizeMb),
            maxPreviewImageSizeMb: Number(maxPreviewImageSizeMb),
            allowedPreviewMimeTypes: parseCsv(allowedPreviewMimeTypesCsv)
          },
          requestLimits: {
            generalPerMinute: Number(generalPerMinute),
            authPerMinute: Number(authPerMinute),
            uploadPerMinute: Number(uploadPerMinute)
          },
          sessionLogin: {
            sessionTtlMinutes: Number(sessionTtlMinutes)
          },
          featureSwitches: {
            publicUploadsEnabled,
            communityPageEnabled
          },
          maintenance: {
            enabled: maintenanceEnabled,
            message: maintenanceMessage.trim(),
            startAtIso: fromLocalInputDateTime(maintenanceStartAt),
            endAtIso: fromLocalInputDateTime(maintenanceEndAt),
            adminBypass: maintenanceAdminBypass,
            readOnlyMode: maintenanceReadOnlyMode,
            blockedRoutePrefixes: []
          },
          apiKeys: {
            googleClientId: googleClientId.trim(),
            googleClientSecret: googleClientSecret.trim(),
            googleRedirectUri: googleRedirectUri.trim(),
            patreonClientId: patreonClientId.trim(),
            patreonClientSecret: patreonClientSecret.trim(),
            patreonRedirectUri: patreonRedirectUri.trim(),
            smtpHost: smtpHost.trim(),
            smtpPort: Number(smtpPort),
            smtpUser: smtpUser.trim(),
            smtpPass: smtpPass.trim(),
            smtpFrom: smtpFrom.trim()
          }
        }
        await apiPatch<RuntimeAdminSettingsResponse>('/admin/global-settings', payload)
        setSuccessMessage('Global settings saved successfully.')
        setIsEditing(false)
        const refreshed = await apiGet<RuntimeAdminSettingsResponse>('/admin/global-settings')
        setGoogleClientSecret(refreshed.data.apiKeys.googleClientSecret)
        setPatreonClientSecret(refreshed.data.apiKeys.patreonClientSecret)
        setSmtpPass(refreshed.data.apiKeys.smtpPass)
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to save global settings.')
      } finally {
        setIsSaving(false)
      }
    })
  }

  return (
    <AdminPageShell activeKey="global-settings">
      <h1 className="font-[family-name:var(--font-heading)] text-[29px] font-normal leading-none text-white">Global Settings</h1>
      <p className="mt-2 text-sm text-[#95a6c1]">Manage upload policy, request/session limits, feature switches, maintenance mode, and API keys.</p>
      {isLoading ? <p className="mt-4 text-sm text-white/70">Loading settings...</p> : null}
      {errorMessage ? <p className="mt-4 rounded-md border border-rose-300/30 bg-rose-300/10 px-3 py-2 text-sm text-rose-100">{errorMessage}</p> : null}
      {successMessage ? <p className="mt-4 rounded-md border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 text-sm text-emerald-100">{successMessage}</p> : null}

      <fieldset disabled={!isEditing || isLoading || isSaving} className="contents">
      <section className={sectionClassName}>
        <h2 className="font-[family-name:var(--font-heading)] text-[21px] font-normal leading-none text-white">Upload limits</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label><span className={labelClassName}>Max VRM size (MB)</span><input className={inputClassName} value={maxVrmSizeMb} onChange={(event) => setMaxVrmSizeMb(event.target.value)} /></label>
          <label><span className={labelClassName}>Max preview image size (MB)</span><input className={inputClassName} value={maxPreviewImageSizeMb} onChange={(event) => setMaxPreviewImageSizeMb(event.target.value)} /></label>
        </div>
        <label className="mt-4 block"><span className={labelClassName}>Allowed preview mime types (comma-separated)</span><input className={inputClassName} value={allowedPreviewMimeTypesCsv} onChange={(event) => setAllowedPreviewMimeTypesCsv(event.target.value)} /></label>
      </section>

      <section className={sectionClassName}>
        <h2 className="font-[family-name:var(--font-heading)] text-[21px] font-normal leading-none text-white">Request limits (rate limiting)</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label><span className={labelClassName}>General requests / minute</span><input className={inputClassName} value={generalPerMinute} onChange={(event) => setGeneralPerMinute(event.target.value)} /></label>
          <label><span className={labelClassName}>Auth requests / minute</span><input className={inputClassName} value={authPerMinute} onChange={(event) => setAuthPerMinute(event.target.value)} /></label>
          <label><span className={labelClassName}>Upload requests / minute</span><input className={inputClassName} value={uploadPerMinute} onChange={(event) => setUploadPerMinute(event.target.value)} /></label>
        </div>
      </section>

      <section className={sectionClassName}>
        <h2 className="font-[family-name:var(--font-heading)] text-[21px] font-normal leading-none text-white">Session and login settings</h2>
        <label className="mt-4 block max-w-sm">
          <span className={labelClassName}>Session TTL (minutes)</span>
          <input className={inputClassName} value={sessionTtlMinutes} onChange={(event) => setSessionTtlMinutes(event.target.value)} />
          <p className={hintClassName}>Applies to new sessions.</p>
        </label>
      </section>

      <section className={sectionClassName}>
        <h2 className="font-[family-name:var(--font-heading)] text-[21px] font-normal leading-none text-white">Feature switches</h2>
        <div className="mt-4 space-y-3">
          <label className="flex items-center gap-3 text-sm text-white"><input type="checkbox" checked={publicUploadsEnabled} onChange={(event) => setPublicUploadsEnabled(event.target.checked)} />Public uploads enabled</label>
          <label className="flex items-center gap-3 text-sm text-white"><input type="checkbox" checked={communityPageEnabled} onChange={(event) => setCommunityPageEnabled(event.target.checked)} />Community page enabled</label>
        </div>
      </section>

      <section className={sectionClassName}>
        <h2 className="font-[family-name:var(--font-heading)] text-[21px] font-normal leading-none text-white">Maintenance mode</h2>
        <div className="mt-4 space-y-3">
          <label className="flex items-center gap-3 text-sm text-white"><input type="checkbox" checked={maintenanceEnabled} onChange={(event) => setMaintenanceEnabled(event.target.checked)} />Maintenance ON/OFF</label>
          <label className="flex items-center gap-3 text-sm text-white"><input type="checkbox" checked={maintenanceAdminBypass} onChange={(event) => setMaintenanceAdminBypass(event.target.checked)} />Admin bypass</label>
          <label className="flex items-center gap-3 text-sm text-white"><input type="checkbox" checked={maintenanceReadOnlyMode} onChange={(event) => setMaintenanceReadOnlyMode(event.target.checked)} />Read-only mode</label>
        </div>
        <label className="mt-4 block"><span className={labelClassName}>Maintenance message</span><textarea className={inputClassName} rows={4} value={maintenanceMessage} onChange={(event) => setMaintenanceMessage(event.target.value)} /></label>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label><span className={labelClassName}>Start time (optional)</span><input type="datetime-local" className={inputClassName} value={maintenanceStartAt} onChange={(event) => setMaintenanceStartAt(event.target.value)} /></label>
          <label><span className={labelClassName}>End time (optional)</span><input type="datetime-local" className={inputClassName} value={maintenanceEndAt} onChange={(event) => setMaintenanceEndAt(event.target.value)} /></label>
        </div>
      </section>

      <section className={sectionClassName}>
        <h2 className="font-[family-name:var(--font-heading)] text-[21px] font-normal leading-none text-white">API keys</h2>
        <p className={hintClassName}>Leave secret fields blank to keep existing value.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label><span className={labelClassName}>Google client ID</span><input className={inputClassName} value={googleClientId} onChange={(event) => setGoogleClientId(event.target.value)} /></label>
          <label><span className={labelClassName}>Google redirect URI</span><input className={inputClassName} value={googleRedirectUri} onChange={(event) => setGoogleRedirectUri(event.target.value)} /></label>
          <label className="md:col-span-2"><span className={labelClassName}>Google client secret (replace)</span><input className={inputClassName} value={googleClientSecret} onChange={(event) => setGoogleClientSecret(event.target.value)} type="text" /></label>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label><span className={labelClassName}>Patreon client ID</span><input className={inputClassName} value={patreonClientId} onChange={(event) => setPatreonClientId(event.target.value)} /></label>
          <label><span className={labelClassName}>Patreon redirect URI</span><input className={inputClassName} value={patreonRedirectUri} onChange={(event) => setPatreonRedirectUri(event.target.value)} /></label>
          <label className="md:col-span-2"><span className={labelClassName}>Patreon client secret (replace)</span><input className={inputClassName} value={patreonClientSecret} onChange={(event) => setPatreonClientSecret(event.target.value)} type="text" /></label>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label><span className={labelClassName}>SMTP host</span><input className={inputClassName} value={smtpHost} onChange={(event) => setSmtpHost(event.target.value)} /></label>
          <label><span className={labelClassName}>SMTP port</span><input className={inputClassName} value={smtpPort} onChange={(event) => setSmtpPort(event.target.value)} /></label>
          <label><span className={labelClassName}>SMTP user</span><input className={inputClassName} value={smtpUser} onChange={(event) => setSmtpUser(event.target.value)} /></label>
          <label><span className={labelClassName}>SMTP from</span><input className={inputClassName} value={smtpFrom} onChange={(event) => setSmtpFrom(event.target.value)} /></label>
          <label className="md:col-span-2"><span className={labelClassName}>SMTP password (replace)</span><input className={inputClassName} value={smtpPass} onChange={(event) => setSmtpPass(event.target.value)} type="text" /></label>
        </div>
      </section>
      </fieldset>

      <div className="mt-6">
        <button
          type="button"
          className="inline-flex h-11 items-center justify-center rounded-md bg-gradient-to-r from-ember-400 to-ember-500 px-5 text-[11px] font-bold uppercase tracking-[0.1em] text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
          disabled={isLoading || isSaving}
          onClick={() => {
            if (!isEditing) {
              setIsEditing(true)
              setSuccessMessage(null)
              return
            }
            handleSave()
          }}
        >
          {isSaving ? 'Saving...' : isEditing ? 'Save Global Settings' : 'Edit Global Settings'}
        </button>
      </div>
    </AdminPageShell>
  )
}

export default GlobalSettingsPage
