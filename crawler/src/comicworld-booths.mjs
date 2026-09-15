// 코믹월드 참가 동아리를 event_booths에 채운다.
//
// 왜 이것만 자동인가
//   부스·무대·굿즈 대부분은 공식 공지가 이미지라 사람이 읽어야 한다. 그런데 코믹월드
//   참가 동아리만은 예외다 — comicw.net/g/boothcut/ 이 HTML 텍스트로 상시 공개하고,
//   등록되는 대로 바로 반영된다. 게다가 수백~수천 개라 애초에 손으로 넣을 수 있는
//   양이 아니다. 자동화 말고는 방법이 없는 유일한 데이터다.
//
//   모델(LLM)을 쓰지 않는다. 구조화된 HTML이라 파서로 충분하고, 형식이 바뀌면 0건이
//   되어 바로 드러난다 — 조용히 틀린 값이 들어가지 않는다.
//
// 2026-09-15 확인한 구조
//   /g/boothcut/?fare={회차}  — 회차 번호로 주소가 정해진다
//   <select class="bc-fare-select"> <option value="337">코믹월드 337 울산 (10.03~10.04)</option>
//   <a class="bc-card" href="/g/2879" data-itid="2879">
//     <div class="bc-booth-num">미배정</div>       ← 번호는 나중에 배정된다
//     <div class="bc-booth-name">샤디</div>
//
// 실행
//   node src/comicworld-booths.mjs --dry-run   # 무엇이 들어갈지만 출력
//   node src/comicworld-booths.mjs             # 실제로 저장
//
// 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from '@supabase/supabase-js'
import { fetchAllRows } from './db.mjs'
import { decodeEntities, fetchHtml, sleep } from './util.mjs'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const DRY_RUN = process.argv.includes('--dry-run')

const LIST_URL = 'https://comicw.net/g/boothcut/'

// 회차 선택 목록. "코믹월드 337 울산", "문구전 2026 가을"처럼 코믹월드가 아닌 것도 섞여 있다.
export function parseFares(html) {
  const select = /<select[^>]*class=["'][^"']*bc-fare-select[^"']*["'][\s\S]*?<\/select>/i.exec(html)
  if (!select) return []
  const fares = []
  for (const m of select[0].matchAll(/<option([^>]*)value=["'](\d+)["']([^>]*)>([\s\S]*?)<\/option>/gi)) {
    const label = decodeEntities(m[4].replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
    // 기본으로 열려 있는 회차는 본문을 다시 받을 필요가 없다.
    const selected = /\bselected\b/i.test(m[1] + m[3])
    fares.push({ fare: m[2], label, selected })
  }
  return fares
}

// 부스 카드. 번호가 아직 없으면 "미배정"이 들어 있다 — 그건 번호 없음으로 본다.
export function parseBooths(html) {
  const booths = []
  for (const m of html.matchAll(/<a\b[^>]*class=["'][^"']*bc-card[^"']*["'][\s\S]*?<\/a>/gi)) {
    const card = m[0]
    const name = pick(card, /<div[^>]*class=["'][^"']*bc-booth-name[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)
    if (!name) continue
    const rawNo = pick(card, /<div[^>]*class=["'][^"']*bc-booth-num[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)
    const itid = /data-itid=["'](\d+)["']/.exec(card)?.[1] ?? null
    booths.push({
      name,
      boothNo: !rawNo || rawNo === '미배정' ? null : rawNo,
      itid,
    })
  }
  return booths
}

function pick(html, re) {
  const m = re.exec(html)
  if (!m) return null
  return decodeEntities(m[1].replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim() || null
}

// "코믹월드 337 울산 (10.03~10.04)" -> 337
//
// 사이트가 회차 이름을 일정하게 적지 않는다 — 2026-09-15 확인 결과 337·338은
// "코믹월드 337 울산"인데 339는 그냥 "339 일산"이다. 그래서 "코믹월드"라는 말을
// 요구하지 않고 세 자리 수만 찾는다. 같은 목록에 섞여 있는 문구전("문구전 2026 가을")은
// 연도가 네 자리라 \b\d{3}\b에 걸리지 않지만, 뜻이 분명하도록 이름으로도 한 번 걸러낸다.
function roundOf(label) {
  if (/문구전/.test(label)) return null
  return /\b(\d{3})\b/.exec(label)?.[1] ?? null
}

async function main() {
  console.log(`코믹월드 참가 동아리 수집${DRY_RUN ? ' (dry-run)' : ''}`)

  let html
  try {
    html = await fetchHtml(LIST_URL)
  } catch (err) {
    console.error(`목록을 못 받았습니다: ${err.message}`)
    process.exit(1)
  }

  const fares = parseFares(html).filter(f => roundOf(f.label))
  if (fares.length === 0) {
    // 형식이 바뀌면 여기서 0건이 된다. 조용히 넘어가지 않고 실패로 알린다 —
    // 파서가 죽은 걸 모르고 몇 달 지나면 그동안 부스가 하나도 안 들어온다.
    console.error('회차 목록을 못 읽었습니다 — 페이지 구조가 바뀌었을 수 있습니다.')
    process.exit(1)
  }
  console.log(`회차 ${fares.length}개: ${fares.map(f => f.label).join(' · ')}\n`)

  // 우리 DB의 코믹월드 행사. 제목이 "코믹월드 337 울산" 형태라 회차 번호로 맞춘다.
  let events
  try {
    events = await fetchAllRows(() => supabase
      .from('events')
      .select('id, title')
      .like('title', '%코믹월드%')
      .order('id'))
  } catch (err) {
    console.error(`행사 조회 실패: ${err.message}`)
    process.exit(1)
  }

  let total = 0
  for (const fare of fares) {
    const round = roundOf(fare.label)
    const event = events.find(e => roundOf(e.title) === round)
    if (!event) {
      console.log(`[건너뜀] ${fare.label} — 우리 DB에 해당 행사가 없습니다`)
      continue
    }

    const pageHtml = fare.selected
      ? html // 기본으로 열려 있던 회차 — 이미 받아둔 본문이 그것이다
      : await fetchHtml(`${LIST_URL}?fare=${fare.fare}`).catch(() => null)
    if (!pageHtml) {
      console.warn(`[실패] ${fare.label} — 본문을 못 받음`)
      continue
    }

    const booths = parseBooths(pageHtml)
    console.log(`[${fare.label}] ${booths.length}곳 — ${event.title}`)
    if (booths.length === 0) {
      console.log('  아직 등록된 동아리가 없습니다')
      continue
    }

    total += await syncBooths(event, booths)
    await sleep(600)
  }

  console.log(`\n완료: ${total}곳 반영`)
}

// 이름을 키로 맞춘다.
//
// 부스번호로 맞추면 안 된다 — 등록 초기에는 전부 "미배정"이고 번호가 나중에 배정된다.
// 그때 번호로 키를 잡으면 같은 동아리가 두 번 들어간다. 이름은 처음부터 끝까지 그대로다.
async function syncBooths(event, booths) {
  const { data: existing, error } = await supabase
    .from('event_booths')
    .select('id, name, booth_no, operator')
    .eq('event_id', event.id)
  if (error) {
    console.error(`  조회 실패: ${error.message}`)
    return 0
  }

  const byName = new Map(existing.map(b => [b.name, b]))
  const toInsert = []
  const toUpdate = []

  booths.forEach((booth, i) => {
    const found = byName.get(booth.name)
    if (!found) {
      toInsert.push({
        event_id: event.id,
        name: booth.name,
        booth_no: booth.boothNo,
        operator: 'creator',
        sort_order: i,
      })
      return
    }
    // 이미 있는 부스는 번호만 채운다. 관리자가 손본 다른 값(구역·장르·이미지)은
    // 건드리지 않는다 — 자동 수집이 사람의 수정을 덮어쓰면 아무도 안 고치게 된다.
    if (booth.boothNo && booth.boothNo !== found.booth_no) {
      toUpdate.push({ id: found.id, booth_no: booth.boothNo })
    }
  })

  console.log(`  새로 ${toInsert.length}곳 · 번호 채움 ${toUpdate.length}곳 · 이미 있음 ${booths.length - toInsert.length}곳`)
  if (DRY_RUN) return toInsert.length + toUpdate.length

  // 수백~수천 건이라 한 번에 넣는다. 나눠 넣으면 요청이 그만큼 나간다.
  for (let i = 0; i < toInsert.length; i += 500) {
    const chunk = toInsert.slice(i, i + 500)
    const { error: insertError } = await supabase.from('event_booths').insert(chunk)
    if (insertError) console.error(`  저장 실패: ${insertError.message}`)
  }
  for (const row of toUpdate) {
    const { error: updateError } = await supabase
      .from('event_booths').update({ booth_no: row.booth_no }).eq('id', row.id)
    if (updateError) console.error(`  번호 저장 실패: ${updateError.message}`)
  }

  return toInsert.length + toUpdate.length
}

main().catch(err => { console.error(err); process.exit(1) })
