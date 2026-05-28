import 'dotenv/config'
import { createServer } from 'node:http'
import { databaseWorkloadPolicy } from './lib/database-workload-policy'
import { installRuntimeLogCapture } from './lib/runtime-log-buffer'
import { startProviderUploadedVoiceRegistrationWorker } from './lib/tts-provider-uploaded-voice-alias'
import { setupTtsStreamWebSocketServer } from './lib/tts-stream-websocket'
import { getFatalShutdownState, registerFatalShutdownHttpServer } from './lib/fatal-shutdown-controller'
import { installPrismaEngineFatalProcessGuard } from './lib/prisma-engine-process-guard'
import { reportPrismaEngineFatalError } from './lib/prisma-engine-fatal-reporter'
import { cleanupSoftDeletedChatSessions } from './services/chat/chat-session-access-service'
import { processPendingCharacterActivityBatchAsBackgroundWork } from './services/chat/character-activity-count-service'
import { processDueChatSessionPreviewRefreshJobsAsBackgroundWork } from './services/chat/chat-session-preview-refresh-service'
import { ensureSystemHomepageCatalog } from './services/landing/default-homepage-service'
import { startMarketingEmailAutomationWorker } from './services/marketing-email-automation-service'
import { reconcilePatreonEntitlementsAsBackgroundWork } from './services/membership/patreon-entitlement-reconciliation-service'
import { startTransientStateRetentionWorker } from './services/retention/transient-state-retention-service'

const parsedPort = Number.parseInt(process.env.PORT ?? '4000', 10)
const port = Number.isNaN(parsedPort) ? 4000 : parsedPort

installRuntimeLogCapture()
installPrismaEngineFatalProcessGuard()

const handleStartupRepairFailure = (repair: string, message: string, error: unknown) => {
  const fatalClassification = reportPrismaEngineFatalError({
    error,
    source: 'startup',
    logContext: {
      component: 'server-startup',
      repair
    }
  })
  if (fatalClassification) {
    throw error
  }

  console.error(message, error)
}

const start = async () => {
  await ensureSystemHomepageCatalog()
  await cleanupSoftDeletedChatSessions()
  await reconcilePatreonEntitlementsAsBackgroundWork({
    apply: true,
    limit: databaseWorkloadPolicy.startupBackgroundBatchSize
  }).then((result) => {
    if (result.inspectedEntitlements > 0 || result.updatedEntitlements > 0) {
      console.log(
        '[server] Patreon entitlement startup reconciliation completed.',
        {
          inspectedEntitlements: result.inspectedEntitlements,
          repairableEntitlements: result.repairableEntitlements,
          updatedEntitlements: result.updatedEntitlements
        }
      )
    }
  }).catch((error) => {
    handleStartupRepairFailure(
      'patreon_entitlement_reconciliation',
      '[server] Failed to reconcile Patreon entitlements during startup; repair script can retry later.',
      error
    )
  })
  await processPendingCharacterActivityBatchAsBackgroundWork({ limit: databaseWorkloadPolicy.startupBackgroundBatchSize }).catch((error) => {
    handleStartupRepairFailure(
      'pending_character_activity_rows',
      '[server] Failed to process pending character activity rows during startup; repair script can retry later.',
      error
    )
  })
  await processDueChatSessionPreviewRefreshJobsAsBackgroundWork({
    batchSize: databaseWorkloadPolicy.startupBackgroundBatchSize,
    leaseOwner: 'server-startup'
  }).catch((error) => {
    handleStartupRepairFailure(
      'chat_session_preview_refresh_jobs',
      '[server] Failed to process pending chat session preview refresh jobs during startup; repair script can retry later.',
      error
    )
  })

  const { default: app } = await import('./app')
  const server = createServer(app)
  registerFatalShutdownHttpServer(server)
  setupTtsStreamWebSocketServer(server)
  startProviderUploadedVoiceRegistrationWorker()
  startMarketingEmailAutomationWorker()
  startTransientStateRetentionWorker()
  server.listen(port, '127.0.0.1', () => {
    console.log('API server listening on http://127.0.0.1:' + port)
  })
}

start().catch((error) => {
  if (!getFatalShutdownState()) {
    reportPrismaEngineFatalError({
      error,
      source: 'startup',
      logContext: {
        component: 'server-startup',
        phase: 'start'
      }
    })
  }
  console.error('[server] Failed to start API server.', error)
  process.exitCode = 1
})
