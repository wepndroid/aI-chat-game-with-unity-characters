import { randomUUID } from 'node:crypto'
import { Router, type NextFunction, type Request, type Response } from 'express'
import { unityStructuredHelperRequestSchema } from '../contracts/unity-client-contract'
import { sendApiData, sendApiError } from '../lib/api-contract'
import { getRequiredGameAccessContext } from '../lib/game-access'
import { requireAuth } from '../middleware/auth-middleware'
import { requireGameAccess } from '../middleware/game-access-middleware'
import { toAiProviderPlayerTier } from '../services/ai-provider-player-tier'
import { ChatAiProviderError, getChatAiProviderErrorReason } from '../services/chat/chat-ai-error'
import { findOwnedActiveChatSession } from '../services/chat/chat-session-access-service'
import { resolvePromptDebugDecision } from '../services/chat/prompt/prompt-debug-policy'
import { generateStructuredHelperContent } from '../services/unity-llm/structured-helper-generation-service'

const unityHelperLlmRoutes = Router()

const activeHelperUsers = new Set<string>()

const singleActiveHelperPerUser = (request: Request, response: Response, next: NextFunction) => {
  const userId = request.authUser?.userId
  if (!userId) {
    next()
    return
  }

  if (activeHelperUsers.has(userId)) {
    response.setHeader('Retry-After', '2')
    sendApiError(response, 429, 'RATE_LIMITED', 'A structured helper request is already running.')
    return
  }

  activeHelperUsers.add(userId)
  let released = false
  const release = () => {
    if (released) {
      return
    }
    released = true
    activeHelperUsers.delete(userId)
  }

  response.once('finish', release)
  response.once('close', release)
  next()
}

const createClientDisconnectSignal = (request: Request, response: Response) => {
  const controller = new AbortController()
  const abort = () => {
    if (!controller.signal.aborted) {
      controller.abort()
    }
  }

  request.once('aborted', abort)
  response.once('close', abort)

  return {
    signal: controller.signal,
    dispose: () => {
      request.off('aborted', abort)
      response.off('close', abort)
    }
  }
}

/**
 * Non-quota structured helper generation endpoint for Unity.
 *
 * This route is intentionally not a generic LLM proxy. Unity can change helper
 * prompts, GBNF grammar, and JSON schema without backend gameplay logic, while
 * backend still enforces auth, session ownership, resource limits, provider
 * credentials, and sanitized errors. It must not reserve quota, create pending
 * turns, write chat messages, update session preview text, or mutate
 * `/unity-state`; visible-turn durability remains owned by the pending-turn
 * commit flow after Unity parses metadata.
 */
unityHelperLlmRoutes.post(
  '/unity/llm/structured-generate',
  requireAuth,
  requireGameAccess,
  singleActiveHelperPerUser,
  async (request, response, next) => {
    const clientDisconnect = createClientDisconnectSignal(request, response)
    try {
      const authUser = request.authUser
      if (!authUser) {
        sendApiError(response, 401, 'AUTH_REQUIRED', 'Authentication required.')
        return
      }

      const providerPlayerTier = toAiProviderPlayerTier(getRequiredGameAccessContext(request).effectiveTierCode)
      const payload = unityStructuredHelperRequestSchema.parse(request.body ?? {})
      const session = await findOwnedActiveChatSession({
        sessionId: payload.session_id,
        userId: authUser.userId
      })

      if (!session) {
        sendApiError(response, 404, 'NOT_FOUND', 'Chat session not found.')
        return
      }

      const promptDebugDecision = resolvePromptDebugDecision({
        debugPromptRequested: payload.debug_prompt === true,
        userId: authUser.userId,
        sessionId: session.id
      })
      const requestId = `helper:${payload.purpose}:${payload.client_request_id ?? randomUUID()}`

      const result = await generateStructuredHelperContent({
        purpose: payload.purpose,
        messages: payload.messages,
        userId: authUser.userId,
        providerPlayerTier,
        sessionId: session.id,
        requestId,
        aiName: payload.ai_name,
        grammar: payload.grammar,
        jsonSchema: payload.json_schema,
        debugPrompt: promptDebugDecision.enabled,
        abortSignal: clientDisconnect.signal
      })

      sendApiData(response, {
        purpose: result.purpose,
        content: result.content,
        content_sha256: result.contentSha256,
        provider: result.provider,
        prompt_debug: result.promptDebug
      })
    } catch (error) {
      if (!(error instanceof ChatAiProviderError)) {
        next(error)
        return
      }

      const errorReason = getChatAiProviderErrorReason(error)
      if (errorReason === 'client_disconnected' && (response.destroyed || response.writableEnded)) {
        return
      }
      sendApiError(response, 500, 'AI_PROVIDER_FAILURE', 'Structured helper generation failed.', {
        error_reason: errorReason
      })
    } finally {
      clientDisconnect.dispose()
    }
  }
)

export default unityHelperLlmRoutes
