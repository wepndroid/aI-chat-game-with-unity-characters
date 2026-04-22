const AI_GIRLFRIEND_ROUTE_BASE = '/ai-girlfriends'

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value).trim()
  } catch {
    return value.trim()
  }
}

const slugifyRouteSegment = (value: string) => {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const buildAiGirlfriendRouteKey = (name: string, id: string) => {
  const trimmedId = id.trim()
  const trimmedName = slugifyRouteSegment(name)

  if (!trimmedName) {
    return trimmedId
  }

  return `${trimmedName}-${trimmedId}`
}

const extractAiGirlfriendIdFromRouteKey = (value: string) => {
  const decoded = safeDecode(value)
  const lastDashIndex = decoded.lastIndexOf('-')

  if (lastDashIndex <= 0) {
    return decoded
  }

  return decoded.slice(lastDashIndex + 1)
}

const buildAiGirlfriendRouteHref = (name: string, id: string) => {
  return `${AI_GIRLFRIEND_ROUTE_BASE}/${encodeURIComponent(buildAiGirlfriendRouteKey(name, id))}`
}

export {
  AI_GIRLFRIEND_ROUTE_BASE,
  buildAiGirlfriendRouteHref,
  buildAiGirlfriendRouteKey,
  extractAiGirlfriendIdFromRouteKey
}
