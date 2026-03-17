import { createHash, randomBytes } from 'node:crypto'

const generateOpaqueSessionToken = () => randomBytes(32).toString('base64url')

const hashOpaqueSessionToken = (rawSessionToken: string) => {
  return createHash('sha256').update(rawSessionToken).digest('hex')
}

export { generateOpaqueSessionToken, hashOpaqueSessionToken }
