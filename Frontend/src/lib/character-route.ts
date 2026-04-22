const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value).trim()
  } catch {
    return value.trim()
  }
}

const buildCharacterRouteKey = (id: string, slug?: string | null) => {
  const trimmedId = id.trim()
  const trimmedSlug = slug?.trim()
  if (!trimmedSlug) {
    return trimmedId
  }
  return `${trimmedId}-${trimmedSlug}`
}

const extractCharacterIdFromRouteKey = (value: string) => {
  const decoded = safeDecode(value)
  const firstDashIndex = decoded.indexOf('-')
  if (firstDashIndex <= 0) {
    return decoded
  }
  return decoded.slice(0, firstDashIndex)
}

export { buildCharacterRouteKey, extractCharacterIdFromRouteKey, safeDecode as decodeCharacterRouteKey }
