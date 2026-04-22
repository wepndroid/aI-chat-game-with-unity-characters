type ApiErrorPayload = {
  message?: string
  code?: string
  field?: string
}

class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly field?: string
  ) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

const API_REQUEST_TIMEOUT_MS = 15000

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
    throw new ApiRequestError(
      payload?.message ?? 'API request failed.',
      response.status,
      payload?.code,
      payload?.field
    )
  }

  if (!payload) {
    throw new Error('API returned an empty response payload.')
  }

  return payload
}

const createRequestSignal = () => {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => {
    controller.abort()
  }, API_REQUEST_TIMEOUT_MS)

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeoutId)
  }
}

const toNetworkErrorMessage = (error: unknown) => {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'Request timed out. Please try again.'
  }

  return error instanceof Error ? error.message : 'Network request failed.'
}

const apiGet = async <T>(path: string) => {
  const requestSignal = createRequestSignal()

  try {
    const response = await fetch(buildApiUrl(path), {
      method: 'GET',
      credentials: 'include',
      signal: requestSignal.signal
    })

    return parseApiResponse<T>(response)
  } catch (error) {
    if (error instanceof ApiRequestError) {
      throw error
    }
    throw new Error(toNetworkErrorMessage(error))
  } finally {
    requestSignal.clear()
  }
}

const createRequestSignalWithTimeout = (timeoutMs = API_REQUEST_TIMEOUT_MS) => {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => {
    controller.abort()
  }, timeoutMs)

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeoutId)
  }
}

const apiPost = async <T>(path: string, body?: unknown, timeoutMs = API_REQUEST_TIMEOUT_MS) => {
  const requestSignal = createRequestSignalWithTimeout(timeoutMs)

  try {
    const response = await fetch(buildApiUrl(path), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: requestSignal.signal
    })

    return parseApiResponse<T>(response)
  } catch (error) {
    if (error instanceof ApiRequestError) {
      throw error
    }
    throw new Error(toNetworkErrorMessage(error))
  } finally {
    requestSignal.clear()
  }
}

const apiPostFormData = async <T>(path: string, formData: FormData, timeoutMs = 120000) => {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => {
    controller.abort()
  }, timeoutMs)

  try {
    const response = await fetch(buildApiUrl(path), {
      method: 'POST',
      credentials: 'include',
      body: formData,
      signal: controller.signal
    })

    return parseApiResponse<T>(response)
  } catch (error) {
    if (error instanceof ApiRequestError) {
      throw error
    }
    throw new Error(toNetworkErrorMessage(error))
  } finally {
    clearTimeout(timeoutId)
  }
}

const apiPatch = async <T>(path: string, body?: unknown) => {
  const requestSignal = createRequestSignal()

  try {
    const response = await fetch(buildApiUrl(path), {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: requestSignal.signal
    })

    return parseApiResponse<T>(response)
  } catch (error) {
    if (error instanceof ApiRequestError) {
      throw error
    }
    throw new Error(toNetworkErrorMessage(error))
  } finally {
    requestSignal.clear()
  }
}

const apiDelete = async <T>(path: string) => {
  const requestSignal = createRequestSignal()

  try {
    const response = await fetch(buildApiUrl(path), {
      method: 'DELETE',
      credentials: 'include',
      signal: requestSignal.signal
    })

    return parseApiResponse<T>(response)
  } catch (error) {
    if (error instanceof ApiRequestError) {
      throw error
    }
    throw new Error(toNetworkErrorMessage(error))
  } finally {
    requestSignal.clear()
  }
}

export { ApiRequestError, apiDelete, apiGet, apiPatch, apiPost, apiPostFormData, buildApiUrl, getApiBaseUrl }
