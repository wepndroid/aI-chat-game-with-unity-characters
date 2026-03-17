import { UserRole } from '@prisma/client'
import { Router } from 'express'
import { z } from 'zod'
import { requireAdmin } from '../middleware/auth-middleware'
import { prisma } from '../lib/prisma'

const userRoutes = Router()

const listUsersQuerySchema = z.object({
  role: z.nativeEnum(UserRole).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25)
})

userRoutes.get('/users', requireAdmin, async (request, response, next) => {
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

export default userRoutes
