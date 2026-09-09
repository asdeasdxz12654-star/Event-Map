import { useEffect, useState } from 'react'

const BASE = import.meta.env.VITE_ADMIN_API_URL || 'https://event-map-api-proxy.asdeasdxz12654.workers.dev'
const REFRESH_MS = 5 * 60 * 1000 // 서울시 쪽 갱신 주기(대략 5분)에 맞춤

// 서울시 실시간 도시데이터를 api-proxy Worker 경유로 가져온다. placeName이 없거나
// "서울시 주요 120장소"에 없는 곳이면 null을 반환한다 — 이땐 호출한 쪽에서
// 기존 crowd_level 추정치로 대체 표시하면 된다.
export function useSeoulCongestion(placeName) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(!!placeName)

  useEffect(() => {
    if (!placeName) {
      setData(null)
      setError(null)
      setLoading(false)
      return
    }

    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const res = await fetch(`${BASE}/seoul-congestion?place=${encodeURIComponent(placeName)}`)
        const body = await res.json()
        if (cancelled) return
        if (!res.ok) {
          setError(body.error ?? 'error')
          setData(null)
        } else {
          setData(body)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    const interval = setInterval(load, REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [placeName])

  return { data, error, loading }
}
