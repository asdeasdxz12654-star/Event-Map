// OpenStreetMap Nominatim으로 행사장 좌표(위/경도)를 조회한다.
// API 키 없이 무료로 사용 가능. 이용 정책: User-Agent 필수, 초당 1건 이하.
// 결과가 없거나 한국 좌표 범위를 벗어나면 null 반환.

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const USER_AGENT = 'EventMapCrawler/1.0 (https://github.com/asdeasdxz12654-star/Event-Map)'

function isValidKoreaCoord(lat, lng) {
  return lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132
}

export async function lookupVenueCoords(venue, address) {
  // 주소를 우선 사용, 없으면 장소명으로 검색
  const queries = [address, venue].filter(Boolean)
  if (queries.length === 0) return null

  for (const query of queries) {
    try {
      const url = new URL(NOMINATIM_URL)
      url.searchParams.set('q', query)
      url.searchParams.set('format', 'json')
      url.searchParams.set('limit', '1')
      url.searchParams.set('countrycodes', 'kr')

      const res = await fetch(url.toString(), {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(5_000),
      })
      if (!res.ok) {
        console.warn(`  [지오코딩] HTTP ${res.status}`)
        continue
      }

      const data = await res.json()
      const item = data[0]
      if (!item) continue

      const lat = parseFloat(item.lat)
      const lng = parseFloat(item.lon)

      if (!isValidKoreaCoord(lat, lng)) {
        console.warn(`  [지오코딩] 좌표 범위 이상 (${lat}, ${lng}), 다음 쿼리 시도`)
        continue
      }

      return { lat, lng }
    } catch (err) {
      console.warn(`  [지오코딩] 조회 실패: ${err.message}`)
    }
  }

  return null
}
