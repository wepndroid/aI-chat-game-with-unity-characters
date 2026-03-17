import { Prisma } from '@prisma/client'
import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth-middleware'
import { prisma } from '../lib/prisma'
import {
  ReviewVerificationError,
  assertReviewOwnerOrAdmin,
  assertReviewRatingEligibility,
  getCharacterForReviewOrThrow,
  getReviewActorOrThrow,
  recalculateCharacterAverageRating
} from '../services/review-service'

const reviewRoutes = Router()

const characterParamsSchema = z.object({
  characterId: z.string().min(1)
})

const reviewParamsSchema = z.object({
  reviewId: z.string().min(1)
})

const listReviewsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20)
})

const createReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().min(3).max(2000)
})

const updateReviewSchema = z
  .object({
    rating: z.number().int().min(1).max(5).optional(),
    body: z.string().trim().min(3).max(2000).optional()
  })
  .refine((payload) => payload.rating !== undefined || payload.body !== undefined, {
    message: 'At least one field (rating or body) must be provided.'
  })

reviewRoutes.get('/characters/:characterId/reviews', async (request, response, next) => {
  try {
    const { characterId } = characterParamsSchema.parse(request.params)
    const query = listReviewsQuerySchema.parse(request.query)

    const character = await getCharacterForReviewOrThrow(characterId)

    if (character.status !== 'APPROVED') {
      response.status(404).json({
        message: 'Character not found.'
      })
      return
    }

    const reviews = await prisma.review.findMany({
      where: {
        characterId
      },
      take: query.limit,
      orderBy: {
        createdAt: 'desc'
      },
      select: {
        id: true,
        rating: true,
        body: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
            username: true
          }
        }
      }
    })

    response.json({
      data: reviews
    })
  } catch (error) {
    if (error instanceof ReviewVerificationError) {
      response.status(error.statusCode).json({
        message: error.message
      })
      return
    }

    next(error)
  }
})

reviewRoutes.post('/characters/:characterId/reviews', requireAuth, async (request, response, next) => {
  try {
    const authUser = request.authUser

    if (!authUser) {
      response.status(401).json({
        message: 'Authentication required.'
      })
      return
    }

    const { characterId } = characterParamsSchema.parse(request.params)
    const payload = createReviewSchema.parse(request.body)

    await assertReviewRatingEligibility(authUser.userId, characterId)

    const transactionResult = await prisma.$transaction(async (transactionClient) => {
      const createdReview = await transactionClient.review.create({
        data: {
          userId: authUser.userId,
          characterId,
          rating: payload.rating,
          body: payload.body
        },
        select: {
          id: true,
          rating: true,
          body: true,
          characterId: true,
          createdAt: true,
          updatedAt: true
        }
      })

      const averageRating = await recalculateCharacterAverageRating(transactionClient, characterId)

      return {
        review: createdReview,
        averageRating
      }
    })

    response.status(201).json({
      data: transactionResult
    })
  } catch (error) {
    if (error instanceof ReviewVerificationError) {
      response.status(error.statusCode).json({
        message: error.message
      })
      return
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      response.status(409).json({
        message: 'You have already reviewed this character.'
      })
      return
    }

    next(error)
  }
})

reviewRoutes.patch('/reviews/:reviewId', requireAuth, async (request, response, next) => {
  try {
    const authUser = request.authUser

    if (!authUser) {
      response.status(401).json({
        message: 'Authentication required.'
      })
      return
    }

    const { reviewId } = reviewParamsSchema.parse(request.params)
    const payload = updateReviewSchema.parse(request.body)

    const actor = await getReviewActorOrThrow(authUser.userId)

    const existingReview = await prisma.review.findUnique({
      where: {
        id: reviewId
      },
      select: {
        id: true,
        userId: true,
        characterId: true
      }
    })

    if (!existingReview) {
      response.status(404).json({
        message: 'Review not found.'
      })
      return
    }

    assertReviewOwnerOrAdmin(existingReview.userId, actor.id, actor.role)

    if (actor.role !== 'ADMIN') {
      await assertReviewRatingEligibility(actor.id, existingReview.characterId)
    }

    const transactionResult = await prisma.$transaction(async (transactionClient) => {
      const updatedReview = await transactionClient.review.update({
        where: {
          id: reviewId
        },
        data: {
          ...(payload.rating !== undefined ? { rating: payload.rating } : {}),
          ...(payload.body !== undefined ? { body: payload.body } : {})
        },
        select: {
          id: true,
          rating: true,
          body: true,
          characterId: true,
          createdAt: true,
          updatedAt: true
        }
      })

      const averageRating = await recalculateCharacterAverageRating(transactionClient, existingReview.characterId)

      return {
        review: updatedReview,
        averageRating
      }
    })

    response.json({
      data: transactionResult
    })
  } catch (error) {
    if (error instanceof ReviewVerificationError) {
      response.status(error.statusCode).json({
        message: error.message
      })
      return
    }

    next(error)
  }
})

reviewRoutes.delete('/reviews/:reviewId', requireAuth, async (request, response, next) => {
  try {
    const authUser = request.authUser

    if (!authUser) {
      response.status(401).json({
        message: 'Authentication required.'
      })
      return
    }

    const { reviewId } = reviewParamsSchema.parse(request.params)
    const actor = await getReviewActorOrThrow(authUser.userId)

    const existingReview = await prisma.review.findUnique({
      where: {
        id: reviewId
      },
      select: {
        id: true,
        userId: true,
        characterId: true
      }
    })

    if (!existingReview) {
      response.status(404).json({
        message: 'Review not found.'
      })
      return
    }

    assertReviewOwnerOrAdmin(existingReview.userId, actor.id, actor.role)

    const transactionResult = await prisma.$transaction(async (transactionClient) => {
      await transactionClient.review.delete({
        where: {
          id: reviewId
        }
      })

      const averageRating = await recalculateCharacterAverageRating(transactionClient, existingReview.characterId)

      return {
        deleted: true,
        characterId: existingReview.characterId,
        averageRating
      }
    })

    response.json({
      data: transactionResult
    })
  } catch (error) {
    if (error instanceof ReviewVerificationError) {
      response.status(error.statusCode).json({
        message: error.message
      })
      return
    }

    next(error)
  }
})

export default reviewRoutes
