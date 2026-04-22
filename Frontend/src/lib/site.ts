const DEFAULT_SITE_URL = 'http://localhost:7000'

const normalizeSiteUrl = (value?: string | null) => {
  const trimmedValue = value?.trim()

  if (!trimmedValue) {
    return DEFAULT_SITE_URL
  }

  try {
    return new URL(trimmedValue).toString().replace(/\/+$/, '')
  } catch {
    return DEFAULT_SITE_URL
  }
}

const siteUrl = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL)
const siteMetadataBase = new URL(siteUrl)

const absoluteUrl = (path = '/') => {
  return new URL(path, siteMetadataBase).toString()
}

export { absoluteUrl, siteMetadataBase, siteUrl }
