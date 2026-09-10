// 이미 저장된 포스터 중 용량이 큰 것을 줄여서 우리 저장소 사본으로 바꾼다.
//
// poster-storage.mjs가 "앞으로 채울 포스터"를 처리한다면, 이 스크립트는 "이미 들어가 있는
// 포스터"를 정리한다. 실제로 홈 첫 화면에서 이미지만 10.2MB를 받고 있었는데, 그중 12.7MB가
// 단 두 건(코믹월드 336의 7.0MB, 광주 ACE Fair의 5.7MB)이었다.
//
// 실행:
//   node src/optimize-poster-images.mjs --dry-run   # 무엇을 바꿀지만 출력
//   node src/optimize-poster-images.mjs             # 실제로 교체 (--apply를 붙여도 같다)
//
// 관리자가 지정한 포스터(admin_edited_at)도 대상에 넣는다. 다른 이미지로 바꾸는 게 아니라
// "같은 이미지를 줄여서 다시 올리는 것"이라 관리자의 선택은 그대로 유지된다. 원래 주소는
// 로그에 남기니 되돌릴 수 있다. (--skip-admin으로 제외할 수 있다.)
//
// 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from '@supabase/supabase-js'
import { fetchAllRows } from './db.mjs'
import { storePoster } from './poster-storage.mjs'
import { sleep } from './util.mjs'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const DRY_RUN = process.argv.includes('--dry-run')
const SKIP_ADMIN = process.argv.includes('--skip-admin')

async function main() {
  let events
  try {
    events = await fetchAllRows(() => supabase
      .from('events')
      .select('id, title, poster_url, admin_edited_at')
      .not('poster_url', 'is', null)
      .order('start_date', { ascending: false }))
  } catch (err) { console.error('조회 실패:', err.message); process.exit(1) }

  const targets = SKIP_ADMIN ? events.filter(e => !e.admin_edited_at) : events
  console.log(`포스터가 있는 행사 ${events.length}건 중 ${targets.length}건 확인${DRY_RUN ? ' (dry-run)' : ''}\n`)

  let replaced = 0
  let kept = 0

  for (const event of targets) {
    const stored = await storePoster(supabase, event.id, event.poster_url, { dryRun: DRY_RUN })
    if (!stored) { kept++; continue }

    console.log(`[교체] ${event.title}${event.admin_edited_at ? ' (관리자 지정)' : ''}`)
    console.log(`  이전: ${event.poster_url}`)
    console.log(`  이후: ${stored}`)

    const { error } = await supabase.from('events').update({ poster_url: stored }).eq('id', event.id)
    if (error) console.error(`  -> 저장 실패: ${error.message}`)
    else replaced++

    await sleep(200)
  }

  console.log(`\n완료: ${replaced}건 교체, ${kept}건 그대로 (이미 작거나 최적화 불가)`)
}

main().catch(err => { console.error(err); process.exit(1) })
