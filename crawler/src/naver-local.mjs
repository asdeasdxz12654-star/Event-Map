// 네이버 지역검색 API로 행사장 좌표(위/경도)를 조회한다.
// 환경변수: NAVER_CLIENT_ID, NAVER_CLIENT_SECRET (naver.mjs와 동일한 키 사용)
// 결과가 없거나 한국 좌표 범위를 벗어나면 null 반환.

const NAVER_LOCAL_URL = 'https://naverapihub.apigw.ntruss.com/search/v1/local'

function isValidKoreaCoord(lat, lng) {
  return lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132
}

// 장소명에서 홀·층·전시장 번호를 제거한다. 홀 번호가 붙으면 지역검색 결과가 부정확해진다.
// 예: "KINTEX 제2전시장 7·8홀" → "KINTEX", "코엑스 3층 D홀" → "코엑스"
function stripHallDetails(venue) {
  return venue
    .replace(/\s+제\d+전시장/g, '')
    .replace(/\s+[^\s]+홀/g, '')
    .replace(/\s+\d+층/g, '')
    .replace(/\s+B\d+\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

async function searchNaverLocal(query) {
  const url = new URL(NAVER_LOCAL_URL)
  url.searchParams.set('query', query)
  url.searchParams.set('display', '1')

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
  return data.items?.[0] ?? null
}

export async function lookupVenueCoords(venue, address) {
  const cleanedVenue = venue ? stripHallDetails(venue) : null
  // 주소 우선 → 홀 정보를 뺀 장소명 순으로 시도
  const queries = [address, cleanedVenue].filter(Boolean)
  if (queries.length === 0) return null

  for (const query of queries) {
    let item
    try {
      item = await searchNaverLocal(query)
    } catch (err) {
      console.warn(`  [지역검색] 조회 실패: ${err.message}`)
      continue
    }
    if (!item) continue

    // 네이버 지역검색 API는 mapx/mapy를 WGS84 * 1e7 정수로 반환
    const lat = parseInt(item.mapy) / 1e7
    const lng = parseInt(item.mapx) / 1e7

    if (!isValidKoreaCoord(lat, lng)) {
      console.warn(`  [지역검색] 좌표 범위 이상 (${lat}, ${lng}), 다음 쿼리 시도`)
      continue
    }

    return { lat, lng }
  }

  return null
}
