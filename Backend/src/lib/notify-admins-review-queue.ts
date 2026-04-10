import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'

const REVIEW_QUEUE_HREF = '/admin/review-queue'

/**
 * One notification per admin — new community VRM / character awaiting moderation.
 */
const notifyAdminsReviewQueue = async (
  db: Prisma.TransactionClient | typeof prisma,
  params: { kind: string; title: string; body: string; href?: string }
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

export { REVIEW_QUEUE_HREF, notifyAdminsReviewQueue }
