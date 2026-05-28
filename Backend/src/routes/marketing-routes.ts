import { Router } from 'express'
import { z } from 'zod'
import { getEmailConfig } from '../lib/auth-config'
import { requireAdmin } from '../middleware/auth-middleware'
import { emailService } from '../services/email-service'
import {
  AVAILABLE_TEMPLATE_VARIABLES,
  EmailTemplateConflictError,
  createEmailSendLog,
  createEmailTemplate,
  getRenderedEmailTemplateByKey,
  listEmailSendLogs,
  listEmailTemplates,
  updateEmailTemplate
} from '../services/email-template-service'
import {
  createMarketingEmailAutomation,
  listMarketingEmailAutomations,
  setMarketingEmailAutomationStatus
} from '../services/marketing-email-automation-service'
import { MARKETING_AUTOMATION_STATUS_CONDITIONS } from '../services/marketing-email-automation-status-condition'
import { getMarketingDashboardData, MARKETING_SEGMENT_KEYS } from '../services/marketing-segment-service'

const marketingRoutes = Router()

const templateCategorySchema = z.enum(['system', 'onboarding', 'conversion', 'winback', 'announcement'])
const templateBodySchema = z.object({
  templateKey: z
    .string()
    .trim()
    .min(3)
    .max(80)
    .regex(/^[a-z0-9_]+$/),
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().min(3).max(300),
  category: templateCategorySchema,
  subject: z.string().trim().min(3).max(200),
  htmlBody: z.string().trim().min(10).max(20000),
  textBody: z.string().trim().min(10).max(20000)
})

const templateUpdateSchema = templateBodySchema.omit({ templateKey: true }).partial().refine((payload) => Object.keys(payload).length > 0, {
  message: 'At least one template field must be provided.'
})

const stringVariablesSchema = z.record(z.string(), z.string()).default({})

const templateKeyParamsSchema = z.object({
  templateKey: z.string().trim().min(1)
})

const testSendSchema = z.object({
  templateKey: z.string().trim().min(1),
  toEmail: z.string().email(),
  variables: stringVariablesSchema.optional()
})

const sendSegmentSchema = z.object({
  templateKey: z.string().trim().min(1),
  segmentKey: z.enum(MARKETING_SEGMENT_KEYS),
  limit: z.number().int().min(1).max(500).default(50),
  includeUnverified: z.boolean().default(false),
  variables: stringVariablesSchema.optional()
})

const automationBodySchema = z.object({
  templateKey: z.string().trim().min(1),
  statusCondition: z.enum(MARKETING_AUTOMATION_STATUS_CONDITIONS),
  triggerDelayHours: z.number().int().min(0).max(3650 * 24).optional(),
  triggerDelayDays: z.number().int().min(0).max(3650).optional(),
  campaignDiscountCode: z.string().trim().max(120).optional().default(''),
  campaignFeaturesSummary: z.string().trim().min(3).max(2000),
  campaignCtaUrl: z.string().trim().url().max(1000),
  sendIntervalSeconds: z.number().int().min(10).max(86400).default(60),
  maxRecipients: z.number().int().min(1).max(20000).default(20000)
}).refine((payload) => payload.triggerDelayHours !== undefined || payload.triggerDelayDays !== undefined, {
  message: 'Automation trigger delay is required.',
  path: ['triggerDelayHours']
}).transform((payload) => ({
  ...payload,
  triggerDelayHours: payload.triggerDelayHours ?? (payload.triggerDelayDays ?? 0) * 24
}))

const automationParamsSchema = z.object({
  automationId: z.string().trim().min(1)
})

const parseFromAddressToEmail = (value: string) => {
  const angleMatch = /<([^>]+)>/.exec(value)

  if (angleMatch?.[1]) {
    return angleMatch[1].trim()
  }

  return value.trim()
}

const getBaseTemplateVariables = () => {
  const frontendUrl = process.env.FRONTEND_URL?.trim() || 'http://127.0.0.1:7000'
  const emailConfig = getEmailConfig()

  return {
    app_name: 'SecretWaifu',
    members_url: `${frontendUrl}/members`,
    login_url: `${frontendUrl}/sign-up`,
    cta_url: `${frontendUrl}/members`,
    support_email: parseFromAddressToEmail(emailConfig.from),
    discount_code: '',
    features_summary: 'New features, more content, and easier ways to jump back in are ready for you.',
    verification_code: '',
    verification_url: '',
    reset_code: '',
    reset_url: '',
    expires_at: '',
    username: 'there',
    email: '',
    days_since_signup: '',
    days_since_last_seen: '',
    chat_sessions_count: '',
    purchase_count: '',
    total_revenue_eur: '',
    last_purchase_date: ''
  }
}

const buildUserTemplateVariables = (
  record: {
    username: string
    email: string
    daysSinceSignup: number
    daysSinceLastSeen: number | null
    chatSessionsCount: number
    purchaseCount: number
    totalRevenueCents: number
    lastPurchaseAt: string | null
  },
  extraVariables: Record<string, string> = {}
) => {
  const lastPurchaseDate = record.lastPurchaseAt ? new Date(record.lastPurchaseAt).toLocaleDateString() : ''

  return {
    ...getBaseTemplateVariables(),
    username: record.username,
    email: record.email,
    days_since_signup: String(record.daysSinceSignup),
    days_since_last_seen: record.daysSinceLastSeen === null ? '' : String(record.daysSinceLastSeen),
    chat_sessions_count: String(record.chatSessionsCount),
    purchase_count: String(record.purchaseCount),
    total_revenue_eur: (record.totalRevenueCents / 100).toFixed(2),
    last_purchase_date: lastPurchaseDate,
    ...extraVariables
  }
}

marketingRoutes.get('/marketing/dashboard', requireAdmin, async (_request, response, next) => {
  try {
    const dashboard = await getMarketingDashboardData()

    response.json({
      data: {
        summary: dashboard.summary,
        segments: {
          reminderCandidates: {
            total: dashboard.segments.reminderCandidates.total,
            records: dashboard.segments.reminderCandidates.records
          },
          engagedNoPurchase: {
            total: dashboard.segments.engagedNoPurchase.total,
            records: dashboard.segments.engagedNoPurchase.records
          },
          winBackCandidates: {
            total: dashboard.segments.winBackCandidates.total,
            records: dashboard.segments.winBackCandidates.records
          }
        },
        updatedAt: dashboard.updatedAt
      }
    })
  } catch (error) {
    next(error)
  }
})

marketingRoutes.get('/marketing/templates', requireAdmin, async (_request, response, next) => {
  try {
    const templates = await listEmailTemplates()

    response.json({
      data: {
        records: templates,
        availableVariables: [...AVAILABLE_TEMPLATE_VARIABLES]
      }
    })
  } catch (error) {
    next(error)
  }
})

marketingRoutes.post('/marketing/templates', requireAdmin, async (request, response, next) => {
  try {
    const payload = templateBodySchema.parse(request.body)
    const created = await createEmailTemplate(payload)

    response.status(201).json({
      data: created
    })
  } catch (error) {
    if (error instanceof EmailTemplateConflictError) {
      response.status(409).json({
        message: error.message
      })
      return
    }

    next(error)
  }
})

marketingRoutes.patch('/marketing/templates/:templateKey', requireAdmin, async (request, response, next) => {
  try {
    const { templateKey } = templateKeyParamsSchema.parse(request.params)
    const payload = templateUpdateSchema.parse(request.body)
    const updated = await updateEmailTemplate(templateKey, payload)

    if (!updated) {
      response.status(404).json({
        message: 'Template not found.'
      })
      return
    }

    response.json({
      data: updated
    })
  } catch (error) {
    next(error)
  }
})

marketingRoutes.get('/marketing/send-logs', requireAdmin, async (_request, response, next) => {
  try {
    const logs = await listEmailSendLogs(40)

    response.json({
      data: {
        records: logs
      }
    })
  } catch (error) {
    next(error)
  }
})

marketingRoutes.get('/marketing/automations', requireAdmin, async (_request, response, next) => {
  try {
    const automations = await listMarketingEmailAutomations()

    response.json({
      data: {
        records: automations,
        statusConditions: [...MARKETING_AUTOMATION_STATUS_CONDITIONS]
      }
    })
  } catch (error) {
    next(error)
  }
})

marketingRoutes.post('/marketing/automations', requireAdmin, async (request, response, next) => {
  try {
    const payload = automationBodySchema.parse(request.body)
    const result = await createMarketingEmailAutomation(payload)

    response.status(201).json({
      data: result
    })
  } catch (error) {
    next(error)
  }
})

marketingRoutes.post('/marketing/automations/:automationId/pause', requireAdmin, async (request, response, next) => {
  try {
    const { automationId } = automationParamsSchema.parse(request.params)
    const automation = await setMarketingEmailAutomationStatus(automationId, 'paused')

    if (!automation) {
      response.status(404).json({
        message: 'Automation not found.'
      })
      return
    }

    response.json({
      data: automation
    })
  } catch (error) {
    next(error)
  }
})

marketingRoutes.post('/marketing/automations/:automationId/resume', requireAdmin, async (request, response, next) => {
  try {
    const { automationId } = automationParamsSchema.parse(request.params)
    const automation = await setMarketingEmailAutomationStatus(automationId, 'active')

    if (!automation) {
      response.status(404).json({
        message: 'Automation not found.'
      })
      return
    }

    response.json({
      data: automation
    })
  } catch (error) {
    next(error)
  }
})

marketingRoutes.post('/marketing/test-send', requireAdmin, async (request, response, next) => {
  try {
    const payload = testSendSchema.parse(request.body)
    const variables = {
      ...getBaseTemplateVariables(),
      username: 'Test User',
      email: payload.toEmail,
      discount_code: 'TEST10',
      features_summary: 'This is a test email from your SecretWaifu admin dashboard.',
      ...payload.variables
    }
    const { template, rendered } = await getRenderedEmailTemplateByKey(payload.templateKey, variables)

    await emailService.sendEmailMessage({
      toEmail: payload.toEmail,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html
    })

    await createEmailSendLog({
      templateKey: template.templateKey,
      recipientEmail: payload.toEmail,
      mode: 'test',
      status: 'sent',
      provider: getEmailConfig().provider,
      subject: rendered.subject,
      sentAt: new Date().toISOString()
    })

    response.json({
      data: {
        sent: true,
        templateKey: template.templateKey,
        subject: rendered.subject
      }
    })
  } catch (error) {
    const payload = request.body as { templateKey?: string; toEmail?: string } | undefined

    if (payload?.templateKey && payload?.toEmail) {
      await createEmailSendLog({
        templateKey: payload.templateKey,
        recipientEmail: payload.toEmail,
        mode: 'test',
        status: 'failed',
        provider: getEmailConfig().provider,
        subject: payload.templateKey,
        errorMessage: error instanceof Error ? error.message : 'Failed to send test email.'
      }).catch(() => undefined)
    }

    next(error)
  }
})

marketingRoutes.post('/marketing/send-segment', requireAdmin, async (request, response, next) => {
  try {
    const payload = sendSegmentSchema.parse(request.body)
    const dashboard = await getMarketingDashboardData()
    const segment = dashboard.segments[payload.segmentKey].allRecords
    const candidateRecords = payload.includeUnverified ? segment : segment.filter((record) => record.isEmailVerified)
    const selectedRecords = candidateRecords.slice(0, payload.limit)

    let sentCount = 0
    let failedCount = 0
    const failureList: Array<{ email: string; error: string }> = []

    for (const record of selectedRecords) {
      try {
        const { template, rendered } = await getRenderedEmailTemplateByKey(
          payload.templateKey,
          buildUserTemplateVariables(record, payload.variables ?? {})
        )

        await emailService.sendEmailMessage({
          toEmail: record.email,
          subject: rendered.subject,
          text: rendered.text,
          html: rendered.html
        })

        await createEmailSendLog({
          templateKey: template.templateKey,
          recipientEmail: record.email,
          recipientUserId: record.id,
          segmentKey: payload.segmentKey,
          mode: 'segment',
          status: 'sent',
          provider: getEmailConfig().provider,
          subject: rendered.subject,
          sentAt: new Date().toISOString()
        })

        sentCount += 1
      } catch (error) {
        failedCount += 1
        failureList.push({
          email: record.email,
          error: error instanceof Error ? error.message : 'Failed to send email.'
        })

        await createEmailSendLog({
          templateKey: payload.templateKey,
          recipientEmail: record.email,
          recipientUserId: record.id,
          segmentKey: payload.segmentKey,
          mode: 'segment',
          status: 'failed',
          provider: getEmailConfig().provider,
          subject: payload.templateKey,
          errorMessage: error instanceof Error ? error.message : 'Failed to send email.'
        }).catch(() => undefined)
      }
    }

    response.json({
      data: {
        segmentKey: payload.segmentKey,
        templateKey: payload.templateKey,
        attempted: selectedRecords.length,
        sent: sentCount,
        failed: failedCount,
        skippedUnverified: payload.includeUnverified ? 0 : segment.length - candidateRecords.length,
        failures: failureList.slice(0, 10)
      }
    })
  } catch (error) {
    next(error)
  }
})

export default marketingRoutes
