import { PrismaClient } from '@prisma/client'

const createPrismaClient = () => {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error']
  })
}

declare global {
  var prismaClientSingleton: PrismaClient | undefined
}

export const prisma = global.prismaClientSingleton ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  global.prismaClientSingleton = prisma
}
