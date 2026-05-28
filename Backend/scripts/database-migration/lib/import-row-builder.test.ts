// Migration lifecycle: disposable validation scaffold. Disposal checkpoint: post-cutover repository cleanup with migration-only commands.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { buildImportPlan, buildDerivedImportPlan, type ImportPlanEntry } from './table-import-plan'
import { getSourceColumnsForModel } from './prisma-row-converter'
import { resolvePythonCommand, type PythonCommand } from './sqlite-source-inspector'
import {
  buildImportPolicyContext,
  buildTargetRowsForDerivedEntry,
  buildTargetRowsForImportEntry
} from './import-row-builder'

type TableFixture = {
  columns: readonly string[]
  rows: readonly Record<string, unknown>[]
}

const now = new Date('2026-05-21T10:00:00.000Z')

const findImportEntry = (sourceTable: string): ImportPlanEntry => {
  const entry = buildImportPlan().find((candidate) => candidate.sourceTable === sourceTable)
  assert.ok(entry, `Import plan entry missing for ${sourceTable}.`)
  return entry
}

const columnsForModel = (modelName: string) => getSourceColumnsForModel(modelName)

const emptyRows = (modelName: string): TableFixture => ({
  columns: columnsForModel(modelName),
  rows: []
})

const basePendingTurnRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'pending-expired',
  userId: 'user-1',
  sessionId: 'session-1',
  storyId: 'story-1',
  kind: 'normal',
  clientTurnId: 'client-turn-1',
  requestId: 'request-1',
  requestFingerprint: 'request-fingerprint-1',
  messageText: 'Hello',
  gameplayEventType: null,
  gameplayEventPayloadJson: null,
  gameplayDisplayText: null,
  assistantText: 'Hi',
  assistantSha256: 'assistant-sha',
  provider: 'llama',
  reservationId: 'reservation-1',
  voiceRequested: 0,
  voiceConsumed: 0,
  voiceAudioUrl: null,
  voiceTaskId: null,
  status: 'PENDING',
  expiresAt: '2026-05-21T09:00:00.000Z',
  committedUserMessageId: null,
  committedAssistantMessageId: null,
  abortReason: null,
  createdAt: '2026-05-21T08:30:00.000Z',
  updatedAt: '2026-05-21T08:55:00.000Z',
  committedAt: null,
  abortedAt: null,
  expiredAt: null,
  ...overrides
})

const baseQuotaReservationRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'reservation-1',
  userId: 'user-1',
  usageId: 'usage-1',
  periodStartAt: '2026-05-01T00:00:00.000Z',
  requestId: 'request-1',
  requestFingerprint: null,
  voiceRequested: 0,
  voiceConsumed: 0,
  voiceTaskId: null,
  status: 'RESERVED',
  sessionId: null,
  messageId: null,
  errorReason: null,
  createdAt: '2026-05-21T08:30:00.000Z',
  updatedAt: '2026-05-21T08:55:00.000Z',
  finalizedAt: null,
  releasedAt: null,
  ...overrides
})

const quoteIdentifierScript = String.raw`
import json, re, sqlite3, sys

def ident(value):
    if not re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", value):
        raise ValueError(f"unsafe identifier: {value}")
    return '"' + value.replace('"', '""') + '"'

source_path = sys.argv[1]
tables = json.loads(sys.argv[2])
conn = sqlite3.connect(source_path)
for table_name, definition in tables.items():
    columns = definition["columns"]
    conn.execute("CREATE TABLE " + ident(table_name) + " (" + ", ".join(ident(column) for column in columns) + ")")
    if not definition["rows"]:
        continue
    column_sql = ", ".join(ident(column) for column in columns)
    placeholders = ", ".join("?" for _ in columns)
    for row in definition["rows"]:
        conn.execute(
            "INSERT INTO " + ident(table_name) + " (" + column_sql + ") VALUES (" + placeholders + ")",
            [row.get(column) for column in columns],
        )
conn.commit()
conn.close()
`

const withSourceDatabase = async (
  tables: Record<string, TableFixture>,
  fn: (sourcePath: string) => Promise<void>
) => {
  const pythonCommand = await resolvePythonCommand()
  if (!pythonCommand) {
    throw new Error('Python sqlite3 is required for import row builder tests.')
  }

  const sourceRoot = join(process.cwd(), '.migration-lab', 'source')
  await mkdir(sourceRoot, { recursive: true })
  const fixtureRoot = await mkdtemp(join(sourceRoot, 'import-row-builder-'))
  const sourcePath = join(fixtureRoot, 'source.db')

  try {
    createSqliteFixture(pythonCommand, sourcePath, tables)
    await fn(sourcePath)
  } finally {
    await rm(fixtureRoot, { force: true, recursive: true })
  }
}

const createSqliteFixture = (pythonCommand: PythonCommand, sourcePath: string, tables: Record<string, TableFixture>) => {
  const result = spawnSync(pythonCommand.command, [...pythonCommand.args, '-c', quoteIdentifierScript, sourcePath, JSON.stringify(tables)], {
    encoding: 'utf8'
  })

  assert.equal(result.status, 0, result.stderr)
}

test('buildTargetRowsForImportEntry converts expired pending turns and releases matching reservations', async () => {
  await withSourceDatabase(
    {
      ChatPendingTurn: {
        columns: columnsForModel('ChatPendingTurn'),
        rows: [basePendingTurnRow()]
      },
      ChatQuotaReservation: {
        columns: columnsForModel('ChatQuotaReservation'),
        rows: [baseQuotaReservationRow()]
      }
    },
    async (sourcePath) => {
      const context = await buildImportPolicyContext(sourcePath, now)
      const sourceTables = new Set(['ChatPendingTurn', 'ChatQuotaReservation'])
      const [pendingTurn] = await buildTargetRowsForImportEntry(sourcePath, findImportEntry('ChatPendingTurn'), context, sourceTables)
      const [reservation] = await buildTargetRowsForImportEntry(
        sourcePath,
        findImportEntry('ChatQuotaReservation'),
        context,
        sourceTables
      )

      assert.equal(pendingTurn.status, 'EXPIRED')
      assert.equal((pendingTurn.expiredAt as Date).toISOString(), '2026-05-21T09:00:00.000Z')
      assert.equal((pendingTurn.updatedAt as Date).toISOString(), now.toISOString())
      assert.equal(reservation.status, 'RELEASED')
      assert.equal((reservation.releasedAt as Date).toISOString(), now.toISOString())
      assert.equal(reservation.errorReason, 'migration_expired_pending_turn')
    }
  )
})

test('buildTargetRowsForImportEntry omits terminal pending turns outside retention', async () => {
  await withSourceDatabase(
    {
      ChatPendingTurn: {
        columns: columnsForModel('ChatPendingTurn'),
        rows: [
          basePendingTurnRow({
            id: 'old-aborted',
            status: 'ABORTED',
            expiresAt: '2026-05-19T09:00:00.000Z',
            updatedAt: '2026-05-19T09:00:00.000Z',
            abortedAt: '2026-05-19T09:00:00.000Z'
          })
        ]
      }
    },
    async (sourcePath) => {
      const context = await buildImportPolicyContext(sourcePath, now)
      const rows = await buildTargetRowsForImportEntry(sourcePath, findImportEntry('ChatPendingTurn'), context, new Set(['ChatPendingTurn']))

      assert.deepEqual(rows, [])
    }
  )
})

test('buildTargetRowsForImportEntry sanitizes RuntimeAdminSettings API keys', async () => {
  await withSourceDatabase(
    {
      ChatPendingTurn: emptyRows('ChatPendingTurn'),
      RuntimeAdminSettings: {
        columns: columnsForModel('RuntimeAdminSettings'),
        rows: [
          {
            id: 'runtime-admin-settings',
            uploadLimitsJson: '{}',
            characterFieldLimitsJson: '{}',
            thumbnailGenerationJson: '{}',
            requestLimitsJson: '{}',
            sessionLoginJson: '{}',
            featureSwitchesJson: '{}',
            maintenanceJson: '{}',
            apiKeysJson: JSON.stringify({
              googleClientSecret: 'source-secret',
              smtpPass: 'source-password',
              emailProvider: 'smtp',
              smtpPort: 2525,
              mailgunRegion: 'eu'
            }),
            updatedAt: '2026-05-21T09:00:00.000Z'
          }
        ]
      }
    },
    async (sourcePath) => {
      const context = await buildImportPolicyContext(sourcePath, now)
      const [row] = await buildTargetRowsForImportEntry(
        sourcePath,
        findImportEntry('RuntimeAdminSettings'),
        context,
        new Set(['ChatPendingTurn', 'RuntimeAdminSettings'])
      )

      assert.equal((row.apiKeys as Record<string, unknown>).googleClientSecret, '')
      assert.equal((row.apiKeys as Record<string, unknown>).smtpPass, '')
      assert.equal((row.apiKeys as Record<string, unknown>).smtpPort, 2525)
      assert.equal(JSON.stringify(row).includes('source-secret'), false)
    }
  )
})

test('buildTargetRowsForImportEntry derives missing MarketingEmailAutomation triggerDelayHours', async () => {
  await withSourceDatabase(
    {
      ChatPendingTurn: emptyRows('ChatPendingTurn'),
      MarketingEmailAutomation: {
        columns: columnsForModel('MarketingEmailAutomation'),
        rows: [
          {
            id: 'automation-1',
            templateKey: 'welcome',
            status: 'ACTIVE',
            statusCondition: 'SIGNED_UP',
            triggerDelayHours: null,
            triggerDelayDays: 2,
            campaignDiscountCode: null,
            campaignFeaturesSummary: 'features',
            campaignCtaUrl: 'https://secretwaifu.com',
            sendIntervalSeconds: 3600,
            maxRecipients: 10,
            createdAt: '2026-05-21T09:00:00.000Z',
            updatedAt: '2026-05-21T09:00:00.000Z',
            startedAt: null,
            pausedAt: null
          }
        ]
      }
    },
    async (sourcePath) => {
      const context = await buildImportPolicyContext(sourcePath, now)
      const [row] = await buildTargetRowsForImportEntry(
        sourcePath,
        findImportEntry('MarketingEmailAutomation'),
        context,
        new Set(['ChatPendingTurn', 'MarketingEmailAutomation'])
      )

      assert.equal(row.triggerDelayHours, 48)
    }
  )
})

test('buildTargetRowsForImportEntry returns no rows for missing optional source tables', async () => {
  await withSourceDatabase(
    {
      ChatPendingTurn: emptyRows('ChatPendingTurn')
    },
    async (sourcePath) => {
      const context = await buildImportPolicyContext(sourcePath, now)
      const rows = await buildTargetRowsForImportEntry(
        sourcePath,
        findImportEntry('MarketingEmailAutomation'),
        context,
        new Set(['ChatPendingTurn'])
      )

      assert.deepEqual(rows, [])
    }
  )
})

test('buildTargetRowsForDerivedEntry derives latest UserActivityState lastSeenAt per user', async () => {
  await withSourceDatabase(
    {
      Session: {
        columns: ['userId', 'lastSeenAt'],
        rows: [
          { userId: 'user-1', lastSeenAt: '2026-05-20T09:00:00.000Z' },
          { userId: 'user-1', lastSeenAt: '2026-05-21T09:00:00.000Z' },
          { userId: 'user-2', lastSeenAt: null }
        ]
      }
    },
    async (sourcePath) => {
      const [entry] = buildDerivedImportPlan()
      const rows = await buildTargetRowsForDerivedEntry(sourcePath, entry, now)

      assert.deepEqual(rows, [
        {
          userId: 'user-1',
          lastSeenAt: new Date('2026-05-21T09:00:00.000Z'),
          createdAt: now,
          updatedAt: now
        }
      ])
    }
  )
})
