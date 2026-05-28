import { UnityLaunchMode, type Prisma, type UserRole } from '@prisma/client'
import { getEffectiveUserRoleForTesting } from '../../lib/auth-config'
import {
  MEMBERSHIP_REQUIRED_CODE,
  MEMBERSHIP_REQUIRED_MESSAGE,
  buildMembershipRequiredDetails,
  isGameAccessAllowed
} from '../../lib/game-access'
import { prisma } from '../../lib/prisma'
import { generateOpaqueSessionToken, hashOpaqueSessionToken } from '../../lib/session-token'
import {
  createWebGlBridgeSessionForUserWithClient,
  type SessionClientMeta
} from '../auth-service'
import {
  createStoryChatSession,
  type StoryChatSessionItem
} from '../chat/story-chat-session-service'
import {
  resolveStoryLaunchPayload,
  type StoryLaunchPayload
} from '../chat/story-launch-payload-service'
import {
  resolveEffectiveMembershipTierForUser,
  type EffectiveMembershipTierCode
} from '../membership/membership-tier-service'
import {
  resolveStorySessionContext,
  type StorySessionContextError,
  type StorySessionContextResult
} from '../chat/story-session-context-service'

type WebglLaunchIssueAuthUser = {
  userId: string
  role: UserRole
  isEmailVerified: boolean
}

type WebglLaunchIssueRequest = {
  storyId: string
  launchMode: 'fresh_session'
}

type WebglLaunchIssueSuccess = {
  launchToken: string
  storyId: string
  characterId: string
  launchMode: 'fresh_session'
  expiresAt: Date
}

type WebglLaunchIssueResult =
  | { ok: true; data: WebglLaunchIssueSuccess }
  | { ok: false; error: StorySessionContextError }

type WebglLaunchResolveRequest = {
  launchToken: string
}

type WebglLaunchResolveUser = {
  id: string
  email: string
  username: string
  player_name: string
  role: UserRole
  is_email_verified: boolean
}

type WebglLaunchResolveSuccess = {
  access_token: string
  token_type: 'Bearer'
  expires_at: string
  user: WebglLaunchResolveUser
  launch: {
    open_screen: 'chat'
    launch_mode: 'fresh_session'
    character_id: string
    story_id: string
    session_id: string
  }
  story: StoryLaunchPayload
  session: StoryChatSessionItem
}

type WebglLaunchResolveError =
  | StorySessionContextError
  | {
      status: 404
      code: 'LAUNCH_CONTEXT_NOT_FOUND'
      message: 'Launch context not found.'
    }
  | {
      status: 403
      code: 'ACCOUNT_SUSPENDED'
      message: 'This account has been suspended.'
    }
  | {
      status: 403
      code: typeof MEMBERSHIP_REQUIRED_CODE
      message: typeof MEMBERSHIP_REQUIRED_MESSAGE
      details: ReturnType<typeof buildMembershipRequiredDetails>
    }

type WebglLaunchResolveResult =
  | { ok: true; data: WebglLaunchResolveSuccess }
  | { ok: false; error: WebglLaunchResolveError }

type WebglLaunchContextPrismaClient = Pick<Prisma.TransactionClient, 'unityLaunchContext'>
type WebglLaunchResolveTransactionClient = Pick<
  Prisma.TransactionClient,
  | 'unityLaunchContext'
  | 'user'
  | 'chatSession'
  | 'storyPost'
  | 'character'
  | 'storyPostLike'
  | 'session'
  | 'userActivityState'
>

type WebglLaunchResolvePrismaClient = {
  $transaction: <T>(handler: (tx: WebglLaunchResolveTransactionClient) => Promise<T>) => Promise<T>
}

type WebglLaunchContextDependencies = {
  prismaClient?: WebglLaunchContextPrismaClient
  storySessionContextResolver?: typeof resolveStorySessionContext
  tokenGenerator?: typeof generateOpaqueSessionToken
  tokenHasher?: typeof hashOpaqueSessionToken
  now?: () => Date
}

type WebglLaunchResolveDependencies = {
  prismaClient?: WebglLaunchResolvePrismaClient
  tokenHasher?: typeof hashOpaqueSessionToken
  now?: () => Date
  effectiveTierResolver?: typeof resolveEffectiveMembershipTierForUser
  storyChatSessionCreator?: typeof createStoryChatSession
  storyLaunchPayloadResolver?: typeof resolveStoryLaunchPayload
  webglSessionCreator?: typeof createWebGlBridgeSessionForUserWithClient
}

const DEFAULT_WEBGL_LAUNCH_CONTEXT_TTL_MS = 5 * 60 * 1000
const parsedWebglLaunchContextTtlMs = Number.parseInt(process.env.WEBGL_LAUNCH_CONTEXT_TTL_MS ?? '', 10)
const WEBGL_LAUNCH_CONTEXT_TTL_MS = Number.isFinite(parsedWebglLaunchContextTtlMs)
  ? Math.max(60_000, parsedWebglLaunchContextTtlMs)
  : DEFAULT_WEBGL_LAUNCH_CONTEXT_TTL_MS

const invalidLaunchContextError: WebglLaunchResolveError = {
  status: 404,
  code: 'LAUNCH_CONTEXT_NOT_FOUND',
  message: 'Launch context not found.'
}

const membershipRequiredError: WebglLaunchResolveError = {
  status: 403,
  code: MEMBERSHIP_REQUIRED_CODE,
  message: MEMBERSHIP_REQUIRED_MESSAGE,
  details: buildMembershipRequiredDetails()
}

class WebglLaunchResolveExpectedFailure extends Error {
  readonly result: WebglLaunchResolveResult

  constructor(result: WebglLaunchResolveResult) {
    super(result.ok ? 'Unexpected successful launch resolve failure.' : result.error.code)
    this.result = result
  }
}

const failResolve = (error: WebglLaunchResolveError): WebglLaunchResolveExpectedFailure =>
  new WebglLaunchResolveExpectedFailure({
    ok: false,
    error
  })

const resolvePlayerName = (playerName: string | null | undefined, username: string) => {
  const normalized = playerName?.trim()
  return normalized && normalized.length > 0 ? normalized : username
}

const mapLaunchMode = (launchMode: UnityLaunchMode): 'fresh_session' => {
  if (launchMode === UnityLaunchMode.FRESH_SESSION) {
    return 'fresh_session'
  }

  throw failResolve(invalidLaunchContextError)
}

const issueWebglLaunchContext = async (
  authUser: WebglLaunchIssueAuthUser,
  request: WebglLaunchIssueRequest,
  dependencies: WebglLaunchContextDependencies = {}
): Promise<WebglLaunchIssueResult> => {
  const storySessionContextResolver = dependencies.storySessionContextResolver ?? resolveStorySessionContext
  const context: StorySessionContextResult = await storySessionContextResolver(authUser, request.storyId)

  if (!context.ok) {
    return context
  }

  const tokenGenerator = dependencies.tokenGenerator ?? generateOpaqueSessionToken
  const tokenHasher = dependencies.tokenHasher ?? hashOpaqueSessionToken
  const prismaClient = dependencies.prismaClient ?? prisma
  const now = dependencies.now ?? (() => new Date())

  const launchToken = tokenGenerator()
  const expiresAt = new Date(now().getTime() + WEBGL_LAUNCH_CONTEXT_TTL_MS)

  await prismaClient.unityLaunchContext.create({
    data: {
      tokenHash: tokenHasher(launchToken),
      userId: authUser.userId,
      storyId: context.data.story.id,
      characterId: context.data.story.characterId,
      launchMode: UnityLaunchMode.FRESH_SESSION,
      expiresAt
    }
  })

  return {
    ok: true,
    data: {
      launchToken,
      storyId: context.data.story.id,
      characterId: context.data.story.characterId,
      launchMode: request.launchMode,
      expiresAt
    }
  }
}

const resolveWebglLaunchContext = async (
  request: WebglLaunchResolveRequest,
  clientMeta: SessionClientMeta,
  dependencies: WebglLaunchResolveDependencies = {}
): Promise<WebglLaunchResolveResult> => {
  const prismaClient = dependencies.prismaClient ?? (prisma as unknown as WebglLaunchResolvePrismaClient)
  const tokenHasher = dependencies.tokenHasher ?? hashOpaqueSessionToken
  const now = dependencies.now ?? (() => new Date())
  const effectiveTierResolver = dependencies.effectiveTierResolver ?? resolveEffectiveMembershipTierForUser
  const storyChatSessionCreator = dependencies.storyChatSessionCreator ?? createStoryChatSession
  const storyLaunchPayloadResolver = dependencies.storyLaunchPayloadResolver ?? resolveStoryLaunchPayload
  const webglSessionCreator = dependencies.webglSessionCreator ?? createWebGlBridgeSessionForUserWithClient
  const tokenHash = tokenHasher(request.launchToken)

  try {
    return await prismaClient.$transaction<WebglLaunchResolveResult>(async (tx) => {
      const claimedAt = now()
      const claim = await tx.unityLaunchContext.updateMany({
        where: {
          tokenHash,
          consumedAt: null,
          expiresAt: {
            gt: claimedAt
          }
        },
        data: {
          consumedAt: claimedAt
        }
      })

      if (claim.count !== 1) {
        return {
          ok: false,
          error: invalidLaunchContextError
        }
      }

      const launchContext = await tx.unityLaunchContext.findUnique({
        where: {
          tokenHash
        },
        select: {
          id: true,
          userId: true,
          storyId: true,
          characterId: true,
          launchMode: true
        }
      })

      if (!launchContext) {
        throw failResolve(invalidLaunchContextError)
      }

      const user = await tx.user.findUnique({
        where: {
          id: launchContext.userId
        },
        select: {
          id: true,
          email: true,
          username: true,
          playerName: true,
          role: true,
          isEmailVerified: true,
          isBanned: true
        }
      })

      if (!user) {
        throw failResolve(invalidLaunchContextError)
      }

      if (user.isBanned) {
        throw failResolve({
          status: 403,
          code: 'ACCOUNT_SUSPENDED',
          message: 'This account has been suspended.'
        })
      }

      const effectiveTierCode: EffectiveMembershipTierCode = await effectiveTierResolver(user.id, {
        db: tx,
        now: claimedAt
      })
      if (!isGameAccessAllowed(effectiveTierCode)) {
        throw failResolve(membershipRequiredError)
      }

      const launchAuthUser = {
        userId: user.id,
        role: getEffectiveUserRoleForTesting(user.role),
        isEmailVerified: user.isEmailVerified
      }
      const createdSession = await storyChatSessionCreator(launchAuthUser, launchContext.storyId, {
        prismaClient: tx,
        now
      })

      if (!createdSession.ok) {
        throw failResolve(createdSession.error)
      }

      if (createdSession.data.context.story.characterId !== launchContext.characterId) {
        throw failResolve(invalidLaunchContextError)
      }

      const story = await storyLaunchPayloadResolver(launchAuthUser, launchContext.storyId, launchContext.characterId, {
        prismaClient: tx
      })

      if (!story) {
        throw failResolve(invalidLaunchContextError)
      }

      const webglSession = await webglSessionCreator(user.id, clientMeta, {
        prismaClient: tx
      })

      await tx.unityLaunchContext.update({
        where: {
          id: launchContext.id
        },
        data: {
          consumedSessionId: createdSession.data.session.id
        }
      })

      return {
        ok: true,
        data: {
          access_token: webglSession.rawSessionToken,
          token_type: 'Bearer',
          expires_at: webglSession.expiresAt.toISOString(),
          user: {
            id: user.id,
            email: user.email,
            username: user.username,
            player_name: resolvePlayerName(user.playerName, user.username),
            role: launchAuthUser.role,
            is_email_verified: user.isEmailVerified
          },
          launch: {
            open_screen: 'chat',
            launch_mode: mapLaunchMode(launchContext.launchMode),
            character_id: launchContext.characterId,
            story_id: launchContext.storyId,
            session_id: createdSession.data.session.id
          },
          story,
          session: createdSession.data.session
        }
      }
    })
  } catch (error) {
    if (error instanceof WebglLaunchResolveExpectedFailure) {
      return error.result
    }

    throw error
  }
}

export { issueWebglLaunchContext, resolveWebglLaunchContext, WEBGL_LAUNCH_CONTEXT_TTL_MS }
export type {
  WebglLaunchIssueAuthUser,
  WebglLaunchIssueRequest,
  WebglLaunchIssueResult,
  WebglLaunchResolveError,
  WebglLaunchResolveRequest,
  WebglLaunchResolveResult,
  WebglLaunchResolveSuccess
}
