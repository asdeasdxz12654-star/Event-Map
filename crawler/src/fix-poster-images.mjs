// poster_url이 없는 행사에 이미지 검색(SerpAPI)으로 포스터를 일괄 등록한다.
//
// 실행:
//   node src/fix-poster-images.mjs            # 찾아서 저장
//   node src/fix-poster-images.mjs --dry-run  # 무엇을 넣을지 출력만 (저장 안 함)
//   node src/fix-poster-images.mjs --limit 10 # 가까운 행사부터 N건만 (SerpAPI 크레딧 절약)
//
// SerpAPI 무료 플랜은 월 250회라, 행사 한 건에 검색 1~3회가 나간다는 걸 감안해서
// --limit로 나눠 돌리는 편이 안전하다. 한도가 소진되면 이후 행사는 검색 없이 넘어간다.
//
// 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SERPAPI_KEY
import { createClient } from '@supabase/supabase-js'
import { fetchEventPosterUrl, isQuotaExhausted } from './serpapi-image.mjs'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const DRY_RUN = process.argv.includes('--dry-run')
const LIMIT = Number(process.argv[process.argv.indexOf('--limit') + 1]) || Infinity

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// 한국 기준 오늘 (notifier/send-notifications.mjs, known-events.mjs와 같은 이유/방식)
function todayKST() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 10)
}

async function main() {
  // 지난 행사는 검색하지 않는다. 포스터가 필요한 건 앞으로 열릴 행사고, 끝난 행사까지
  // 훑으면 (start_date 오름차순이라 목록 앞이 전부 지난 행사다) 한정된 SerpAPI
  // 크레딧을 아무도 안 보는 카드에 다 쓰게 된다.
  const { data: events, error } = await supabase
    .from('events')
    .select('id, title, start_date, website, ticket_url')
    .is('poster_url', null)
    .gte('start_date', todayKST())
    .order('start_date')

  if (error) { console.error('조회 실패:', error.message); process.exit(1) }
  const targets = events.slice(0, LIMIT)
  console.log(`포스터 없는 예정 행사 ${events.length}건 중 ${targets.length}건 처리${DRY_RUN ? ' (dry-run)' : ''}\n`)

  let updated = 0
  let skipped = 0

  for (const event of targets) {
    console.log(`[${event.start_date}] ${event.title}`)
    const posterUrl = await fetchEventPosterUrl(event.title, [event.website, event.ticket_url], event.start_date ? Number(event.start_date.slice(0, 4)) : null)

    if (!posterUrl) {
      console.log('  -> 이미지 없음, 스킵')
      skipped++
      if (isQuotaExhausted()) { console.log('\nSerpAPI 검색 한도가 소진돼 남은 행사는 건너뜁니다.'); break }
      await sleep(300)
      continue
    }

    if (DRY_RUN) {
      updated++
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

  console.log(`\n완료: ${updated}건 ${DRY_RUN ? '찾음(저장 안 함)' : '업데이트'}, ${skipped}건 스킵`)
}

main().catch(err => { console.error(err); process.exit(1) })
