// website가 비어 있는 행사에 공식 사이트 주소를 채운다 (SerpAPI 웹 검색).
//
// 실행:
//   node src/fix-official-sites.mjs            # 찾아서 저장
//   node src/fix-official-sites.mjs --dry-run  # 무엇을 넣을지 출력만
//   node src/fix-official-sites.mjs --limit 10 # 가까운 행사부터 N건만
//
// 왜 따로 필요한가: 포스터 채우기(fix-poster-images.mjs)도 공식 사이트를 찾아 저장하지만,
// 그건 "포스터가 없는 행사"만 훑는다. 게다가 그때 쓰는 resolveOfficialUrls()는 website든
// ticket_url이든 하나만 있으면 검색을 건너뛴다 — 그래서 "예매 링크는 있는데 공식 사이트는
// 모르는" 행사는 어느 쪽으로도 채워지지 않았다. 상세 화면의 공식 사이트 버튼은 이 값을
// 쓰므로, website만 따로 보는 스크립트를 둔다.
//
// 판정 기준은 official-site-lookup.mjs에 있다 — 기사·예매처·SNS·위키·행사 모음 사이트는
// 공식으로 치지 않고, 그 도메인 첫 화면 제목에도 행사명이 있어야 채택한다.
// 못 찾으면 그냥 비워 둔다(화면에서는 "공식 정보 검색" 버튼이 대신 나간다).
//
// 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SERPAPI_KEY
import { createClient } from '@supabase/supabase-js'
import { fetchAllRows } from './db.mjs'
import { findOfficialSiteUrl } from './official-site-lookup.mjs'
import { isQuotaExhausted } from './serpapi.mjs'
import { todayKST } from './date-kst.mjs'
import { sleep } from './util.mjs'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const DRY_RUN = process.argv.includes('--dry-run')
const LIMIT = Number(process.argv[process.argv.indexOf('--limit') + 1]) || Infinity

async function main() {
  // 지난 행사는 찾지 않는다. 공식 사이트가 필요한 건 앞으로 열릴 행사고,
  // 검색 크레딧(무료 월 250회)을 아무도 안 여는 카드에 쓸 이유가 없다.
  let events
  try {
    events = await fetchAllRows(() => supabase
      .from('events')
      .select('id, title, start_date')
      .is('website', null)
      .gte('start_date', todayKST())
      .order('start_date').order('id'))
  } catch (err) { console.error('조회 실패:', err.message); process.exit(1) }

  const targets = events.slice(0, LIMIT)
  console.log(`공식 사이트가 없는 예정 행사 ${events.length}건 중 ${targets.length}건 처리${DRY_RUN ? ' (dry-run)' : ''}\n`)

  let updated = 0
  let skipped = 0

  for (const event of targets) {
    console.log(`[${event.start_date}] ${event.title}`)

    const site = await findOfficialSiteUrl(event.title)
    if (!site) {
      console.log('  -> 공식 사이트를 못 찾음, 스킵')
      skipped++
      if (isQuotaExhausted()) { console.log('\nSerpAPI 검색 한도가 소진돼 남은 행사는 건너뜁니다.'); break }
      await sleep(300)
      continue
    }

    console.log(`  -> ${site.url} (첫화면 "${site.homeTitle}")`)
    if (!DRY_RUN) {
      const { error } = await supabase
        .from('events')
        .update({ website: site.url })
        .eq('id', event.id)
        .is('website', null)        // 그사이 채워졌으면 덮어쓰지 않음
        .is('admin_edited_at', null) // 관리자가 직접 손댄 행은 건드리지 않음
      if (error) { console.error(`  -> 저장 실패: ${error.message}`); skipped++; await sleep(300); continue }
    }
    updated++
    await sleep(300)
  }

  console.log(`\n완료: ${updated}건 ${DRY_RUN ? '찾음(저장 안 함)' : '업데이트'}, ${skipped}건 스킵`)
}

main().catch(err => { console.error(err); process.exit(1) })
