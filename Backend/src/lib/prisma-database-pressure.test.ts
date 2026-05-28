import test from 'node:test'
import assert from 'node:assert/strict'

import { classifyPrismaDatabasePressureError } from './prisma-database-pressure'

test('classifyPrismaDatabasePressureError recognizes Prisma query timeout errors', () => {
  assert.equal(
    classifyPrismaDatabasePressureError({
      code: 'P1008',
      message: 'Socket timeout.'
    }),
    'query_timeout'
  )
})

test('classifyPrismaDatabasePressureError recognizes expired interactive transactions', () => {
  assert.equal(
    classifyPrismaDatabasePressureError({
      code: 'P2028',
      message: 'Transaction already closed: A query cannot be executed on an expired transaction.'
    }),
    'transaction_expired'
  )
})

test('classifyPrismaDatabasePressureError recognizes PostgreSQL and Prisma pressure reasons', () => {
  assert.equal(
    classifyPrismaDatabasePressureError({
      code: 'P2024',
      message: 'Timed out fetching a new connection from the connection pool.'
    }),
    'pool_timeout'
  )
  assert.equal(
    classifyPrismaDatabasePressureError({
      code: 'P2034',
      message: 'Transaction failed due to a write conflict or a deadlock. Please retry your transaction.'
    }),
    'write_conflict_or_deadlock'
  )
  assert.equal(
    classifyPrismaDatabasePressureError({
      code: 'P2037',
      message: 'Too many database connections opened.'
    }),
    'connection_limit'
  )
})

test('classifyPrismaDatabasePressureError recognizes Prisma socket timeout wording without leaking details', () => {
  assert.equal(
    classifyPrismaDatabasePressureError(new Error('Invalid `prisma.chatSession.update()` invocation: Socket timeout.')),
    'query_timeout'
  )
})

test('classifyPrismaDatabasePressureError does not retain SQLite lock matching after PostgreSQL cutover', () => {
  assert.equal(
    classifyPrismaDatabasePressureError(new Error('database is locked')),
    null
  )
  assert.equal(
    classifyPrismaDatabasePressureError(new Error('database table is locked')),
    null
  )
})
