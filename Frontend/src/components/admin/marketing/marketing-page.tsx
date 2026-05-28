'use client'

import AdminPageShell from '@/components/shared/admin-page-shell'
import AdminKpiCard from '@/components/ui-elements/admin-kpi-card'
import { apiGet, apiPatch, apiPost } from '@/lib/api-client'
import {
  formatAutomationStartSuccessMessage,
  type MarketingAutomationEnqueueResult
} from '@/lib/marketing-automation-messages'
import {
  formatMarketingAutomationDelayHours,
  resolveMarketingAutomationDelayHours,
  type MarketingAutomationDelayUnit
} from '@/lib/marketing-automation-delay'
import { useCallback, useEffect, useMemo, useState } from 'react'

type MarketingSegmentKey = 'reminderCandidates' | 'engagedNoPurchase' | 'winBackCandidates'
type TemplateCategory = 'system' | 'onboarding' | 'conversion' | 'winback' | 'announcement'

type MarketingSegmentRecord = {
  id: string
  email: string
  username: string
  isEmailVerified: boolean
  createdAt: string
  lastSeenAt: string | null
  daysSinceSignup: number
  daysSinceLastSeen: number | null
  chatSessionsCount: number
  purchaseCount: number
  totalRevenueCents: number
  currentTierCents: number
  hasActivePaidMembership: boolean
  membershipStatus: string | null
  lastPurchaseAt: string | null
  reason: string
}

type MarketingDashboardResponse = {
  data: {
    summary: {
      reminderCandidates: number
      engagedNoPurchase: number
      winBackCandidates: number
      verificationBlockers: number
    }
    segments: Record<
      MarketingSegmentKey,
      {
        total: number
        records: MarketingSegmentRecord[]
      }
    >
    updatedAt: string
  }
}

type TemplateRecord = {
  id: string
  templateKey: string
  name: string
  description: string
  category: TemplateCategory
  subject: string
  htmlBody: string
  textBody: string
  isBuiltIn: boolean
  createdAt: string
  updatedAt: string
}

type TemplatesResponse = {
  data: {
    records: TemplateRecord[]
    availableVariables: string[]
  }
}

type SendLogRecord = {
  id: string
  templateKey: string
  recipientEmail: string
  recipientUserId: string | null
  segmentKey: string | null
  mode: string
  status: string
  provider: string
  subject: string
  errorMessage: string | null
  createdAt: string
  sentAt: string | null
}

type SendLogsResponse = {
  data: {
    records: SendLogRecord[]
  }
}

type MarketingAutomationCondition =
  | 'email_unverified'
  | 'verified_no_subscription'
  | 'engaged_no_subscription'
  | 'active_subscription'
  | 'canceled_subscription'
  | 'all_verified_users'

type MarketingAutomationRecord = {
  id: string
  templateKey: string
  templateName: string | null
  status: 'active' | 'paused' | 'completed'
  statusCondition: MarketingAutomationCondition
  triggerDelayHours: number
  triggerDelayDays: number
  campaignDiscountCode: string
  campaignFeaturesSummary: string
  campaignCtaUrl: string
  sendIntervalSeconds: number
  maxRecipients: number
  createdAt: string
  updatedAt: string
  startedAt: string | null
  pausedAt: string | null
  stats: {
    totalRecipients: number
    queued: number
    sending: number
    sent: number
    failed: number
  }
}

type MarketingAutomationsResponse = {
  data: {
    records: MarketingAutomationRecord[]
    statusConditions: MarketingAutomationCondition[]
  }
}

const segmentLabelMap: Record<MarketingSegmentKey, string> = {
  reminderCandidates: 'Reminder Candidates',
  engagedNoPurchase: 'Engaged But Unconverted',
  winBackCandidates: 'Win-Back Candidates'
}

const segmentDescriptionMap: Record<MarketingSegmentKey, string> = {
  reminderCandidates: 'Signed up 7+ days ago and still have not purchased.',
  engagedNoPurchase: 'Still active or chatting, but not yet converted.',
  winBackCandidates: 'Paid before, but no longer active right now.'
}

const recommendedTemplateBySegment: Record<MarketingSegmentKey, string> = {
  reminderCandidates: 'signup_reminder_7d',
  engagedNoPurchase: 'engaged_free_features',
  winBackCandidates: 'winback_new_features'
}

const automationConditionLabelMap: Record<MarketingAutomationCondition, string> = {
  email_unverified: 'Email is not verified',
  verified_no_subscription: 'Verified, no subscription',
  engaged_no_subscription: 'Engaged, no subscription',
  active_subscription: 'Has active subscription',
  canceled_subscription: 'Canceled or lapsed subscription',
  all_verified_users: 'All verified users'
}

const automationConditionDescriptionMap: Record<MarketingAutomationCondition, string> = {
  email_unverified: 'Users who signed up but still have not verified their email.',
  verified_no_subscription: 'Verified free users who have not generated a purchase yet.',
  engaged_no_subscription: 'Verified free users with chat or recent activity but no purchase.',
  active_subscription: 'Verified users with an active paid subscription.',
  canceled_subscription: 'Former paying users who no longer have an active subscription.',
  all_verified_users: 'Every verified non-admin user, useful for broad announcements.'
}

const emptyTemplateForm = {
  templateKey: '',
  name: '',
  description: '',
  category: 'announcement' as TemplateCategory,
  subject: '',
  textBody: '',
  htmlBody: ''
}

const formatCompactNumber = (value: number) =>
  new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(value)

const formatCurrency = (valueCents: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2
  }).format(valueCents / 100)

const formatDate = (value: string | null) => {
  if (!value) {
    return '-'
  }

  return new Date(value).toLocaleString()
}

const formatAutomationDelay = (automation: Pick<MarketingAutomationRecord, 'triggerDelayHours' | 'triggerDelayDays'>) => {
  const triggerDelayHours = Number.isFinite(automation.triggerDelayHours)
    ? automation.triggerDelayHours
    : automation.triggerDelayDays * 24

  return formatMarketingAutomationDelayHours(triggerDelayHours)
}

const normalizeTemplateKey = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)

const buildDuplicateTemplateKey = (sourceKey: string, templates: TemplateRecord[]) => {
  const existingKeys = new Set(templates.map((template) => template.templateKey))
  const baseKey = normalizeTemplateKey(`${sourceKey}_copy`) || 'template_copy'

  if (!existingKeys.has(baseKey)) {
    return baseKey
  }

  for (let index = 2; index < 100; index += 1) {
    const suffix = `_${index}`
    const candidate = `${baseKey.slice(0, 80 - suffix.length)}${suffix}`
    if (!existingKeys.has(candidate)) {
      return candidate
    }
  }

  return `${baseKey.slice(0, 70)}_${Date.now().toString(36)}`
}

const interpolateTemplate = (input: string, variables: Record<string, string>) => {
  return input.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, variableName: string) => variables[variableName] ?? '')
}

const buildPreviewDocument = (html: string) => `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      html, body { margin: 0; padding: 0; background: #0b0f14; }
      body { min-height: 100vh; }
      * { box-sizing: border-box; }
      img { max-width: 100%; }
    </style>
  </head>
  <body>${html}</body>
</html>`

const MailIcon = () => {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M4 6.5h16v11H4z" />
      <path d="m5 8 7 5 7-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const PulseIcon = () => {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M3 12h4l2.1-4.2L13 16l2.1-4H21" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const ReturnIcon = () => {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M9 7H5v4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 11a8 8 0 1 0 2.3-5.6L5 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const CheckIcon = () => {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="m5 12 4.2 4.2L19 6.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const EditorInputClassName =
  'mt-1 w-full rounded-md border border-white/15 bg-[#0f131a] px-3 py-2 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-ember-300'

const StatusPill = ({ label, tone }: { label: string; tone: 'green' | 'amber' | 'slate' | 'rose' }) => {
  const toneClassName =
    tone === 'green'
      ? 'border-emerald-500/35 bg-emerald-500/12 text-emerald-200'
      : tone === 'amber'
        ? 'border-amber-500/35 bg-amber-500/12 text-amber-100'
        : tone === 'rose'
          ? 'border-rose-500/35 bg-rose-500/12 text-rose-100'
          : 'border-white/10 bg-white/5 text-[#b8c2d8]'

  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] ${toneClassName}`}>{label}</span>
}

const SegmentTable = ({
  title,
  description,
  total,
  records,
  emptyMessage
}: {
  title: string
  description: string
  total: number
  records: MarketingSegmentRecord[]
  emptyMessage: string
}) => {
  return (
    <section className="rounded-2xl border border-white/10 bg-[#0c0f14]/95 px-4 py-5 sm:px-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-[family-name:var(--font-heading)] text-[18px] font-normal leading-tight text-white sm:text-[21px] sm:leading-none">
            {title}
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-[#91a4c3]">{description}</p>
        </div>
        <p className="shrink-0 text-xs uppercase tracking-[0.08em] text-[#6f809d]">Total: {total.toLocaleString()}</p>
      </div>

      <div className="mt-4 overflow-x-auto">
        {records.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/10 bg-[#10151c] px-4 py-6 text-sm text-[#91a4c3]">{emptyMessage}</p>
        ) : (
          <table className="w-full min-w-[920px]">
            <thead>
              <tr className="border-b border-white/10 text-left">
                <th className="px-3 py-3 text-xs font-normal uppercase tracking-[0.08em] text-[#7081a2]">User</th>
                <th className="px-3 py-3 text-xs font-normal uppercase tracking-[0.08em] text-[#7081a2]">Lifecycle</th>
                <th className="px-3 py-3 text-xs font-normal uppercase tracking-[0.08em] text-[#7081a2]">Activity</th>
                <th className="px-3 py-3 text-xs font-normal uppercase tracking-[0.08em] text-[#7081a2]">Revenue</th>
                <th className="px-3 py-3 text-xs font-normal uppercase tracking-[0.08em] text-[#7081a2]">Suggested Angle</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id} className="border-b border-white/5 align-top last:border-b-0">
                  <td className="px-3 py-4">
                    <p className="text-sm font-medium text-white">{record.username}</p>
                    <p className="mt-1 text-xs text-[#8ea0bf]">{record.email}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <StatusPill label={record.isEmailVerified ? 'Verified' : 'Unverified'} tone={record.isEmailVerified ? 'green' : 'amber'} />
                      <StatusPill
                        label={record.hasActivePaidMembership ? 'Paid Active' : record.purchaseCount > 0 ? 'Former Paid' : 'Free'}
                        tone={record.hasActivePaidMembership ? 'green' : 'slate'}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-4 text-sm text-[#d5def0]">
                    <p>Joined {record.daysSinceSignup}d ago</p>
                    <p className="mt-1 text-xs text-[#8ea0bf]">Created {formatDate(record.createdAt)}</p>
                    {record.membershipStatus ? <p className="mt-2 text-xs text-[#8ea0bf]">Membership: {record.membershipStatus}</p> : null}
                  </td>
                  <td className="px-3 py-4 text-sm text-[#d5def0]">
                    <p>{record.lastSeenAt ? `Last seen ${record.daysSinceLastSeen ?? 0}d ago` : 'No active session yet'}</p>
                    <p className="mt-1 text-xs text-[#8ea0bf]">Last activity {formatDate(record.lastSeenAt)}</p>
                    <p className="mt-2 text-xs text-[#8ea0bf]">
                      {record.chatSessionsCount} chat session{record.chatSessionsCount === 1 ? '' : 's'}
                    </p>
                  </td>
                  <td className="px-3 py-4 text-sm text-[#d5def0]">
                    <p>
                      {record.purchaseCount > 0 ? `${record.purchaseCount} purchase${record.purchaseCount === 1 ? '' : 's'}` : 'No purchases'}
                    </p>
                    <p className="mt-1 text-xs text-[#8ea0bf]">Revenue {formatCurrency(record.totalRevenueCents)}</p>
                    {record.lastPurchaseAt ? <p className="mt-2 text-xs text-[#8ea0bf]">Last paid {formatDate(record.lastPurchaseAt)}</p> : null}
                  </td>
                  <td className="px-3 py-4 text-sm text-[#dbe4f7]">
                    <p className="leading-6">{record.reason}</p>
                    {record.currentTierCents > 0 ? (
                      <p className="mt-2 text-xs text-[#8ea0bf]">Monthly tier: {formatCurrency(record.currentTierCents)}</p>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}

const MarketingPage = () => {
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [dashboard, setDashboard] = useState<MarketingDashboardResponse['data'] | null>(null)
  const [templates, setTemplates] = useState<TemplateRecord[]>([])
  const [availableVariables, setAvailableVariables] = useState<string[]>([])
  const [sendLogs, setSendLogs] = useState<SendLogRecord[]>([])
  const [automations, setAutomations] = useState<MarketingAutomationRecord[]>([])

  const [selectedTemplateKey, setSelectedTemplateKey] = useState('')
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false)
  const [isSavingTemplate, setIsSavingTemplate] = useState(false)
  const [templateForm, setTemplateForm] = useState(emptyTemplateForm)

  const [testTemplateKey, setTestTemplateKey] = useState('')
  const [testEmail, setTestEmail] = useState('')
  const [testUsername, setTestUsername] = useState('Test User')
  const [testDiscountCode, setTestDiscountCode] = useState('TEST10')
  const [testFeaturesSummary, setTestFeaturesSummary] = useState('This is a test message from the SecretWaifu admin dashboard.')
  const [testCtaUrl, setTestCtaUrl] = useState('http://127.0.0.1:7000/members')
  const [isSendingTest, setIsSendingTest] = useState(false)

  const [sendSegmentKey, setSendSegmentKey] = useState<MarketingSegmentKey>('reminderCandidates')
  const [sendTemplateKey, setSendTemplateKey] = useState(recommendedTemplateBySegment.reminderCandidates)
  const [sendLimit, setSendLimit] = useState('25')
  const [includeUnverified, setIncludeUnverified] = useState(false)
  const [campaignDiscountCode, setCampaignDiscountCode] = useState('')
  const [campaignFeaturesSummary, setCampaignFeaturesSummary] = useState('New features, more content, and easier ways to jump back in are ready for you.')
  const [campaignCtaUrl, setCampaignCtaUrl] = useState('http://127.0.0.1:7000/members')
  const [isSendingCampaign, setIsSendingCampaign] = useState(false)
  const [automationTemplateKey, setAutomationTemplateKey] = useState(recommendedTemplateBySegment.reminderCandidates)
  const [automationCondition, setAutomationCondition] = useState<MarketingAutomationCondition>('verified_no_subscription')
  const [automationDelayValue, setAutomationDelayValue] = useState('7')
  const [automationDelayUnit, setAutomationDelayUnit] = useState<MarketingAutomationDelayUnit>('days')
  const [automationIntervalSeconds, setAutomationIntervalSeconds] = useState('60')
  const [automationMaxRecipients, setAutomationMaxRecipients] = useState('20000')
  const [automationDiscountCode, setAutomationDiscountCode] = useState('')
  const [automationFeaturesSummary, setAutomationFeaturesSummary] = useState(
    'New features, more content, and easier ways to jump back in are ready for you.'
  )
  const [automationCtaUrl, setAutomationCtaUrl] = useState('http://127.0.0.1:7000/members')
  const [isStartingAutomation, setIsStartingAutomation] = useState(false)
  const [updatingAutomationId, setUpdatingAutomationId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    const [dashboardPayload, templatesPayload, sendLogsPayload, automationsPayload] = await Promise.all([
      apiGet<MarketingDashboardResponse>('/marketing/dashboard'),
      apiGet<TemplatesResponse>('/marketing/templates'),
      apiGet<SendLogsResponse>('/marketing/send-logs'),
      apiGet<MarketingAutomationsResponse>('/marketing/automations')
    ])

    setDashboard(dashboardPayload.data)
    setTemplates(templatesPayload.data.records)
    setAvailableVariables(templatesPayload.data.availableVariables)
    setSendLogs(sendLogsPayload.data.records)
    setAutomations(automationsPayload.data.records)

    const firstTemplate = templatesPayload.data.records[0]
    if (firstTemplate && !selectedTemplateKey) {
      setSelectedTemplateKey(firstTemplate.templateKey)
      setTemplateForm({
        templateKey: firstTemplate.templateKey,
        name: firstTemplate.name,
        description: firstTemplate.description,
        category: firstTemplate.category,
        subject: firstTemplate.subject,
        textBody: firstTemplate.textBody,
        htmlBody: firstTemplate.htmlBody
      })
    }

    if (firstTemplate && !testTemplateKey) {
      setTestTemplateKey(firstTemplate.templateKey)
    }

    if (firstTemplate && !automationTemplateKey) {
      setAutomationTemplateKey(firstTemplate.templateKey)
    }
  }, [automationTemplateKey, selectedTemplateKey, testTemplateKey])

  useEffect(() => {
    let isCancelled = false

    Promise.resolve().then(async () => {
      setIsLoading(true)
      setErrorMessage(null)

      try {
        await loadData()
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Failed to load marketing dashboard.')
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
  }, [loadData])

  useEffect(() => {
    setSendTemplateKey(recommendedTemplateBySegment[sendSegmentKey])
  }, [sendSegmentKey])

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.templateKey === selectedTemplateKey) ?? null,
    [selectedTemplateKey, templates]
  )

  const previewVariables = useMemo(
    () => ({
      app_name: 'SecretWaifu',
      username: 'DemoUser',
      email: testEmail || 'demo@example.com',
      verification_code: '482193',
      verification_url: testCtaUrl || 'http://127.0.0.1:7000/auth/verify-email',
      reset_code: '901244',
      reset_url: testCtaUrl || 'http://127.0.0.1:7000/auth/reset-password',
      expires_at: '2026-04-30 18:00 UTC',
      members_url: 'http://127.0.0.1:7000/members',
      login_url: 'http://127.0.0.1:7000/sign-up',
      cta_url: testCtaUrl || 'http://127.0.0.1:7000/members',
      support_email: 'support@secretwaifu.com',
      discount_code: testDiscountCode || 'WELCOME10',
      features_summary:
        testFeaturesSummary ||
        'New content drops, stronger member features, and a smoother path back into the experience are all waiting for you.',
      days_since_signup: '7',
      days_since_last_seen: '3',
      chat_sessions_count: '6',
      purchase_count: '1',
      total_revenue_eur: '16.50',
      last_purchase_date: 'April 12, 2026'
    }),
    [testCtaUrl, testDiscountCode, testEmail, testFeaturesSummary]
  )

  const previewSubject = useMemo(() => interpolateTemplate(templateForm.subject, previewVariables), [templateForm.subject, previewVariables])
  const previewHtml = useMemo(() => interpolateTemplate(templateForm.htmlBody, previewVariables), [templateForm.htmlBody, previewVariables])
  const previewText = useMemo(() => interpolateTemplate(templateForm.textBody, previewVariables), [templateForm.textBody, previewVariables])
  const automationDelayPreview = formatMarketingAutomationDelayHours(
    resolveMarketingAutomationDelayHours(automationDelayValue, automationDelayUnit)
  )

  const kpiCards = useMemo(() => {
    if (!dashboard) {
      return []
    }

    return [
      {
        id: 'reminder',
        label: 'Reminder Queue',
        value: formatCompactNumber(dashboard.summary.reminderCandidates),
        helperText: 'Signed up 7+ days ago with no purchase yet',
        tone: 'blue' as const,
        icon: <MailIcon />
      },
      {
        id: 'engaged',
        label: 'Engaged Free Users',
        value: formatCompactNumber(dashboard.summary.engagedNoPurchase),
        helperText: 'Active or chatting, but still unconverted',
        tone: 'purple' as const,
        icon: <PulseIcon />
      },
      {
        id: 'winback',
        label: 'Win-Back Pool',
        value: formatCompactNumber(dashboard.summary.winBackCandidates),
        helperText: 'Paid before, no longer active now',
        tone: 'green' as const,
        icon: <ReturnIcon />
      },
      {
        id: 'verify',
        label: 'Verify First',
        value: formatCompactNumber(dashboard.summary.verificationBlockers),
        helperText: 'Reminder candidates still missing verified email',
        tone: 'orange' as const,
        icon: <CheckIcon />
      }
    ]
  }, [dashboard])

  const handleSelectTemplate = (template: TemplateRecord) => {
    setIsCreatingTemplate(false)
    setSelectedTemplateKey(template.templateKey)
    setTemplateForm({
      templateKey: template.templateKey,
      name: template.name,
      description: template.description,
      category: template.category,
      subject: template.subject,
      textBody: template.textBody,
      htmlBody: template.htmlBody
    })
  }

  const handleCreateNewTemplate = () => {
    setIsCreatingTemplate(true)
    setSelectedTemplateKey('')
    setTemplateForm(emptyTemplateForm)
  }

  const handleDuplicateTemplate = (template: TemplateRecord) => {
    setIsCreatingTemplate(true)
    setSelectedTemplateKey('')
    setTemplateForm({
      templateKey: buildDuplicateTemplateKey(template.templateKey, templates),
      name: `${template.name} Copy`,
      description: template.description,
      category: template.category,
      subject: template.subject,
      textBody: template.textBody,
      htmlBody: template.htmlBody
    })
    setSuccessMessage(`Duplicating "${template.name}". Review the copy, then save it as a new template.`)
    setErrorMessage(null)
  }

  const handleSaveTemplate = async () => {
    setIsSavingTemplate(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      if (isCreatingTemplate) {
        const normalizedTemplateKey = normalizeTemplateKey(templateForm.templateKey)
        if (!normalizedTemplateKey) {
          throw new Error('Template key is required.')
        }

        if (templates.some((template) => template.templateKey === normalizedTemplateKey)) {
          throw new Error(`Email template "${normalizedTemplateKey}" already exists. Choose a different template key.`)
        }

        const payload = await apiPost<{ data: TemplateRecord }>('/marketing/templates', {
          ...templateForm,
          templateKey: normalizedTemplateKey
        })
        setSuccessMessage(`Template "${payload.data.name}" created.`)
      } else if (selectedTemplateKey) {
        const payload = await apiPatch<{ data: TemplateRecord }>(`/marketing/templates/${encodeURIComponent(selectedTemplateKey)}`, {
          name: templateForm.name,
          description: templateForm.description,
          category: templateForm.category,
          subject: templateForm.subject,
          textBody: templateForm.textBody,
          htmlBody: templateForm.htmlBody
        })
        setSuccessMessage(`Template "${payload.data.name}" saved.`)
      }

      await loadData()
      const nextTemplateKey = isCreatingTemplate ? normalizeTemplateKey(templateForm.templateKey) : selectedTemplateKey
      const refreshedTemplate = (await apiGet<TemplatesResponse>('/marketing/templates')).data.records.find(
        (template) => template.templateKey === nextTemplateKey
      )

      if (refreshedTemplate) {
        handleSelectTemplate(refreshedTemplate)
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save template.')
    } finally {
      setIsSavingTemplate(false)
    }
  }

  const handleSendTestEmail = async () => {
    setIsSendingTest(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      const payload = await apiPost<{ data: { sent: boolean; subject: string } }>('/marketing/test-send', {
        templateKey: testTemplateKey,
        toEmail: testEmail.trim(),
        variables: {
          username: testUsername.trim(),
          discount_code: testDiscountCode.trim(),
          features_summary: testFeaturesSummary.trim(),
          cta_url: testCtaUrl.trim()
        }
      })

      setSuccessMessage(`Test email sent: ${payload.data.subject}`)
      const logsPayload = await apiGet<SendLogsResponse>('/marketing/send-logs')
      setSendLogs(logsPayload.data.records)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to send test email.')
    } finally {
      setIsSendingTest(false)
    }
  }

  const handleSendCampaign = async () => {
    setIsSendingCampaign(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      const payload = await apiPost<{
        data: {
          attempted: number
          sent: number
          failed: number
          skippedUnverified: number
        }
      }>('/marketing/send-segment', {
        templateKey: sendTemplateKey,
        segmentKey: sendSegmentKey,
        limit: Number(sendLimit),
        includeUnverified,
        variables: {
          discount_code: campaignDiscountCode.trim(),
          features_summary: campaignFeaturesSummary.trim(),
          cta_url: campaignCtaUrl.trim()
        }
      })

      setSuccessMessage(
        `Campaign finished. Attempted ${payload.data.attempted}, sent ${payload.data.sent}, failed ${payload.data.failed}, skipped ${payload.data.skippedUnverified} unverified users.`
      )

      await loadData()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to send campaign.')
    } finally {
      setIsSendingCampaign(false)
    }
  }

  const handleStartAutomation = async () => {
    setIsStartingAutomation(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      const triggerDelayHours = resolveMarketingAutomationDelayHours(automationDelayValue, automationDelayUnit)
      const payload = await apiPost<{
        data: {
          automation: MarketingAutomationRecord
          enqueueResult: MarketingAutomationEnqueueResult
        }
      }>('/marketing/automations', {
        templateKey: automationTemplateKey,
        statusCondition: automationCondition,
        triggerDelayHours,
        campaignDiscountCode: automationDiscountCode.trim(),
        campaignFeaturesSummary: automationFeaturesSummary.trim(),
        campaignCtaUrl: automationCtaUrl.trim(),
        sendIntervalSeconds: Number(automationIntervalSeconds),
        maxRecipients: Number(automationMaxRecipients)
      })

      setSuccessMessage(formatAutomationStartSuccessMessage(payload.data.enqueueResult))
      await loadData()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to start automation.')
    } finally {
      setIsStartingAutomation(false)
    }
  }

  const handleSetAutomationStatus = async (automationId: string, nextAction: 'pause' | 'resume') => {
    setUpdatingAutomationId(automationId)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      await apiPost(`/marketing/automations/${encodeURIComponent(automationId)}/${nextAction}`, {})
      setSuccessMessage(nextAction === 'pause' ? 'Automation paused.' : 'Automation resumed.')
      await loadData()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to update automation.')
    } finally {
      setUpdatingAutomationId(null)
    }
  }

  return (
    <AdminPageShell activeKey="marketing">
      <h1 className="font-[family-name:var(--font-heading)] text-[22px] font-normal leading-tight text-white sm:text-[26px] md:text-[29px] md:leading-none">
        Marketing
      </h1>
      <p className="mt-2 max-w-4xl text-sm text-[#95a6c1]">
        This page handles real email operations: editable templates, test sends, queued automations, manual segment sends, and delivery logs.
      </p>
      <p className="mt-2 break-words text-sm text-[#95a6c1]">
        Last updated: {dashboard ? new Date(dashboard.updatedAt).toLocaleString() : isLoading ? 'Loading...' : '-'}
      </p>

      {errorMessage ? (
        <p className="mt-4 rounded-md border border-rose-300/30 bg-rose-300/10 px-3 py-2 text-sm text-rose-100">{errorMessage}</p>
      ) : null}
      {successMessage ? (
        <p className="mt-4 rounded-md border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 text-sm text-emerald-100">{successMessage}</p>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        {isLoading && kpiCards.length === 0 ? <p className="col-span-full text-sm text-white/70">Loading marketing segments...</p> : null}
        {kpiCards.map((card) => (
          <AdminKpiCard
            key={card.id}
            label={card.label}
            value={card.value}
            helperText={card.helperText}
            tone={card.tone}
            icon={card.icon}
          />
        ))}
      </div>

      <section className="mt-5 rounded-2xl border border-amber-500/20 bg-[linear-gradient(135deg,rgba(244,99,19,0.12),rgba(12,15,20,0.95))] px-4 py-5 sm:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <h2 className="font-[family-name:var(--font-heading)] text-[18px] font-normal text-white sm:text-[21px]">
              Manual And Queued Sending
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#f2dccf]">
              Queued automations now run through the background worker. You can still send test emails and one-off manual campaigns from this page.
            </p>
          </div>
          <div className="grid gap-2 text-sm text-[#f8e8de] sm:min-w-[320px]">
            <p className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">Mailgun delivery is already connected through global settings.</p>
            <p className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">Ten starter templates are preloaded and editable.</p>
            <p className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">Signup reminders and win-back sequences can be throttled through queued automations.</p>
          </div>
        </div>
      </section>

      <section className="mt-5 grid gap-4 xl:grid-cols-[300px_1fr]">
        <div className="rounded-2xl border border-white/10 bg-[#0c0f14]/95 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-[family-name:var(--font-heading)] text-[18px] text-white">Templates</h2>
            <button
              type="button"
              onClick={handleCreateNewTemplate}
              className="rounded-md border border-white/15 px-3 py-1.5 text-xs text-white transition hover:border-white/30 hover:bg-white/5"
            >
              New Template
            </button>
          </div>
          <p className="mt-2 text-sm text-[#91a4c3]">{templates.length} templates available.</p>
          <div className="mt-4 space-y-2">
            {templates.map((template) => (
              <div
                key={template.templateKey}
                className={`rounded-xl border px-3 py-3 transition ${
                  selectedTemplateKey === template.templateKey && !isCreatingTemplate
                    ? 'border-ember-400/40 bg-[#26180f] text-white'
                    : 'border-white/10 bg-[#10151c] text-[#d5def0] hover:border-white/20 hover:bg-[#131924]'
                }`}
              >
                <button type="button" onClick={() => handleSelectTemplate(template)} className="block w-full text-left">
                  <p className="text-sm font-medium">{template.name}</p>
                  <p className="mt-1 text-xs text-[#8ea0bf]">{template.templateKey}</p>
                </button>
                <div className="mt-2 flex flex-wrap gap-2">
                  <StatusPill label={template.category} tone="slate" />
                  {template.isBuiltIn ? <StatusPill label="Built-in" tone="amber" /> : <StatusPill label="Custom" tone="green" />}
                  <button
                    type="button"
                    onClick={() => handleDuplicateTemplate(template)}
                    className="rounded-full border border-white/15 px-2.5 py-1 text-[11px] text-white transition hover:border-ember-300/50 hover:bg-ember-300/10"
                  >
                    Duplicate
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0c0f14]/95 p-4 sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-[family-name:var(--font-heading)] text-[18px] text-white sm:text-[21px]">
                {isCreatingTemplate ? 'Create Template' : selectedTemplate ? `Edit: ${selectedTemplate.name}` : 'Template Editor'}
              </h2>
              <p className="mt-2 text-sm text-[#91a4c3]">
                {'Use placeholders like {{username}}, {{discount_code}}, {{cta_url}}, and {{features_summary}}.'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleSaveTemplate}
              disabled={isSavingTemplate}
              className="rounded-md bg-gradient-to-r from-ember-400 to-ember-500 px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-black disabled:opacity-70"
            >
              {isSavingTemplate ? 'Saving...' : isCreatingTemplate ? 'Create Template' : 'Save Template'}
            </button>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label>
              <span className="text-xs uppercase tracking-[0.08em] text-[#7a8caa]">Template Key</span>
              <input
                className={EditorInputClassName}
                value={templateForm.templateKey}
                disabled={!isCreatingTemplate}
                onChange={(event) => setTemplateForm((previous) => ({ ...previous, templateKey: normalizeTemplateKey(event.target.value) }))}
              />
            </label>
            <label>
              <span className="text-xs uppercase tracking-[0.08em] text-[#7a8caa]">Category</span>
              <select
                className={EditorInputClassName}
                value={templateForm.category}
                onChange={(event) => setTemplateForm((previous) => ({ ...previous, category: event.target.value as TemplateCategory }))}
              >
                <option value="system">System</option>
                <option value="onboarding">Onboarding</option>
                <option value="conversion">Conversion</option>
                <option value="winback">Winback</option>
                <option value="announcement">Announcement</option>
              </select>
            </label>
            <label>
              <span className="text-xs uppercase tracking-[0.08em] text-[#7a8caa]">Name</span>
              <input
                className={EditorInputClassName}
                value={templateForm.name}
                onChange={(event) => setTemplateForm((previous) => ({ ...previous, name: event.target.value }))}
              />
            </label>
            <label>
              <span className="text-xs uppercase tracking-[0.08em] text-[#7a8caa]">Subject</span>
              <input
                className={EditorInputClassName}
                value={templateForm.subject}
                onChange={(event) => setTemplateForm((previous) => ({ ...previous, subject: event.target.value }))}
              />
            </label>
          </div>

          <label className="mt-4 block">
            <span className="text-xs uppercase tracking-[0.08em] text-[#7a8caa]">Description</span>
            <textarea
              rows={2}
              className={EditorInputClassName}
              value={templateForm.description}
              onChange={(event) => setTemplateForm((previous) => ({ ...previous, description: event.target.value }))}
            />
          </label>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <label>
              <span className="text-xs uppercase tracking-[0.08em] text-[#7a8caa]">Plain Text Body</span>
              <textarea
                rows={14}
                className={EditorInputClassName}
                value={templateForm.textBody}
                onChange={(event) => setTemplateForm((previous) => ({ ...previous, textBody: event.target.value }))}
              />
            </label>
            <label>
              <span className="text-xs uppercase tracking-[0.08em] text-[#7a8caa]">HTML Body</span>
              <textarea
                rows={14}
                className={EditorInputClassName}
                value={templateForm.htmlBody}
                onChange={(event) => setTemplateForm((previous) => ({ ...previous, htmlBody: event.target.value }))}
              />
            </label>
          </div>

          <div className="mt-4">
            <p className="text-xs uppercase tracking-[0.08em] text-[#7a8caa]">Available Variables</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {availableVariables.map((variableName) => (
                <code key={variableName} className="rounded-full border border-white/10 bg-[#11161d] px-2.5 py-1 text-[11px] text-[#cbd6eb]">
                  {`{{${variableName}}}`}
                </code>
              ))}
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-white/10 bg-[#090c11] p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-[family-name:var(--font-heading)] text-[17px] text-white">Rendered Email Preview</h3>
                <p className="mt-1 text-sm text-[#91a4c3]">Preview uses sample values so you can judge layout, CTA clarity, and overall feel.</p>
              </div>
              <StatusPill label="HTML Preview" tone="green" />
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-white">
              <div className="border-b border-slate-200 bg-slate-100 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.08em] text-slate-500">Subject</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{previewSubject || '(no subject yet)'}</p>
              </div>
              <iframe title="Rendered email preview" srcDoc={buildPreviewDocument(previewHtml)} className="h-[760px] w-full bg-white" />
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-[#10151c] p-4">
              <p className="text-xs uppercase tracking-[0.08em] text-[#7a8caa]">Plain Text Version</p>
              <pre className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-[#d7e0f2]">{previewText || '(no text body yet)'}</pre>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-[#0c0f14]/95 p-4 sm:p-6">
          <h2 className="font-[family-name:var(--font-heading)] text-[18px] text-white sm:text-[21px]">Send Test Email</h2>
          <p className="mt-2 text-sm text-[#91a4c3]">Use this to send any template to a specific email before sending to real users.</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label>
              <span className="text-xs uppercase tracking-[0.08em] text-[#7a8caa]">Template</span>
              <select className={EditorInputClassName} value={testTemplateKey} onChange={(event) => setTestTemplateKey(event.target.value)}>
                {templates.map((template) => (
                  <option key={template.templateKey} value={template.templateKey}>
                    {template.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="text-xs uppercase tracking-[0.08em] text-[#7a8caa]">Recipient Email</span>
              <input className={EditorInputClassName} value={testEmail} onChange={(event) => setTestEmail(event.target.value)} />
            </label>
            <label>
              <span className="text-xs uppercase tracking-[0.08em] text-[#7a8caa]">Username</span>
              <input className={EditorInputClassName} value={testUsername} onChange={(event) => setTestUsername(event.target.value)} />
            </label>
            <label>
              <span className="text-xs uppercase tracking-[0.08em] text-[#7a8caa]">Discount Code</span>
              <input className={EditorInputClassName} value={testDiscountCode} onChange={(event) => setTestDiscountCode(event.target.value)} />
            </label>
          </div>
          <label className="mt-4 block">
            <span className="text-xs uppercase tracking-[0.08em] text-[#7a8caa]">Features Summary</span>
            <textarea rows={3} className={EditorInputClassName} value={testFeaturesSummary} onChange={(event) => setTestFeaturesSummary(event.target.value)} />
          </label>
          <label className="mt-4 block">
            <span className="text-xs uppercase tracking-[0.08em] text-[#7a8caa]">CTA URL</span>
            <input className={EditorInputClassName} value={testCtaUrl} onChange={(event) => setTestCtaUrl(event.target.value)} />
          </label>
          <button
            type="button"
            onClick={handleSendTestEmail}
            disabled={isSendingTest}
            className="mt-4 rounded-md bg-gradient-to-r from-ember-400 to-ember-500 px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-black disabled:opacity-70"
          >
            {isSendingTest ? 'Sending...' : 'Send Test Email'}
          </button>
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#0c0f14]/95 p-4 sm:p-6">
          <h2 className="font-[family-name:var(--font-heading)] text-[18px] text-white sm:text-[21px]">Send Campaign To Segment</h2>
          <p className="mt-2 text-sm text-[#91a4c3]">This is the actual send action. It sends the chosen template to users in one lifecycle segment.</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label>
              <span className="text-xs uppercase tracking-[0.08em] text-[#7a8caa]">Segment</span>
              <select
                className={EditorInputClassName}
                value={sendSegmentKey}
                onChange={(event) => setSendSegmentKey(event.target.value as MarketingSegmentKey)}
              >
                <option value="reminderCandidates">Reminder Candidates</option>
                <option value="engagedNoPurchase">Engaged But Unconverted</option>
                <option value="winBackCandidates">Win-Back Candidates</option>
              </select>
            </label>
            <label>
              <span className="text-xs uppercase tracking-[0.08em] text-[#7a8caa]">Template</span>
              <select className={EditorInputClassName} value={sendTemplateKey} onChange={(event) => setSendTemplateKey(event.target.value)}>
                {templates.map((template) => (
                  <option key={template.templateKey} value={template.templateKey}>
                    {template.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="text-xs uppercase tracking-[0.08em] text-[#7a8caa]">Limit</span>
              <input className={EditorInputClassName} value={sendLimit} onChange={(event) => setSendLimit(event.target.value)} />
            </label>
            <label className="flex items-end">
              <span className="mb-2 flex items-center gap-3 text-sm text-white/80">
                <input type="checkbox" checked={includeUnverified} onChange={(event) => setIncludeUnverified(event.target.checked)} />
                Include unverified emails
              </span>
            </label>
          </div>
          <label className="mt-4 block">
            <span className="text-xs uppercase tracking-[0.08em] text-[#7a8caa]">Campaign Discount Code</span>
            <input className={EditorInputClassName} value={campaignDiscountCode} onChange={(event) => setCampaignDiscountCode(event.target.value)} />
          </label>
          <label className="mt-4 block">
            <span className="text-xs uppercase tracking-[0.08em] text-[#7a8caa]">Campaign Features Summary</span>
            <textarea rows={3} className={EditorInputClassName} value={campaignFeaturesSummary} onChange={(event) => setCampaignFeaturesSummary(event.target.value)} />
          </label>
          <label className="mt-4 block">
            <span className="text-xs uppercase tracking-[0.08em] text-[#7a8caa]">Campaign CTA URL</span>
            <input className={EditorInputClassName} value={campaignCtaUrl} onChange={(event) => setCampaignCtaUrl(event.target.value)} />
          </label>
          <div className="mt-4 rounded-xl border border-white/10 bg-[#10151c] px-3 py-3 text-sm text-[#d4ddf0]">
            <p className="font-medium text-white">{segmentLabelMap[sendSegmentKey]}</p>
            <p className="mt-1 text-[#8ea0bf]">{segmentDescriptionMap[sendSegmentKey]}</p>
            <p className="mt-2 text-xs text-[#8ea0bf]">Recommended template: {recommendedTemplateBySegment[sendSegmentKey]}</p>
          </div>
          <button
            type="button"
            onClick={handleSendCampaign}
            disabled={isSendingCampaign}
            className="mt-4 rounded-md bg-gradient-to-r from-ember-400 to-ember-500 px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-black disabled:opacity-70"
          >
            {isSendingCampaign ? 'Sending...' : 'Send Campaign'}
          </button>
        </section>
      </div>

      <section className="mt-5 rounded-2xl border border-white/10 bg-[#0c0f14]/95 p-4 sm:p-6">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="font-[family-name:var(--font-heading)] text-[18px] text-white sm:text-[21px]">Marketing Automation</h2>
            <p className="mt-2 max-w-4xl text-sm text-[#91a4c3]">
              Start a throttled email queue instead of sending every message inside one browser request.
            </p>
          </div>
          <StatusPill label="Queued Sending" tone="green" />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <label>
            <span className="text-xs uppercase tracking-[0.08em] text-[#7a8caa]">Template</span>
            <select className={EditorInputClassName} value={automationTemplateKey} onChange={(event) => setAutomationTemplateKey(event.target.value)}>
              {templates.map((template) => (
                <option key={template.templateKey} value={template.templateKey}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="text-xs uppercase tracking-[0.08em] text-[#7a8caa]">Send When Status</span>
            <select
              className={EditorInputClassName}
              value={automationCondition}
              onChange={(event) => setAutomationCondition(event.target.value as MarketingAutomationCondition)}
            >
              {Object.entries(automationConditionLabelMap).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div>
            <span className="text-xs uppercase tracking-[0.08em] text-[#7a8caa]">Exceeded Time</span>
            <div className="mt-1 grid grid-cols-[1fr_120px] gap-2">
              <input className={EditorInputClassName.replace('mt-1 ', '')} value={automationDelayValue} onChange={(event) => setAutomationDelayValue(event.target.value)} />
              <select
                className={EditorInputClassName.replace('mt-1 ', '')}
                value={automationDelayUnit}
                onChange={(event) => setAutomationDelayUnit(event.target.value as MarketingAutomationDelayUnit)}
              >
                <option value="days">Days</option>
                <option value="hours">Hours</option>
              </select>
            </div>
          </div>
          <label>
            <span className="text-xs uppercase tracking-[0.08em] text-[#7a8caa]">Campaign Discount Code</span>
            <input className={EditorInputClassName} value={automationDiscountCode} onChange={(event) => setAutomationDiscountCode(event.target.value)} />
          </label>
          <label>
            <span className="text-xs uppercase tracking-[0.08em] text-[#7a8caa]">Campaign CTA URL</span>
            <input className={EditorInputClassName} value={automationCtaUrl} onChange={(event) => setAutomationCtaUrl(event.target.value)} />
          </label>
          <label>
            <span className="text-xs uppercase tracking-[0.08em] text-[#7a8caa]">Interval Between Emails</span>
            <input
              className={EditorInputClassName}
              value={automationIntervalSeconds}
              onChange={(event) => setAutomationIntervalSeconds(event.target.value)}
            />
          </label>
        </div>

        <label className="mt-4 block">
          <span className="text-xs uppercase tracking-[0.08em] text-[#7a8caa]">Campaign Features Summary</span>
          <textarea
            rows={3}
            className={EditorInputClassName}
            value={automationFeaturesSummary}
            onChange={(event) => setAutomationFeaturesSummary(event.target.value)}
          />
        </label>

        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <label>
            <span className="text-xs uppercase tracking-[0.08em] text-[#7a8caa]">Max Recipients</span>
            <input
              className={EditorInputClassName}
              value={automationMaxRecipients}
              onChange={(event) => setAutomationMaxRecipients(event.target.value)}
            />
          </label>
          <button
            type="button"
            onClick={handleStartAutomation}
            disabled={isStartingAutomation}
            className="rounded-md bg-gradient-to-r from-ember-400 to-ember-500 px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-black disabled:opacity-70"
          >
            {isStartingAutomation ? 'Starting...' : 'Start Automation'}
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-white/10 bg-[#10151c] px-3 py-3 text-sm text-[#d4ddf0]">
          <p className="font-medium text-white">{automationConditionLabelMap[automationCondition]}</p>
          <p className="mt-1 text-[#8ea0bf]">{automationConditionDescriptionMap[automationCondition]}</p>
          <p className="mt-2 text-xs text-[#8ea0bf]">
            Users become eligible after {automationDelayPreview} in this status.
          </p>
          <p className="mt-1 text-xs text-[#8ea0bf]">
            At {Number(automationIntervalSeconds || 0) || 0}s per email, 100 recipients takes about{' '}
            {Math.ceil(((Number(automationIntervalSeconds || 0) || 0) * 100) / 60).toLocaleString()} minutes.
          </p>
        </div>

        <div className="mt-6 overflow-x-auto">
          {automations.length === 0 ? (
            <p className="rounded-xl border border-dashed border-white/10 bg-[#10151c] px-4 py-6 text-sm text-[#91a4c3]">
              No automations have been started yet.
            </p>
          ) : (
            <table className="w-full min-w-[980px]">
              <thead>
                <tr className="border-b border-white/10 text-left">
                  <th className="px-3 py-3 text-xs uppercase tracking-[0.08em] text-[#7081a2]">Status</th>
                  <th className="px-3 py-3 text-xs uppercase tracking-[0.08em] text-[#7081a2]">Rule</th>
                  <th className="px-3 py-3 text-xs uppercase tracking-[0.08em] text-[#7081a2]">Template</th>
                  <th className="px-3 py-3 text-xs uppercase tracking-[0.08em] text-[#7081a2]">Queued</th>
                  <th className="px-3 py-3 text-xs uppercase tracking-[0.08em] text-[#7081a2]">Sent</th>
                  <th className="px-3 py-3 text-xs uppercase tracking-[0.08em] text-[#7081a2]">Failed</th>
                  <th className="px-3 py-3 text-xs uppercase tracking-[0.08em] text-[#7081a2]">Interval</th>
                  <th className="px-3 py-3 text-xs uppercase tracking-[0.08em] text-[#7081a2]">Started</th>
                  <th className="px-3 py-3 text-xs uppercase tracking-[0.08em] text-[#7081a2]">Action</th>
                </tr>
              </thead>
              <tbody>
                {automations.map((automation) => (
                  <tr key={automation.id} className="border-b border-white/5 align-top last:border-b-0">
                    <td className="px-3 py-4">
                      <StatusPill
                        label={automation.status}
                        tone={automation.status === 'active' ? 'green' : automation.status === 'completed' ? 'slate' : 'amber'}
                      />
                    </td>
                    <td className="px-3 py-4 text-sm text-[#d5def0]">
                      <p>{automationConditionLabelMap[automation.statusCondition]}</p>
                      <p className="mt-1 text-xs text-[#8ea0bf]">after {formatAutomationDelay(automation)}</p>
                    </td>
                    <td className="px-3 py-4 text-sm text-[#d5def0]">
                      <p>{automation.templateName ?? automation.templateKey}</p>
                      <p className="mt-1 text-xs text-[#8ea0bf]">{automation.templateKey}</p>
                    </td>
                    <td className="px-3 py-4 text-sm text-[#d5def0]">{automation.stats.queued.toLocaleString()}</td>
                    <td className="px-3 py-4 text-sm text-emerald-200">{automation.stats.sent.toLocaleString()}</td>
                    <td className="px-3 py-4 text-sm text-rose-200">{automation.stats.failed.toLocaleString()}</td>
                    <td className="px-3 py-4 text-sm text-[#d5def0]">{automation.sendIntervalSeconds}s</td>
                    <td className="px-3 py-4 text-sm text-[#d5def0]">{formatDate(automation.startedAt ?? automation.createdAt)}</td>
                    <td className="px-3 py-4">
                      {automation.status === 'active' ? (
                        <button
                          type="button"
                          onClick={() => void handleSetAutomationStatus(automation.id, 'pause')}
                          disabled={updatingAutomationId === automation.id}
                          className="rounded-md border border-white/15 px-3 py-1.5 text-xs text-white transition hover:border-white/30 hover:bg-white/5 disabled:opacity-60"
                        >
                          Pause
                        </button>
                      ) : automation.status === 'paused' ? (
                        <button
                          type="button"
                          onClick={() => void handleSetAutomationStatus(automation.id, 'resume')}
                          disabled={updatingAutomationId === automation.id}
                          className="rounded-md border border-emerald-300/30 px-3 py-1.5 text-xs text-emerald-100 transition hover:bg-emerald-300/10 disabled:opacity-60"
                        >
                          Resume
                        </button>
                      ) : (
                        <span className="text-xs text-[#8ea0bf]">Done</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="mt-5 rounded-2xl border border-white/10 bg-[#0c0f14]/95 px-4 py-5 sm:px-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-[family-name:var(--font-heading)] text-[18px] font-normal leading-tight text-white sm:text-[21px] sm:leading-none">
            Recent Send Logs
          </h2>
          <p className="text-xs uppercase tracking-[0.08em] text-[#6f809d]">Latest {sendLogs.length}</p>
        </div>
        <div className="mt-4 overflow-x-auto">
          {sendLogs.length === 0 ? (
            <p className="rounded-xl border border-dashed border-white/10 bg-[#10151c] px-4 py-6 text-sm text-[#91a4c3]">No email activity yet.</p>
          ) : (
            <table className="w-full min-w-[920px]">
              <thead>
                <tr className="border-b border-white/10 text-left">
                  <th className="px-3 py-3 text-xs uppercase tracking-[0.08em] text-[#7081a2]">Status</th>
                  <th className="px-3 py-3 text-xs uppercase tracking-[0.08em] text-[#7081a2]">Recipient</th>
                  <th className="px-3 py-3 text-xs uppercase tracking-[0.08em] text-[#7081a2]">Template</th>
                  <th className="px-3 py-3 text-xs uppercase tracking-[0.08em] text-[#7081a2]">Mode</th>
                  <th className="px-3 py-3 text-xs uppercase tracking-[0.08em] text-[#7081a2]">Provider</th>
                  <th className="px-3 py-3 text-xs uppercase tracking-[0.08em] text-[#7081a2]">Sent</th>
                </tr>
              </thead>
              <tbody>
                {sendLogs.map((log) => (
                  <tr key={log.id} className="border-b border-white/5 align-top last:border-b-0">
                    <td className="px-3 py-4">
                      <StatusPill label={log.status} tone={log.status === 'sent' ? 'green' : 'rose'} />
                    </td>
                    <td className="px-3 py-4 text-sm text-[#d5def0]">
                      <p>{log.recipientEmail}</p>
                      {log.errorMessage ? <p className="mt-1 text-xs text-rose-200">{log.errorMessage}</p> : null}
                    </td>
                    <td className="px-3 py-4 text-sm text-[#d5def0]">
                      <p>{log.templateKey}</p>
                      <p className="mt-1 text-xs text-[#8ea0bf]">{log.subject}</p>
                    </td>
                    <td className="px-3 py-4 text-sm text-[#d5def0]">
                      <p>{log.mode}</p>
                      {log.segmentKey ? <p className="mt-1 text-xs text-[#8ea0bf]">{log.segmentKey}</p> : null}
                    </td>
                    <td className="px-3 py-4 text-sm text-[#d5def0]">{log.provider}</td>
                    <td className="px-3 py-4 text-sm text-[#d5def0]">
                      <p>{formatDate(log.sentAt ?? log.createdAt)}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <div className="mt-5 grid gap-4">
        <SegmentTable
          title="Reminder Candidates"
          description="People who created an account at least a week ago and still have not purchased. This is the cleanest first automation for a come-try-the-game reminder."
          total={dashboard?.segments.reminderCandidates.total ?? 0}
          records={dashboard?.segments.reminderCandidates.records ?? []}
          emptyMessage="No users are currently overdue for a signup reminder."
        />

        <SegmentTable
          title="Engaged But Unconverted"
          description="People who are still active or already using chat, but have not purchased yet. These are strong candidates for a feature-focused email or limited offer."
          total={dashboard?.segments.engagedNoPurchase.total ?? 0}
          records={dashboard?.segments.engagedNoPurchase.records ?? []}
          emptyMessage="No engaged free users were found right now."
        />

        <SegmentTable
          title="Win-Back Candidates"
          description="People who paid before but no longer have an active paid membership. This is the segment for comeback discounts, new feature highlights, and cancellation recovery."
          total={dashboard?.segments.winBackCandidates.total ?? 0}
          records={dashboard?.segments.winBackCandidates.records ?? []}
          emptyMessage="No inactive former paid users were found right now."
        />
      </div>
    </AdminPageShell>
  )
}

export default MarketingPage
