import argon2 from 'argon2'

const hashPassword = async (rawPassword: string) => {
  return argon2.hash(rawPassword, {
    type: argon2.argon2id
  })
}

const verifyPassword = async (rawPassword: string, passwordHash: string) => {
  return argon2.verify(passwordHash, rawPassword)
}

export { hashPassword, verifyPassword }
