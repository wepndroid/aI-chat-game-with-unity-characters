import fs from 'node:fs'
import path from 'node:path'
import type { CharacterStatus, CharacterVisibility, PrismaClient, UserRole } from '@prisma/client'
import { getLegacyCharacterTagline, legacyCharacterTaglineMap } from './legacy-character-taglines'

type LegacyModelListItem = {
  Name: string
  FileHash: string
  Tier: number
  heywaifu: number
}

type LegacyCharacterInfoResponse = {
  id?: string
  name?: string
  fullname?: string
  description?: string
  personality?: string
  scenario?: string
  first_message?: string
  example_dialogs?: string
}

type LegacyImportOptions = {
  ownerEmail: string
  sourceBaseUrl: string
  publicAssetBaseUrl: string
  dryRun?: boolean
  skipDownloads?: boolean
  limit?: number | null
}

type NormalizedLegacyImportOptions = {
  ownerEmail: string
  sourceBaseUrl: string
  publicAssetBaseUrl: string
  dryRun: boolean
  skipDownloads: boolean
  limit: number | null
}

type LegacyTaglineBackfillOptions = {
  forceUpdate?: boolean
}

type ResolvedOwner = {
  id: string
  email: string
  username: string
  role: UserRole
}

type PreparedLegacyCharacter = {
  name: string
  slug: string
  tagline: string | null
  fullName: string | null
  description: string | null
  personality: string | null
  scenario: string | null
  firstMessage: string | null
  exampleDialogs: string | null
  vroidFileUrl: string
  previewImageUrl: string | null
  legacyFileHash: string
  legacyTier: number
  legacyHeyWaifu: number
  isPatreonGated: boolean
  minimumTierCents: number | null
  status: CharacterStatus
  visibility: CharacterVisibility
  officialListing: boolean
}

type ExistingImportedCharacter = {
  id: string
  slug: string
  previewImageUrl: string | null
  publishedAt: Date | null
}

type ImportStats = {
  scanned: number
  created: number
  updated: number
  skipped: number
  downloaded: number
  personaFetched: number
  personaMissing: number
}

type LegacyImportRunItem = {
  name: string
  slug: string
  action: 'create' | 'update'
  tagline: string | null
  personaStatus: 'fetched' | 'missing' | 'not-requested'
  downloadedFile: boolean
  vroidFileUrl: string
  legacyTier: number
  legacyHeyWaifu: number
}

type LegacyImportRunResult = {
  owner: ResolvedOwner
  options: NormalizedLegacyImportOptions
  stats: ImportStats
  items: LegacyImportRunItem[]
}

type LegacyTaglineBackfillItem = {
  name: string
  previousTagline: string | null
  resolvedTagline: string | null
  status: 'updated' | 'skipped' | 'unresolved'
}

type LegacyTaglineBackfillResult = {
  forceUpdate: boolean
  updated: number
  skipped: number
  unresolved: number
  items: LegacyTaglineBackfillItem[]
}

type LegacyImportOverview = {
  defaults: {
    ownerEmail: string
    sourceBaseUrl: string
    publicAssetBaseUrl: string
  }
  legacySource: {
    reachable: boolean
    modelCount: number | null
    errorMessage: string | null
  }
  coverage: {
    mappedTaglines: number
  }
  imported: {
    characters: number
    withTagline: number
    missingTagline: number
    missingPreviewImage: number
  }
}

const DEFAULT_OWNER_EMAIL = 'ghostlady0613@gmail.com'
const DEFAULT_SOURCE_BASE_URL = 'https://squircle.games'
const DEFAULT_PUBLIC_ASSET_BASE_URL = 'http://127.0.0.1:4000'

const slugify = (value: string) => {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

const buildUniqueSlug = (source: string, suffix: string) => {
  const baseSlug = slugify(source)

  if (!baseSlug) {
    return `character-${suffix}`
  }

  return `${baseSlug}-${suffix}`
}

const normalizeBaseUrl = (value: string) => value.trim().replace(/\/+$/, '')

const toOptionalTrimmedString = (value: unknown) => {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

const mapLegacyTierToMinimumTierCents = (tier: number) => {
  if (tier >= 2) {
    return 1650
  }

  if (tier >= 1) {
    return 900
  }

  return null
}

const buildLegacyVrmUrl = (sourceBaseUrl: string, modelName: string) => {
  const encodedName = encodeURIComponent(modelName.trim())
  return `${sourceBaseUrl}/modeldownload/${encodedName}.vrm`
}

const buildUploadedVrmUrl = (publicAssetBaseUrl: string, filename: string) => {
  return `${publicAssetBaseUrl}/uploads/${encodeURIComponent(filename)}`
}

const normalizeLegacyImportOptions = (options: LegacyImportOptions): NormalizedLegacyImportOptions => {
  const ownerEmail = options.ownerEmail.trim()

  if (!ownerEmail) {
    throw new Error('Owner email is required.')
  }

  if (options.limit !== undefined && options.limit !== null && (!Number.isInteger(options.limit) || options.limit <= 0)) {
    throw new Error('Limit must be a positive integer when provided.')
  }

  return {
    ownerEmail,
    sourceBaseUrl: normalizeBaseUrl(options.sourceBaseUrl),
    publicAssetBaseUrl: normalizeBaseUrl(options.publicAssetBaseUrl),
    dryRun: options.dryRun === true,
    skipDownloads: options.skipDownloads === true,
    limit: options.limit ?? null
  }
}

const fetchJson = async <T>(url: string) => {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Request failed for ${url} (${response.status} ${response.statusText}).`)
  }

  return (await response.json()) as T
}

const fetchLegacyModelList = async (sourceBaseUrl: string) => {
  return fetchJson<LegacyModelListItem[]>(`${sourceBaseUrl}/modeldownload/models.json`)
}

const fetchLegacyCharacterInfo = async (sourceBaseUrl: string, modelName: string) => {
  const normalizedName = modelName.trim()
  const lookupCandidates = Array.from(
    new Set(
      [
        normalizedName,
        normalizedName.toLowerCase(),
        normalizedName.replace(/\s+/g, '-'),
        normalizedName.toLowerCase().replace(/\s+/g, '-'),
        slugify(normalizedName)
      ].filter(Boolean)
    )
  )

  for (const candidate of lookupCandidates) {
    const url = `${sourceBaseUrl}/wp-json/characters/v1/info?character=${encodeURIComponent(candidate)}`
    const response = await fetch(url)

    if (response.status === 404) {
      continue
    }

    if (!response.ok) {
      throw new Error(`Character info request failed for ${modelName} via "${candidate}" (${response.status} ${response.statusText}).`)
    }

    return (await response.json()) as LegacyCharacterInfoResponse
  }

  return null
}

const ensureDirectory = async (directoryPath: string) => {
  await fs.promises.mkdir(directoryPath, { recursive: true })
}

const downloadVrmFile = async (url: string, targetPath: string) => {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`VRM download failed for ${url} (${response.status} ${response.statusText}).`)
  }

  const fileBuffer = Buffer.from(await response.arrayBuffer())
  await fs.promises.writeFile(targetPath, fileBuffer)
}

const resolveOwner = async (prismaClient: PrismaClient, ownerEmail: string): Promise<ResolvedOwner> => {
  const owner = await prismaClient.user.findUnique({
    where: {
      email: ownerEmail
    },
    select: {
      id: true,
      email: true,
      username: true,
      role: true
    }
  })

  if (!owner) {
    throw new Error(`No user found for ${ownerEmail}. Create that account first or choose another owner email.`)
  }

  return owner
}

const prepareLegacyCharacter = async (
  options: NormalizedLegacyImportOptions,
  owner: ResolvedOwner,
  model: LegacyModelListItem,
  uploadsRoot: string,
  stats: ImportStats
) => {
  const sourceVrmUrl = buildLegacyVrmUrl(options.sourceBaseUrl, model.Name)
  const localFilename = `${model.FileHash.toLowerCase()}.vrm`
  const localFilePath = path.join(uploadsRoot, localFilename)
  const minimumTierCents = mapLegacyTierToMinimumTierCents(model.Tier)
  const shouldFetchPersona = model.heywaifu === 1

  let legacyCharacterInfo: LegacyCharacterInfoResponse | null = null

  if (shouldFetchPersona) {
    legacyCharacterInfo = await fetchLegacyCharacterInfo(options.sourceBaseUrl, model.Name)

    if (legacyCharacterInfo) {
      stats.personaFetched += 1
    } else {
      stats.personaMissing += 1
    }
  }

  let downloadedFile = false
  let vroidFileUrl = sourceVrmUrl

  if (!options.skipDownloads) {
    if (!options.dryRun) {
      await ensureDirectory(uploadsRoot)

      if (!fs.existsSync(localFilePath)) {
        await downloadVrmFile(sourceVrmUrl, localFilePath)
        stats.downloaded += 1
        downloadedFile = true
      }
    } else if (!fs.existsSync(localFilePath)) {
      stats.downloaded += 1
      downloadedFile = true
    }

    vroidFileUrl = buildUploadedVrmUrl(options.publicAssetBaseUrl, localFilename)
  }

  const preparedCharacter: PreparedLegacyCharacter = {
    name: model.Name.trim(),
    slug: buildUniqueSlug(model.Name, model.FileHash.slice(0, 8).toLowerCase()),
    tagline: getLegacyCharacterTagline(model.Name),
    fullName: toOptionalTrimmedString(legacyCharacterInfo?.fullname),
    description: toOptionalTrimmedString(legacyCharacterInfo?.description),
    personality: toOptionalTrimmedString(legacyCharacterInfo?.personality),
    scenario: toOptionalTrimmedString(legacyCharacterInfo?.scenario),
    firstMessage: toOptionalTrimmedString(legacyCharacterInfo?.first_message),
    exampleDialogs: toOptionalTrimmedString(legacyCharacterInfo?.example_dialogs),
    vroidFileUrl,
    previewImageUrl: null,
    legacyFileHash: model.FileHash.toLowerCase(),
    legacyTier: model.Tier,
    legacyHeyWaifu: model.heywaifu,
    isPatreonGated: model.Tier > 0,
    minimumTierCents,
    status: 'APPROVED',
    visibility: 'PUBLIC',
    officialListing: owner.role === 'ADMIN'
  }

  return {
    preparedCharacter,
    downloadedFile,
    personaStatus: shouldFetchPersona ? (legacyCharacterInfo ? ('fetched' as const) : ('missing' as const)) : ('not-requested' as const)
  }
}

const findExistingImportedCharacter = async (
  prismaClient: PrismaClient,
  ownerId: string,
  character: PreparedLegacyCharacter
): Promise<ExistingImportedCharacter | null> => {
  return prismaClient.character.findFirst({
    where: {
      OR: [
        {
          legacyFileHash: character.legacyFileHash
        },
        {
          AND: [
            {
              ownerId
            },
            {
              name: character.name
            }
          ]
        }
      ]
    },
    select: {
      id: true,
      slug: true,
      previewImageUrl: true,
      publishedAt: true
    }
  })
}

const createImportedCharacter = async (prismaClient: PrismaClient, owner: ResolvedOwner, character: PreparedLegacyCharacter) => {
  const createdCharacter = await prismaClient.character.create({
    data: {
      ownerId: owner.id,
      slug: character.slug,
      name: character.name,
      tagline: character.tagline,
      fullName: character.fullName,
      description: character.description,
      vroidFileUrl: character.vroidFileUrl,
      previewImageUrl: character.previewImageUrl,
      legacyFileHash: character.legacyFileHash,
      legacyTier: character.legacyTier,
      legacyHeyWaifu: character.legacyHeyWaifu,
      status: character.status,
      visibility: character.visibility,
      officialListing: character.officialListing,
      isPatreonGated: character.isPatreonGated,
      minimumTierCents: character.minimumTierCents,
      publishedAt: new Date()
    },
    select: {
      id: true
    }
  })

  await prismaClient.characterCard.create({
    data: {
      characterId: createdCharacter.id,
      creatorUserId: owner.id,
      fullName: character.fullName,
      description: character.description,
      personality: character.personality,
      scenario: character.scenario,
      firstMessage: character.firstMessage,
      exampleDialogs: character.exampleDialogs,
      isPublic: true
    }
  })
}

const updateImportedCharacter = async (
  prismaClient: PrismaClient,
  owner: ResolvedOwner,
  existingCharacter: ExistingImportedCharacter,
  character: PreparedLegacyCharacter
) => {
  await prismaClient.character.update({
    where: {
      id: existingCharacter.id
    },
    data: {
      name: character.name,
      fullName: character.fullName,
      description: character.description,
      vroidFileUrl: character.vroidFileUrl,
      legacyFileHash: character.legacyFileHash,
      legacyTier: character.legacyTier,
      legacyHeyWaifu: character.legacyHeyWaifu,
      status: character.status,
      visibility: character.visibility,
      officialListing: character.officialListing,
      isPatreonGated: character.isPatreonGated,
      minimumTierCents: character.minimumTierCents,
      publishedAt: existingCharacter.publishedAt ?? new Date(),
      previewImageUrl: existingCharacter.previewImageUrl,
      ...(character.tagline !== null ? { tagline: character.tagline } : {})
    }
  })

  await prismaClient.characterCard.upsert({
    where: {
      characterId: existingCharacter.id
    },
    create: {
      characterId: existingCharacter.id,
      creatorUserId: owner.id,
      fullName: character.fullName,
      description: character.description,
      personality: character.personality,
      scenario: character.scenario,
      firstMessage: character.firstMessage,
      exampleDialogs: character.exampleDialogs,
      isPublic: true
    },
    update: {
      fullName: character.fullName,
      description: character.description,
      personality: character.personality,
      scenario: character.scenario,
      firstMessage: character.firstMessage,
      exampleDialogs: character.exampleDialogs,
      isPublic: true
    }
  })
}

const runLegacyImport = async (prismaClient: PrismaClient, rawOptions: LegacyImportOptions): Promise<LegacyImportRunResult> => {
  const options = normalizeLegacyImportOptions(rawOptions)
  const owner = await resolveOwner(prismaClient, options.ownerEmail)
  const uploadsRoot = path.join(process.cwd(), 'uploads')
  const modelList = await fetchLegacyModelList(options.sourceBaseUrl)
  const limitedModelList = options.limit ? modelList.slice(0, options.limit) : modelList

  const stats: ImportStats = {
    scanned: limitedModelList.length,
    created: 0,
    updated: 0,
    skipped: 0,
    downloaded: 0,
    personaFetched: 0,
    personaMissing: 0
  }

  const items: LegacyImportRunItem[] = []

  for (const model of limitedModelList) {
    const { preparedCharacter, downloadedFile, personaStatus } = await prepareLegacyCharacter(options, owner, model, uploadsRoot, stats)
    const existingCharacter = await findExistingImportedCharacter(prismaClient, owner.id, preparedCharacter)
    const action = existingCharacter ? 'update' : 'create'

    if (!options.dryRun) {
      if (existingCharacter) {
        await updateImportedCharacter(prismaClient, owner, existingCharacter, preparedCharacter)
        stats.updated += 1
      } else {
        await createImportedCharacter(prismaClient, owner, preparedCharacter)
        stats.created += 1
      }
    } else if (existingCharacter) {
      stats.updated += 1
    } else {
      stats.created += 1
    }

    items.push({
      name: preparedCharacter.name,
      slug: preparedCharacter.slug,
      action,
      tagline: preparedCharacter.tagline,
      personaStatus,
      downloadedFile,
      vroidFileUrl: preparedCharacter.vroidFileUrl,
      legacyTier: preparedCharacter.legacyTier,
      legacyHeyWaifu: preparedCharacter.legacyHeyWaifu
    })
  }

  return {
    owner,
    options,
    stats,
    items
  }
}

const runLegacyTaglineBackfill = async (
  prismaClient: PrismaClient,
  options: LegacyTaglineBackfillOptions = {}
): Promise<LegacyTaglineBackfillResult> => {
  const forceUpdate = options.forceUpdate === true
  const characters = await prismaClient.character.findMany({
    where: {
      legacyFileHash: {
        not: null
      }
    },
    select: {
      id: true,
      name: true,
      tagline: true
    },
    orderBy: {
      createdAt: 'asc'
    }
  })

  const items: LegacyTaglineBackfillItem[] = []
  let updated = 0
  let skipped = 0
  let unresolved = 0

  for (const character of characters) {
    const resolvedTagline = getLegacyCharacterTagline(character.name)
    const currentTagline = character.tagline?.trim() ?? ''

    if (!resolvedTagline) {
      unresolved += 1
      items.push({
        name: character.name,
        previousTagline: character.tagline,
        resolvedTagline: null,
        status: 'unresolved'
      })
      continue
    }

    if (!forceUpdate && currentTagline.length > 0) {
      skipped += 1
      items.push({
        name: character.name,
        previousTagline: character.tagline,
        resolvedTagline,
        status: 'skipped'
      })
      continue
    }

    if (currentTagline === resolvedTagline) {
      skipped += 1
      items.push({
        name: character.name,
        previousTagline: character.tagline,
        resolvedTagline,
        status: 'skipped'
      })
      continue
    }

    await prismaClient.character.update({
      where: {
        id: character.id
      },
      data: {
        tagline: resolvedTagline
      }
    })

    updated += 1
    items.push({
      name: character.name,
      previousTagline: character.tagline,
      resolvedTagline,
      status: 'updated'
    })
  }

  return {
    forceUpdate,
    updated,
    skipped,
    unresolved,
    items
  }
}

const getLegacyImportOverview = async (
  prismaClient: PrismaClient,
  ownerEmail = DEFAULT_OWNER_EMAIL
): Promise<LegacyImportOverview> => {
  const normalizedSourceBaseUrl = normalizeBaseUrl(DEFAULT_SOURCE_BASE_URL)
  const normalizedPublicAssetBaseUrl = normalizeBaseUrl(
    process.env.PUBLIC_ASSET_BASE_URL?.trim() || process.env.BACKEND_PUBLIC_URL?.trim() || DEFAULT_PUBLIC_ASSET_BASE_URL
  )

  const [importedCharacters, importedMissingTagline, importedMissingPreviewImage] = await Promise.all([
    prismaClient.character.count({
      where: {
        legacyFileHash: {
          not: null
        }
      }
    }),
    prismaClient.character.count({
      where: {
        legacyFileHash: {
          not: null
        },
        OR: [
          {
            tagline: null
          },
          {
            tagline: ''
          }
        ]
      }
    }),
    prismaClient.character.count({
      where: {
        legacyFileHash: {
          not: null
        },
        OR: [
          {
            previewImageUrl: null
          },
          {
            previewImageUrl: ''
          }
        ]
      }
    })
  ])
  const importedWithTagline = Math.max(0, importedCharacters - importedMissingTagline)

  let legacySource: LegacyImportOverview['legacySource']

  try {
    const legacyModels = await fetchLegacyModelList(normalizedSourceBaseUrl)
    legacySource = {
      reachable: true,
      modelCount: legacyModels.length,
      errorMessage: null
    }
  } catch (error) {
    legacySource = {
      reachable: false,
      modelCount: null,
      errorMessage: error instanceof Error ? error.message : 'Unable to reach the legacy source.'
    }
  }

  return {
    defaults: {
      ownerEmail: ownerEmail.trim() || DEFAULT_OWNER_EMAIL,
      sourceBaseUrl: normalizedSourceBaseUrl,
      publicAssetBaseUrl: normalizedPublicAssetBaseUrl
    },
    legacySource,
    coverage: {
      mappedTaglines: legacyCharacterTaglineMap.size
    },
    imported: {
      characters: importedCharacters,
      withTagline: importedWithTagline,
      missingTagline: importedMissingTagline,
      missingPreviewImage: importedMissingPreviewImage
    }
  }
}

export {
  DEFAULT_OWNER_EMAIL,
  DEFAULT_PUBLIC_ASSET_BASE_URL,
  DEFAULT_SOURCE_BASE_URL,
  buildLegacyVrmUrl,
  buildUploadedVrmUrl,
  fetchLegacyModelList,
  getLegacyImportOverview,
  normalizeLegacyImportOptions,
  runLegacyImport,
  runLegacyTaglineBackfill
}
export type {
  ImportStats,
  LegacyCharacterInfoResponse,
  LegacyImportOverview,
  LegacyImportOptions,
  LegacyImportRunItem,
  LegacyImportRunResult,
  LegacyModelListItem,
  LegacyTaglineBackfillItem,
  LegacyTaglineBackfillOptions,
  LegacyTaglineBackfillResult,
  NormalizedLegacyImportOptions,
  ResolvedOwner
}
