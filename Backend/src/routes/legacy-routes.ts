import { createHash } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'

const legacyRoutes = Router()

type LegacyModelItem = {
  Name: string
  FileHash: string
  Tier: number
  heywaifu: number
}

const legacyCharacterInfoQuerySchema = z.object({
  character: z.string().trim().min(1)
})

const legacyVerifyCodeQuerySchema = z.object({
  code: z.string().trim().min(1)
})

const resolveLegacyTier = (payload: { legacyTier: number | null; isPatreonGated: boolean }) => {
  if (typeof payload.legacyTier === 'number') {
    return payload.legacyTier
  }

  return payload.isPatreonGated ? 1 : 0
}

const resolveLegacyHeyWaifu = (payload: {
  legacyHeyWaifu: number | null
  isPatreonGated: boolean
}) => {
  if (typeof payload.legacyHeyWaifu === 'number') {
    return payload.legacyHeyWaifu
  }

  return payload.isPatreonGated ? 1 : 0
}

const tryExtractFileHashFromVroidUrl = (vroidFileUrl: string | null) => {
  if (!vroidFileUrl) {
    return null
  }

  try {
    const normalizedUrl = new URL(vroidFileUrl)
    const filename = normalizedUrl.pathname.split('/').pop() ?? ''
    const hashLikeValue = filename.replace(/\.[^.]+$/, '')

    if (/^[a-f0-9]{64}$/i.test(hashLikeValue)) {
      return hashLikeValue.toLowerCase()
    }
  } catch {
    return null
  }

  return null
}

const buildLegacyFileHash = (payload: { name: string; vroidFileUrl: string | null }) => {
  const extractedFileHash = tryExtractFileHashFromVroidUrl(payload.vroidFileUrl)

  if (extractedFileHash) {
    return extractedFileHash
  }

  return createHash('sha256').update(`${payload.name}|${payload.vroidFileUrl ?? ''}`).digest('hex')
}

const resolveLegacyFileHash = (payload: { legacyFileHash: string | null; name: string; vroidFileUrl: string | null }) => {
  if (payload.legacyFileHash && /^[a-f0-9]{64}$/i.test(payload.legacyFileHash)) {
    return payload.legacyFileHash.toLowerCase()
  }

  return buildLegacyFileHash({
    name: payload.name,
    vroidFileUrl: payload.vroidFileUrl
  })
}

const normalizeLookupValue = (value: string) => value.trim().toLowerCase()
const normalizeLookupKey = (value: string) => normalizeLookupValue(value).replace(/[^a-z0-9]/g, '')

legacyRoutes.get(['/modeldownload/models.json', '/modeldownload/modes.json'], async (_request, response, next) => {
  try {
    const characterList = await prisma.character.findMany({
      where: {
        status: 'APPROVED'
      },
      orderBy: {
        name: 'asc'
      },
      select: {
        name: true,
        vroidFileUrl: true,
        legacyFileHash: true,
        legacyTier: true,
        legacyHeyWaifu: true,
        isPatreonGated: true
      }
    })

    const legacyModelList: LegacyModelItem[] = characterList.map((character) => ({
      Name: character.name,
      FileHash: resolveLegacyFileHash({
        legacyFileHash: character.legacyFileHash,
        name: character.name,
        vroidFileUrl: character.vroidFileUrl
      }),
      Tier: resolveLegacyTier({
        legacyTier: character.legacyTier,
        isPatreonGated: character.isPatreonGated
      }),
      heywaifu: resolveLegacyHeyWaifu({
        legacyHeyWaifu: character.legacyHeyWaifu,
        isPatreonGated: character.isPatreonGated
      })
    }))

    response.json(legacyModelList)
  } catch (error) {
    next(error)
  }
})

legacyRoutes.get('/wp-json/characters/v1/info', async (request, response, next) => {
  try {
    const query = legacyCharacterInfoQuerySchema.parse(request.query)
    const normalizedCharacterLookup = normalizeLookupValue(query.character)
    const normalizedCharacterLookupKey = normalizeLookupKey(query.character)

    const characterList = await prisma.character.findMany({
      where: {
        status: 'APPROVED'
      },
      select: {
        id: true,
        slug: true,
        name: true,
        fullName: true,
        description: true,
        defaultStory: {
          select: {
            promptDescription: true,
            personality: true,
            scenario: true,
            firstMessage: true,
            exampleDialogs: true
          }
        }
      }
    })

    const matchedCharacter = characterList.find((character) => {
      const candidateValues = [character.slug, character.name, character.fullName ?? '']
      const normalizedCandidates = candidateValues.map((candidateValue) => normalizeLookupValue(candidateValue))
      const normalizedCandidateKeys = candidateValues.map((candidateValue) => normalizeLookupKey(candidateValue))

      if (normalizedCandidates.some((candidateValue) => candidateValue === normalizedCharacterLookup)) {
        return true
      }

      if (normalizedCandidateKeys.some((candidateValue) => candidateValue === normalizedCharacterLookupKey)) {
        return true
      }

      return normalizedCandidateKeys.some((candidateValue) => candidateValue.includes(normalizedCharacterLookupKey))
    })

    if (!matchedCharacter) {
      response.status(404).json({
        error: 'character_not_found'
      })
      return
    }

    const defaultStory = matchedCharacter.defaultStory

    response.json({
      id: matchedCharacter.id,
      name: matchedCharacter.name,
      fullname: matchedCharacter.fullName ?? '',
      description: defaultStory?.promptDescription ?? matchedCharacter.description ?? '',
      personality: defaultStory?.personality ?? '',
      scenario: defaultStory?.scenario ?? '',
      first_message: defaultStory?.firstMessage ?? '',
      example_dialogs: defaultStory?.exampleDialogs ?? ''
    })
  } catch (error) {
    next(error)
  }
})

legacyRoutes.get('/wp-json/patreon/v2/verify-code', async (request, response, next) => {
  try {
    legacyVerifyCodeQuerySchema.parse(request.query)
    response.status(410).json({
      status: 'invalid',
      error: 'legacy_access_codes_disabled'
    })
  } catch (error) {
    next(error)
  }
})

export default legacyRoutes
