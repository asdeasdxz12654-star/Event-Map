// '오늘 예매 오픈'인 행사, '내일 시작'하는 행사를 찾아 구독자 전원에게 FCM 푸시를 보낸다.
// 이벤트당 알림 타입별로 한 번만 보내도록 event_notifications 테이블로 중복 발송을 막는다.
// 실행: node src/send-notifications.mjs
// 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FIREBASE_SERVICE_ACCOUNT_KEY(서비스 계정 JSON 전체를 문자열로)
import { createClient } from '@supabase/supabase-js'
import admin from 'firebase-admin'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)),
})

// 이벤트 날짜가 한국 기준(KST)이라 오늘/내일 판정도 KST로 맞춘다.
function todayKST() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 10)
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

async function alreadyNotified(eventId, type) {
  const { data, error } = await supabase
    .from('event_notifications')
    .select('id')
    .eq('event_id', eventId)
    .eq('type', type)
    .maybeSingle()
  if (error) throw error
  return !!data
}

async function markNotified(eventId, type) {
  // unique(event_id, type) 제약이 있어서, 동시 실행 등으로 이미 있어도 에러로 취급하지 않는다.
  const { error } = await supabase.from('event_notifications').insert({ event_id: eventId, type })
  if (error && error.code !== '23505') throw error
}

async function getAllTokens() {
  const { data, error } = await supabase.from('push_subscriptions').select('token')
  if (error) throw error
  return data.map(row => row.token)
}

async function pruneInvalidTokens(tokens, responses) {
  const invalid = []
  responses.forEach((r, i) => {
    if (r.success) return
    const code = r.error?.code
    if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
      invalid.push(tokens[i])
    }
  })
  if (invalid.length === 0) return
  const { error } = await supabase.from('push_subscriptions').delete().in('token', invalid)
  if (error) console.error('무효 토큰 정리 실패:', error.message)
  else console.log(`  무효 토큰 ${invalid.length}개 정리`)
}

async function notify(tokens, { title, body, url }) {
  if (tokens.length === 0) {
    console.log('  구독자 없음, 발송 스킵')
    return
  }
  const response = await admin.messaging().sendEachForMulticast({
    tokens,
    notification: { title, body },
    data: { url },
  })
  console.log(`  발송 결과: 성공 ${response.successCount} / 실패 ${response.failureCount}`)
  await pruneInvalidTokens(tokens, response.responses)
}

async function main() {
  const today = todayKST()
  const tomorrow = addDays(today, 1)
  console.log(`기준일(KST): 오늘 ${today}, 내일 ${tomorrow}`)

  const tokens = await getAllTokens()
  console.log(`구독 토큰 ${tokens.length}개`)

  const { data: ticketOpenEvents, error: e1 } = await supabase
    .from('events')
    .select('id, title')
    .eq('ticket_open_date', today)
  if (e1) throw e1

  for (const event of ticketOpenEvents ?? []) {
    if (await alreadyNotified(event.id, 'ticket_open')) continue
    console.log(`[예매 오픈] ${event.title}`)
    await notify(tokens, {
      title: '🎟 예매 오픈!',
      body: `${event.title} 예매가 오늘 오픈했어요`,
      url: `/events/${event.id}`,
    })
    await markNotified(event.id, 'ticket_open')
  }

  const { data: startingSoonEvents, error: e2 } = await supabase
    .from('events')
    .select('id, title, venue')
    .eq('start_date', tomorrow)
  if (e2) throw e2

  for (const event of startingSoonEvents ?? []) {
    if (await alreadyNotified(event.id, 'starting_soon')) continue
    console.log(`[행사 임박] ${event.title}`)
    await notify(tokens, {
      title: '📅 내일 행사 시작!',
      body: `${event.title}${event.venue ? ` (${event.venue})` : ''}가 내일 시작해요`,
      url: `/events/${event.id}`,
    })
    await markNotified(event.id, 'starting_soon')
  }

  console.log('완료')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
