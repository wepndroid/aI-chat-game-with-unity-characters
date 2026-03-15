import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12

const decodeEncryptionKey = () => {
  const rawKey = process.env.PATREON_TOKEN_ENCRYPTION_KEY

  if (!rawKey) {
    throw new Error('PATREON_TOKEN_ENCRYPTION_KEY is required for Patreon token encryption.')
  }

  const tryBase64 = Buffer.from(rawKey, 'base64')

  if (tryBase64.length === 32) {
    return tryBase64
  }

  const tryUtf8 = Buffer.from(rawKey, 'utf8')

  if (tryUtf8.length === 32) {
    return tryUtf8
  }

  throw new Error('PATREON_TOKEN_ENCRYPTION_KEY must resolve to 32 bytes (base64 or utf8).')
}

const encryptSecret = (value: string) => {
  const key = decodeEncryptionKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`
}

const decryptSecret = (payload: string) => {
  const key = decodeEncryptionKey()
  const [ivEncoded, tagEncoded, encryptedEncoded] = payload.split(':')

  if (!ivEncoded || !tagEncoded || !encryptedEncoded) {
    throw new Error('Invalid encrypted payload format.')
  }

  const iv = Buffer.from(ivEncoded, 'base64')
  const tag = Buffer.from(tagEncoded, 'base64')
  const encrypted = Buffer.from(encryptedEncoded, 'base64')
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  return decrypted.toString('utf8')
}

export { decryptSecret, encryptSecret }
