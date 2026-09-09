// 네이버 지역검색 API로 행사장 좌표(위/경도)를 조회한다.
// 환경변수: NAVER_CLIENT_ID, NAVER_CLIENT_SECRET (naver.mjs와 동일한 키 사용)
//
// 예전엔 검색 결과 1건을 그대로 믿고 좌표로 썼다. 지역검색은 키워드 유사도 검색이라
// "코엑스"로 찾으면 전국의 동명 상호가 먼저 나오는 일이 흔했고, 그 좌표가 그대로
// 상세페이지 지도에 찍혔다. 지금은 후보를 여러 개 받아서
//   1) 한국 좌표 범위인지
//   2) 주소를 알고 있으면 같은 시·도, 같은 시군구인지
//   3) 상호명이 장소명과 겹치는지
// 를 보고 가장 잘 맞는 하나를 고른다. 확신이 없으면 null을 반환한다 —
// 엉뚱한 곳에 핀을 찍느니 지도를 안 보여주는 편이 낫다.

const NAVER_LOCAL_URL = 'https://naverapihub.apigw.ntruss.com/search/v1/local'

function isValidKoreaCoord(lat, lng) {
  return lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132
}

// 장소명에서 홀·층·전시장 번호를 제거한다. 홀 번호가 붙으면 지역검색 결과가 부정확해진다.
// 예: "KINTEX 제2전시장 7·8홀" → "KINTEX", "코엑스 3층 D홀" → "코엑스"
export function stripHallDetails(venue) {
  return venue
    .replace(/\s+제\d+전시장/g, '')
    .replace(/\s+[^\s]+홀/g, '')
    .replace(/\s+\d+층/g, '')
    .replace(/\s+B\d+\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripHtml(str = '') {
  return str.replace(/<[^>]+>/g, '').trim()
}

// "서울특별시" / "서울시" / "서울" 을 같은 값으로 맞춘다. 광역시·도 이름은 앞 두 글자가
// 사실상 유일하다(서울/부산/대구/인천/광주/대전/울산/세종/경기/강원/충북/충남/전북/
// 전남/경북/경남/제주).
function normalizeRegion(address) {
  const first = stripHtml(address).trim().split(/\s+/)[0] ?? ''
  return first.slice(0, 2)
}

// 시군구(두 번째 토큰) — "강남구", "해운대구", "고양시" 등
function districtOf(address) {
  const parts = stripHtml(address).trim().split(/\s+/)
  return parts[1] ?? ''
}

function normalizeName(text) {
  return stripHtml(text).toLowerCase().replace(/[^0-9a-z가-힣]+/g, '')
}

// 주소에서 시·도와 시군구를 뺀 나머지(도로명 + 건물번호). "경기도 고양시 일산서구
// 킨텍스로 217-60" -> "킨텍스로21760". 이게 일치하면 같은 건물로 봐도 된다.
function addressCore(address) {
  const parts = stripHtml(address).trim().split(/\s+/).slice(2)
  return normalizeName(parts.join(''))
}

// 후보가 얼마나 믿을 만한지 점수화한다. 0이면 채택하지 않는다.
//
// 처음엔 "시·도가 같으면 2점" 식으로 지역만 맞아도 점수를 줬는데, 그러면 이름이 전혀
// 다른 곳도 통과했다. 실제로 "킨텍스 제2전시장"에 트램펄린장(스타필드 바운스) 좌표가,
// "킨텍스"에 일산동구청 좌표가 박혔다 — 둘 다 같은 고양시라는 이유만으로 채택된 것이다.
// 지금은 상호명이 겹치거나 도로명 주소가 일치해야만 채택한다. 지역 일치는 가산점일 뿐
// 단독 근거가 되지 못한다.
export function scoreLocalItem(item, { venue, address }) {
  const itemAddress = item.roadAddress || item.address || ''

  const wantRegion = address ? normalizeRegion(address) : ''
  const gotRegion = normalizeRegion(itemAddress)
  // 시·도가 다르면 완전히 다른 곳이다 (부산 행사에 서울 좌표가 박히는 케이스)
  if (wantRegion && gotRegion && wantRegion !== gotRegion) return 0

  // 상호명 일치 — 홀·층을 뗀 장소명이 검색 결과 이름과 서로 포함 관계인지
  const wantName = venue ? normalizeName(stripHallDetails(venue)) : ''
  const gotName = normalizeName(item.title ?? '')
  const nameMatch = wantName.length >= 2 && gotName.length >= 2 &&
    (gotName.includes(wantName) || wantName.includes(gotName))

  // 도로명 주소 일치 — 시·도/시군구를 뺀 부분이 들어 있는지.
  // "경기도 일산"처럼 도로명이 없는 뭉뚱그린 주소는 근거로 쓰지 않는다.
  const wantCore = address ? addressCore(address) : ''
  const addressMatch = wantCore.length >= 4 && normalizeName(itemAddress).includes(wantCore)

  if (!nameMatch && !addressMatch) return 0

  let score = 0
  if (nameMatch) score += 3
  if (addressMatch) score += 3
  if (wantRegion && wantRegion === gotRegion) score += 1
  if (address && districtOf(address) && districtOf(address) === districtOf(itemAddress)) score += 1
  return score
}

async function searchNaverLocal(query) {
  const url = new URL(NAVER_LOCAL_URL)
  url.searchParams.set('query', query)
  url.searchParams.set('display', '5')

  const res = await fetch(url, {
    headers: {
      'X-NCP-APIGW-API-KEY-ID': process.env.NAVER_CLIENT_ID,
      'X-NCP-APIGW-API-KEY': process.env.NAVER_CLIENT_SECRET,
    },
    signal: AbortSignal.timeout(5_000),
  })
  if (!res.ok) {
    console.warn(`  [지역검색] HTTP ${res.status}`)
    return []
  }

  const data = await res.json()
  return data.items ?? []
}

function toCoords(item) {
  // 네이버 지역검색 API는 mapx/mapy를 WGS84 * 1e7 정수로 반환
  const lat = parseInt(item.mapy) / 1e7
  const lng = parseInt(item.mapx) / 1e7
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (!isValidKoreaCoord(lat, lng)) return null
  return { lat, lng }
}

// 주소가 있으면 주소로, 없으면 홀 정보를 뺀 장소명으로 조회한다.
// 반환: { lat, lng, matchedName, matchedAddress, score } 또는 null
export async function lookupVenue(venue, address) {
  const cleanedVenue = venue ? stripHallDetails(venue) : null
  const queries = [address, cleanedVenue].filter(Boolean)
  if (queries.length === 0) return null

  for (const query of queries) {
    let items = []
    try {
      items = await searchNaverLocal(query)
    } catch (err) {
      console.warn(`  [지역검색] 조회 실패: ${err.message}`)
      continue
    }

    const scored = items
      .map(item => ({ item, coords: toCoords(item), score: scoreLocalItem(item, { venue, address }) }))
      .filter(c => c.coords && c.score > 0)
      .sort((a, b) => b.score - a.score)

    if (scored.length === 0) continue

    const best = scored[0]
    return {
      ...best.coords,
      matchedName: stripHtml(best.item.title ?? ''),
      matchedAddress: best.item.roadAddress || best.item.address || '',
      score: best.score,
    }
  }

  console.warn(`  [지역검색] 믿을 만한 결과 없음 (venue=${venue ?? '-'}, address=${address ?? '-'})`)
  return null
}

// 기존 호출부 호환용 — 좌표만 필요할 때.
export async function lookupVenueCoords(venue, address) {
  const found = await lookupVenue(venue, address)
  return found ? { lat: found.lat, lng: found.lng } : null
}
