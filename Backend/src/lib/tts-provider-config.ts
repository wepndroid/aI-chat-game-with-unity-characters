const PROVIDER_TTS_WS_SUFFIX = '/tts/ws'

const readTtsProviderBearerToken = () =>
  process.env.CHAT_TTS_API_BEARER_TOKEN?.trim() ||
  process.env.CHAT_TTS_BEARER_TOKEN?.trim() ||
  process.env.CHAT_TTS_WEBHOOK_BEARER_TOKEN?.trim() ||
  null

const getTtsProviderWsUrl = () => process.env.CHAT_TTS_PROVIDER_WS_URL?.trim() ?? ''

const getTtsProviderHttpBaseUrl = () => {
  const configured = process.env.CHAT_TTS_PROVIDER_HTTP_BASE_URL?.trim().replace(/\/+$/, '')
  if (configured) {
    return configured
  }

  const providerWsUrl = getTtsProviderWsUrl()
  if (!providerWsUrl) {
    return ''
  }

  try {
    const parsed = new URL(providerWsUrl)
    parsed.protocol = parsed.protocol === 'wss:' ? 'https:' : 'http:'

    const normalizedPathname = parsed.pathname.replace(/\/+$/, '')
    parsed.pathname = normalizedPathname.endsWith(PROVIDER_TTS_WS_SUFFIX)
      ? normalizedPathname.slice(0, -PROVIDER_TTS_WS_SUFFIX.length) || '/'
      : normalizedPathname
    parsed.search = ''
    parsed.hash = ''

    return parsed.toString().replace(/\/+$/, '')
  } catch {
    return ''
  }
}

const buildTtsProviderHttpUrl = (pathSuffix: string) => {
  const baseUrl = getTtsProviderHttpBaseUrl()
  if (!baseUrl) {
    return null
  }

  return `${baseUrl.replace(/\/+$/, '')}/${pathSuffix.replace(/^\/+/, '')}`
}

export { buildTtsProviderHttpUrl, getTtsProviderHttpBaseUrl, getTtsProviderWsUrl, readTtsProviderBearerToken }
