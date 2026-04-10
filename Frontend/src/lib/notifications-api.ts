import { apiGet, apiPost } from '@/lib/api-client'

export type NotificationFeedItem = {
  id: string
  kind: string
  title: string
  body: string | null
  href: string
  createdAt: string
  read: boolean
}

type NotificationsResponse = {
  data: {
    items: NotificationFeedItem[]
    unreadCount: number
  }
}

const getMyNotifications = async () => {
  return apiGet<NotificationsResponse>('/users/me/notifications')
}

const markNotificationRead = async (id: string) => {
  return apiPost<{ data: { updated: boolean } }>('/users/me/notifications/mark-read', { id })
}

export { getMyNotifications, markNotificationRead }
