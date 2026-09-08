// 이미 events 테이블에 들어가 있는 고정 행사들의 입장료를 강제 업데이트하는 일회성 스크립트.
// known-events.mjs는 source_url 중복 방지 때문에 이미 등록된 행사를 다시 쓰지 않으므로,
// known-events.mjs에 새로 채운 admission_fee를 기존 DB 행에 반영하려면 이 스크립트로 직접 업데이트한다.
// 실행: node src/update-admission-fees.mjs
// 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const UPDATES = [
  ['지스타%', '성인 18,000원 / 청소년 8,000원 (BTC 일반 사전예매, 100% 예매제)'],
  ['플레이엑스포%', '3,000원 (미취학아동·만 65세 이상·장애인·국가유공자·현역 군인/경찰/소방관 무료)'],
  ['부산인디커넥트페스티벌%', '오프라인 1일권 성인 15,000원·청소년 12,500원 / 2일권 성인 30,000원·청소년 25,000원 (공식 홈페이지 사전예매 20% 할인)'],
  ['코믹월드%', '사전예매 7,000원 (현장 구매 10,000원)'],
  ['BIAF%', '개막작 30,000원 / 일반 상영작 8,000원 / 특별토크 15,000원 (2025년 기준, 2026년 가격 미확정)'],
  ['AGF%', '공식 미정'],
  ['제94회 코스앤코믹%', '공식 미정'],
  ['제95회 코스앤코믹%', '공식 미정'],
]

async function updateFee(titlePattern, admissionFee) {
  const { data, error } = await supabase
    .from('events')
    .update({ admission_fee: admissionFee })
    .ilike('title', titlePattern)
    .is('admission_fee', null)
    .select('id, title, admission_fee')

  if (error) {
    console.error(`[update-admission-fees] ${titlePattern} 업데이트 실패:`, error.message)
    return
  }
  console.log(`[update-admission-fees] ${titlePattern} → ${data.length}건 업데이트`)
  for (const row of data) console.log(`  - [${row.id}] ${row.title}`)
}

// 일러스타 페스 12는 실제로는 14회차(2026-10-10~11 KINTEX)인데 known-events.mjs에
// 잘못된 회차 번호로 등록돼 있었다 — 제목과 입장료를 함께 바로잡는다.
// (source_url dedup 유지를 위해 known-events.mjs의 slug는 그대로 두고 title만 고쳤음)
async function fixIllustarfes14() {
  const { data, error } = await supabase
    .from('events')
    .update({
      title: '일러스타 페스 14',
      admission_fee: '선행입장권 12,000원(입장권만)·14,000원(탈의실 이용권 포함) / 일반입장권 7,000원·9,000원',
    })
    .eq('title', '일러스타 페스 12')
    .eq('start_date', '2026-10-10')
    .select('id, title, admission_fee')

  if (error) {
    console.error('[update-admission-fees] 일러스타 페스 12→14 수정 실패:', error.message)
    return
  }
  console.log(`[update-admission-fees] 일러스타 페스 12→14 → ${data.length}건 업데이트`)
  for (const row of data) console.log(`  - [${row.id}] ${row.title}`)
}

for (const [pattern, fee] of UPDATES) {
  await updateFee(pattern, fee)
}
await fixIllustarfes14()
console.log('완료')
