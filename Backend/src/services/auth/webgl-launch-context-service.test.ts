import test from 'node:test'
import assert from 'node:assert/strict'
import {
  issueWebglLaunchContext,
  resolveWebglLaunchContext,
  WEBGL_LAUNCH_CONTEXT_TTL_MS
} from './webgl-launch-context-service'

const authUser = {
  userId: 'user-1',
  role: 'USER' as const,
  isEmailVerified: true
}

const storyContext = {
  story: {
    id: 'story-1',
    authorId: 'author-1',
    characterId: 'story-character-1',
    publicationStatus: 'PUBLISHED' as const,
    moderationStatus: 'APPROVED' as const
  },
  character: {
    id: 'story-character-1',
    ownerId: 'owner-1',
    status: 'APPROVED' as const,
    visibility: 'PUBLIC' as const,
    isPatreonGated: false
  }
}

const createDependencies = () => {
  const createCalls: unknown[] = []

  return {
    createCalls,
    dependencies: {
      prismaClient: {
        unityLaunchContext: {
          create: async (input: unknown) => {
            createCalls.push(input)
            return { id: 'launch-context-1' }
          }
        }
      },
      tokenGenerator: () => 'raw-launch-token-value',
      tokenHasher: (token: string) => `hashed:${token}`,
      now: () => new Date('2026-05-08T12:00:00.000Z'),
      storySessionContextResolver: async () => ({
        ok: true as const,
        data: storyContext
      })
    }
  }
}

const allowGameAccess = async () => 'premium' as const

test('issueWebglLaunchContext rejects inaccessible stories before creating a token', async () => {
  let generatedToken = false
  const createCalls: unknown[] = []

  const result = await issueWebglLaunchContext(authUser, { storyId: 'private-story', launchMode: 'fresh_session' }, {
    prismaClient: {
      unityLaunchContext: {
        create: async (input: unknown) => {
          createCalls.push(input)
          return { id: 'launch-context-1' }
        }
      }
    } as never,
    tokenGenerator: () => {
      generatedToken = true
      return 'raw-launch-token-value'
    },
    tokenHasher: (token: string) => `hashed:${token}`,
    storySessionContextResolver: async () => ({
      ok: false as const,
      error: {
        status: 404,
        code: 'STORY_NOT_FOUND',
        message: 'Story not found.'
      }
    })
  })

  assert.equal(result.ok, false)
  assert.equal(generatedToken, false)
  assert.equal(createCalls.length, 0)
})

test('issueWebglLaunchContext stores only the launch token hash', async () => {
  const { createCalls, dependencies } = createDependencies()
  const result = await issueWebglLaunchContext(authUser, { storyId: 'story-1', launchMode: 'fresh_session' }, dependencies as never)

  assert.equal(result.ok, true)
  assert.equal(createCalls.length, 1)
  const createCall = createCalls[0] as { data: { tokenHash: string; launchToken?: string } }
  assert.equal(createCall.data.tokenHash, 'hashed:raw-launch-token-value')
  assert.equal(createCall.data.launchToken, undefined)
  if (result.ok) {
    assert.equal(result.data.launchToken, 'raw-launch-token-value')
  }
})

test('issueWebglLaunchContext returns a fresh-session launch response', async () => {
  const { dependencies } = createDependencies()
  const result = await issueWebglLaunchContext(authUser, { storyId: 'story-1', launchMode: 'fresh_session' }, dependencies as never)

  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.data.storyId, 'story-1')
    assert.equal(result.data.characterId, 'story-character-1')
    assert.equal(result.data.launchMode, 'fresh_session')
    assert.equal(
      result.data.expiresAt.toISOString(),
      new Date(new Date('2026-05-08T12:00:00.000Z').getTime() + WEBGL_LAUNCH_CONTEXT_TTL_MS).toISOString()
    )
  }
})

test('issueWebglLaunchContext uses the selected story character id', async () => {
  const { createCalls, dependencies } = createDependencies()
  await issueWebglLaunchContext(authUser, { storyId: 'story-1', launchMode: 'fresh_session' }, dependencies as never)

  const createCall = createCalls[0] as { data: { storyId: string; characterId: string } }
  assert.equal(createCall.data.storyId, 'story-1')
  assert.equal(createCall.data.characterId, 'story-character-1')
})

test('resolveWebglLaunchContext consumes a valid token into a fresh chat launch payload', async () => {
  const claimCalls: unknown[] = []
  const consumedSessionCalls: unknown[] = []
  const transactionClient = {
    unityLaunchContext: {
      updateMany: async (input: unknown) => {
        claimCalls.push(input)
        return { count: 1 }
      },
      findUnique: async () => ({
        id: 'launch-context-1',
        tokenHash: 'hashed:raw-launch-token-value',
        userId: 'user-1',
        storyId: 'story-1',
        characterId: 'story-character-1',
        launchMode: 'FRESH_SESSION' as const,
        expiresAt: new Date('2026-05-08T12:05:00.000Z'),
        consumedAt: new Date('2026-05-08T12:00:00.000Z'),
        consumedSessionId: null
      }),
      update: async (input: unknown) => {
        consumedSessionCalls.push(input)
        return { id: 'launch-context-1' }
      }
    },
    user: {
      findUnique: async () => ({
        id: 'user-1',
        email: 'player@example.com',
        username: 'player',
        playerName: 'Player',
        role: 'USER' as const,
        isEmailVerified: true,
        isBanned: false
      })
    }
  }

  const result = await resolveWebglLaunchContext(
    { launchToken: 'raw-launch-token-value' },
    { ipAddress: '127.0.0.1', userAgent: 'Unity WebGL' },
    {
      prismaClient: {
        $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(transactionClient)
      } as never,
      tokenHasher: (token: string) => `hashed:${token}`,
      now: () => new Date('2026-05-08T12:00:00.000Z'),
      effectiveTierResolver: allowGameAccess,
      storyChatSessionCreator: async () => ({
        ok: true as const,
        data: {
          context: storyContext,
          session: {
            id: 'session-1',
            user_id: 'user-1',
            story_id: 'story-1',
            character_id: 'story-character-1',
            created_at: '2026-05-08T12:00:00.000Z',
            last_updated: '2026-05-08T12:00:00.000Z',
            preview_text: null
          }
        }
      }),
      storyLaunchPayloadResolver: async () => ({
        id: 'story-1',
        title: 'Story title',
        prompt_description: 'Prompt',
        personality: 'Kind',
        scenario: 'Cafe',
        first_message: 'Hi',
        scenario_type: 'romance',
        published_at: '2026-05-08T11:00:00.000Z',
        likes_count: 3,
        has_liked: true,
        origin: 'OFFICIAL',
        is_default: true,
        author: {
          id: 'author-1',
          username: 'author'
        }
      }),
      webglSessionCreator: async () => ({
        rawSessionToken: 'raw-webgl-bearer-token',
        expiresAt: new Date('2026-05-08T12:10:00.000Z')
      })
    }
  )

  assert.equal(result.ok, true)
  assert.equal(claimCalls.length, 1)
  assert.deepEqual(claimCalls[0], {
    where: {
      tokenHash: 'hashed:raw-launch-token-value',
      consumedAt: null,
      expiresAt: {
        gt: new Date('2026-05-08T12:00:00.000Z')
      }
    },
    data: {
      consumedAt: new Date('2026-05-08T12:00:00.000Z')
    }
  })
  assert.deepEqual(consumedSessionCalls[0], {
    where: {
      id: 'launch-context-1'
    },
    data: {
      consumedSessionId: 'session-1'
    }
  })

  if (result.ok) {
    assert.equal(result.data.access_token, 'raw-webgl-bearer-token')
    assert.equal(result.data.token_type, 'Bearer')
    assert.equal(result.data.launch.open_screen, 'chat')
    assert.equal(result.data.launch.launch_mode, 'fresh_session')
    assert.equal(result.data.launch.character_id, 'story-character-1')
    assert.equal(result.data.launch.story_id, 'story-1')
    assert.equal(result.data.launch.session_id, 'session-1')
    assert.equal(result.data.story.id, 'story-1')
    assert.equal(result.data.session.id, 'session-1')
    assert.deepEqual(result.data.user, {
      id: 'user-1',
      email: 'player@example.com',
      username: 'player',
      player_name: 'Player',
      role: 'USER',
      is_email_verified: true
    })
  }
})

test('resolveWebglLaunchContext rejects free-tier launch tokens before creating a session', async () => {
  let sessionCreated = false
  let rolledBack = false

  const result = await resolveWebglLaunchContext(
    { launchToken: 'raw-launch-token-value' },
    { ipAddress: null, userAgent: null },
    {
      prismaClient: {
        $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
          try {
            return await callback({
              unityLaunchContext: {
                updateMany: async () => ({ count: 1 }),
                findUnique: async () => ({
                  id: 'launch-context-1',
                  tokenHash: 'hashed:raw-launch-token-value',
                  userId: 'user-1',
                  storyId: 'story-1',
                  characterId: 'story-character-1',
                  launchMode: 'FRESH_SESSION' as const,
                  expiresAt: new Date('2026-05-08T12:05:00.000Z'),
                  consumedAt: new Date('2026-05-08T12:00:00.000Z'),
                  consumedSessionId: null
                })
              },
              user: {
                findUnique: async () => ({
                  id: 'user-1',
                  email: 'player@example.com',
                  username: 'player',
                  playerName: null,
                  role: 'USER' as const,
                  isEmailVerified: true,
                  isBanned: false
                })
              }
            })
          } catch (error) {
            rolledBack = true
            throw error
          }
        }
      } as never,
      tokenHasher: (token: string) => `hashed:${token}`,
      now: () => new Date('2026-05-08T12:00:00.000Z'),
      effectiveTierResolver: async () => 'free' as const,
      storyChatSessionCreator: async () => {
        sessionCreated = true
        throw new Error('should not create a session without game access')
      }
    }
  )

  assert.equal(rolledBack, true)
  assert.equal(sessionCreated, false)
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.error.status, 403)
    assert.equal(result.error.code, 'MEMBERSHIP_REQUIRED')
    assert.equal(result.error.message, 'Start a membership first to play SecretWaifu.')
  }
})

test('resolveWebglLaunchContext hides invalid expired or consumed tokens behind one generic error', async () => {
  let findCalls = 0
  let sessionCreated = false

  const result = await resolveWebglLaunchContext(
    { launchToken: 'unknown-launch-token' },
    { ipAddress: null, userAgent: null },
    {
      prismaClient: {
        $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
          callback({
            unityLaunchContext: {
              updateMany: async () => ({ count: 0 }),
              findUnique: async () => {
                findCalls += 1
                return null
              }
            }
          })
      } as never,
      tokenHasher: (token: string) => `hashed:${token}`,
      now: () => new Date('2026-05-08T12:00:00.000Z'),
      effectiveTierResolver: allowGameAccess,
      storyChatSessionCreator: async () => {
        sessionCreated = true
        throw new Error('should not create a session for invalid launch tokens')
      }
    }
  )

  assert.equal(result.ok, false)
  assert.equal(findCalls, 0)
  assert.equal(sessionCreated, false)
  if (!result.ok) {
    assert.equal(result.error.status, 404)
    assert.equal(result.error.code, 'LAUNCH_CONTEXT_NOT_FOUND')
    assert.equal(result.error.message, 'Launch context not found.')
  }
})

test('resolveWebglLaunchContext rolls back the token claim when story access fails during resolve', async () => {
  let rolledBack = false

  const result = await resolveWebglLaunchContext(
    { launchToken: 'raw-launch-token-value' },
    { ipAddress: null, userAgent: null },
    {
      prismaClient: {
        $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
          try {
            return await callback({
              unityLaunchContext: {
                updateMany: async () => ({ count: 1 }),
                findUnique: async () => ({
                  id: 'launch-context-1',
                  tokenHash: 'hashed:raw-launch-token-value',
                  userId: 'user-1',
                  storyId: 'story-1',
                  characterId: 'story-character-1',
                  launchMode: 'FRESH_SESSION' as const,
                  expiresAt: new Date('2026-05-08T12:05:00.000Z'),
                  consumedAt: new Date('2026-05-08T12:00:00.000Z'),
                  consumedSessionId: null
                })
              },
              user: {
                findUnique: async () => ({
                  id: 'user-1',
                  email: 'player@example.com',
                  username: 'player',
                  playerName: null,
                  role: 'USER' as const,
                  isEmailVerified: true,
                  isBanned: false
                })
              }
            })
          } catch (error) {
            rolledBack = true
            throw error
          }
        }
      } as never,
      tokenHasher: (token: string) => `hashed:${token}`,
      now: () => new Date('2026-05-08T12:00:00.000Z'),
      effectiveTierResolver: allowGameAccess,
      storyChatSessionCreator: async () => ({
        ok: false as const,
        error: {
          status: 404 as const,
          code: 'STORY_NOT_FOUND' as const,
          message: 'Story not found.'
        }
      })
    }
  )

  assert.equal(rolledBack, true)
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.error.code, 'STORY_NOT_FOUND')
  }
})
