import { Router } from 'express'
import { z } from 'zod'
import { requireAdmin } from '../middleware/auth-middleware'
import {
  createStaticPage,
  getFooterStaticPages,
  getPublicStaticPageBySlug,
  listAdminStaticPages,
  updateStaticPage
} from '../services/static-page-service'

const staticPageRoutes = Router()

const adminStaticPageSchema = z
  .object({
    slug: z.string().trim().min(1).max(120),
    title: z.string().trim().min(1).max(180),
    summary: z.string().trim().max(400).nullable().optional(),
    metaTitle: z.string().trim().max(180).nullable().optional(),
    metaDescription: z.string().trim().max(300).nullable().optional(),
    contentHtml: z.string().trim().min(1),
    sourceUrl: z.string().trim().url().nullable().optional(),
    revisionDate: z.string().trim().max(80).nullable().optional(),
    isPublished: z.boolean().optional(),
    showInFooter: z.boolean().optional(),
    footerLabel: z.string().trim().max(120).nullable().optional(),
    sortOrder: z.number().int().min(0).max(10000).optional()
  })
  .strict()

staticPageRoutes.get('/static-pages/footer', async (_request, response, next) => {
  try {
    const pages = await getFooterStaticPages()
    response.json({
      data: pages.map((page) => ({
        slug: page.slug,
        title: page.title,
        footerLabel: page.footerLabel ?? page.title,
        sortOrder: page.sortOrder
      }))
    })
  } catch (error) {
    next(error)
  }
})

staticPageRoutes.get('/static-pages/:slug', async (request, response, next) => {
  try {
    const params = z.object({ slug: z.string().trim().min(1).max(120) }).parse(request.params)
    const page = await getPublicStaticPageBySlug(params.slug)

    if (!page) {
      response.status(404).json({
        message: 'Static page not found.'
      })
      return
    }

    response.json({
      data: page
    })
  } catch (error) {
    next(error)
  }
})

staticPageRoutes.get('/admin/static-pages', requireAdmin, async (_request, response, next) => {
  try {
    const pages = await listAdminStaticPages()
    response.json({
      data: pages
    })
  } catch (error) {
    next(error)
  }
})

staticPageRoutes.post('/admin/static-pages', requireAdmin, async (request, response, next) => {
  try {
    const payload = adminStaticPageSchema.parse(request.body)
    const createdPage = await createStaticPage(payload)
    response.status(201).json({
      data: createdPage
    })
  } catch (error) {
    next(error)
  }
})

staticPageRoutes.patch('/admin/static-pages/:id', requireAdmin, async (request, response, next) => {
  try {
    const params = z.object({ id: z.string().trim().min(1) }).parse(request.params)
    const payload = adminStaticPageSchema.partial().parse(request.body)
    const updatedPage = await updateStaticPage(params.id, payload)

    if (!updatedPage) {
      response.status(404).json({
        message: 'Static page not found.'
      })
      return
    }

    response.json({
      data: updatedPage
    })
  } catch (error) {
    next(error)
  }
})

export default staticPageRoutes
