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

const apiGet = async <T>(path: string, init?: Pick<RequestInit, 'cache'>) => {
  const requestSignal = createRequestSignal()

  try {
    const response = await fetch(buildApiUrl(path), {
      method: 'GET',
      credentials: 'include',
      ...init,
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

type ApiPostOptions = Pick<RequestInit, 'cache'> & {
  timeoutMs?: number
}

const resolveApiPostOptions = (options: number | ApiPostOptions = API_REQUEST_TIMEOUT_MS): ApiPostOptions => {
  return typeof options === 'number' ? { timeoutMs: options } : options
}

const apiPost = async <T>(path: string, body?: unknown, options: number | ApiPostOptions = API_REQUEST_TIMEOUT_MS) => {
  const resolvedOptions = resolveApiPostOptions(options)
  const requestSignal = createRequestSignalWithTimeout(resolvedOptions.timeoutMs ?? API_REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(buildApiUrl(path), {
      method: 'POST',
      credentials: 'include',
      cache: resolvedOptions.cache,
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

const apiPostFormDataWithProgress = async <T>(
  path: string,
  formData: FormData,
  options?: {
    timeoutMs?: number
    onProgress?: (progress: { loaded: number; total: number | null; percent: number | null }) => void
  }
) => {
  const timeoutMs = options?.timeoutMs ?? 120000

  return await new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const timeoutId = window.setTimeout(() => {
      xhr.abort()
    }, timeoutMs)

    xhr.open('POST', buildApiUrl(path))
    xhr.withCredentials = true

    xhr.upload.onprogress = (event) => {
      if (!options?.onProgress) {
        return
      }

      const total = event.lengthComputable ? event.total : null
      const percent = total && total > 0 ? Math.min(100, Math.max(0, (event.loaded / total) * 100)) : null
      options.onProgress({
        loaded: event.loaded,
        total,
        percent
      })
    }

    xhr.onerror = () => {
      clearTimeout(timeoutId)
      reject(new Error('Network request failed.'))
    }

    xhr.onabort = () => {
      clearTimeout(timeoutId)
      reject(new Error('Request timed out. Please try again.'))
    }

    xhr.onload = async () => {
      clearTimeout(timeoutId)

      try {
        const text = xhr.responseText
        const payload = (text ? JSON.parse(text) : null) as (T & ApiErrorPayload) | null

        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new ApiRequestError(payload?.message ?? 'API request failed.', xhr.status, payload?.code, payload?.field))
          return
        }

        if (!payload) {
          reject(new Error('API returned an empty response payload.'))
          return
        }

        resolve(payload)
      } catch (error) {
        reject(error instanceof Error ? error : new Error('API request failed.'))
      }
    }

    xhr.send(formData)
  }).catch((error) => {
    if (error instanceof ApiRequestError) {
      throw error
    }
    throw new Error(toNetworkErrorMessage(error))
  })
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

const apiPut = async <T>(path: string, body?: unknown) => {
  const requestSignal = createRequestSignal()

  try {
    const response = await fetch(buildApiUrl(path), {
      method: 'PUT',
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

export { ApiRequestError, apiDelete, apiGet, apiPatch, apiPost, apiPostFormData, apiPostFormDataWithProgress, apiPut, buildApiUrl, getApiBaseUrl }
