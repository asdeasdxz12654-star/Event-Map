// 부스·굿즈·코스어·배치도 이미지를 우리 저장소 사본으로 바꾼다.
//
// 왜
//   이 이미지들은 전부 주최 측 공지에 걸린 남의 주소다. 관리자가 공지를 보고 주소를
//   붙여넣으면 그 주소가 그대로 화면에 꽂힌다. 그런데
//     · 공지는 행사가 끝나면 내려간다. 그러면 지난 행사 페이지의 굿즈 사진이 전부 깨진다.
//     · 핫링크를 막는 서버에서는 애초에 안 보인다(인벤이 401을 준다).
//     · 원본이 인쇄용이면 굿즈 격자에서 수 MB짜리를 수십 장 받게 된다.
//   포스터는 이미 같은 이유로 사본을 쓰고 있다(poster-storage.mjs). 나머지도 맞춘다.
//
// 포스터와 다른 점
//   포스터 쪽은 "큰 것만" 줄인다(150KB 이하는 그대로 둔다). 여기는 크기와 무관하게
//   전부 옮긴다 — 문제가 용량이 아니라 원본이 사라지는 것이기 때문이다.
//
// 실행
//   node src/mirror-images.mjs --dry-run   # 무엇을 옮길지만 출력
//   node src/mirror-images.mjs             # 실제로 옮긴다 (--apply를 붙여도 같다)
//   node src/mirror-images.mjs --limit 50  # 한 번에 처리할 건수 (기본 200)
//
// 준비물: supabase/event_images_bucket_2026-09-15.sql의 event-images 버킷.
// 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from '@supabase/supabase-js'
import { fetchAllRows } from './db.mjs'
import { isOurStorage, mirrorImage } from './image-mirror.mjs'
import { sleep } from './util.mjs'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const DRY_RUN = process.argv.includes('--dry-run')
const limitArg = process.argv.indexOf('--limit')
const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : 200

// 옮길 대상. 표에 적은 것이 전부다 — 새 이미지 컬럼이 생기면 여기 한 줄을 더하면 된다.
//
// kind는 image-mirror.mjs의 IMAGE_KINDS와 맞춘다. 배치도만 'plan'인 이유는 확대해서
// 부스 번호를 읽는 그림이라 줄이면 못 쓰게 되기 때문이다.
const TARGETS = [
  {
    table: 'events',
    column: 'floor_plan_url',
    label: '부스 배치도',
    prefix: 'floor-plans',
    kind: 'plan',
    select: 'id, title, floor_plan_url',
    describe: row => row.title,
  },
  {
    table: 'event_booths',
    column: 'image_url',
    label: '부스 대표 이미지',
    prefix: 'booths',
    kind: 'thumb',
    select: 'id, name, image_url',
    describe: row => row.name,
  },
  {
    table: 'event_booth_items',
    column: 'image_url',
    label: '굿즈·체험 사진',
    prefix: 'items',
    kind: 'photo',
    select: 'id, name, image_url',
    describe: row => row.name,
  },
  {
    table: 'event_cosplayers',
    column: 'photo_url',
    label: '코스어 사진',
    prefix: 'cosplayers',
    kind: 'photo',
    select: 'id, name, photo_url',
    describe: row => row.name,
  },
]

async function mirrorTarget(target, budget) {
  let rows
  try {
    rows = await fetchAllRows(() => supabase
      .from(target.table)
      .select(target.select)
      .not(target.column, 'is', null)
      .order('id'))
  } catch (err) {
    // 테이블이 아직 없을 수 있다(마이그레이션 실행 전). 그때는 조용히 건너뛴다 —
    // 이 스크립트 하나 때문에 CI가 빨개질 이유가 없다.
    console.log(`[${target.label}] 건너뜀 (${err.message})`)
    return { moved: 0, failed: 0, kept: 0, used: 0 }
  }

  const pending = rows.filter(r => r[target.column] && !isOurStorage(r[target.column]))
  console.log(`\n[${target.label}] 전체 ${rows.length}건 · 옮길 것 ${pending.length}건`)
  if (pending.length === 0) return { moved: 0, failed: 0, kept: rows.length, used: 0 }

  let moved = 0
  let failed = 0
  let used = 0

  for (const row of pending) {
    if (used >= budget) {
      console.log(`  ... 이번 실행 한도(${LIMIT}건)에 도달, 나머지는 다음 실행에서`)
      break
    }
    used++

    const result = await mirrorImage(supabase, {
      prefix: target.prefix,
      id: row.id,
      sourceUrl: row[target.column],
      kind: target.kind,
      dryRun: DRY_RUN,
    })

    if (!result) continue // 이미 우리 것이거나 주소가 비었음

    if (result.error) {
      // 원본을 못 받는 건 대개 "이미 사라졌다"는 뜻이다. 값은 건드리지 않는다 —
      // 주소를 지워버리면 나중에 원본이 돌아와도 되살릴 수 없고, 관리자가 무엇을
      // 넣었었는지도 잃는다. 로그로 남겨서 사람이 판단하게 둔다.
      console.warn(`  [실패] ${target.describe(row)} — ${result.error}`)
      console.warn(`         ${row[target.column]}`)
      failed++
      continue
    }

    if (DRY_RUN) {
      console.log(`  [예정] ${target.describe(row)} — ${result.summary} (${result.path})`)
      moved++
      continue
    }

    const { error } = await supabase
      .from(target.table)
      .update({ [target.column]: result.url })
      .eq('id', row.id)

    if (error) {
      console.error(`  [저장 실패] ${target.describe(row)} — ${error.message}`)
      failed++
    } else {
      console.log(`  [완료] ${target.describe(row)} — ${result.summary}`)
      moved++
    }

    // 남의 서버를 연달아 두드리지 않는다.
    await sleep(200)
  }

  return { moved, failed, kept: rows.length - pending.length, used }
}

async function main() {
  console.log(`이미지 사본 만들기${DRY_RUN ? ' (dry-run — 아무것도 바꾸지 않습니다)' : ''} · 한도 ${LIMIT}건`)

  let budget = LIMIT
  const totals = { moved: 0, failed: 0, kept: 0 }

  for (const target of TARGETS) {
    const r = await mirrorTarget(target, budget)
    budget -= r.used
    totals.moved += r.moved
    totals.failed += r.failed
    totals.kept += r.kept
    if (budget <= 0) {
      console.log('\n한도를 다 썼습니다 — 남은 것은 다음 실행에서 이어서 처리됩니다.')
      break
    }
  }

  console.log(`\n완료: ${totals.moved}건 옮김, ${totals.failed}건 실패, ${totals.kept}건 이미 사본`)
  if (totals.failed > 0) {
    console.log('실패한 건은 원본 주소를 그대로 두었습니다. 위 로그의 주소를 열어보고,')
    console.log('정말 사라졌다면 관리자 화면에서 새 주소로 바꾸거나 비워 주세요.')
  }
}

main().catch(err => { console.error(err); process.exit(1) })
