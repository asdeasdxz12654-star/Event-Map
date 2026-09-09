import { useEffect, useState } from 'react'

// 대중교통 길찾기 버튼(네이버·구글).
//
// 예전엔 네이버 링크가 `directions/-/-/{목적지}/transit` 형태였는데, 네이버의 경로 URL은
// `directions/{출발}/{도착}/{경유}/{수단}` 순서라서 목적지를 "경유지" 칸에 넣은 꼴이었다.
// 그래서 출발지도 도착지도 비어 있는 화면이 열렸다. 도착지를 제 자리(두 번째)에 넣고,
// 값 순서도 네이버 규격(경도,위도,이름)에 맞춘다.
//
// 출발지는 브라우저 위치 권한이 이미 허용돼 있으면 조용히 채워 넣어서 누르는 즉시
// 출발↔도착이 모두 찍힌 경로가 열리게 한다. 아직 안 물어본 상태면 "내 위치에서 출발"
// 버튼을 눌렀을 때만 권한을 요청한다 — 지도 링크를 누르는 순간 새 탭에서 권한 팝업이
// 뜨면 사용자가 빈 탭만 보게 되기 때문에, 권한 요청은 이 페이지 안에서 끝낸다.

const GEO_OPTIONS = { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 }

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('unsupported')); return }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      err => reject(err),
      GEO_OPTIONS
    )
  })
}

export default function DirectionsButtons({ lat, lng, placeName, fallbackQuery }) {
  const hasCoords = lat != null && lng != null
  const [origin, setOrigin] = useState(null)
  // Permissions API가 없는 브라우저(구형 사파리 등)는 상태를 미리 알 수 없으니
  // 처음부터 "내 위치에서 출발" 버튼을 띄워 사용자가 직접 고르게 한다.
  const [canAsk, setCanAsk] = useState(
    () => typeof navigator !== 'undefined' && !!navigator.geolocation && !navigator.permissions?.query
  )
  const [asking, setAsking] = useState(false)

  // 이미 허용된 상태면 프롬프트 없이 바로 좌표를 받아둔다.
  useEffect(() => {
    let cancelled = false
    if (!navigator.geolocation || !navigator.permissions?.query) return

    navigator.permissions.query({ name: 'geolocation' })
      .then(status => {
        if (cancelled) return
        if (status.state === 'granted') {
          getPosition().then(p => { if (!cancelled) setOrigin(p) }).catch(() => {})
        } else if (status.state === 'prompt') {
          setCanAsk(true)
        }
      })
      .catch(() => { if (!cancelled) setCanAsk(true) })

    return () => { cancelled = true }
  }, [])

  const askLocation = async () => {
    setAsking(true)
    try {
      setOrigin(await getPosition())
      setCanAsk(false)
    } catch {
      setCanAsk(false) // 거부했으면 다시 조르지 않는다
    } finally {
      setAsking(false)
    }
  }

  // 네이버: /directions/{출발}/{도착}/{경유}/{수단}, 각 지점은 "경도,위도,이름"
  const naverUrl = (() => {
    if (!hasCoords) return `https://map.naver.com/v5/search/${encodeURIComponent(fallbackQuery)}`
    const goal = `${lng},${lat},${encodeURIComponent(placeName)}`
    const start = origin ? `${origin.lng},${origin.lat},${encodeURIComponent('내 위치')}` : '-'
    return `https://map.naver.com/v5/directions/${start}/${goal}/-/transit`
  })()

  // 구글: origin을 비워두면 앱이 알아서 현재 위치를 출발지로 잡는다.
  const googleUrl = (() => {
    const params = new URLSearchParams({
      api: '1',
      destination: hasCoords ? `${lat},${lng}` : fallbackQuery,
      travelmode: 'transit',
    })
    if (origin) params.set('origin', `${origin.lat},${origin.lng}`)
    return `https://www.google.com/maps/dir/?${params.toString()}`
  })()

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <p className="text-xs text-zinc-400">대중교통 길찾기</p>
        {origin ? (
          <span className="text-xs text-emerald-400">📍 내 위치에서 출발</span>
        ) : canAsk ? (
          <button
            onClick={askLocation}
            disabled={asking}
            className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
          >
            {asking ? '위치 확인 중...' : '📍 내 위치에서 출발'}
          </button>
        ) : null}
      </div>
      <div className="flex gap-2">
        <a
          href={naverUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 py-2.5 bg-green-700/80 hover:bg-green-700 text-white text-sm font-medium rounded-xl text-center transition-colors"
        >
          🚇 네이버
        </a>
        <a
          href={googleUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 py-2.5 bg-blue-600/80 hover:bg-blue-600 text-white text-sm font-medium rounded-xl text-center transition-colors"
        >
          🗺 구글 맵
        </a>
      </div>
    </div>
  )
}
