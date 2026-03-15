import { Prisma, UserRole } from '@prisma/client'
import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'

const userRoutes = Router()

const createUserSchema = z.object({
  email: z.string().email(),
  username: z.string().trim().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
  role: z.nativeEnum(UserRole).optional()
})

const listUsersQuerySchema = z.object({
  role: z.nativeEnum(UserRole).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25)
})

userRoutes.get('/users', async (request, response, next) => {
  try {
    const query = listUsersQuerySchema.parse(request.query)

    const userList = await prisma.user.findMany({
      where: query.role ? { role: query.role } : undefined,
      take: query.limit,
      orderBy: {
        createdAt: 'desc'
      },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        isEmailVerified: true,
        createdAt: true,
        updatedAt: true
      }
    })

    response.json({
      data: userList
    })
  } catch (error) {
    next(error)
  }
})

userRoutes.post('/users', async (request, response, next) => {
  try {
    const payload = createUserSchema.parse(request.body)

    const createdUser = await prisma.user.create({
      data: {
        email: payload.email.toLowerCase(),
        username: payload.username,
        role: payload.role ?? 'USER'
      },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        isEmailVerified: true,
        createdAt: true
      }
    })

    response.status(201).json({
      data: createdUser
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      response.status(409).json({
        message: 'A user with this e-mail or username already exists.'
      })
      return
    }

    next(error)
  }
})

export default userRoutes
