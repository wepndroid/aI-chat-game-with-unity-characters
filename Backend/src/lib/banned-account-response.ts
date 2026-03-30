import type { Response } from 'express'

/** Returned by session middleware when a valid session belongs to a banned user. Client may use `code` for UI. */
export const ACCOUNT_BANNED_BODY = {
  message: 'This account has been suspended.',
  code: 'ACCOUNT_BANNED' as const
}

export const sendBannedAccountForbidden = (response: Response) => {
  response.status(403).json(ACCOUNT_BANNED_BODY)
}
