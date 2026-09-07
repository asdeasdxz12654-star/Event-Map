// venue_address가 null인 행사에 주소를 채운 뒤 네이버 지역검색으로 좌표를 설정한다.
// 실행: node src/fix-venue-addresses.mjs
// 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NAVER_CLIENT_ID, NAVER_CLIENT_SECRET
import { createClient } from '@supabase/supabase-js'
import { lookupVenueCoords } from './naver-local.mjs'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// 장소명 키워드 → 도로명 주소 매핑
const VENUE_ADDRESS_MAP = [
  { match: v => v?.includes('킨텍스') || v?.includes('KINTEX'),        address: '경기도 고양시 일산서구 킨텍스로 217-60' },
  { match: v => v?.includes('고려대학교 화정체육관'),                   address: '서울특별시 성북구 안암로 145' },
  { match: v => v?.includes('파라다이스 시티'),                         address: '인천광역시 중구 영종해안남로321번길 186' },
  { match: v => v?.includes('현대백화점 판교'),                         address: '경기도 성남시 분당구 판교역로146번길 20' },
  { match: v => v?.includes('장충체육관'),                              address: '서울특별시 중구 장충단로 60' },
  { match: v => v?.includes('BEXCO') || v?.includes('벡스코'),          address: '부산광역시 해운대구 APEC로 55' },
  { match: v => v?.includes('하이커그라운드') || v?.includes('하이커 그라운드'), address: '서울특별시 중구 청계천로 40' },
]

function resolveAddress(venue) {
  if (!venue) return null
  const rule = VENUE_ADDRESS_MAP.find(r => r.match(venue))
  return rule ? rule.address : null
}

async function main() {
  const { data: events, error } = await supabase
    .from('events')
    .select('id, title, venue, venue_address, start_date')
    .is('venue_lat', null)
    .order('start_date')

  if (error) { console.error('조회 실패:', error.message); process.exit(1) }
  console.log(`좌표 없는 행사 ${events.length}건\n`)

  let updated = 0
  let skipped = 0

  for (const event of events) {
    const resolvedAddr = resolveAddress(event.venue) ?? event.venue_address

    if (!resolvedAddr && !event.venue) {
      console.log(`  [스킵] ${event.title} — venue 없음`)
      skipped++
      continue
    }

    // 주소가 새로 확인된 경우 DB 업데이트
    if (resolvedAddr && resolvedAddr !== event.venue_address) {
      const { error: addrErr } = await supabase
        .from('events')
        .update({ venue_address: resolvedAddr })
        .eq('id', event.id)
      if (addrErr) {
        console.error(`  [주소 저장 실패] ${event.title}: ${addrErr.message}`)
      } else {
        console.log(`  [주소 설정] ${event.title}: ${resolvedAddr}`)
      }
    }

    const coords = await lookupVenueCoords(event.venue, resolvedAddr ?? event.venue_address)
    if (!coords) {
      console.log(`  [스킵] ${event.title} — 좌표 검색 결과 없음 (venue: "${event.venue}")`)
      skipped++
      await sleep(300)
      continue
    }

    const { error: coordErr } = await supabase
      .from('events')
      .update({ venue_lat: coords.lat, venue_lng: coords.lng })
      .eq('id', event.id)

    if (coordErr) {
      console.error(`  [좌표 저장 실패] ${event.title}: ${coordErr.message}`)
    } else {
      console.log(`  [완료] ${event.title} → ${coords.lat}, ${coords.lng}`)
      updated++
    }

    await sleep(300)
  }

  console.log(`\n완료: ${updated}건 업데이트, ${skipped}건 스킵`)
}

main().catch(err => { console.error(err); process.exit(1) })
