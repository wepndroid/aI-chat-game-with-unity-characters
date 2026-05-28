import { randomUUID } from 'node:crypto'
import { prisma } from '../lib/prisma'
import { postgresTimestamptzValue } from '../lib/database/postgres-sql'

type StaticPageRecord = {
  id: string
  slug: string
  title: string
  summary: string | null
  metaTitle: string | null
  metaDescription: string | null
  contentHtml: string
  sourceUrl: string | null
  revisionDate: string | null
  isPublished: boolean
  showInFooter: boolean
  footerLabel: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

type CreateStaticPageInput = {
  slug: string
  title: string
  summary?: string | null
  metaTitle?: string | null
  metaDescription?: string | null
  contentHtml: string
  sourceUrl?: string | null
  revisionDate?: string | null
  isPublished?: boolean
  showInFooter?: boolean
  footerLabel?: string | null
  sortOrder?: number
}

type UpdateStaticPageInput = Partial<CreateStaticPageInput>

type StaticPageRow = {
  id: string
  slug: string
  title: string
  summary: string | null
  metaTitle: string | null
  metaDescription: string | null
  contentHtml: string
  sourceUrl: string | null
  revisionDate: string | null
  isPublished: boolean
  showInFooter: boolean
  footerLabel: string | null
  sortOrder: number
  createdAt: string | Date
  updatedAt: string | Date
}

type SeedPageDefinition = Omit<CreateStaticPageInput, 'contentHtml'> & {
  sourceUrl?: string | null
  contentHtml?: string
  contentFetcher?: () => Promise<{ contentHtml: string; revisionDate?: string | null }>
}

let staticPagesEnsured = false
const staticPageTimestamp = (timestamp: string | Date | null) => postgresTimestamptzValue(timestamp)

const normalizeSlug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const trimNullable = (value?: string | null) => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

const fromRow = (row: StaticPageRow): StaticPageRecord => ({
  id: row.id,
  slug: row.slug,
  title: row.title,
  summary: row.summary,
  metaTitle: row.metaTitle,
  metaDescription: row.metaDescription,
  contentHtml: row.contentHtml,
  sourceUrl: row.sourceUrl,
  revisionDate: row.revisionDate,
  isPublished: row.isPublished,
  showInFooter: row.showInFooter,
  footerLabel: row.footerLabel,
  sortOrder: row.sortOrder,
  createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt
})

const decodeHtmlEntities = (value: string) =>
  value
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")

const fixCommonMojibake = (value: string) =>
  value
    .replaceAll('â€œ', '“')
    .replaceAll('â€', '”')
    .replaceAll('â€˜', '‘')
    .replaceAll('â€™', '’')
    .replaceAll('â€“', '–')
    .replaceAll('â€”', '—')
    .replaceAll('â€¢', '•')
    .replaceAll('Â ', ' ')
    .replaceAll('Â', ' ')
    .replaceAll('Ã ', 'à')
    .replaceAll('Ã©', 'é')
    .replaceAll('Ã¨', 'è')
    .replaceAll('Ã¹', 'ù')

const decodePolicyHtml = (value: string) => fixCommonMojibake(decodeHtmlEntities(value))

const applySecretWaifuBranding = (value: string) =>
  value
    .replaceAll('mailto:support@candymail.ai', 'mailto:support@secretwaifu.com')
    .replaceAll('support@candymail.ai', 'support@secretwaifu.com')
    .replaceAll('https://candy.ai/', 'https://secretwaifu.com/')
    .replaceAll('http://candy.ai/', 'https://secretwaifu.com/')
    .replaceAll('Candy.ai®', 'SecretWaifu.com')
    .replaceAll('Candy.ai', 'SecretWaifu.com')
    .replaceAll('candy.ai', 'SecretWaifu.com')
    .replaceAll('Candy AI', 'SecretWaifu')
    .replaceAll('EverAI Limited', 'Mihi Marketing BV')
    .replaceAll('EverAI', 'Mihi Marketing BV')

const applySecretWaifuBrandingToNullable = (value: string | null) => (value ? applySecretWaifuBranding(value) : value)

const internalPolicyPathMap: Record<string, string> = {
  'terms-of-service': '/legal/terms-of-service',
  'privacy-policy': '/legal/privacy-notice',
  'cookies-policy': '/legal/cookies-notice',
  'underage-policy': '/legal/underage-policy',
  'content-removal-policy': '/legal/content-removal-policy',
  'blocked-content-policy': '/legal/blocked-content-policy',
  'dmca-policy': '/legal/dmca-policy',
  'complaint-policy': '/legal/complaint-policy',
  'usc-2257-exemption': '/legal/18-usc-2257-exemption',
  'community-guidelines': '/legal/community-guidelines',
  'affiliate-terms': '/legal/affiliate-terms-conditions',
  'legal-information': '/legal'
}

const rewritePolicyLinks = (contentHtml: string) =>
  contentHtml
    .replace(
      /<a\s+href="\/(terms-of-service|privacy-policy|cookies-policy|underage-policy|content-removal-policy|blocked-content-policy|dmca-policy|complaint-policy|usc-2257-exemption|community-guidelines|affiliate-terms|legal-information)"/g,
      (_match, pathKey: keyof typeof internalPolicyPathMap) => `<a href="${internalPolicyPathMap[pathKey]}"`
    )
    .replace(/<a\s+href="support@candymail\.ai"/g, '<a href="mailto:support@secretwaifu.com"')
    .replace(/<a\s+href="\/(?!legal)/g, '<a href="https://secretwaifu.com/')

const sanitizeImportedPolicyHtml = (contentHtml: string) =>
  applySecretWaifuBranding(
    decodePolicyHtml(
      rewritePolicyLinks(
        contentHtml
          .replace(/\sclass="[^"]*"/g, '')
          .replace(/\saria-hidden="true"/g, '')
          .replace(/\sid="[^"]*"/g, '')
          .replace(/<a href="#[^"]*"[^>]*><\/a>/g, '')
          .trim()
      )
    )
  )

const fetchImportedPolicyPage = async (url: string) => {
  const response = await fetch(url, { redirect: 'follow' })

  if (!response.ok) {
    throw new Error(`Unable to fetch policy page: ${url}`)
  }

  const html = await response.text()
  const revisionMatch = html.match(/<strong>Date of Revision:<\/strong>\s*([^<\n]+)/i)
  const proseStart = html.indexOf('<div class="prose prose-invert')

  if (proseStart < 0) {
    throw new Error(`Unable to parse policy page: ${url}`)
  }

  const contentStart = html.indexOf('>', proseStart) + 1
  const contentEnd = html.indexOf('</div>', contentStart)
  const contentHtml = html.slice(contentStart, contentEnd)

  return {
    contentHtml: sanitizeImportedPolicyHtml(contentHtml),
    revisionDate: revisionMatch ? decodePolicyHtml(revisionMatch[1].trim()) : null
  }
}

const defaultSeedPages: SeedPageDefinition[] = [
  {
    slug: 'legal',
    title: 'Legal Information',
    summary: 'Browse the imported legal and policy pages available on SecretWaifu.',
    metaTitle: 'Legal Information',
    metaDescription: 'Terms, privacy, cookies, content policies, and related legal information for SecretWaifu.',
    contentHtml: `
      <p>This legal hub collects the policy pages currently available on SecretWaifu.</p>
      <ul>
        <li><a href="/legal/terms-of-service">Terms of Service</a></li>
        <li><a href="/legal/privacy-notice">Privacy Notice</a></li>
        <li><a href="/legal/cookies-notice">Cookies Notice</a></li>
        <li><a href="/legal/underage-policy">Underage Policy</a></li>
        <li><a href="/legal/content-removal-policy">Content Removal Policy</a></li>
        <li><a href="/legal/blocked-content-policy">Blocked Content Policy</a></li>
        <li><a href="/legal/dmca-policy">DMCA Policy</a></li>
        <li><a href="/legal/complaint-policy">Complaint Policy</a></li>
        <li><a href="/legal/18-usc-2257-exemption">18 U.S.C. 2257 Exemption</a></li>
        <li><a href="/legal/community-guidelines">Community Guidelines</a></li>
        <li><a href="/legal/affiliate-terms-conditions">Affiliate Terms & Conditions</a></li>
      </ul>
    `,
    isPublished: true,
    showInFooter: true,
    footerLabel: 'Legal',
    sortOrder: 10
  },
  {
    slug: 'terms-of-service',
    title: 'Terms of Service',
    summary: 'Rules, eligibility, content, payments, and account terms.',
    metaTitle: 'Terms of Service',
    metaDescription: 'Read the Terms of Service for SecretWaifu.',
    sourceUrl: 'https://candy.ai/terms-of-service',
    contentFetcher: () => fetchImportedPolicyPage('https://candy.ai/terms-of-service'),
    isPublished: true,
    showInFooter: true,
    footerLabel: 'Terms',
    sortOrder: 20
  },
  {
    slug: 'privacy-notice',
    title: 'Privacy Notice',
    summary: 'How personal data is collected, used, and protected.',
    metaTitle: 'Privacy Notice',
    metaDescription: 'Read the Privacy Notice for SecretWaifu.',
    sourceUrl: 'https://candy.ai/privacy-policy',
    contentFetcher: () => fetchImportedPolicyPage('https://candy.ai/privacy-policy'),
    isPublished: true,
    showInFooter: true,
    footerLabel: 'Privacy',
    sortOrder: 30
  },
  {
    slug: 'cookies-notice',
    title: 'Cookies Notice',
    summary: 'Information about cookies and similar tracking technologies.',
    metaTitle: 'Cookies Notice',
    metaDescription: 'Read the Cookies Notice for SecretWaifu.',
    sourceUrl: 'https://candy.ai/cookies-policy',
    contentFetcher: () => fetchImportedPolicyPage('https://candy.ai/cookies-policy'),
    isPublished: true,
    showInFooter: true,
    footerLabel: 'Cookies',
    sortOrder: 40
  },
  {
    slug: 'underage-policy',
    title: 'Underage Policy',
    summary: 'Age-gating, moderation, and zero-tolerance protections for minors.',
    metaTitle: 'Underage Policy',
    metaDescription: 'Read the Underage Policy for SecretWaifu.',
    sourceUrl: 'https://candy.ai/underage-policy',
    contentFetcher: () => fetchImportedPolicyPage('https://candy.ai/underage-policy'),
    isPublished: true,
    showInFooter: true,
    footerLabel: 'Underage Policy',
    sortOrder: 50
  },
  {
    slug: 'content-removal-policy',
    title: 'Content Removal Policy',
    summary: 'How reported or violating content may be reviewed and removed.',
    metaTitle: 'Content Removal Policy',
    metaDescription: 'Read the Content Removal Policy for SecretWaifu.',
    sourceUrl: 'https://candy.ai/content-removal-policy',
    contentFetcher: () => fetchImportedPolicyPage('https://candy.ai/content-removal-policy'),
    isPublished: true,
    showInFooter: true,
    footerLabel: 'Content Removal',
    sortOrder: 60
  },
  {
    slug: 'blocked-content-policy',
    title: 'Blocked Content Policy',
    summary: 'Categories of prohibited content that are blocked or restricted.',
    metaTitle: 'Blocked Content Policy',
    metaDescription: 'Read the Blocked Content Policy for SecretWaifu.',
    sourceUrl: 'https://candy.ai/blocked-content-policy',
    contentFetcher: () => fetchImportedPolicyPage('https://candy.ai/blocked-content-policy'),
    isPublished: true,
    showInFooter: true,
    footerLabel: 'Blocked Content',
    sortOrder: 70
  },
  {
    slug: 'dmca-policy',
    title: 'DMCA Policy',
    summary: 'How copyright complaints and counter-notices are handled.',
    metaTitle: 'DMCA Policy',
    metaDescription: 'Read the DMCA Policy for SecretWaifu.',
    sourceUrl: 'https://candy.ai/dmca-policy',
    contentFetcher: () => fetchImportedPolicyPage('https://candy.ai/dmca-policy'),
    isPublished: true,
    showInFooter: true,
    footerLabel: 'DMCA',
    sortOrder: 80
  },
  {
    slug: 'complaint-policy',
    title: 'Complaint Policy',
    summary: 'How users can submit and escalate complaints.',
    metaTitle: 'Complaint Policy',
    metaDescription: 'Read the Complaint Policy for SecretWaifu.',
    sourceUrl: 'https://candy.ai/complaint-policy',
    contentFetcher: () => fetchImportedPolicyPage('https://candy.ai/complaint-policy'),
    isPublished: true,
    showInFooter: true,
    footerLabel: 'Complaints',
    sortOrder: 90
  },
  {
    slug: '18-usc-2257-exemption',
    title: '18 U.S.C. 2257 Exemption',
    summary: 'Statement regarding AI-generated content and record-keeping exemptions.',
    metaTitle: '18 U.S.C. 2257 Exemption',
    metaDescription: 'Read the 18 U.S.C. 2257 Exemption notice for SecretWaifu.',
    sourceUrl: 'https://candy.ai/usc-2257-exemption',
    contentFetcher: () => fetchImportedPolicyPage('https://candy.ai/usc-2257-exemption'),
    isPublished: true,
    showInFooter: true,
    footerLabel: '2257 Exemption',
    sortOrder: 100
  },
  {
    slug: 'community-guidelines',
    title: 'Community Guidelines',
    summary: 'Behavioral expectations, moderation, and prohibited conduct.',
    metaTitle: 'Community Guidelines',
    metaDescription: 'Read the Community Guidelines for SecretWaifu.',
    sourceUrl: 'https://candy.ai/community-guidelines',
    contentFetcher: () => fetchImportedPolicyPage('https://candy.ai/community-guidelines'),
    isPublished: true,
    showInFooter: true,
    footerLabel: 'Community Guidelines',
    sortOrder: 110
  },
  {
    slug: 'affiliate-terms-conditions',
    title: 'Affiliate Terms & Conditions',
    summary: 'Affiliate program terms currently available through SecretWaifu partner systems.',
    metaTitle: 'Affiliate Terms & Conditions',
    metaDescription: 'View affiliate terms and conditions links for SecretWaifu.',
    sourceUrl: 'https://candy.ai/affiliate-terms',
    contentHtml: `
      <p>SecretWaifu affiliate partnerships are subject to the active campaign terms, commission structure, fraud controls, traffic restrictions, and payout rules communicated for the current program.</p>
      <p>Affiliate partners must use approved promotional materials, comply with all applicable laws and platform policies, and avoid misleading, deceptive, or spam-based acquisition tactics.</p>
      <p>Program-specific operational terms can be published or updated here by the admin team whenever the affiliate setup changes.</p>
    `,
    isPublished: true,
    showInFooter: true,
    footerLabel: 'Affiliate Terms',
    sortOrder: 120
  }
]
const seedPageSlugSet = new Set(defaultSeedPages.map((page) => page.slug))

const synchronizeSeedPageBranding = async () => {
  const rows = await prisma.$queryRawUnsafe<StaticPageRow[]>(`
    SELECT "id", "slug", "title", "summary", "metaTitle", "metaDescription", "contentHtml", "sourceUrl", "revisionDate", "isPublished", "showInFooter", "footerLabel", "sortOrder", "createdAt", "updatedAt"
    FROM "StaticPages"
  `)

  for (const row of rows) {
    if (!seedPageSlugSet.has(row.slug)) {
      continue
    }

    const nextTitle = applySecretWaifuBranding(row.title)
    const nextSummary = applySecretWaifuBrandingToNullable(row.summary)
    const nextMetaTitle = applySecretWaifuBrandingToNullable(row.metaTitle)
    const nextMetaDescription = applySecretWaifuBrandingToNullable(row.metaDescription)
    const nextContentHtml = applySecretWaifuBranding(row.contentHtml)
    const nextFooterLabel = applySecretWaifuBrandingToNullable(row.footerLabel)

    const hasChanged =
      nextTitle !== row.title ||
      nextSummary !== row.summary ||
      nextMetaTitle !== row.metaTitle ||
      nextMetaDescription !== row.metaDescription ||
      nextContentHtml !== row.contentHtml ||
      nextFooterLabel !== row.footerLabel

    if (!hasChanged) {
      continue
    }

    await prisma.$executeRaw`
      UPDATE "StaticPages"
      SET
        "title" = ${nextTitle},
        "summary" = ${nextSummary},
        "metaTitle" = ${nextMetaTitle},
        "metaDescription" = ${nextMetaDescription},
        "contentHtml" = ${nextContentHtml},
        "footerLabel" = ${nextFooterLabel},
        "updatedAt" = ${staticPageTimestamp(new Date().toISOString())}
      WHERE "id" = ${row.id}
    `
  }
}

const seedDefaultStaticPages = async () => {
  const existingRows = await prisma.$queryRawUnsafe<Array<{ slug: string }>>(`SELECT "slug" FROM "StaticPages"`)
  const existingSlugs = new Set(existingRows.map((row) => row.slug))
  const nowIso = new Date().toISOString()

  for (const page of defaultSeedPages) {
    if (existingSlugs.has(page.slug)) {
      continue
    }

    let contentHtml = page.contentHtml?.trim() ?? ''
    let revisionDate = trimNullable(page.revisionDate)

    if (!contentHtml && page.contentFetcher) {
      try {
        const importedPage = await page.contentFetcher()
        contentHtml = importedPage.contentHtml
        revisionDate = trimNullable(importedPage.revisionDate ?? revisionDate)
      } catch (error) {
        console.error(`[static-pages] Failed to import seed page "${page.slug}"`, error)
      }
    }

    if (!contentHtml) {
      contentHtml = `<p>${page.title} is being prepared. Please check back soon.</p>`
    }

    await prisma.$executeRaw`
      INSERT INTO "StaticPages"
        ("id", "slug", "title", "summary", "metaTitle", "metaDescription", "contentHtml", "sourceUrl", "revisionDate", "isPublished", "showInFooter", "footerLabel", "sortOrder", "createdAt", "updatedAt")
      VALUES
        (${randomUUID()}, ${page.slug}, ${page.title}, ${trimNullable(page.summary)}, ${trimNullable(page.metaTitle)}, ${trimNullable(page.metaDescription)}, ${contentHtml}, ${trimNullable(page.sourceUrl)}, ${revisionDate}, ${page.isPublished !== false}, ${Boolean(page.showInFooter)}, ${trimNullable(page.footerLabel) ?? page.title}, ${page.sortOrder ?? 0}, ${staticPageTimestamp(nowIso)}, ${staticPageTimestamp(nowIso)})
    `
  }
}

const ensureStaticPages = async () => {
  if (staticPagesEnsured) {
    return
  }

  await seedDefaultStaticPages()
  await synchronizeSeedPageBranding()
  staticPagesEnsured = true
}

const listAdminStaticPages = async () => {
  await ensureStaticPages()

  const rows = await prisma.$queryRawUnsafe<StaticPageRow[]>(`
    SELECT "id", "slug", "title", "summary", "metaTitle", "metaDescription", "contentHtml", "sourceUrl", "revisionDate", "isPublished", "showInFooter", "footerLabel", "sortOrder", "createdAt", "updatedAt"
    FROM "StaticPages"
    ORDER BY "sortOrder" ASC, "title" ASC
  `)

  return rows.map(fromRow)
}

const getPublicStaticPageBySlug = async (slug: string) => {
  await ensureStaticPages()

  const rows = await prisma.$queryRawUnsafe<StaticPageRow[]>(
    `SELECT "id", "slug", "title", "summary", "metaTitle", "metaDescription", "contentHtml", "sourceUrl", "revisionDate", "isPublished", "showInFooter", "footerLabel", "sortOrder", "createdAt", "updatedAt"
     FROM "StaticPages"
     WHERE "slug" = $1 AND "isPublished" = TRUE
     LIMIT 1`,
    normalizeSlug(slug)
  )

  return rows[0] ? fromRow(rows[0]) : null
}

const getFooterStaticPages = async () => {
  await ensureStaticPages()

  const rows = await prisma.$queryRawUnsafe<StaticPageRow[]>(`
    SELECT "id", "slug", "title", "summary", "metaTitle", "metaDescription", "contentHtml", "sourceUrl", "revisionDate", "isPublished", "showInFooter", "footerLabel", "sortOrder", "createdAt", "updatedAt"
    FROM "StaticPages"
    WHERE "isPublished" = TRUE AND "showInFooter" = TRUE
    ORDER BY "sortOrder" ASC, "title" ASC
  `)

  return rows.map(fromRow)
}

const getAdminStaticPageById = async (id: string) => {
  await ensureStaticPages()

  const rows = await prisma.$queryRawUnsafe<StaticPageRow[]>(
    `SELECT "id", "slug", "title", "summary", "metaTitle", "metaDescription", "contentHtml", "sourceUrl", "revisionDate", "isPublished", "showInFooter", "footerLabel", "sortOrder", "createdAt", "updatedAt"
     FROM "StaticPages"
     WHERE "id" = $1
     LIMIT 1`,
    id.trim()
  )

  return rows[0] ? fromRow(rows[0]) : null
}

const createStaticPage = async (input: CreateStaticPageInput) => {
  await ensureStaticPages()

  const nowIso = new Date().toISOString()
  const slug = normalizeSlug(input.slug)

  await prisma.$executeRaw`
    INSERT INTO "StaticPages"
      ("id", "slug", "title", "summary", "metaTitle", "metaDescription", "contentHtml", "sourceUrl", "revisionDate", "isPublished", "showInFooter", "footerLabel", "sortOrder", "createdAt", "updatedAt")
    VALUES
      (${randomUUID()}, ${slug}, ${input.title.trim()}, ${trimNullable(input.summary)}, ${trimNullable(input.metaTitle)}, ${trimNullable(input.metaDescription)}, ${input.contentHtml.trim()}, ${trimNullable(input.sourceUrl)}, ${trimNullable(input.revisionDate)}, ${input.isPublished !== false}, ${Boolean(input.showInFooter)}, ${trimNullable(input.footerLabel) ?? input.title.trim()}, ${input.sortOrder ?? 0}, ${staticPageTimestamp(nowIso)}, ${staticPageTimestamp(nowIso)})
  `

  const createdRows = await prisma.$queryRawUnsafe<StaticPageRow[]>(
    `SELECT "id", "slug", "title", "summary", "metaTitle", "metaDescription", "contentHtml", "sourceUrl", "revisionDate", "isPublished", "showInFooter", "footerLabel", "sortOrder", "createdAt", "updatedAt"
     FROM "StaticPages"
     WHERE "slug" = $1
     LIMIT 1`,
    slug
  )

  return fromRow(createdRows[0])
}

const updateStaticPage = async (id: string, input: UpdateStaticPageInput) => {
  const existingPage = await getAdminStaticPageById(id)

  if (!existingPage) {
    return null
  }

  const nextSlug = input.slug ? normalizeSlug(input.slug) : existingPage.slug
  const nextTitle = input.title?.trim() || existingPage.title
  const nowIso = new Date().toISOString()

  await prisma.$executeRaw`
    UPDATE "StaticPages"
    SET
      "slug" = ${nextSlug},
      "title" = ${nextTitle},
      "summary" = ${input.summary !== undefined ? trimNullable(input.summary) : existingPage.summary},
      "metaTitle" = ${input.metaTitle !== undefined ? trimNullable(input.metaTitle) : existingPage.metaTitle},
      "metaDescription" = ${input.metaDescription !== undefined ? trimNullable(input.metaDescription) : existingPage.metaDescription},
      "contentHtml" = ${input.contentHtml !== undefined ? input.contentHtml.trim() : existingPage.contentHtml},
      "sourceUrl" = ${input.sourceUrl !== undefined ? trimNullable(input.sourceUrl) : existingPage.sourceUrl},
      "revisionDate" = ${input.revisionDate !== undefined ? trimNullable(input.revisionDate) : existingPage.revisionDate},
      "isPublished" = ${input.isPublished !== undefined ? input.isPublished : existingPage.isPublished},
      "showInFooter" = ${input.showInFooter !== undefined ? input.showInFooter : existingPage.showInFooter},
      "footerLabel" = ${input.footerLabel !== undefined ? trimNullable(input.footerLabel) ?? nextTitle : existingPage.footerLabel},
      "sortOrder" = ${input.sortOrder !== undefined ? input.sortOrder : existingPage.sortOrder},
      "updatedAt" = ${staticPageTimestamp(nowIso)}
    WHERE "id" = ${existingPage.id}
  `

  const updatedPage = await getAdminStaticPageById(existingPage.id)
  return updatedPage
}

export {
  createStaticPage,
  ensureStaticPages,
  getAdminStaticPageById,
  getFooterStaticPages,
  getPublicStaticPageBySlug,
  listAdminStaticPages,
  normalizeSlug,
  updateStaticPage
}
export type { CreateStaticPageInput, StaticPageRecord, UpdateStaticPageInput }
