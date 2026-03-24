import { createHash, createHmac } from 'node:crypto'
import { EntitlementStatus } from '@prisma/client'
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

const mapEntitlementTierCodeToCents = (tierCode: string) => {
  if (tierCode === 'secretwaifu_access') {
    return 1650
  }

  if (tierCode === 'just_models') {
    return 900
  }

  const explicitAmountMatch = tierCode.match(/(\d{3,5})/)

  if (!explicitAmountMatch) {
    return 0
  }

  const parsedTierCents = Number.parseInt(explicitAmountMatch[1], 10)

  if (Number.isNaN(parsedTierCents)) {
    return 0
  }

  return parsedTierCents
}

const resolveBestPatreonTierCents = (payload: { accountTierCents: number; entitlementTierCodes: string[] }) => {
  const entitlementTierCents = payload.entitlementTierCodes.reduce((highestTierCents, tierCode) => {
    return Math.max(highestTierCents, mapEntitlementTierCodeToCents(tierCode))
  }, 0)

  return Math.max(payload.accountTierCents, entitlementTierCents)
}

const resolveLegacyTier = (payload: { legacyTier: number | null; isPatreonGated: boolean; minimumTierCents: number | null }) => {
  if (typeof payload.legacyTier === 'number') {
    return payload.legacyTier
  }

  if (!payload.isPatreonGated) {
    return 0
  }

  const minimumTierCents = payload.minimumTierCents ?? 0

  if (minimumTierCents >= 1500) {
    return 2
  }

  return 1
}

const resolveLegacyHeyWaifu = (payload: {
  legacyHeyWaifu: number | null
  isPatreonGated: boolean
  minimumTierCents: number | null
}) => {
  if (typeof payload.legacyHeyWaifu === 'number') {
    return payload.legacyHeyWaifu
  }

  if (!payload.isPatreonGated) {
    return 0
  }

  const minimumTierCents = payload.minimumTierCents ?? 0
  return minimumTierCents >= 1500 ? 1 : 0
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

const parseLegacyCodeOverrides = () => {
  const rawValue = process.env.LEGACY_VERIFY_CODE_OVERRIDES?.trim()

  if (!rawValue) {
    return new Map<string, number>()
  }

  const entries = rawValue
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)

  const output = new Map<string, number>()

  for (const entry of entries) {
    const [code, cents] = entry.split(':').map((value) => value.trim())

    if (!code || !cents) {
      continue
    }

    const parsedCents = Number.parseInt(cents, 10)

    if (Number.isNaN(parsedCents) || parsedCents <= 0) {
      continue
    }

    output.set(code.toLowerCase(), parsedCents)
  }

  return output
}

const buildLegacyAccessCode = (userId: string) => {
  const secretKey = process.env.LEGACY_CODE_SECRET?.trim() || process.env.PATREON_CLIENT_SECRET?.trim() || 'secretwaifu-legacy-code'
  const encodedDigest = createHmac('sha256', secretKey).update(userId).digest('base64url')
  const compactCode = encodedDigest.replace(/[^a-zA-Z0-9]/g, '')
  return compactCode.slice(0, 6).toUpperCase()
}

legacyRoutes.get(['/modeldownload/models.json', '/modeldownload/modes.json'], async (_request, response, next) => {
  try {
    const characterList = await prisma.character.findMany({
      where: {
        status: 'APPROVED',
        visibility: {
          in: ['PUBLIC', 'UNLISTED']
        }
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
        isPatreonGated: true,
        minimumTierCents: true
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
        isPatreonGated: character.isPatreonGated,
        minimumTierCents: character.minimumTierCents
      }),
      heywaifu: resolveLegacyHeyWaifu({
        legacyHeyWaifu: character.legacyHeyWaifu,
        isPatreonGated: character.isPatreonGated,
        minimumTierCents: character.minimumTierCents
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
        status: 'APPROVED',
        visibility: {
          in: ['PUBLIC', 'UNLISTED']
        }
      },
      select: {
        id: true,
        slug: true,
        name: true,
        fullName: true,
        description: true,
        personality: true,
        scenario: true,
        firstMessage: true,
        exampleDialogs: true
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

    response.json({
      id: matchedCharacter.id,
      name: matchedCharacter.name,
      fullname: matchedCharacter.fullName ?? '',
      description: matchedCharacter.description ?? '',
      personality: matchedCharacter.personality ?? '',
      scenario: matchedCharacter.scenario ?? '',
      first_message: matchedCharacter.firstMessage ?? '',
      example_dialogs: matchedCharacter.exampleDialogs ?? ''
    })
  } catch (error) {
    next(error)
  }
})

legacyRoutes.get('/wp-json/patreon/v2/verify-code', async (request, response, next) => {
  try {
    const query = legacyVerifyCodeQuerySchema.parse(request.query)
    const normalizedCode = query.code.toLowerCase()

    const overrideCodeMap = parseLegacyCodeOverrides()
    const overriddenTierCents = overrideCodeMap.get(normalizedCode)

    if (overriddenTierCents) {
      response.json({
        status: `valid_${overriddenTierCents}`
      })
      return
    }

    const userList = await prisma.user.findMany({
      include: {
        patreonAccount: {
          select: {
            tierCents: true,
            membershipStatus: true
          }
        },
        entitlementGrants: {
          where: {
            source: 'PATREON',
            status: EntitlementStatus.ACTIVE
          },
          select: {
            tierCode: true
          }
        }
      }
    })

    for (const user of userList) {
      const generatedLegacyCode = buildLegacyAccessCode(user.id).toLowerCase()

      if (generatedLegacyCode !== normalizedCode) {
        continue
      }

      const membershipStatus = user.patreonAccount?.membershipStatus ?? ''

      if (membershipStatus !== 'active_patron') {
        response.json({
          status: 'invalid'
        })
        return
      }

      const tierCents = resolveBestPatreonTierCents({
        accountTierCents: user.patreonAccount?.tierCents ?? 0,
        entitlementTierCodes: user.entitlementGrants.map((entitlement) => entitlement.tierCode)
      })

      if (tierCents <= 0) {
        response.json({
          status: 'invalid'
        })
        return
      }

      response.json({
        status: `valid_${tierCents}`
      })
      return
    }

    response.json({
      status: 'invalid'
    })
  } catch (error) {
    next(error)
  }
})

export default legacyRoutes
