// 이미 저장된 행사장 좌표(venue_lat/venue_lng)를 검증한다.
// 검증 없이 지역검색 1순위 결과를 그대로 쓰던 시절에 들어온 "엉뚱한 위치"를 찾아낸다.
//
// 실행:
//   node src/verify-venue-coords.mjs          # 검사만 하고 보고
//   node src/verify-venue-coords.mjs --fix    # 어긋난 좌표를 다시 조회한 값으로 교체
//
// 판정: 저장된 좌표와 지금 다시 조회한 좌표의 거리가 2km를 넘으면 어긋난 것으로 본다.
// (같은 건물 안에서의 오차나 정문/후문 차이는 수백 m라 걸리지 않는다)
// 관리자가 직접 손댄 행사(admin_edited_at)는 보고만 하고 건드리지 않는다.
// 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NAVER_CLIENT_ID, NAVER_CLIENT_SECRET
import { createClient } from '@supabase/supabase-js'
import { fetchAllRows } from './db.mjs'
import { sleep } from './util.mjs'
import { lookupVenue } from './naver-local.mjs'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const FIX = process.argv.includes('--fix')
const MAX_DRIFT_KM = 2

// 하버사인 — 두 좌표 사이 거리(km)
function distanceKm(a, b) {
  const R = 6371
  const toRad = d => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

async function main() {
  let events
  try {
    events = await fetchAllRows(() => supabase
      .from('events')
      .select('id, title, venue, venue_address, venue_lat, venue_lng, admin_edited_at')
      .not('venue_lat', 'is', null)
      .order('start_date', { ascending: false }))
  } catch (err) { console.error('조회 실패:', err.message); process.exit(1) }
  console.log(`좌표가 있는 행사 ${events.length}건 검증${FIX ? ' (--fix: 교체까지)' : ' (보고만)'}\n`)

  const stats = { ok: 0, drift: 0, fixed: 0, unverifiable: 0, adminSkipped: 0 }
  const problems = []

  for (const event of events) {
    const stored = { lat: event.venue_lat, lng: event.venue_lng }
    const found = await lookupVenue(event.venue, event.venue_address)

    if (!found) {
      // 다시 조회해도 믿을 만한 결과가 없으면 판단 근거가 없다 — 그대로 둔다.
      stats.unverifiable++
      await sleep(250)
      continue
    }

    const km = distanceKm(stored, found)
    if (km <= MAX_DRIFT_KM) {
      stats.ok++
      await sleep(250)
      continue
    }

    stats.drift++
    console.log(`[어긋남 ${km.toFixed(1)}km] ${event.title}`)
    console.log(`  장소: ${event.venue ?? '-'} / ${event.venue_address ?? '-'}`)
    console.log(`  저장된 좌표: ${stored.lat}, ${stored.lng}`)
    console.log(`  재조회 결과: ${found.lat}, ${found.lng} (${found.matchedName} · ${found.matchedAddress})`)
    problems.push({ title: event.title, km, found })

    if (event.admin_edited_at) {
      console.log('  -> 관리자 수정 행사라 건드리지 않음')
      stats.adminSkipped++
      await sleep(250)
      continue
    }
    if (!FIX) {
      console.log('  -> --fix 로 실행하면 재조회 좌표로 교체')
      await sleep(250)
      continue
    }

    const { error: updateError } = await supabase
      .from('events')
      .update({ venue_lat: found.lat, venue_lng: found.lng })
      .eq('id', event.id)
      .is('admin_edited_at', null)
    if (updateError) console.error(`  -> 저장 실패: ${updateError.message}`)
    else { console.log('  -> 교체 완료'); stats.fixed++ }

    await sleep(250)
  }

  console.log('\n--- 결과 ---')
  console.log(`일치 ${stats.ok} / 어긋남 ${stats.drift} / 교체 ${stats.fixed} / 검증불가 ${stats.unverifiable} / 관리자 행사 보류 ${stats.adminSkipped}`)
  if (problems.length > 0 && !FIX) {
    console.log('\n확인이 필요한 행사:')
    for (const p of problems) console.log(`  ${p.title} — ${p.km.toFixed(1)}km 차이`)
  }
}

main().catch(err => { console.error(err); process.exit(1) })
