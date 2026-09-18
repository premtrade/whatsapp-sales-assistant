import { useEffect, useState, useCallback } from 'react'

export function useRealtime(
  handlers: Record<string, (data: any) => void>
) {
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('auth_token')
    if (!token) return

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${proto}//${window.location.host}/ws?token=${encodeURIComponent(token)}`)

    ws.onopen = () => {
      setConnected(true)
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        const handler = handlers[data.type]
        if (handler) handler(data)
      } catch {}
    }

    ws.onclose = () => setConnected(false)
    ws.onerror = () => setConnected(false)

    return () => ws.close()
  }, [handlers])

  return { connected }
}

export function useSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const search = useCallback(async (q: string) => {
    setQuery(q)
    if (!q.trim()) { setResults([]); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/contacts/search?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')?.replace(/^jwt:/, '')}` }
      })
      if (res.ok) {
        const data = await res.json()
        setResults(data.data || [])
      }
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  return { query, results, loading, search }
}
