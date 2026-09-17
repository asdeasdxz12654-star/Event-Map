// 공식 소스를 확인하고 바뀐 것을 기록한다.
//
// 값을 채우지 않는다 — "올라왔다"만 알린다. 그 다음은 관리자 화면(/admin/drafts)에서
// 사람이 보고 넣는다. 부스·무대·굿즈·코스어 입력 폼과 이미지 업로드는 이미 갖춰져 있으니,
// 지금 비어 있던 고리는 "언제 올라왔는지 아무도 모른다"는 것 하나였다.
//
// 실행
//   node src/watch-sources.mjs --dry-run   # 확인만, 상태를 저장하지 않는다
//   node src/watch-sources.mjs             # 확인하고 상태 저장
//
// 준비물: supabase/source_watches_2026-09-15.sql
// 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from '@supabase/supabase-js'
import { WATCHES, checkWatch } from './source-watches.mjs'
import { sleep } from './util.mjs'
import { runJob } from '../../shared/job-run.mjs'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const DRY_RUN = process.argv.includes('--dry-run')

async function loadState() {
  const { data, error } = await supabase.from('source_watches').select('*')
  if (error) {
    // 테이블이 아직 없으면(마이그레이션 실행 전) 조용히 끝낸다 — 이것 하나 때문에
    // CI가 빨개질 이유가 없다.
    console.log(`source_watches 테이블을 못 읽었습니다 — 건너뜁니다 (${error.message})`)
    return null
  }
  return new Map(data.map(row => [row.key, row]))
}

async function main() {
  const state = await loadState()
  if (!state) return

  console.log(`감시 대상 ${WATCHES.length}곳 확인${DRY_RUN ? ' (dry-run)' : ''}\n`)

  let changed = 0
  let failed = 0

  for (const watch of WATCHES) {
    const previous = state.get(watch.key)
    const result = await checkWatch(watch, previous?.content_hash)
    const now = new Date().toISOString()

    if (result.error) {
      console.warn(`[실패] ${watch.label} — ${result.error}`)
      failed++
      if (!DRY_RUN) {
        await upsert(watch, { last_checked_at: now, last_error: result.error })
      }
      await sleep(400)
      continue
    }

    if (result.first) {
      console.log(`[기준 잡음] ${watch.label} — 신호 ${result.count}개`)
    } else if (result.changed) {
      console.log(`[바뀜] ${watch.label} — 신호 ${result.count}개`)
      console.log(`       ${watch.url}`)
      if (result.candidates.length > 0) {
        console.log(`       배치도 후보 ${result.candidates.length}장:`)
        for (const c of result.candidates) {
          console.log(`         ${c.width}x${c.height}  ${c.url}`)
        }
      }
      changed++
    } else {
      console.log(`[그대로] ${watch.label}`)
    }

    if (!DRY_RUN) {
      await upsert(watch, {
        content_hash: result.hash,
        last_checked_at: now,
        last_error: null,
        // 처음 기준을 잡을 때는 last_changed_at을 찍지 않는다 — 찍으면 감시를 켜는 날
        // 전부가 "새 알림"이 된다.
        ...(result.changed ? { last_changed_at: now } : {}),
        ...(result.changed ? { candidates: result.candidates } : {}),
      })
    }

    // 남의 서버를 연달아 두드리지 않는다.
    await sleep(400)
  }

  console.log(`\n완료: ${changed}곳 바뀜, ${failed}곳 실패`)
  if (changed > 0) {
    console.log('바뀐 곳은 /admin/drafts 화면의 "공식 소스 감지"에 뜹니다.')
  }

  return { items: changed, detail: { 확인: WATCHES.length, 바뀜: changed, 실패: failed } }
}

async function upsert(watch, patch) {
  const { error } = await supabase.from('source_watches').upsert({
    key: watch.key,
    label: watch.label,
    url: watch.url,
    event_title: watch.eventTitle ?? null,
    ...patch,
  }, { onConflict: 'key' })
  if (error) console.error(`  -> 상태 저장 실패: ${error.message}`)
}

runJob('watch-sources', main, { record: !DRY_RUN })
