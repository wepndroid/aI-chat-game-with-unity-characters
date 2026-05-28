import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { emailService } from '../services/email-service'
import { buildFrontendPublicUrl } from './frontend-public-url'

const REVIEW_QUEUE_HREF = '/admin/review-queue'

type ReviewQueueNotification = {
  kind: string
  title: string
  body: string
  href?: string
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const resolveAbsoluteReviewUrl = (href: string) => buildFrontendPublicUrl(href, 'admin review queue email links')

/**
 * One in-app notification per admin for content awaiting moderation.
 */
const notifyAdminsReviewQueue = async (
  db: Prisma.TransactionClient | typeof prisma,
  params: ReviewQueueNotification
): Promise<void> => {
  const adminRows = await db.user.findMany({
    where: { role: 'ADMIN' },
    select: { id: true }
  })

  if (adminRows.length === 0) {
    return
  }

  const href = params.href ?? REVIEW_QUEUE_HREF

  await db.userNotification.createMany({
    data: adminRows.map((row) => ({
      userId: row.id,
      kind: params.kind,
      title: params.title,
      body: params.body,
      href
    }))
  })
}

const notifyAdminsReviewQueueBestEffort = async (params: ReviewQueueNotification): Promise<void> => {
  try {
    await notifyAdminsReviewQueue(prisma, params)
  } catch (error) {
    console.error('Failed to create admin review queue notification.', error)
  }
}

/**
 * Sends best-effort email alerts to all admin accounts after the pending-review
 * record has been committed. Email failures must not block creator submission.
 */
const emailAdminsReviewQueue = async (params: ReviewQueueNotification): Promise<void> => {
  try {
    const adminRows = await prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: {
        email: true,
        username: true
      }
    })

    if (adminRows.length === 0) {
      return
    }

    const href = params.href ?? REVIEW_QUEUE_HREF
    const reviewUrl = resolveAbsoluteReviewUrl(href)
    if (!reviewUrl) {
      console.error('Skipped admin review queue email notifications because FRONTEND_URL is not configured.')
      return
    }

    const subject = params.title
    const safeTitle = escapeHtml(params.title)
    const safeBody = escapeHtml(params.body)
    const safeReviewUrl = escapeHtml(reviewUrl)
    const html = `
    <div style="font-family:Arial,Helvetica,sans-serif; background:#050608; color:#f8f5f2; padding:24px;">
      <div style="max-width:620px; margin:0 auto; border:1px solid rgba(255,255,255,0.12); border-radius:18px; background:#10141d; padding:24px;">
        <p style="margin:0 0 8px; color:#ffb07a; font-size:12px; letter-spacing:0.12em; text-transform:uppercase;">Review queue</p>
        <h1 style="margin:0 0 14px; color:#ffffff; font-size:24px; line-height:1.25;">${safeTitle}</h1>
        <p style="margin:0 0 22px; color:#dbe4f6; font-size:15px; line-height:1.65;">${safeBody}</p>
        <a href="${safeReviewUrl}" style="display:inline-block; padding:12px 18px; border-radius:999px; background:#f46313; color:#050608; font-weight:700; text-decoration:none;">Open review queue</a>
        <p style="margin:18px 0 0; color:#8fa3c7; font-size:12px; line-height:1.6;">${safeReviewUrl}</p>
      </div>
    </div>
  `
    const text = `${params.title}\n\n${params.body}\n\nOpen review queue: ${reviewUrl}`

    const results = await Promise.allSettled(
      adminRows.map((adminRow) =>
        emailService.sendEmailMessage({
          toEmail: adminRow.email,
          subject,
          text: `Hello ${adminRow.username},\n\n${text}`,
          html
        })
      )
    )
    const failedCount = results.filter((result) => result.status === 'rejected').length

    if (failedCount > 0) {
      console.error(`Failed to send ${failedCount} admin review queue email notification(s).`)
    }
  } catch {
    console.error('Failed to send admin review queue email notifications.')
  }
}

export { REVIEW_QUEUE_HREF, emailAdminsReviewQueue, notifyAdminsReviewQueue, notifyAdminsReviewQueueBestEffort }
export type { ReviewQueueNotification }
