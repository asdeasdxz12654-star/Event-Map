// poster_url이 없는 행사에 네이버 이미지 검색으로 포스터를 일괄 등록한다.
// 실행: node src/fix-poster-images.mjs
// 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NAVER_CLIENT_ID, NAVER_CLIENT_SECRET
import { createClient } from '@supabase/supabase-js'
import { fetchEventPosterUrl } from './naver-image.mjs'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function main() {
  const { data: events, error } = await supabase
    .from('events')
    .select('id, title, start_date')
    .is('poster_url', null)
    .order('start_date')

  if (error) { console.error('조회 실패:', error.message); process.exit(1) }
  console.log(`포스터 없는 행사 ${events.length}건\n`)

  let updated = 0
  let skipped = 0

  for (const event of events) {
    console.log(`[${event.start_date}] ${event.title}`)
    const posterUrl = await fetchEventPosterUrl(event.title)

    if (!posterUrl) {
      console.log('  -> 이미지 없음, 스킵')
      skipped++
      await sleep(300)
      continue
    }

    const { error: updateError } = await supabase
      .from('events')
      .update({ poster_url: posterUrl })
      .eq('id', event.id)

    if (updateError) {
      console.error(`  -> 저장 실패: ${updateError.message}`)
    } else {
      updated++
    }

    await sleep(300) // API 호출 간격
  }

  console.log(`\n완료: ${updated}건 업데이트, ${skipped}건 스킵`)
}

main().catch(err => { console.error(err); process.exit(1) })
