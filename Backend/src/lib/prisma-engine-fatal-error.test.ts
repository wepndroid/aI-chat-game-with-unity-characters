import assert from 'node:assert/strict'
import test from 'node:test'

import { classifyPrismaEngineFatalError, isPrismaEngineFatalError } from './prisma-engine-fatal-error'

test('classifyPrismaEngineFatalError marks direct Prisma rust panic names as fatal', () => {
  const error = Object.assign(new Error('engine crashed'), {
    name: 'PrismaClientRustPanicError',
    clientVersion: '6.19.0'
  })

  assert.deepEqual(classifyPrismaEngineFatalError(error), {
    reason: 'prisma_engine_panic',
    errorName: 'PrismaClientRustPanicError',
    clientVersion: '6.19.0'
  })
  assert.equal(isPrismaEngineFatalError(error), true)
})

test('classifyPrismaEngineFatalError marks Prisma panic signatures as fatal', () => {
  const error = new Error(
    'PrismaClientRustPanicError: Invalid `prisma.landingPage.findMany()` invocation:\n\nPANIC in query-engine/query-structure/src/record.rs:69:46\nno entry found for key'
  )

  assert.deepEqual(classifyPrismaEngineFatalError(error), {
    reason: 'prisma_engine_panic',
    errorName: 'Error'
  })
})

test('classifyPrismaEngineFatalError does not mark recoverable Prisma errors as fatal', () => {
  for (const code of ['P1008', 'P2028', 'P2002']) {
    const error = Object.assign(new Error(`recoverable ${code}`), {
      name: 'PrismaClientKnownRequestError',
      code,
      clientVersion: '6.19.0'
    })

    assert.equal(classifyPrismaEngineFatalError(error), null)
    assert.equal(isPrismaEngineFatalError(error), false)
  }
})

test('classifyPrismaEngineFatalError does not mark plain socket timeouts as fatal', () => {
  const error = Object.assign(new Error('Socket timeout'), {
    name: 'SocketError',
    code: 'UND_ERR_SOCKET'
  })

  assert.equal(classifyPrismaEngineFatalError(error), null)
})
