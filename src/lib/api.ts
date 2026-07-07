import { useState, useEffect, useCallback } from 'react'

export async function apiFetch<T = unknown>(
  url: string,
  options?: RequestInit & { json?: unknown },
): Promise<T> {
  const opts: RequestInit = {
    credentials: 'include',
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  }
  if (options?.json !== undefined) {
    opts.body = JSON.stringify(options.json)
    opts.method = opts.method || 'POST'
  }
  const res = await fetch(url, opts)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as any).error || `HTTP ${res.status}`)
  return data as T
}

export function useData<T>(url: string) {
  const [data,    setData]    = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const reload = useCallback(() => {
    setLoading(true)
    setError(null)
    apiFetch<T>(url)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [url])

  useEffect(() => { reload() }, [reload])

  return { data, loading, error, reload, setData }
}
