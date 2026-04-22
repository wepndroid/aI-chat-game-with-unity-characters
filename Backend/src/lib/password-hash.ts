import crypto from 'node:crypto'
import { authConfig } from './auth-config'

const ARGON2_PREFIX = '$argon2'
const ARGON2_ALGORITHM = 'argon2id'
const ARGON2_VERSION = 19
const ARGON2_MEMORY = 65536
const ARGON2_PASSES = 3
const ARGON2_PARALLELISM = 4
const ARGON2_SALT_LENGTH = 16
const ARGON2_TAG_LENGTH = 32
const HASH_ALGORITHM = 'scrypt'
const HASH_KEY_LENGTH = 64
const HASH_SALT_LENGTH = 16
const HASH_DELIMITER = '$'

type Argon2NativeModule = {
  argon2id: number
  hash: (rawPassword: string, options: { type: number }) => Promise<string>
  verify: (passwordHash: string, rawPassword: string) => Promise<boolean>
}

let nativeArgon2Module: Argon2NativeModule | null | undefined

const getNativeArgon2Module = () => {
  if (nativeArgon2Module !== undefined) {
    return nativeArgon2Module
  }

  try {
    nativeArgon2Module = eval('require')('argon2') as Argon2NativeModule
  } catch {
    nativeArgon2Module = null
  }

  return nativeArgon2Module
}

const hasBuiltinArgon2 = typeof crypto.argon2 === 'function'

const ensureArgon2Support = () => {
  if (hasBuiltinArgon2 || getNativeArgon2Module()) {
    return
  }

  throw new Error('Argon2 hashing is unavailable. Use Node.js 24.7+ or install the optional "argon2" package.')
}

const toPhcBase64 = (buffer: Buffer) => buffer.toString('base64').replace(/=+$/g, '')

const fromPhcBase64 = (value: string) => {
  const normalized = value.replace(/\s+/g, '')
  const padding = (4 - (normalized.length % 4)) % 4
  return Buffer.from(`${normalized}${'='.repeat(padding)}`, 'base64')
}

const deriveArgon2Key = async (
  rawPassword: string,
  salt: Buffer,
  options: {
    algorithm: 'argon2d' | 'argon2i' | 'argon2id'
    memory: number
    passes: number
    parallelism: number
    tagLength: number
  }
) => {
  return new Promise<Buffer>((resolve, reject) => {
    crypto.argon2(
      options.algorithm,
      {
        message: rawPassword,
        nonce: salt,
        memory: options.memory,
        passes: options.passes,
        parallelism: options.parallelism,
        tagLength: options.tagLength
      },
      (error, derivedKey) => {
        if (error) {
          reject(error)
          return
        }

        resolve(Buffer.from(derivedKey))
      }
    )
  })
}

const parseArgon2Hash = (passwordHash: string) => {
  const [empty, algorithm, versionPart, parameterPart, saltPart, hashPart] = passwordHash.split('$')

  if (empty !== '' || !algorithm || !versionPart || !parameterPart || !saltPart || !hashPart) {
    return null
  }

  const version = Number.parseInt(versionPart.replace(/^v=/, ''), 10)
  const parameters = new URLSearchParams(parameterPart.replace(/,/g, '&'))
  const memory = Number.parseInt(parameters.get('m') ?? '', 10)
  const passes = Number.parseInt(parameters.get('t') ?? '', 10)
  const parallelism = Number.parseInt(parameters.get('p') ?? '', 10)

  if (
    !Number.isFinite(version) ||
    !Number.isFinite(memory) ||
    !Number.isFinite(passes) ||
    !Number.isFinite(parallelism) ||
    version <= 0 ||
    memory <= 0 ||
    passes <= 0 ||
    parallelism <= 0
  ) {
    return null
  }

  const salt = fromPhcBase64(saltPart)
  const storedKey = fromPhcBase64(hashPart)

  if (salt.length < 8 || storedKey.length === 0) {
    return null
  }

  if (algorithm !== 'argon2d' && algorithm !== 'argon2i' && algorithm !== 'argon2id') {
    return null
  }

  return {
    algorithm: algorithm as 'argon2d' | 'argon2i' | 'argon2id',
    version,
    memory,
    passes,
    parallelism,
    salt,
    storedKey
  }
}

const hashPasswordWithArgon2 = async (rawPassword: string) => {
  const nativeArgon2 = getNativeArgon2Module()
  if (!hasBuiltinArgon2 && nativeArgon2) {
    return nativeArgon2.hash(rawPassword, {
      type: nativeArgon2.argon2id
    })
  }

  ensureArgon2Support()

  const salt = crypto.randomBytes(ARGON2_SALT_LENGTH)
  const derivedKey = await deriveArgon2Key(rawPassword, salt, {
    algorithm: ARGON2_ALGORITHM,
    memory: ARGON2_MEMORY,
    passes: ARGON2_PASSES,
    parallelism: ARGON2_PARALLELISM,
    tagLength: ARGON2_TAG_LENGTH
  })

  return `$${ARGON2_ALGORITHM}$v=${ARGON2_VERSION}$m=${ARGON2_MEMORY},t=${ARGON2_PASSES},p=${ARGON2_PARALLELISM}$${toPhcBase64(salt)}$${toPhcBase64(derivedKey)}`
}

const hashPasswordWithScrypt = async (rawPassword: string) => {
  const salt = crypto.randomBytes(HASH_SALT_LENGTH).toString('hex')
  const derivedKey = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(rawPassword, salt, HASH_KEY_LENGTH, (error, key) => {
      if (error) {
        reject(error)
        return
      }

      resolve(key as Buffer)
    })
  })

  return [HASH_ALGORITHM, salt, derivedKey.toString('hex')].join(HASH_DELIMITER)
}

const verifyScryptPassword = async (rawPassword: string, passwordHash: string) => {
  const [algorithm, salt, storedKey] = passwordHash.split(HASH_DELIMITER)

  if (algorithm !== HASH_ALGORITHM || !salt || !storedKey) {
    return false
  }

  const derivedKey = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(rawPassword, salt, storedKey.length / 2, (error, key) => {
      if (error) {
        reject(error)
        return
      }

      resolve(key as Buffer)
    })
  })

  const storedKeyBuffer = Buffer.from(storedKey, 'hex')
  if (storedKeyBuffer.length !== derivedKey.length) {
    return false
  }

  return crypto.timingSafeEqual(storedKeyBuffer, derivedKey)
}

const isArgon2Hash = (passwordHash: string) => passwordHash.startsWith(ARGON2_PREFIX)

const hashPassword = async (rawPassword: string) => {
  if (authConfig.passwordHashAlgorithm === 'argon2') {
    return hashPasswordWithArgon2(rawPassword)
  }

  return hashPasswordWithScrypt(rawPassword)
}

const verifyPassword = async (rawPassword: string, passwordHash: string) => {
  if (isArgon2Hash(passwordHash)) {
    const nativeArgon2 = getNativeArgon2Module()
    if (!hasBuiltinArgon2 && nativeArgon2) {
      return nativeArgon2.verify(passwordHash, rawPassword)
    }

    ensureArgon2Support()

    const parsedHash = parseArgon2Hash(passwordHash)

    if (!parsedHash) {
      return false
    }

    const derivedKey = await deriveArgon2Key(rawPassword, parsedHash.salt, {
      algorithm: parsedHash.algorithm,
      memory: parsedHash.memory,
      passes: parsedHash.passes,
      parallelism: parsedHash.parallelism,
      tagLength: parsedHash.storedKey.length
    })

    if (parsedHash.storedKey.length !== derivedKey.length) {
      return false
    }

    return crypto.timingSafeEqual(parsedHash.storedKey, derivedKey)
  }

  return verifyScryptPassword(rawPassword, passwordHash)
}

export { hashPassword, verifyPassword }
