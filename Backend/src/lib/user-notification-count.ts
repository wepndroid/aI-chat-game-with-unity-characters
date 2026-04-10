import { prisma } from './prisma'

/** Unread story rejections (StoryPost) + unread UserNotification rows. */
const getUnreadNotificationCount = async (userId: string): Promise<number> => {
  const [storyRejectionCount, dbNotificationCount] = await Promise.all([
    prisma.storyPost.count({
      where: {
        authorId: userId,
        publicationStatus: 'PUBLISHED',
        moderationStatus: 'REJECTED',
        authorReadRejectionAt: null
      }
    }),
    prisma.userNotification.count({
      where: {
        userId,
        readAt: null
      }
    })
  ])

  return storyRejectionCount + dbNotificationCount
}

export { getUnreadNotificationCount }
