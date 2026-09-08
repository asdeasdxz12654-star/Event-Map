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

for (const [pattern, fee] of UPDATES) {
  await updateFee(pattern, fee)
}
console.log('완료')
