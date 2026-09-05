// 네이버 지역 검색 API로 행사장 좌표(위/경도)를 조회한다.
// 환경변수: NAVER_CLIENT_ID, NAVER_CLIENT_SECRET (naver.mjs와 동일한 API Hub 키)
//
// 응답의 mapx/mapy는 WGS84 경도·위도 × 10^4 값이다.
//   예) 인사동: mapx=1269893, mapy=375404 → lng=126.9893, lat=37.5404
// venue + venue_address를 합쳐서 검색하고 첫 번째 결과를 사용한다.
// 키가 없거나 결과가 없으면 null을 반환하며, 오류 시에도 크롤러를 멈추지 않는다.

const NAVER_LOCAL_URL = 'https://naverapihub.apigw.ntruss.com/search/v1/local'

function toDecimal(v) {
  return parseInt(v, 10) / 10_000
}

// 한국 좌표 범위(내륙+제주 포함)를 벗어난 결과는 버린다.
function isValidKoreaCoord(lat, lng) {
  return lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132
}

export async function lookupVenueCoords(venue, address) {
  if (!process.env.NAVER_CLIENT_ID || !process.env.NAVER_CLIENT_SECRET) return null

  const query = [venue, address].filter(Boolean).join(' ').trim()
  if (!query) return null

  const url = new URL(NAVER_LOCAL_URL)
  url.searchParams.set('query', query)
  url.searchParams.set('display', '1')

  try {
    const res = await fetch(url, {
      headers: {
        'X-NCP-APIGW-API-KEY-ID': process.env.NAVER_CLIENT_ID,
        'X-NCP-APIGW-API-KEY': process.env.NAVER_CLIENT_SECRET,
      },
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) {
      console.warn(`  [지역검색] HTTP ${res.status}`)
      return null
    }

    const data = await res.json()
    const item = data.items?.[0]
    if (!item?.mapx || !item?.mapy) return null

    const lat = toDecimal(item.mapy)
    const lng = toDecimal(item.mapx)

    if (!isValidKoreaCoord(lat, lng)) {
      console.warn(`  [지역검색] 좌표 범위 이상 (${lat}, ${lng}), 스킵`)
      return null
    }

    return { lat, lng }
  } catch (err) {
    console.warn(`  [지역검색] 조회 실패: ${err.message}`)
    return null
  }
}
