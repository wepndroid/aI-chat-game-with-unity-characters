// Migration lifecycle: final-migration-required support code. Disposal checkpoint: post-cutover repository cleanup with migration-only commands.
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'

const calculateFileSha256 = async (pathValue: string) => {
  const hash = createHash('sha256')
  const stream = createReadStream(pathValue)

  for await (const chunk of stream) {
    hash.update(chunk)
  }

  return hash.digest('hex')
}

export { calculateFileSha256 }
