import nodemailer from 'nodemailer'
import { getEmailConfig } from '../lib/auth-config'
import { getRenderedEmailTemplateByKey } from './email-template-service'

type VerificationEmailPayload = {
  toEmail: string
  username: string
  verificationCode: string
  verificationUrl?: string
  expiresAt: Date
}

type PasswordResetEmailPayload = {
  toEmail: string
  username: string
  resetCode: string
  resetUrl: string
  expiresAt: Date
}

type WelcomeEmailPayload = {
  toEmail: string
  username: string
  ctaUrl: string
  membersUrl: string
}

interface EmailService {
  sendEmailMessage(payload: { toEmail: string; subject: string; text: string; html: string }): Promise<void>
  sendVerificationEmail(payload: VerificationEmailPayload): Promise<void>
  sendPasswordResetEmail(payload: PasswordResetEmailPayload): Promise<void>
  sendWelcomeEmail(payload: WelcomeEmailPayload): Promise<void>
}

const parseDuration = (value: string | undefined, fallbackValue: number) => {
  const parsed = Number.parseInt(value ?? '', 10)

  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallbackValue
  }

  return parsed
}

const emailSendTimeoutMs = parseDuration(process.env.EMAIL_SEND_TIMEOUT_MS, 6000)
const frontendPublicUrl = process.env.FRONTEND_URL?.trim() || 'http://127.0.0.1:7000'

const parseFromAddressToEmail = (value: string) => {
  const angleMatch = /<([^>]+)>/.exec(value)

  if (angleMatch?.[1]) {
    return angleMatch[1].trim()
  }

  return value.trim()
}

const getBaseTemplateVariables = () => {
  const emailConfig = getEmailConfig()

  return {
    app_name: 'SecretWaifu',
    members_url: `${frontendPublicUrl}/members`,
    login_url: `${frontendPublicUrl}/sign-up`,
    cta_url: `${frontendPublicUrl}/members`,
    support_email: parseFromAddressToEmail(emailConfig.from)
  }
}

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`Email send timed out after ${timeoutMs}ms.`))
        }, timeoutMs)
      })
    ])
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle)
    }
  }
}

class EnvironmentEmailService implements EmailService {
  private createTransporter(): nodemailer.Transporter | null {
    const emailConfig = getEmailConfig()
    const hasMinimumSmtpConfig = Boolean(
      emailConfig.smtpHost && emailConfig.smtpPort && emailConfig.smtpUser && emailConfig.smtpPass && emailConfig.from
    )

    if (!hasMinimumSmtpConfig) {
      return null
    }

    return nodemailer.createTransport({
      host: emailConfig.smtpHost,
      port: emailConfig.smtpPort,
      secure: emailConfig.smtpSecure,
      connectionTimeout: emailSendTimeoutMs,
      greetingTimeout: emailSendTimeoutMs,
      socketTimeout: emailSendTimeoutMs,
      auth: {
        user: emailConfig.smtpUser,
        pass: emailConfig.smtpPass
      }
    })
  }

  private getMailgunApiBaseUrl() {
    const emailConfig = getEmailConfig()
    return emailConfig.mailgunRegion === 'eu' ? 'https://api.eu.mailgun.net' : 'https://api.mailgun.net'
  }

  private async sendViaMailgunApi(toEmail: string, subject: string, text: string, html: string) {
    const emailConfig = getEmailConfig()
    const hasMinimumMailgunConfig = Boolean(emailConfig.mailgunDomain && emailConfig.mailgunApiKey && emailConfig.from)

    if (!hasMinimumMailgunConfig) {
      throw new Error('Mailgun provider is selected but required Mailgun settings are incomplete.')
    }

    const body = new URLSearchParams({
      from: emailConfig.from,
      to: toEmail,
      subject,
      text,
      html
    })

    const controller = new AbortController()
    const timeoutHandle = setTimeout(() => {
      controller.abort()
    }, emailSendTimeoutMs)

    try {
      const response = await fetch(`${this.getMailgunApiBaseUrl()}/v3/${emailConfig.mailgunDomain}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`api:${emailConfig.mailgunApiKey}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body,
        signal: controller.signal
      })

      if (!response.ok) {
        const failureText = await response.text().catch(() => '')
        throw new Error(`Mailgun send failed with ${response.status}${failureText ? `: ${failureText}` : '.'}`)
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error(`Email send timed out after ${emailSendTimeoutMs}ms.`)
      }

      throw error
    } finally {
      clearTimeout(timeoutHandle)
    }
  }

  async sendEmailMessage(payload: { toEmail: string; subject: string; text: string; html: string }) {
    const emailConfig = getEmailConfig()
    const transporter = emailConfig.provider === 'smtp' ? this.createTransporter() : null

    if (emailConfig.provider === 'mailgun') {
      await this.sendViaMailgunApi(payload.toEmail, payload.subject, payload.text, payload.html)
      return
    }

    if (transporter) {
      await withTimeout(
        transporter.sendMail({
          from: emailConfig.from,
          to: payload.toEmail,
          subject: payload.subject,
          text: payload.text,
          html: payload.html
        }),
        emailSendTimeoutMs
      )
      return
    }

    if (process.env.NODE_ENV !== 'production') {
      console.info(`[EmailService:dev-fallback] To=${payload.toEmail} | Subject=${payload.subject}`)
      console.info(payload.text)
      return
    }

    throw new Error('Email provider is not configured in production environment.')
  }

  async sendVerificationEmail(payload: VerificationEmailPayload) {
    const { rendered } = await getRenderedEmailTemplateByKey('auth_verify_email', {
      ...getBaseTemplateVariables(),
      username: payload.username,
      verification_code: payload.verificationCode,
      verification_url: payload.verificationUrl ?? '',
      expires_at: payload.expiresAt.toISOString()
    })

    await this.sendEmailMessage({
      toEmail: payload.toEmail,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html
    })
  }

  async sendPasswordResetEmail(payload: PasswordResetEmailPayload) {
    const { rendered } = await getRenderedEmailTemplateByKey('auth_password_reset', {
      ...getBaseTemplateVariables(),
      username: payload.username,
      reset_code: payload.resetCode,
      reset_url: payload.resetUrl,
      expires_at: payload.expiresAt.toISOString()
    })

    await this.sendEmailMessage({
      toEmail: payload.toEmail,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html
    })
  }

  async sendWelcomeEmail(payload: WelcomeEmailPayload) {
    const { rendered } = await getRenderedEmailTemplateByKey('welcome_new_account', {
      ...getBaseTemplateVariables(),
      username: payload.username,
      cta_url: payload.ctaUrl,
      members_url: payload.membersUrl,
      email: payload.toEmail
    })

    await this.sendEmailMessage({
      toEmail: payload.toEmail,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html
    })
  }
}

const emailService: EmailService = new EnvironmentEmailService()

export { emailService }
export type { EmailService, PasswordResetEmailPayload, VerificationEmailPayload, WelcomeEmailPayload }
