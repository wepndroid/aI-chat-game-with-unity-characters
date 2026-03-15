type SessionRole = 'user' | 'admin'

type SessionUser = {
  username: string
  email: string
  role: SessionRole
}

const AUTH_SESSION_STORAGE_KEY = 'secretwaifu-session-v1'
const AUTH_SESSION_CHANGED_EVENT = 'auth-session-changed'
const AUTH_USERS_STORAGE_KEY = 'secretwaifu-users-v1'
const AUTH_OPEN_SIGN_IN_MODAL_EVENT = 'auth-open-sign-in-modal'

type StoredAuthUser = {
  username: string
  email: string
  password: string
  role: SessionRole
}

type RegisterAuthUserPayload = {
  username: string
  email: string
  password: string
}

type RegisterAuthUserResult =
  | {
      success: true
      sessionUser: SessionUser
    }
  | {
      success: false
      message: string
    }

type AuthenticateAuthUserResult =
  | {
      success: true
      sessionUser: SessionUser
    }
  | {
      success: false
      message: string
    }

const DEFAULT_AUTH_USERS: StoredAuthUser[] = [
  {
    username: 'adminsenpai',
    email: 'admin@secretwaifu.com',
    password: 'admin123',
    role: 'admin'
  }
]

const isSessionUser = (value: unknown): value is SessionUser => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const sessionCandidate = value as Partial<SessionUser>

  return Boolean(
    sessionCandidate.username &&
      sessionCandidate.email &&
      (sessionCandidate.role === 'user' || sessionCandidate.role === 'admin')
  )
}

const isStoredAuthUser = (value: unknown): value is StoredAuthUser => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const userCandidate = value as Partial<StoredAuthUser>

  return Boolean(
    userCandidate.username &&
      userCandidate.email &&
      userCandidate.password &&
      (userCandidate.role === 'user' || userCandidate.role === 'admin')
  )
}

const toSessionUser = (user: StoredAuthUser): SessionUser => ({
  username: user.username,
  email: user.email,
  role: user.role
})

const normalizeEmail = (email: string) => email.trim().toLowerCase()

const readSessionUser = () => {
  if (typeof window === 'undefined') {
    return null
  }

  const rawSessionPayload = localStorage.getItem(AUTH_SESSION_STORAGE_KEY)

  if (!rawSessionPayload) {
    return null
  }

  try {
    const parsedSession = JSON.parse(rawSessionPayload) as unknown

    if (!isSessionUser(parsedSession)) {
      localStorage.removeItem(AUTH_SESSION_STORAGE_KEY)
      return null
    }

    return parsedSession
  } catch {
    localStorage.removeItem(AUTH_SESSION_STORAGE_KEY)
    return null
  }
}

const readStoredAuthUsers = () => {
  if (typeof window === 'undefined') {
    return DEFAULT_AUTH_USERS
  }

  const rawUsersPayload = localStorage.getItem(AUTH_USERS_STORAGE_KEY)

  if (!rawUsersPayload) {
    localStorage.setItem(AUTH_USERS_STORAGE_KEY, JSON.stringify(DEFAULT_AUTH_USERS))
    return DEFAULT_AUTH_USERS
  }

  try {
    const parsedUsers = JSON.parse(rawUsersPayload) as unknown

    if (!Array.isArray(parsedUsers)) {
      localStorage.setItem(AUTH_USERS_STORAGE_KEY, JSON.stringify(DEFAULT_AUTH_USERS))
      return DEFAULT_AUTH_USERS
    }

    const validatedUsers = parsedUsers.filter(isStoredAuthUser)
    const knownByEmail = new Map<string, StoredAuthUser>()

    for (const defaultUser of DEFAULT_AUTH_USERS) {
      knownByEmail.set(defaultUser.email, defaultUser)
    }

    for (const user of validatedUsers) {
      knownByEmail.set(normalizeEmail(user.email), {
        ...user,
        email: normalizeEmail(user.email)
      })
    }

    const userList = Array.from(knownByEmail.values())
    localStorage.setItem(AUTH_USERS_STORAGE_KEY, JSON.stringify(userList))

    return userList
  } catch {
    localStorage.setItem(AUTH_USERS_STORAGE_KEY, JSON.stringify(DEFAULT_AUTH_USERS))
    return DEFAULT_AUTH_USERS
  }
}

const writeStoredAuthUsers = (userList: StoredAuthUser[]) => {
  if (typeof window === 'undefined') {
    return
  }

  localStorage.setItem(AUTH_USERS_STORAGE_KEY, JSON.stringify(userList))
}

const writeSessionUser = (sessionUser: SessionUser) => {
  if (typeof window === 'undefined') {
    return
  }

  localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(sessionUser))
  window.dispatchEvent(new Event(AUTH_SESSION_CHANGED_EVENT))
}

const clearSessionUser = () => {
  if (typeof window === 'undefined') {
    return
  }

  localStorage.removeItem(AUTH_SESSION_STORAGE_KEY)
  window.dispatchEvent(new Event(AUTH_SESSION_CHANGED_EVENT))
}

const resolveSessionRole = (email: string, username: string): SessionRole => {
  const normalizedEmail = email.trim().toLowerCase()
  const normalizedUsername = username.trim().toLowerCase()

  if (normalizedEmail === 'admin@secretwaifu.com' || normalizedUsername === 'adminsenpai') {
    return 'admin'
  }

  return 'user'
}

const registerAuthUser = (payload: RegisterAuthUserPayload): RegisterAuthUserResult => {
  const username = payload.username.trim()
  const email = normalizeEmail(payload.email)
  const password = payload.password.trim()

  if (username.length < 3) {
    return {
      success: false,
      message: 'Username must be at least 3 characters.'
    }
  }

  if (!email || !email.includes('@')) {
    return {
      success: false,
      message: 'Please enter a valid e-mail.'
    }
  }

  if (password.length < 6) {
    return {
      success: false,
      message: 'Password must be at least 6 characters.'
    }
  }

  const userList = readStoredAuthUsers()
  const userExists = userList.some((user) => normalizeEmail(user.email) === email)

  if (userExists) {
    return {
      success: false,
      message: 'An account with this e-mail already exists.'
    }
  }

  const role = resolveSessionRole(email, username)
  const createdUser: StoredAuthUser = {
    username,
    email,
    password,
    role
  }

  writeStoredAuthUsers([...userList, createdUser])

  return {
    success: true,
    sessionUser: toSessionUser(createdUser)
  }
}

const authenticateAuthUser = (emailInput: string, passwordInput: string): AuthenticateAuthUserResult => {
  const email = normalizeEmail(emailInput)
  const password = passwordInput.trim()

  if (!email || !password) {
    return {
      success: false,
      message: 'E-mail and password are required.'
    }
  }

  const userList = readStoredAuthUsers()
  const matchedUser = userList.find((user) => normalizeEmail(user.email) === email)

  if (!matchedUser) {
    return {
      success: false,
      message: 'No account found. Please sign up first.'
    }
  }

  if (matchedUser.password !== password) {
    return {
      success: false,
      message: 'Invalid e-mail or password.'
    }
  }

  return {
    success: true,
    sessionUser: toSessionUser(matchedUser)
  }
}

export {
  AUTH_OPEN_SIGN_IN_MODAL_EVENT,
  AUTH_SESSION_CHANGED_EVENT,
  AUTH_SESSION_STORAGE_KEY,
  AUTH_USERS_STORAGE_KEY,
  authenticateAuthUser,
  clearSessionUser,
  readSessionUser,
  registerAuthUser,
  resolveSessionRole,
  writeSessionUser
}
export type { SessionRole, SessionUser }
