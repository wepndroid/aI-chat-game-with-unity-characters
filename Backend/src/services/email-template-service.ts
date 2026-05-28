import { randomUUID } from 'node:crypto'
import { prisma } from '../lib/prisma'
import { postgresEnumValue, postgresTimestamptzValue } from '../lib/database/postgres-sql'

type EmailTemplateCategory = 'system' | 'onboarding' | 'conversion' | 'winback' | 'announcement'
type EmailTemplateRecord = {
  id: string
  templateKey: string
  name: string
  description: string
  category: EmailTemplateCategory
  subject: string
  htmlBody: string
  textBody: string
  isBuiltIn: boolean
  createdAt: string
  updatedAt: string
}

type CreateEmailTemplateInput = {
  templateKey: string
  name: string
  description: string
  category: EmailTemplateCategory
  subject: string
  htmlBody: string
  textBody: string
  isBuiltIn?: boolean
}

type UpdateEmailTemplateInput = Partial<Omit<CreateEmailTemplateInput, 'templateKey'>>

type EmailTemplateVariables = Record<string, string>

type RenderedEmailTemplate = {
  subject: string
  html: string
  text: string
}

type EmailSendLogRecord = {
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

type CreateEmailSendLogInput = {
  templateKey: string
  recipientEmail: string
  recipientUserId?: string | null
  segmentKey?: string | null
  mode: 'test' | 'segment' | 'single' | 'automation'
  status: 'sent' | 'failed'
  provider: string
  subject: string
  errorMessage?: string | null
  sentAt?: string | null
}

class EmailTemplateConflictError extends Error {
  constructor(templateKey: string) {
    super(`Email template "${templateKey}" already exists. Choose a different template key.`)
    this.name = 'EmailTemplateConflictError'
  }
}

const AVAILABLE_TEMPLATE_VARIABLES = [
  'app_name',
  'username',
  'email',
  'verification_code',
  'verification_url',
  'reset_code',
  'reset_url',
  'expires_at',
  'members_url',
  'login_url',
  'cta_url',
  'support_email',
  'discount_code',
  'features_summary',
  'days_since_signup',
  'days_since_last_seen',
  'chat_sessions_count',
  'purchase_count',
  'total_revenue_eur',
  'last_purchase_date'
] as const

const buildMarketingEmailTemplateCategorySql = (category: EmailTemplateCategory) =>
  postgresEnumValue(category, 'MarketingEmailTemplateCategory')

const buildMarketingEmailSendModeSql = (mode: CreateEmailSendLogInput['mode']) =>
  postgresEnumValue(mode, 'MarketingEmailSendMode')

const buildMarketingEmailSendStatusSql = (status: CreateEmailSendLogInput['status']) =>
  postgresEnumValue(status, 'MarketingEmailSendStatus')

const buildMarketingEmailTimestampSql = (timestamp: string | Date | null) => postgresTimestamptzValue(timestamp)

const buildEmailHtml = ({
  eyebrow,
  title,
  intro,
  spotlightHtml,
  bodyHtml,
  ctaLabel,
  ctaUrl,
  secondaryLabel,
  secondaryUrl,
  footerNote
}: {
  eyebrow: string
  title: string
  intro: string
  spotlightHtml?: string
  bodyHtml: string
  ctaLabel: string
  ctaUrl: string
  secondaryLabel?: string
  secondaryUrl?: string
  footerNote?: string
}) => `
<div style="margin:0; padding:32px 16px; background:#050608; color:#f8f5f2; font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:640px; margin:0 auto; overflow:hidden; border:1px solid rgba(255,255,255,0.08); border-radius:28px; background:linear-gradient(180deg,#0d1016 0%,#0a0c10 100%);">
    <div style="padding:24px 28px; background:radial-gradient(circle at top left, rgba(244,99,19,0.28), rgba(13,16,22,0) 52%), linear-gradient(135deg,#171b22 0%,#0d1016 100%); border-bottom:1px solid rgba(255,255,255,0.08);">
      <div style="display:inline-block; padding:6px 12px; border-radius:999px; background:rgba(244,99,19,0.18); color:#ffb07a; font-size:11px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase;">
        ${eyebrow}
      </div>
      <div style="margin-top:22px; font-size:13px; letter-spacing:0.28em; text-transform:uppercase; color:#8fa3c7;">
        SecretWaifu
      </div>
      <h1 style="margin:14px 0 0; font-size:32px; line-height:1.15; color:#ffffff;">
        ${title}
      </h1>
      <p style="margin:14px 0 0; font-size:16px; line-height:1.7; color:#cfd8ea;">
        ${intro}
      </p>
    </div>
    <div style="padding:28px;">
      ${
        spotlightHtml
          ? `<div style="margin-bottom:22px; padding:20px; border-radius:22px; border:1px solid rgba(244,99,19,0.22); background:linear-gradient(180deg, rgba(244,99,19,0.12), rgba(255,255,255,0.02));">${spotlightHtml}</div>`
          : ''
      }
      <div style="padding:22px; border-radius:22px; border:1px solid rgba(255,255,255,0.08); background:#131821; color:#dbe4f6; font-size:15px; line-height:1.8;">
        ${bodyHtml}
      </div>
      <div style="margin-top:26px;">
        <a href="${ctaUrl}" style="display:inline-block; padding:14px 24px; border-radius:999px; background:#f46313; color:#050608; text-decoration:none; font-size:14px; font-weight:700;">
          ${ctaLabel}
        </a>
        ${
          secondaryLabel && secondaryUrl
            ? `<a href="${secondaryUrl}" style="display:inline-block; margin-left:12px; padding:14px 20px; border-radius:999px; border:1px solid rgba(255,255,255,0.14); color:#f8f5f2; text-decoration:none; font-size:14px; font-weight:600;">${secondaryLabel}</a>`
            : ''
        }
      </div>
      <p style="margin:22px 0 0; font-size:13px; line-height:1.7; color:#8ea0bf;">
        ${footerNote ?? 'If a button does not work in your email app, copy and paste the link shown above into your browser.'}
      </p>
    </div>
  </div>
</div>
`

const BUILT_IN_EMAIL_TEMPLATES: CreateEmailTemplateInput[] = [
  {
    templateKey: 'auth_verify_email',
    name: 'Verify Email',
    description: 'System email sent after signup to verify the email address.',
    category: 'system',
    subject: 'Verify your {{app_name}} email',
    textBody:
      'Hello {{username}},\n\nYour verification code for {{app_name}} is:\n{{verification_code}}\n\nThis code expires at {{expires_at}}.\n\nIf needed, open:\n{{verification_url}}',
    htmlBody: buildEmailHtml({
      eyebrow: 'Account Security',
      title: 'Confirm your email and unlock your account',
      intro: 'Use the verification code below to confirm this email address and finish setting up your {{app_name}} account.',
      spotlightHtml:
        '<div style="font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:#ffb07a;">Verification Code</div><div style="margin-top:10px; font-size:34px; font-weight:700; letter-spacing:0.24em; color:#ffffff;">{{verification_code}}</div><div style="margin-top:10px; font-size:13px; color:#a6b6d3;">Expires at {{expires_at}}</div>',
      bodyHtml:
        '<p style="margin:0 0 12px;">Hello {{username}},</p><p style="margin:0;">Once your email is verified, you can move through the rest of the account flow without friction.</p>',
      ctaLabel: 'Verify Email',
      ctaUrl: '{{verification_url}}',
      footerNote: 'If you did not start this signup, you can ignore this email.'
    }),
    isBuiltIn: true
  },
  {
    templateKey: 'auth_password_reset',
    name: 'Password Reset',
    description: 'System email sent when a user requests a password reset.',
    category: 'system',
    subject: 'Reset your {{app_name}} password',
    textBody:
      'Hello {{username}},\n\nYour password reset code is:\n{{reset_code}}\n\nReset your password here:\n{{reset_url}}\n\nThis code expires at {{expires_at}}.\nIf you did not request this, you can ignore this email.',
    htmlBody: buildEmailHtml({
      eyebrow: 'Password Reset',
      title: 'Reset your password securely',
      intro: 'Use the code below to reset your password and get back into {{app_name}}.',
      spotlightHtml:
        '<div style="font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:#ffb07a;">Reset Code</div><div style="margin-top:10px; font-size:34px; font-weight:700; letter-spacing:0.24em; color:#ffffff;">{{reset_code}}</div><div style="margin-top:10px; font-size:13px; color:#a6b6d3;">Expires at {{expires_at}}</div>',
      bodyHtml:
        '<p style="margin:0 0 12px;">Hello {{username}},</p><p style="margin:0;">Open the reset page, paste the code, and choose your new password.</p>',
      ctaLabel: 'Reset Password',
      ctaUrl: '{{reset_url}}',
      footerNote: 'If you did not request a password reset, you can ignore this email and your password will stay unchanged.'
    }),
    isBuiltIn: true
  },
  {
    templateKey: 'welcome_new_account',
    name: 'Welcome New Account',
    description: 'Warm first-touch email right after a new account is created.',
    category: 'onboarding',
    subject: 'Welcome to {{app_name}}, {{username}}',
    textBody:
      'Hi {{username}},\n\nYour account is ready. Start exploring {{app_name}} here:\n{{cta_url}}\n\nIf you want the fastest path, log in and open the members area:\n{{members_url}}\n\nNeed help? Reply to this email or contact {{support_email}}.',
    htmlBody: buildEmailHtml({
      eyebrow: 'Welcome',
      title: 'Your account is ready',
      intro: 'You are in. The fastest way to get value from {{app_name}} is to jump straight into the members area and start exploring.',
      bodyHtml:
        '<p style="margin:0 0 14px;">Hi {{username}},</p><p style="margin:0 0 14px;">We built {{app_name}} to feel immediate: less setup, more discovery, more reasons to come back.</p><p style="margin:0;">If you want the shortest path to the good part, start here.</p>',
      ctaLabel: 'Open SecretWaifu',
      ctaUrl: '{{cta_url}}',
      secondaryLabel: 'Members Area',
      secondaryUrl: '{{members_url}}',
      footerNote: 'Questions or friction? Reach out at {{support_email}} and we will help.'
    }),
    isBuiltIn: true
  },
  {
    templateKey: 'signup_reminder_7d',
    name: 'Signup Reminder After 7 Days',
    description: 'Reminder for users who signed up but did not purchase after a week.',
    category: 'onboarding',
    subject: 'Still thinking it over, {{username}}?',
    textBody:
      'Hi {{username}},\n\nYou created your {{app_name}} account {{days_since_signup}} days ago, but it looks like you have not jumped in yet.\n\nPick up where you left off:\n{{cta_url}}\n\nIf you want a quick overview before you decide, here is the best place to start:\n{{members_url}}',
    htmlBody: buildEmailHtml({
      eyebrow: 'Reminder',
      title: 'Your account is still waiting for you',
      intro: 'You signed up {{days_since_signup}} days ago. If you meant to come back later, this is your quick shortcut back in.',
      bodyHtml:
        '<p style="margin:0 0 14px;">Hi {{username}},</p><p style="margin:0 0 14px;">A lot of users create an account, get busy, and forget to return. If that happened to you, no problem.</p><p style="margin:0;">You can pick up exactly where you left off and see what {{app_name}} already has ready for you.</p>',
      ctaLabel: 'Jump Back In',
      ctaUrl: '{{cta_url}}',
      secondaryLabel: 'View Members Area',
      secondaryUrl: '{{members_url}}'
    }),
    isBuiltIn: true
  },
  {
    templateKey: 'signup_discount_nudge',
    name: 'Discount Nudge',
    description: 'Conversion nudge for unconverted users when you want to include a discount code.',
    category: 'conversion',
    subject: 'A small bonus if you want to come back',
    textBody:
      'Hi {{username}},\n\nIf a little push helps, you can use code {{discount_code}} on your next upgrade.\n\nClaim it here:\n{{cta_url}}\n\nIf you have questions before upgrading, just reply and we will help.',
    htmlBody: buildEmailHtml({
      eyebrow: 'Offer',
      title: 'A small push, if that helps',
      intro: 'If price was the thing holding you back, use this code on your next upgrade and get moving.',
      spotlightHtml:
        '<div style="font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:#ffb07a;">Discount Code</div><div style="margin-top:10px; font-size:30px; font-weight:700; letter-spacing:0.16em; color:#ffffff;">{{discount_code}}</div>',
      bodyHtml:
        '<p style="margin:0 0 14px;">Hi {{username}},</p><p style="margin:0 0 14px;">You do not need to make a big decision all at once. Sometimes a smaller step is enough.</p><p style="margin:0;">Apply the code below and see if {{app_name}} feels like the right fit for you.</p>',
      ctaLabel: 'Claim Discount',
      ctaUrl: '{{cta_url}}'
    }),
    isBuiltIn: true
  },
  {
    templateKey: 'engaged_free_features',
    name: 'Engaged Free User Features',
    description: 'Feature-focused email for active free users who have not converted yet.',
    category: 'conversion',
    subject: 'You are already close to the good part',
    textBody:
      'Hi {{username}},\n\nYou have already spent time exploring {{app_name}}. Here is what people usually unlock next:\n{{features_summary}}\n\nSee what is waiting for you:\n{{cta_url}}',
    htmlBody: buildEmailHtml({
      eyebrow: 'Conversion',
      title: 'You are already close to the best part',
      intro: 'You have already shown real interest. This is usually the moment where upgrading starts to make sense.',
      spotlightHtml:
        '<div style="font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:#ffb07a;">What Users Usually Unlock Next</div><div style="margin-top:12px; font-size:15px; line-height:1.8; color:#dbe4f6;">{{features_summary}}</div>',
      bodyHtml:
        '<p style="margin:0 0 14px;">Hi {{username}},</p><p style="margin:0 0 14px;">You have already spent time inside {{app_name}}. That means you do not need a generic sales pitch.</p><p style="margin:0;">You need a clear next step and a better sense of what opens up once you move beyond the free layer.</p>',
      ctaLabel: 'See What Unlocks',
      ctaUrl: '{{cta_url}}'
    }),
    isBuiltIn: true
  },
  {
    templateKey: 'upgrade_offer_premium',
    name: 'Premium Upgrade Offer',
    description: 'Upgrade email for free users who are clearly engaged.',
    category: 'conversion',
    subject: 'Ready to unlock more in {{app_name}}?',
    textBody:
      'Hi {{username}},\n\nYou have already started exploring. If you want more content, faster access, and the full experience, this is the best next step:\n{{cta_url}}\n\n{{features_summary}}',
    htmlBody: buildEmailHtml({
      eyebrow: 'Upgrade',
      title: 'Unlock the fuller experience',
      intro: 'If you already like what you have seen, this is the point where upgrading removes the friction and opens the better parts.',
      spotlightHtml:
        '<div style="font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:#ffb07a;">Why People Upgrade</div><div style="margin-top:12px; font-size:15px; line-height:1.8; color:#dbe4f6;">{{features_summary}}</div>',
      bodyHtml:
        '<p style="margin:0 0 14px;">Hi {{username}},</p><p style="margin:0;">If you want more content, faster access, and fewer limits, this is the most direct next step.</p>',
      ctaLabel: 'Upgrade Now',
      ctaUrl: '{{cta_url}}'
    }),
    isBuiltIn: true
  },
  {
    templateKey: 'winback_discount_offer',
    name: 'Win-Back Discount Offer',
    description: 'Discount email for former paid users who cancelled or lapsed.',
    category: 'winback',
    subject: 'Come back with {{discount_code}}',
    textBody:
      'Hi {{username}},\n\nWe would love to have you back. Use code {{discount_code}} if you want to return and pick things up again.\n\nCome back here:\n{{cta_url}}\n\nYour last purchase was on {{last_purchase_date}}.',
    htmlBody: buildEmailHtml({
      eyebrow: 'Win Back',
      title: 'Come back with a better reason',
      intro: 'You have already been here before. If you want to return, here is a cleaner reason to do it now.',
      spotlightHtml:
        '<div style="font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:#ffb07a;">Comeback Code</div><div style="margin-top:10px; font-size:30px; font-weight:700; letter-spacing:0.16em; color:#ffffff;">{{discount_code}}</div><div style="margin-top:10px; font-size:13px; color:#a6b6d3;">Last purchase: {{last_purchase_date}}</div>',
      bodyHtml:
        '<p style="margin:0 0 14px;">Hi {{username}},</p><p style="margin:0 0 14px;">We would love to have you back, but only if there is enough value to make the return feel worth it.</p><p style="margin:0;">Use the code above and take another look.</p>',
      ctaLabel: 'Come Back Now',
      ctaUrl: '{{cta_url}}'
    }),
    isBuiltIn: true
  },
  {
    templateKey: 'winback_new_features',
    name: 'Win-Back New Features',
    description: 'Win-back email focused on what changed since the user left.',
    category: 'winback',
    subject: 'A lot has changed since your last visit',
    textBody:
      'Hi {{username}},\n\nSince your last visit, here is what is new in {{app_name}}:\n{{features_summary}}\n\nTake another look:\n{{cta_url}}',
    htmlBody: buildEmailHtml({
      eyebrow: 'What Is New',
      title: 'There is a good chance it feels different now',
      intro: 'If you left because it was not quite there yet, this is the kind of update worth checking.',
      spotlightHtml:
        '<div style="font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:#ffb07a;">New Since Your Last Visit</div><div style="margin-top:12px; font-size:15px; line-height:1.8; color:#dbe4f6;">{{features_summary}}</div>',
      bodyHtml:
        '<p style="margin:0 0 14px;">Hi {{username}},</p><p style="margin:0;">We have been improving {{app_name}} since you were last around. If the product did not quite land before, now is a good time to re-evaluate it.</p>',
      ctaLabel: 'See What Changed',
      ctaUrl: '{{cta_url}}'
    }),
    isBuiltIn: true
  },
  {
    templateKey: 'general_feature_announcement',
    name: 'General Feature Announcement',
    description: 'Broad announcement email for launches and major updates.',
    category: 'announcement',
    subject: 'New in {{app_name}} this week',
    textBody:
      'Hi {{username}},\n\nHere is what is new:\n{{features_summary}}\n\nSee everything here:\n{{cta_url}}',
    htmlBody: buildEmailHtml({
      eyebrow: 'Announcement',
      title: 'New this week in {{app_name}}',
      intro: 'A quick update with the most important things worth seeing right now.',
      spotlightHtml:
        '<div style="font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:#ffb07a;">Highlights</div><div style="margin-top:12px; font-size:15px; line-height:1.8; color:#dbe4f6;">{{features_summary}}</div>',
      bodyHtml:
        '<p style="margin:0 0 14px;">Hi {{username}},</p><p style="margin:0;">If you have not checked in lately, this is the fastest summary of what changed and where to go next.</p>',
      ctaLabel: 'View Updates',
      ctaUrl: '{{cta_url}}'
    }),
    isBuiltIn: true
  }
]

let builtInTemplatesSynced = false

const syncBuiltInEmailTemplates = async () => {
  if (builtInTemplatesSynced) {
    return
  }

  const existingTemplates = await prisma.$queryRawUnsafe<
    Array<{ templateKey: string; isBuiltIn: boolean; createdAt: Date; updatedAt: Date }>
  >(
    `SELECT "templateKey", "isBuiltIn", "createdAt", "updatedAt" FROM "MarketingEmailTemplates"`
  )
  const existingTemplateMap = new Map(existingTemplates.map((row) => [row.templateKey, row]))
  const nowIso = new Date().toISOString()

  for (const template of BUILT_IN_EMAIL_TEMPLATES) {
    const existingTemplate = existingTemplateMap.get(template.templateKey)

    if (!existingTemplate) {
      await prisma.$executeRaw`
        INSERT INTO "MarketingEmailTemplates"
          ("id", "templateKey", "name", "description", "category", "subject", "htmlBody", "textBody", "isBuiltIn", "createdAt", "updatedAt")
        VALUES
          (${randomUUID()}, ${template.templateKey}, ${template.name}, ${template.description}, ${buildMarketingEmailTemplateCategorySql(template.category)}, ${template.subject}, ${template.htmlBody}, ${template.textBody}, ${template.isBuiltIn}, ${buildMarketingEmailTimestampSql(nowIso)}, ${buildMarketingEmailTimestampSql(nowIso)})
      `
      continue
    }

    const shouldRefreshBuiltIn =
      existingTemplate.isBuiltIn && existingTemplate.createdAt.getTime() === existingTemplate.updatedAt.getTime()

    if (!shouldRefreshBuiltIn) {
      continue
    }

    await prisma.$executeRaw`
      UPDATE "MarketingEmailTemplates"
      SET
        "name" = ${template.name},
        "description" = ${template.description},
        "category" = ${buildMarketingEmailTemplateCategorySql(template.category)},
        "subject" = ${template.subject},
        "htmlBody" = ${template.htmlBody},
        "textBody" = ${template.textBody},
        "updatedAt" = ${buildMarketingEmailTimestampSql(nowIso)}
      WHERE "templateKey" = ${template.templateKey}
    `
  }

  builtInTemplatesSynced = true
}

const toTemplateRecord = (row: {
  id: string
  templateKey: string
  name: string
  description: string
  category: string
  subject: string
  htmlBody: string
  textBody: string
  isBuiltIn: boolean
  createdAt: string | Date
  updatedAt: string | Date
}): EmailTemplateRecord => ({
  id: row.id,
  templateKey: row.templateKey,
  name: row.name,
  description: row.description,
  category: row.category as EmailTemplateCategory,
  subject: row.subject,
  htmlBody: row.htmlBody,
  textBody: row.textBody,
  isBuiltIn: row.isBuiltIn,
  createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt
})

const listEmailTemplates = async () => {
  await syncBuiltInEmailTemplates()
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: string
      templateKey: string
      name: string
      description: string
      category: string
      subject: string
      htmlBody: string
      textBody: string
      isBuiltIn: boolean
      createdAt: Date
      updatedAt: Date
    }>
  >(`SELECT "id", "templateKey", "name", "description", "category", "subject", "htmlBody", "textBody", "isBuiltIn", "createdAt", "updatedAt"
     FROM "MarketingEmailTemplates"
     ORDER BY "category" ASC, "name" ASC`)

  return rows.map(toTemplateRecord)
}

const getEmailTemplateByKey = async (templateKey: string) => {
  await syncBuiltInEmailTemplates()
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: string
      templateKey: string
      name: string
      description: string
      category: string
      subject: string
      htmlBody: string
      textBody: string
      isBuiltIn: boolean
      createdAt: Date
      updatedAt: Date
    }>
  >(
    `SELECT "id", "templateKey", "name", "description", "category", "subject", "htmlBody", "textBody", "isBuiltIn", "createdAt", "updatedAt"
     FROM "MarketingEmailTemplates"
     WHERE "templateKey" = $1
     LIMIT 1`,
    templateKey
  )

  return rows[0] ? toTemplateRecord(rows[0]) : null
}

const createEmailTemplate = async (input: CreateEmailTemplateInput) => {
  await syncBuiltInEmailTemplates()
  const existing = await getEmailTemplateByKey(input.templateKey)

  if (existing) {
    throw new EmailTemplateConflictError(input.templateKey)
  }

  const nowIso = new Date().toISOString()

  try {
    await prisma.$executeRaw`
      INSERT INTO "MarketingEmailTemplates"
        ("id", "templateKey", "name", "description", "category", "subject", "htmlBody", "textBody", "isBuiltIn", "createdAt", "updatedAt")
      VALUES
        (${randomUUID()}, ${input.templateKey}, ${input.name}, ${input.description}, ${buildMarketingEmailTemplateCategorySql(input.category)}, ${input.subject}, ${input.htmlBody}, ${input.textBody}, ${input.isBuiltIn}, ${buildMarketingEmailTimestampSql(nowIso)}, ${buildMarketingEmailTimestampSql(nowIso)})
    `
  } catch (error) {
    if (error instanceof Error && /unique|constraint/i.test(error.message)) {
      throw new EmailTemplateConflictError(input.templateKey)
    }

    throw error
  }

  const created = await getEmailTemplateByKey(input.templateKey)
  if (!created) {
    throw new Error('Template was not created.')
  }

  return created
}

const updateEmailTemplate = async (templateKey: string, input: UpdateEmailTemplateInput) => {
  await syncBuiltInEmailTemplates()
  const existing = await getEmailTemplateByKey(templateKey)

  if (!existing) {
    return null
  }

  const nextTemplate = {
    ...existing,
    name: input.name ?? existing.name,
    description: input.description ?? existing.description,
    category: input.category ?? existing.category,
    subject: input.subject ?? existing.subject,
    htmlBody: input.htmlBody ?? existing.htmlBody,
    textBody: input.textBody ?? existing.textBody
  }

  await prisma.$executeRaw`
    UPDATE "MarketingEmailTemplates"
    SET
      "name" = ${nextTemplate.name},
      "description" = ${nextTemplate.description},
      "category" = ${buildMarketingEmailTemplateCategorySql(nextTemplate.category)},
      "subject" = ${nextTemplate.subject},
      "htmlBody" = ${nextTemplate.htmlBody},
      "textBody" = ${nextTemplate.textBody},
      "updatedAt" = ${buildMarketingEmailTimestampSql(new Date().toISOString())}
    WHERE "templateKey" = ${templateKey}
  `

  return getEmailTemplateByKey(templateKey)
}

const interpolateTemplate = (input: string, variables: EmailTemplateVariables) => {
  return input.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, variableName: string) => variables[variableName] ?? '')
}

const renderEmailTemplate = (template: EmailTemplateRecord, variables: EmailTemplateVariables): RenderedEmailTemplate => {
  return {
    subject: interpolateTemplate(template.subject, variables).trim(),
    html: interpolateTemplate(template.htmlBody, variables),
    text: interpolateTemplate(template.textBody, variables)
  }
}

const getRenderedEmailTemplateByKey = async (templateKey: string, variables: EmailTemplateVariables) => {
  const template = await getEmailTemplateByKey(templateKey)

  if (!template) {
    throw new Error(`Email template "${templateKey}" was not found.`)
  }

  return {
    template,
    rendered: renderEmailTemplate(template, variables)
  }
}

const listEmailSendLogs = async (limit = 30) => {
  await syncBuiltInEmailTemplates()
  const rows = await prisma.$queryRawUnsafe<
    Array<{
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
      createdAt: Date
      sentAt: Date | null
    }>
  >(
    `SELECT "id", "templateKey", "recipientEmail", "recipientUserId", "segmentKey", "mode", "status", "provider", "subject", "errorMessage", "createdAt", "sentAt"
     FROM "MarketingEmailSendLog"
     ORDER BY "createdAt" DESC
     LIMIT $1`,
    Math.max(1, Math.min(limit, 200))
  )

  return rows.map((row) => ({
    id: row.id,
    templateKey: row.templateKey,
    recipientEmail: row.recipientEmail,
    recipientUserId: row.recipientUserId,
    segmentKey: row.segmentKey,
    mode: row.mode,
    status: row.status,
    provider: row.provider,
    subject: row.subject,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    sentAt: row.sentAt?.toISOString() ?? null
  })) as EmailSendLogRecord[]
}

const createEmailSendLog = async (input: CreateEmailSendLogInput) => {
  await syncBuiltInEmailTemplates()
  const createdAt = new Date().toISOString()

  await prisma.$executeRaw`
    INSERT INTO "MarketingEmailSendLog"
      ("id", "templateKey", "recipientEmail", "recipientUserId", "segmentKey", "mode", "status", "provider", "subject", "errorMessage", "createdAt", "sentAt")
    VALUES
      (${randomUUID()}, ${input.templateKey}, ${input.recipientEmail}, ${input.recipientUserId ?? null}, ${input.segmentKey ?? null}, ${buildMarketingEmailSendModeSql(input.mode)}, ${buildMarketingEmailSendStatusSql(input.status)}, ${input.provider}, ${input.subject}, ${input.errorMessage ?? null}, ${buildMarketingEmailTimestampSql(createdAt)}, ${buildMarketingEmailTimestampSql(input.sentAt ?? null)})
  `
}

export {
  AVAILABLE_TEMPLATE_VARIABLES,
  EmailTemplateConflictError,
  buildMarketingEmailSendModeSql,
  buildMarketingEmailSendStatusSql,
  buildMarketingEmailTemplateCategorySql,
  buildMarketingEmailTimestampSql,
  createEmailSendLog,
  createEmailTemplate,
  getEmailTemplateByKey,
  getRenderedEmailTemplateByKey,
  listEmailSendLogs,
  listEmailTemplates,
  renderEmailTemplate,
  updateEmailTemplate
}
export type {
  CreateEmailTemplateInput,
  EmailSendLogRecord,
  EmailTemplateCategory,
  EmailTemplateRecord,
  EmailTemplateVariables,
  RenderedEmailTemplate,
  UpdateEmailTemplateInput
}
