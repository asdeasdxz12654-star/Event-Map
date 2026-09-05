// 좌표(venue_lat/venue_lng)가 없는 기존 행사를 네이버 지역 API로 일괄 업데이트한다.
// 실행: node src/backfill-coords.mjs
// 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NAVER_CLIENT_ID, NAVER_CLIENT_SECRET
import { createClient } from '@supabase/supabase-js'
import { lookupVenueCoords } from './naver-local.mjs'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function main() {
  const { data: events, error } = await supabase
    .from('events')
    .select('id, title, venue, venue_address')
    .is('venue_lat', null)
    .order('start_date', { ascending: true })

  if (error) { console.error('조회 실패:', error.message); process.exit(1) }
  console.log(`좌표 없는 행사 ${events.length}건 처리 시작`)

  let updated = 0
  let skipped = 0

  for (const event of events) {
    const coords = await lookupVenueCoords(event.venue, event.venue_address)
    if (!coords) {
      console.log(`  [스킵] ${event.title} — 검색 결과 없음`)
      skipped++
      await sleep(200)
      continue
    }

    const { error: updateError } = await supabase
      .from('events')
      .update({ venue_lat: coords.lat, venue_lng: coords.lng })
      .eq('id', event.id)

    if (updateError) {
      console.error(`  [실패] ${event.title}:`, updateError.message)
    } else {
      console.log(`  [완료] ${event.title} → ${coords.lat}, ${coords.lng}`)
      updated++
    }

    await sleep(200) // API 호출 간격
  }

  console.log(`\n완료: ${updated}건 업데이트, ${skipped}건 스킵`)
}

main().catch(err => { console.error(err); process.exit(1) })
