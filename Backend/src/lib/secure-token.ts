import { createHash, randomBytes } from 'node:crypto'

const generateSecureToken = () => randomBytes(32).toString('base64url')

const oneTimeCodeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

const generateOneTimeCode = (length = 8) => {
  const randomBuffer = randomBytes(length)

  return Array.from(randomBuffer)
    .map((byte) => oneTimeCodeAlphabet[byte % oneTimeCodeAlphabet.length])
    .join('')
}

const hashSecureToken = (rawToken: string) => {
  return createHash('sha256').update(rawToken).digest('hex')
}

export { generateOneTimeCode, generateSecureToken, hashSecureToken }
