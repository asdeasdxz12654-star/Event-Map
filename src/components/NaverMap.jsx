import { useEffect, useRef, useState } from 'react'

const CLIENT_ID = import.meta.env.VITE_NAVER_MAPS_CLIENT_ID ?? '1whplxsqes'

// 모듈 스코프에서 스크립트 로딩 상태를 관리 — 여러 컴포넌트가 중복 로드하지 않도록
let scriptState = 'idle' // 'idle' | 'loading' | 'ready' | 'error'
const pending = []

function loadScript(cb) {
  if (scriptState === 'ready') { cb(null); return }
  if (scriptState === 'error') { cb(new Error('failed')); return }
  pending.push(cb)
  if (scriptState === 'loading') return
  scriptState = 'loading'
  const s = document.createElement('script')
  s.src = `https://openapi.map.naver.com/openapi/v3/maps.js?ncpClientId=${CLIENT_ID}`
  s.onload = () => { scriptState = 'ready'; pending.splice(0).forEach(fn => fn(null)) }
  s.onerror = () => { scriptState = 'error'; pending.splice(0).forEach(fn => fn(new Error('failed'))) }
  document.head.appendChild(s)
}

export default function NaverMap({ lat, lng, venueName, linkUrl }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const [ready, setReady] = useState(scriptState === 'ready')
  const [failed, setFailed] = useState(scriptState === 'error')

  useEffect(() => {
    if (ready || failed) return
    loadScript(err => (err ? setFailed(true) : setReady(true)))
  }, [])

  useEffect(() => {
    if (!ready || !containerRef.current) return
    const nv = window.naver?.maps
    if (!nv) return

    mapRef.current?.destroy()
    const center = new nv.LatLng(lat, lng)
    const map = new nv.Map(containerRef.current, {
      center,
      zoom: 16,
      zoomControl: false,
      mapTypeControl: false,
      scaleControl: false,
      mapDataControl: false,
    })
    new nv.Marker({ position: center, map, title: venueName })
    mapRef.current = map

    return () => { mapRef.current?.destroy(); mapRef.current = null }
  }, [ready, lat, lng, venueName])

  if (failed) {
    return (
      <a
        href={linkUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center w-full h-[220px] bg-zinc-800/60 hover:bg-zinc-700/60 transition-colors group"
      >
        <div className="text-center">
          <div className="text-3xl mb-2">🗺</div>
          <span className="text-xs text-zinc-400 group-hover:text-white transition-colors">
            네이버 지도에서 보기 →
          </span>
        </div>
      </a>
    )
  }

  return (
    <div className="relative">
      {!ready && (
        <div className="absolute inset-0 bg-zinc-800 flex items-center justify-center z-10">
          <span className="text-zinc-500 text-xs animate-pulse">지도 불러오는 중...</span>
        </div>
      )}
      <div ref={containerRef} className="w-full h-[220px]" />
      {linkUrl && (
        <a
          href={linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute bottom-2 right-2 text-xs bg-black/60 hover:bg-black/80 text-white px-2.5 py-1 rounded-full transition-colors pointer-events-auto"
        >
          네이버 지도에서 보기 →
        </a>
      )}
    </div>
  )
}
