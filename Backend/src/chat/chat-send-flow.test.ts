import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import request from 'supertest'

const backendRoot = process.cwd()

const runPrismaDbPush = (databaseUrl: string) => {
  const args =
    process.platform === 'win32'
      ? ['/d', '/s', '/c', 'npx.cmd prisma db push --skip-generate']
      : ['prisma', 'db', 'push', '--skip-generate']

  const command = process.platform === 'win32' ? 'cmd.exe' : 'npx'
  return spawnSync(command, args, {
    cwd: backendRoot,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl
    },
    encoding: 'utf8'
  })
}

const createTempDbUrl = () => {
  const tempDirectory = path.join(backendRoot, 'prisma', '.tmp')
  fs.mkdirSync(tempDirectory, { recursive: true })
  const fileName = `chat-send-flow-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`
  const filePath = path.join(tempDirectory, fileName)
  fs.writeFileSync(filePath, '')
  return {
    filePath,
    databaseUrl: `file:./.tmp/${fileName}`
  }
}

test('chat/send finalizes on success and releases on AI failure', async () => {
  process.env.NODE_ENV = 'test'

  const { filePath, databaseUrl } = createTempDbUrl()
  process.env.DATABASE_URL = databaseUrl

  const pushResult = runPrismaDbPush(databaseUrl)
  assert.equal(
    pushResult.status,
    0,
    `prisma db push failed:\n${pushResult.stdout ?? ''}\n${pushResult.stderr ?? ''}\n${pushResult.error?.message ?? ''}`
  )

  const [{ prisma }, { default: app }, { authConfig }, { generateOpaqueSessionToken, hashOpaqueSessionToken }] =
    await Promise.all([
      import('../lib/prisma'),
      import('../app'),
      import('../lib/auth-config'),
      import('../lib/session-token')
    ])

  try {
    const user = await prisma.user.create({
      data: {
        email: 'chat-send-flow@example.com',
        username: 'chat_send_flow_user',
        passwordHash: 'not-used-in-test',
        isEmailVerified: true
      },
      select: {
        id: true
      }
    })

    await prisma.tier.upsert({
      where: {
        code: 'free'
      },
      update: {
        messageLimit: 20,
        periodDays: 30
      },
      create: {
        code: 'free',
        messageLimit: 20,
        periodDays: 30,
        label: 'Free'
      }
    })

    const character = await prisma.character.create({
      data: {
        name: 'Chat Flow Character',
        slug: `chat-flow-${Math.random().toString(16).slice(2, 10)}`,
        ownerId: user.id,
        status: 'APPROVED',
        visibility: 'PUBLIC'
      },
      select: {
        id: true
      }
    })

    const characterCard = await prisma.characterCard.create({
      data: {
        characterId: character.id,
        creatorUserId: user.id,
        fullName: 'Chat Flow Character',
        scenario: 'Test scenario for chat flow',
        firstMessage: 'Hello from test'
      },
      select: {
        id: true
      }
    })

    const story = await prisma.storyPost.create({
      data: {
        authorId: user.id,
        title: 'Chat Flow Story',
        body: 'story body',
        scenarioStory: 'Story block',
        scenarioChat: '"hello"',
        characterId: character.id,
        publicationStatus: 'PUBLISHED',
        moderationStatus: 'APPROVED',
        publishedAt: new Date()
      },
      select: {
        id: true
      }
    })

    const chatSession = await prisma.chatSession.create({
      data: {
        userId: user.id,
        characterCardId: characterCard.id,
        storyId: story.id
      },
      select: {
        id: true
      }
    })

    const rawSessionToken = generateOpaqueSessionToken()
    await prisma.session.create({
      data: {
        userId: user.id,
        sessionTokenHash: hashOpaqueSessionToken(rawSessionToken),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        lastSeenAt: new Date()
      }
    })

    const authCookie = `${authConfig.cookieName}=${rawSessionToken}`
    const sendRequest = request(app)

    const consumeResponse = await sendRequest
      .post('/api/chat/quota/consume')
      .set('Cookie', authCookie)
      .send({
        userId: user.id
      })

    assert.equal(consumeResponse.status, 200)
    assert.equal(consumeResponse.body?.data?.allowed, true)
    assert.equal(consumeResponse.body?.data?.user_id, user.id)

    const usageAfterConsumeCheck = await prisma.chatMessageUsage.findFirst({
      where: {
        userId: user.id
      },
      select: {
        messagesUsed: true
      }
    })
    assert.equal(usageAfterConsumeCheck?.messagesUsed, 0)

    const legacyCreateSessionResponse = await sendRequest
      .post('/api/chat/sessions')
      .set('Cookie', authCookie)
      .send({
        characterCardId: characterCard.id
      })

    assert.equal(legacyCreateSessionResponse.status, 410)

    const legacyCreateMessageResponse = await sendRequest
      .post(`/api/chat/sessions/${chatSession.id}/messages`)
      .set('Cookie', authCookie)
      .send({
        role: 'USER',
        content: 'Legacy write path'
      })

    assert.equal(legacyCreateMessageResponse.status, 410)

    const clientMessageId = 'client-msg-001'
    const successResponse = await sendRequest
      .post('/api/chat/send')
      .set('Cookie', authCookie)
      .send({
        session_id: chatSession.id,
        message: 'Hello there',
        client_message_id: clientMessageId
      })

    assert.equal(successResponse.status, 200)
    assert.equal(successResponse.body?.data?.allowed, true)
    assert.equal(successResponse.body?.data?.assistant_message?.role, 'ASSISTANT')

    const usageAfterSuccess = await prisma.chatMessageUsage.findFirst({
      where: {
        userId: user.id
      },
      select: {
        messagesUsed: true
      }
    })
    assert.equal(usageAfterSuccess?.messagesUsed, 1)

    const duplicateResponse = await sendRequest
      .post('/api/chat/send')
      .set('Cookie', authCookie)
      .send({
        session_id: chatSession.id,
        message: 'Hello there',
        client_message_id: clientMessageId
      })

    assert.equal(duplicateResponse.status, 204)

    const usageAfterDuplicate = await prisma.chatMessageUsage.findFirst({
      where: {
        userId: user.id
      },
      select: {
        messagesUsed: true
      }
    })
    assert.equal(usageAfterDuplicate?.messagesUsed, 1)

    const failureResponse = await sendRequest
      .post('/api/chat/send')
      .set('Cookie', authCookie)
      .set('x-sw-force-ai-failure', '1')
      .send({
        session_id: chatSession.id,
        message: 'Please fail'
      })

    assert.equal(failureResponse.status, 500)
    const releasedFlag =
      failureResponse.body?.details?.released ??
      failureResponse.body?.error?.details?.released ??
      failureResponse.body?.data?.released
    assert.equal(releasedFlag, true)

    const usageAfterFailure = await prisma.chatMessageUsage.findFirst({
      where: {
        userId: user.id
      },
      select: {
        messagesUsed: true
      }
    })
    assert.equal(usageAfterFailure?.messagesUsed, 1)

    const releasedReservations = await prisma.chatQuotaReservation.count({
      where: {
        userId: user.id,
        status: 'RELEASED'
      }
    })
    assert.ok(releasedReservations >= 1)
  } finally {
    await prisma.$disconnect()
    try {
      fs.unlinkSync(filePath)
    } catch {
      // best-effort cleanup
    }
  }
})
