// poster_url이 없는 행사에 이미지 검색(SerpAPI)으로 포스터를 일괄 등록한다.
//
// 실행:
//   node src/fix-poster-images.mjs            # 찾아서 저장 (--apply를 붙여도 같다)
//   node src/fix-poster-images.mjs --dry-run  # 무엇을 넣을지 출력만 (저장 안 함)
//   node src/fix-poster-images.mjs --limit 10 # 가까운 행사부터 N건만 (SerpAPI 크레딧 절약)
//
// SerpAPI 무료 플랜은 월 250회라, 행사 한 건에 검색 1~3회가 나간다는 걸 감안해서
// --limit로 나눠 돌리는 편이 안전하다. 한도가 소진되면 이후 행사는 검색 없이 넘어간다.
//
// 공식 사이트(website)가 비어 있는 행사는 웹 검색으로 찾아서 함께 채운다
// (official-site-lookup.mjs) — 포스터 정확도가 거기서 갈린다.
//
// 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SERPAPI_KEY
import { createClient } from '@supabase/supabase-js'
import { fetchAllRows } from './db.mjs'
import { isQuotaExhausted } from './serpapi-image.mjs'
import { resolveOfficialUrls } from './official-site-lookup.mjs'
import { findEventPoster } from './poster-lookup.mjs'
import { storePoster } from './poster-storage.mjs'
import { todayKST } from './date-kst.mjs'
import { sleep } from './util.mjs'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const DRY_RUN = process.argv.includes('--dry-run')
const LIMIT = Number(process.argv[process.argv.indexOf('--limit') + 1]) || Infinity

async function main() {
  // 지난 행사는 검색하지 않는다. 포스터가 필요한 건 앞으로 열릴 행사고, 끝난 행사까지
  // 훑으면 (start_date 오름차순이라 목록 앞이 전부 지난 행사다) 한정된 SerpAPI
  // 크레딧을 아무도 안 보는 카드에 다 쓰게 된다.
  let events
  try {
    events = await fetchAllRows(() => supabase
      .from('events')
      .select('id, title, start_date, website, ticket_url, admin_edited_at')
      .is('poster_url', null)
      .gte('start_date', todayKST())
      .order('start_date'))
  } catch (err) { console.error('조회 실패:', err.message); process.exit(1) }
  const targets = events.slice(0, LIMIT)
  console.log(`포스터 없는 예정 행사 ${events.length}건 중 ${targets.length}건 처리${DRY_RUN ? ' (dry-run)' : ''}\n`)

  let updated = 0
  let skipped = 0

  for (const event of targets) {
    console.log(`[${event.start_date}] ${event.title}`)
    // 공식 사이트를 알면 "site:도메인 포스터"로 정확히 찾는다. 모르면 먼저 찾아본다.
    const officialUrls = await resolveOfficialUrls(supabase, event, { save: !DRY_RUN })
    const posterUrl = await findEventPoster(supabase, {
      title: event.title,
      officialUrls,
      eventYear: event.start_date ? Number(event.start_date.slice(0, 4)) : null,
    })

    if (!posterUrl) {
      console.log('  -> 이미지 없음, 스킵')
      skipped++
      if (isQuotaExhausted()) { console.log('\nSerpAPI 검색 한도가 소진돼 남은 행사는 건너뜁니다.'); break }
      await sleep(300)
      continue
    }

    if (DRY_RUN) {
      // 저장은 안 하지만 "얼마나 줄어드는지"는 미리 보여준다
      await storePoster(supabase, event.id, posterUrl, { dryRun: true })
      updated++
      await sleep(300)
      continue
    }

    // 인쇄용 원본처럼 큰 포스터는 줄여서 우리 저장소에 두고 그 주소를 쓴다.
    const finalUrl = await storePoster(supabase, event.id, posterUrl) ?? posterUrl

    const { error: updateError } = await supabase
      .from('events')
      .update({ poster_url: finalUrl })
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
