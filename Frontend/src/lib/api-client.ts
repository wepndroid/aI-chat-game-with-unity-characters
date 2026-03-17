type ApiErrorPayload = {
  message?: string
}

const getApiBaseUrl = () => {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000/api'
}

const buildApiUrl = (path: string) => {
  const baseUrl = getApiBaseUrl().replace(/\/+$/, '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${baseUrl}${normalizedPath}`
}

const parseApiResponse = async <T>(response: Response): Promise<T> => {
  const payload = (await response.json().catch(() => null)) as (T & ApiErrorPayload) | null

  if (!response.ok) {
    throw new Error(payload?.message ?? 'API request failed.')
  }

  if (!payload) {
    throw new Error('API returned an empty response payload.')
  }

  return payload
}

const apiGet = async <T>(path: string) => {
  const response = await fetch(buildApiUrl(path), {
    method: 'GET',
    credentials: 'include'
  })

  return parseApiResponse<T>(response)
}

const apiPost = async <T>(path: string, body?: unknown) => {
  const response = await fetch(buildApiUrl(path), {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  })

  return parseApiResponse<T>(response)
}

export { apiGet, apiPost, buildApiUrl, getApiBaseUrl }
