export class ApiError extends Error {
  code: string
  status: number

  constructor(message: string, code = 'ERROR', status = 500) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

interface ErrorPayload {
  error?: { code?: string; message?: string }
}

export async function apiFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const response = await fetch(url, {
    ...init,
    headers,
    cache: 'no-store',
  })
  const text = await response.text()
  let parsed: unknown = null
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = null
    }
  }
  if (!response.ok) {
    const payload = parsed as ErrorPayload | null
    throw new ApiError(
      payload?.error?.message || `请求失败（HTTP ${response.status}）`,
      payload?.error?.code || 'HTTP_ERROR',
      response.status,
    )
  }
  return parsed as T
}

export function apiGet<T>(url: string): Promise<T> {
  return apiFetch<T>(url)
}

export function apiPost<T>(url: string, body?: unknown): Promise<T> {
  return apiFetch<T>(url, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export function apiPatch<T>(url: string, body: unknown): Promise<T> {
  return apiFetch<T>(url, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export function apiDelete<T>(url: string): Promise<T> {
  return apiFetch<T>(url, { method: 'DELETE' })
}
