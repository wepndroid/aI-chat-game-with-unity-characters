import nodemailer from 'nodemailer'
import { getEmailConfig } from '../lib/auth-config'

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
  resetUrl: string
  expiresAt: Date
}

interface EmailService {
  sendVerificationEmail(payload: VerificationEmailPayload): Promise<void>
  sendPasswordResetEmail(payload: PasswordResetEmailPayload): Promise<void>
}

const parseDuration = (value: string | undefined, fallbackValue: number) => {
  const parsed = Number.parseInt(value ?? '', 10)

  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallbackValue
  }

  return parsed
}

const emailSendTimeoutMs = parseDuration(process.env.EMAIL_SEND_TIMEOUT_MS, 6000)

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

  private async sendMessage(toEmail: string, subject: string, text: string, html: string) {
    const emailConfig = getEmailConfig()
    const transporter = this.createTransporter()

    if (transporter) {
      await withTimeout(
        transporter.sendMail({
          from: emailConfig.from,
          to: toEmail,
          subject,
          text,
          html
        }),
        emailSendTimeoutMs
      )
      return
    }

    if (process.env.NODE_ENV !== 'production') {
      console.info(`[EmailService:dev-fallback] To=${toEmail} | Subject=${subject}`)
      console.info(text)
      return
    }

    throw new Error('Email provider is not configured in production environment.')
  }

  async sendVerificationEmail(payload: VerificationEmailPayload) {
    const expiryLabel = payload.expiresAt.toISOString()
    const subject = 'Verify your SecretWaifu account email'
    const textLines = [
      `Hello ${payload.username},`,
      '',
      'Your SecretWaifu one-time verification code is:',
      payload.verificationCode,
      '',
      `This code expires at ${expiryLabel}.`
    ]

    if (payload.verificationUrl) {
      textLines.push('', 'Optional quick link:', payload.verificationUrl)
    }

    const text = textLines.join('\n')
    const html = `
      <p>Hello ${payload.username},</p>
      <p>Your SecretWaifu one-time verification code is:</p>
      <p><strong style="font-size:20px; letter-spacing:2px;">${payload.verificationCode}</strong></p>
      <p>This code expires at ${expiryLabel}.</p>
      ${payload.verificationUrl ? `<p>Optional quick link: <a href="${payload.verificationUrl}">${payload.verificationUrl}</a></p>` : ''}
    `

    await this.sendMessage(payload.toEmail, subject, text, html)
  }

  async sendPasswordResetEmail(payload: PasswordResetEmailPayload) {
    const expiryLabel = payload.expiresAt.toISOString()
    const subject = 'Reset your SecretWaifu account password'
    const text = [
      `Hello ${payload.username},`,
      '',
      'Use this link to reset your password:',
      payload.resetUrl,
      '',
      `This link expires at ${expiryLabel}.`,
      'If you did not request this, you can ignore this message.'
    ].join('\n')
    const html = `
      <p>Hello ${payload.username},</p>
      <p>Use this link to reset your password:</p>
      <p><a href="${payload.resetUrl}">${payload.resetUrl}</a></p>
      <p>This link expires at ${expiryLabel}.</p>
      <p>If you did not request this, you can ignore this message.</p>
    `

    await this.sendMessage(payload.toEmail, subject, text, html)
  }
}

const emailService: EmailService = new EnvironmentEmailService()

export { emailService }
export type { EmailService, PasswordResetEmailPayload, VerificationEmailPayload }
