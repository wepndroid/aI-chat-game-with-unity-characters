import test from 'node:test'
import assert from 'node:assert/strict'
import { UserRole } from '@prisma/client'

import {
  createWebGlBridgeSessionForUserWithClient,
  resolveAuthenticatedSessionUserWithClient
} from '../auth-service'

type AuthSessionRow = {
  id: string
  userId: string
  lastSeenAt: Date | null
  user: {
    email: string
    role: UserRole
    isEmailVerified: boolean
    isBanned: boolean
    activityState: {
      lastSeenAt: Date | null
    } | null
  }
}

type AuthSessionRowOverrides = Partial<Omit<AuthSessionRow, 'user'>> & {
  user?: Partial<AuthSessionRow['user']>
}

const makeAuthSessionRow = (overrides: AuthSessionRowOverrides = {}): AuthSessionRow => {
  const userOverrides = overrides.user

  return {
    id: overrides.id ?? 'session-1',
    userId: overrides.userId ?? 'user-1',
    lastSeenAt: overrides.lastSeenAt ?? new Date('2026-05-18T11:59:00.000Z'),
    user: {
      email: userOverrides?.email ?? 'user@example.com',
      role: userOverrides?.role ?? UserRole.USER,
      isEmailVerified: userOverrides?.isEmailVerified ?? true,
      isBanned: userOverrides?.isBanned ?? false,
      activityState: userOverrides?.activityState ?? {
        lastSeenAt: overrides.lastSeenAt ?? new Date('2026-05-18T11:59:00.000Z')
      }
    }
  }
}

const createResolveSessionDb = (input: {
  session: AuthSessionRow | null
  updateManyError?: unknown
  updateManyResult?: {
    count: number
  }
}) => {
  const findFirstCalls: unknown[] = []
  const updateManyCalls: unknown[] = []
  const upsertCalls: unknown[] = []

  return {
    findFirstCalls,
    updateManyCalls,
    upsertCalls,
    db: {
      session: {
        findFirst: async (query: unknown) => {
          findFirstCalls.push(query)
          return input.session
        },
        updateMany: async (query: unknown) => {
          updateManyCalls.push(query)
          if (input.updateManyError) {
            throw input.updateManyError
          }

          return input.updateManyResult ?? { count: 1 }
        }
      },
      userActivityState: {
        upsert: async (query: unknown) => {
          upsertCalls.push(query)
          return { userId: input.session?.userId ?? 'user-1' }
        }
      }
    }
  }
}

test('createWebGlBridgeSessionForUserWithClient stores only the bearer token hash', async () => {
  const createCalls: unknown[] = []
  const upsertCalls: unknown[] = []
  const issuedAt = new Date('2026-05-08T12:00:00.000Z')

  const result = await createWebGlBridgeSessionForUserWithClient(
    'user-1',
    {
      ipAddress: '127.0.0.1',
      userAgent: 'Unity WebGL'
    },
    {
      prismaClient: {
        session: {
          create: async (input: unknown) => {
            createCalls.push(input)
            return { id: 'session-row-1' }
          }
        },
        userActivityState: {
          upsert: async (input: unknown) => {
            upsertCalls.push(input)
            return { userId: 'user-1' }
          }
        }
      } as never,
      tokenGenerator: () => 'raw-webgl-bearer-token',
      tokenHasher: (token: string) => `hashed:${token}`,
      now: () => issuedAt,
      ttlMs: 120_000
    }
  )

  assert.equal(result.rawSessionToken, 'raw-webgl-bearer-token')
  assert.equal(result.expiresAt.toISOString(), '2026-05-08T12:02:00.000Z')
  assert.equal(createCalls.length, 1)
  const createCall = createCalls[0] as {
    data: {
      sessionTokenHash: string
      rawSessionToken?: string
      userAgent: string
      createdAt: Date
      lastSeenAt: Date
    }
  }
  assert.equal(createCall.data.sessionTokenHash, 'hashed:raw-webgl-bearer-token')
  assert.equal(createCall.data.rawSessionToken, undefined)
  assert.equal(createCall.data.userAgent, '[webgl-bridge] Unity WebGL')
  assert.equal(createCall.data.createdAt.toISOString(), '2026-05-08T12:00:00.000Z')
  assert.equal(createCall.data.lastSeenAt.toISOString(), '2026-05-08T12:00:00.000Z')
  assert.deepEqual(upsertCalls, [
    {
      where: {
        userId: 'user-1'
      },
      create: {
        userId: 'user-1',
        lastSeenAt: issuedAt,
        createdAt: issuedAt,
        updatedAt: issuedAt
      },
      update: {
        lastSeenAt: issuedAt,
        updatedAt: issuedAt
      }
    }
  ])
})

test('resolveAuthenticatedSessionUserWithClient returns a fresh session without refreshing lastSeenAt', async () => {
  const now = new Date('2026-05-18T12:00:00.000Z')
  const { db, findFirstCalls, updateManyCalls } = createResolveSessionDb({
    session: makeAuthSessionRow({
      lastSeenAt: new Date('2026-05-18T11:59:00.000Z')
    })
  })

  const result = await resolveAuthenticatedSessionUserWithClient('raw-cookie-token', {
    prismaClient: db as never,
    tokenHasher: (token: string) => `hashed:${token}`,
    now: () => now
  })

  assert.deepEqual(result, {
    userId: 'user-1',
    email: 'user@example.com',
    role: UserRole.USER,
    isEmailVerified: true,
    sessionId: 'session-1'
  })
  assert.equal(updateManyCalls.length, 0)
  assert.equal(findFirstCalls.length, 1)
  assert.deepEqual(findFirstCalls[0], {
    where: {
      sessionTokenHash: 'hashed:raw-cookie-token',
      revokedAt: null,
      expiresAt: {
        gt: now
      }
    },
    select: {
      id: true,
      userId: true,
      lastSeenAt: true,
      user: {
        select: {
          email: true,
          role: true,
          isEmailVerified: true,
          isBanned: true,
          activityState: {
            select: {
              lastSeenAt: true
            }
          }
        }
      }
    }
  })
})

test('resolveAuthenticatedSessionUserWithClient conditionally refreshes stale session and durable activity', async () => {
  const now = new Date('2026-05-18T12:00:00.000Z')
  const { db, updateManyCalls, upsertCalls } = createResolveSessionDb({
    session: makeAuthSessionRow({
      lastSeenAt: new Date('2026-05-18T11:54:59.000Z')
    })
  })

  const result = await resolveAuthenticatedSessionUserWithClient('raw-cookie-token', {
    prismaClient: db as never,
    tokenHasher: (token: string) => `hashed:${token}`,
    now: () => now
  })

  assert.notEqual(result, null)
  assert.notEqual(result, 'banned')
  assert.equal(updateManyCalls.length, 1)
  assert.equal(upsertCalls.length, 1)
  assert.deepEqual(updateManyCalls[0], {
    where: {
      id: 'session-1',
      OR: [
        {
          lastSeenAt: null
        },
        {
          lastSeenAt: {
            lt: new Date('2026-05-18T11:55:00.000Z')
          }
        }
      ]
    },
    data: {
      lastSeenAt: now
    }
  })
  assert.deepEqual(upsertCalls[0], {
    where: {
      userId: 'user-1'
    },
    create: {
      userId: 'user-1',
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now
    },
    update: {
      lastSeenAt: now,
      updatedAt: now
    }
  })
})

test('resolveAuthenticatedSessionUserWithClient preserves a valid session when lastSeenAt refresh hits database pressure', async () => {
  const now = new Date('2026-05-18T12:00:00.000Z')
  const warnings: unknown[] = []
  const { db, upsertCalls } = createResolveSessionDb({
    session: makeAuthSessionRow({
      lastSeenAt: new Date('2026-05-18T11:54:59.000Z')
    }),
    updateManyError: Object.assign(
      new Error('Socket timeout containing raw-cookie-token and user@example.com'),
      {
        code: 'P1008'
      }
    )
  })

  const result = await resolveAuthenticatedSessionUserWithClient('raw-cookie-token', {
    prismaClient: db as never,
    tokenHasher: (token: string) => `hashed:${token}`,
    now: () => now,
    lastSeenRefreshWarningLogger: (warning) => warnings.push(warning)
  })

  assert.deepEqual(result, {
    userId: 'user-1',
    email: 'user@example.com',
    role: UserRole.USER,
    isEmailVerified: true,
    sessionId: 'session-1'
  })
  assert.equal(upsertCalls.length, 1)
  assert.equal(warnings.length, 1)

  const serializedWarning = JSON.stringify(warnings[0])
  assert.equal(serializedWarning.includes('raw-cookie-token'), false)
  assert.equal(serializedWarning.includes('user@example.com'), false)
})

test('resolveAuthenticatedSessionUserWithClient revokes banned sessions without refreshing lastSeenAt', async () => {
  const now = new Date('2026-05-18T12:00:00.000Z')
  const { db, updateManyCalls } = createResolveSessionDb({
    session: makeAuthSessionRow({
      user: {
        email: 'banned@example.com',
        role: UserRole.USER,
        isEmailVerified: true,
        isBanned: true
      },
      lastSeenAt: new Date('2026-05-18T11:00:00.000Z')
    })
  })

  const result = await resolveAuthenticatedSessionUserWithClient('raw-cookie-token', {
    prismaClient: db as never,
    tokenHasher: (token: string) => `hashed:${token}`,
    now: () => now
  })

  assert.equal(result, 'banned')
  assert.equal(updateManyCalls.length, 1)
  assert.deepEqual(updateManyCalls[0], {
    where: {
      userId: 'user-1',
      revokedAt: null
    },
    data: {
      revokedAt: now
    }
  })
})
