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

const applyGlobalSettingsToForm = (
  settings: RuntimeAdminSettingsResponse['data'],
  setters: {
    setMaxVrmSizeMb: (v: string) => void
    setMaxPreviewImageSizeMb: (v: string) => void
    setAllowedPreviewMimeTypesCsv: (v: string) => void
    setGeneralPerMinute: (v: string) => void
    setAuthPerMinute: (v: string) => void
    setUploadPerMinute: (v: string) => void
    setSessionTtlMinutes: (v: string) => void
    setPublicUploadsEnabled: (v: boolean) => void
    setCommunityPageEnabled: (v: boolean) => void
    setMaintenanceEnabled: (v: boolean) => void
    setMaintenanceMessage: (v: string) => void
    setMaintenanceStartAt: (v: string) => void
    setMaintenanceEndAt: (v: string) => void
    setMaintenanceReadOnlyMode: (v: boolean) => void
    setGoogleClientId: (v: string) => void
    setGoogleClientSecret: (v: string) => void
    setGoogleRedirectUri: (v: string) => void
    setPatreonClientId: (v: string) => void
    setPatreonClientSecret: (v: string) => void
    setPatreonRedirectUri: (v: string) => void
    setSmtpHost: (v: string) => void
    setSmtpPort: (v: string) => void
    setSmtpUser: (v: string) => void
    setSmtpPass: (v: string) => void
    setSmtpFrom: (v: string) => void
  }
) => {
  setters.setMaxVrmSizeMb(String(settings.uploadLimits.maxVrmSizeMb))
  setters.setMaxPreviewImageSizeMb(String(settings.uploadLimits.maxPreviewImageSizeMb))
  setters.setAllowedPreviewMimeTypesCsv(settings.uploadLimits.allowedPreviewMimeTypes.join(', '))
  setters.setGeneralPerMinute(String(settings.requestLimits.generalPerMinute))
  setters.setAuthPerMinute(String(settings.requestLimits.authPerMinute))
  setters.setUploadPerMinute(String(settings.requestLimits.uploadPerMinute))
  setters.setSessionTtlMinutes(String(settings.sessionLogin.sessionTtlMinutes))
  setters.setPublicUploadsEnabled(settings.featureSwitches.publicUploadsEnabled)
  setters.setCommunityPageEnabled(settings.featureSwitches.communityPageEnabled)
  setters.setMaintenanceEnabled(settings.maintenance.enabled)
  setters.setMaintenanceMessage(settings.maintenance.message)
  setters.setMaintenanceStartAt(toLocalInputDateTime(settings.maintenance.startAtIso))
  setters.setMaintenanceEndAt(toLocalInputDateTime(settings.maintenance.endAtIso))
  setters.setMaintenanceReadOnlyMode(settings.maintenance.readOnlyMode)
  setters.setGoogleClientId(settings.apiKeys.googleClientId)
  setters.setGoogleClientSecret(settings.apiKeys.googleClientSecret)
  setters.setGoogleRedirectUri(settings.apiKeys.googleRedirectUri)
  setters.setPatreonClientId(settings.apiKeys.patreonClientId)
  setters.setPatreonClientSecret(settings.apiKeys.patreonClientSecret)
  setters.setPatreonRedirectUri(settings.apiKeys.patreonRedirectUri)
  setters.setSmtpHost(settings.apiKeys.smtpHost)
  setters.setSmtpPort(String(settings.apiKeys.smtpPort))
  setters.setSmtpUser(settings.apiKeys.smtpUser)
  setters.setSmtpPass(settings.apiKeys.smtpPass)
  setters.setSmtpFrom(settings.apiKeys.smtpFrom)
}

const EyeIcon = ({ className = 'size-5' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

const EyeOffIcon = ({ className = 'size-5' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" strokeLinecap="round" strokeLinejoin="round" />
    <line x1="1" y1="1" x2="23" y2="23" strokeLinecap="round" />
  </svg>
)

type SecretFieldProps = {
  label: string
  value: string
  onChange: (value: string) => void
  visible: boolean
  onToggleVisible: () => void
  disabled?: boolean
}

const SecretField = ({ label, value, onChange, visible, onToggleVisible, disabled }: SecretFieldProps) => (
  <label className="md:col-span-2 block">
    <span className={labelClassName}>{label}</span>
    <div className="relative mt-1">
      <input
        className={`${inputClassName} pr-11`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type={visible ? 'text' : 'password'}
        autoComplete="off"
        disabled={disabled}
      />
      <button
        type="button"
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-white/55 transition hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-40"
        onClick={onToggleVisible}
        aria-label={visible ? 'Hide value' : 'Show value'}
        aria-pressed={visible}
        disabled={disabled}
      >
        {visible ? <EyeOffIcon className="size-5" /> : <EyeIcon className="size-5" />}
      </button>
    </div>
  </label>
)

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
  const [showGoogleSecret, setShowGoogleSecret] = useState(false)
  const [showPatreonSecret, setShowPatreonSecret] = useState(false)
  const [showSmtpPass, setShowSmtpPass] = useState(false)

  useEffect(() => {
    let isCancelled = false
    Promise.resolve().then(async () => {
      setIsLoading(true)
      setErrorMessage(null)
      try {
        const payload = await apiGet<RuntimeAdminSettingsResponse>('/admin/global-settings')
        if (isCancelled) return
        applyGlobalSettingsToForm(payload.data, {
          setMaxVrmSizeMb,
          setMaxPreviewImageSizeMb,
          setAllowedPreviewMimeTypesCsv,
          setGeneralPerMinute,
          setAuthPerMinute,
          setUploadPerMinute,
          setSessionTtlMinutes,
          setPublicUploadsEnabled,
          setCommunityPageEnabled,
          setMaintenanceEnabled,
          setMaintenanceMessage,
          setMaintenanceStartAt,
          setMaintenanceEndAt,
          setMaintenanceReadOnlyMode,
          setGoogleClientId,
          setGoogleClientSecret,
          setGoogleRedirectUri,
          setPatreonClientId,
          setPatreonClientSecret,
          setPatreonRedirectUri,
          setSmtpHost,
          setSmtpPort,
          setSmtpUser,
          setSmtpPass,
          setSmtpFrom
        })
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
            adminBypass: true,
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
        const saved = await apiPatch<RuntimeAdminSettingsResponse>('/admin/global-settings', payload)
        setSuccessMessage('Global settings saved successfully.')
        setIsEditing(false)
        applyGlobalSettingsToForm(saved.data, {
          setMaxVrmSizeMb,
          setMaxPreviewImageSizeMb,
          setAllowedPreviewMimeTypesCsv,
          setGeneralPerMinute,
          setAuthPerMinute,
          setUploadPerMinute,
          setSessionTtlMinutes,
          setPublicUploadsEnabled,
          setCommunityPageEnabled,
          setMaintenanceEnabled,
          setMaintenanceMessage,
          setMaintenanceStartAt,
          setMaintenanceEndAt,
          setMaintenanceReadOnlyMode,
          setGoogleClientId,
          setGoogleClientSecret,
          setGoogleRedirectUri,
          setPatreonClientId,
          setPatreonClientSecret,
          setPatreonRedirectUri,
          setSmtpHost,
          setSmtpPort,
          setSmtpUser,
          setSmtpPass,
          setSmtpFrom
        })
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
        <p className={hintClassName}>
          Administrator accounts always have full API access (including while this page loads). Visitors who are not admins see the maintenance message when maintenance is on.
        </p>
        <div className="mt-4 space-y-3">
          <label className="flex items-center gap-3 text-sm text-white"><input type="checkbox" checked={maintenanceEnabled} onChange={(event) => setMaintenanceEnabled(event.target.checked)} />Maintenance ON/OFF</label>
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
          <SecretField
            label="Google client secret (replace)"
            value={googleClientSecret}
            onChange={setGoogleClientSecret}
            visible={showGoogleSecret}
            onToggleVisible={() => setShowGoogleSecret((previous) => !previous)}
            disabled={!isEditing || isLoading || isSaving}
          />
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label><span className={labelClassName}>Patreon client ID</span><input className={inputClassName} value={patreonClientId} onChange={(event) => setPatreonClientId(event.target.value)} /></label>
          <label><span className={labelClassName}>Patreon redirect URI</span><input className={inputClassName} value={patreonRedirectUri} onChange={(event) => setPatreonRedirectUri(event.target.value)} /></label>
          <SecretField
            label="Patreon client secret (replace)"
            value={patreonClientSecret}
            onChange={setPatreonClientSecret}
            visible={showPatreonSecret}
            onToggleVisible={() => setShowPatreonSecret((previous) => !previous)}
            disabled={!isEditing || isLoading || isSaving}
          />
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label><span className={labelClassName}>SMTP host</span><input className={inputClassName} value={smtpHost} onChange={(event) => setSmtpHost(event.target.value)} /></label>
          <label><span className={labelClassName}>SMTP port</span><input className={inputClassName} value={smtpPort} onChange={(event) => setSmtpPort(event.target.value)} /></label>
          <label><span className={labelClassName}>SMTP user</span><input className={inputClassName} value={smtpUser} onChange={(event) => setSmtpUser(event.target.value)} /></label>
          <label><span className={labelClassName}>SMTP from</span><input className={inputClassName} value={smtpFrom} onChange={(event) => setSmtpFrom(event.target.value)} /></label>
          <SecretField
            label="SMTP password (replace)"
            value={smtpPass}
            onChange={setSmtpPass}
            visible={showSmtpPass}
            onToggleVisible={() => setShowSmtpPass((previous) => !previous)}
            disabled={!isEditing || isLoading || isSaving}
          />
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
