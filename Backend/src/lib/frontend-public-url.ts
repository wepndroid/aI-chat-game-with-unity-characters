const localFrontendPublicUrl = 'http://127.0.0.1:7000'

const normalizeFrontendPublicUrl = (value: string) => value.trim().replace(/\/+$/, '')

const resolveFrontendPublicUrl = (purpose: string) => {
  const configured = process.env.FRONTEND_URL?.trim()

  if (configured) {
    return normalizeFrontendPublicUrl(configured)
  }

  if (process.env.NODE_ENV === 'production') {
    console.error(`[config] FRONTEND_URL is required for ${purpose}. Localhost fallback is disabled in production.`)
    return null
  }

  return localFrontendPublicUrl
}

const buildFrontendPublicUrl = (pathOrUrl: string, purpose: string) => {
  const frontendPublicUrl = resolveFrontendPublicUrl(purpose)

  if (!frontendPublicUrl) {
    return null
  }

  try {
    return new URL(pathOrUrl, `${frontendPublicUrl}/`).toString()
  } catch {
    return `${frontendPublicUrl}${pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`}`
  }
}

export { buildFrontendPublicUrl, resolveFrontendPublicUrl }
