import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const marketingPageSource = readFileSync(new URL('./marketing-page.tsx', import.meta.url), 'utf8')

test('marketing page copy reflects queued automation support', () => {
  assert.equal(marketingPageSource.includes('Emails do not go out automatically yet.'), false)
  assert.equal(marketingPageSource.includes('Queued automations now run through the background worker.'), true)
})
