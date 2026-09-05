// venue 필드에 날짜 표기가 잘못 들어간 행사를 찾아 정리한다.
// 예: "장충체육관(09/13)" → "장충체육관"
// 실행(진단): node src/fix-venue-numbers.mjs
// 실행(수정): node src/fix-venue-numbers.mjs --fix
// 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const FIX = process.argv.includes('--fix')

// "(09/13)" 형식 날짜를 venue에서 제거한다
function cleanVenueName(venue) {
  return venue.replace(/\s*\(\d{1,2}\/\d{1,2}\)/g, '').trim()
}

function hasBadVenue(venue) {
  if (!venue) return false
  return /\(\d{1,2}\/\d{1,2}\)/.test(venue)
}

async function main() {
  const { data: events, error } = await supabase
    .from('events')
    .select('id, title, venue, start_date')
    .order('start_date', { ascending: true })

  if (error) { console.error('조회 실패:', error.message); process.exit(1) }

  const bad = events.filter(e => hasBadVenue(e.venue))

  if (bad.length === 0) {
    console.log('이상한 venue가 없습니다.')
    return
  }

  console.log(`\n문제 있는 venue ${bad.length}건:\n`)
  for (const e of bad) {
    const cleaned = cleanVenueName(e.venue)
    console.log(`  [${e.start_date}] ${e.title}`)
    console.log(`    수정 전: "${e.venue}"`)
    console.log(`    수정 후: "${cleaned}"`)
    console.log()
  }

  if (!FIX) {
    console.log('→ 실제 수정하려면: node src/fix-venue-numbers.mjs --fix')
    return
  }

  console.log('수정 중...')
  let fixed = 0
  for (const e of bad) {
    const cleaned = cleanVenueName(e.venue)
    const { error: updateError } = await supabase
      .from('events')
      .update({ venue: cleaned })
      .eq('id', e.id)
    if (updateError) {
      console.error(`  [실패] ${e.title}: ${updateError.message}`)
    } else {
      console.log(`  [완료] "${e.venue}" → "${cleaned}"`)
      fixed++
    }
  }
  console.log(`\n완료: ${fixed}건 수정`)
}

main().catch(err => { console.error(err); process.exit(1) })
