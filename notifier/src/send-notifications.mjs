// '오늘 예매 오픈'인 행사, '내일 시작'하는 행사를 찾아 구독자 전원에게 FCM 푸시를 보낸다.
// 이벤트당 알림 타입별로 한 번만 보내도록 event_notifications 테이블로 중복 발송을 막는다.
// 실행: node src/send-notifications.mjs
// 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FIREBASE_SERVICE_ACCOUNT_KEY(서비스 계정 JSON 전체를 문자열로)
import { createClient } from '@supabase/supabase-js'
import { initializeApp, cert } from 'firebase-admin/app'
import { getMessaging } from 'firebase-admin/messaging'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

initializeApp({
  credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)),
})
const messaging = getMessaging()

// PostgREST는 요청당 기본 1000행까지만 준다 — 그냥 select하면 구독자가 1000명을 넘는
// 순간 에러도 없이 앞쪽 1000개만 발송된다. range()로 끝까지 페이징한다.
const PAGE_SIZE = 1000
// sendEachForMulticast는 호출당 토큰 500개가 상한이다.
const SEND_CHUNK = 500
// .in('token', [...]) 필터는 토큰이 그대로 URL 쿼리에 실린다. FCM 토큰이 160자 안팎이라
// 한 번에 너무 많이 넣으면 URL 길이 제한에 걸려서, 필터는 따로 잘게 나눈다.
const FILTER_CHUNK = 50

function chunk(list, size) {
  const out = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

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
  const tokens = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('push_subscriptions')
      .select('token')
      .order('id', { ascending: true }) // 페이지 사이에 순서가 흔들려 누락/중복되지 않게
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    tokens.push(...data.map(row => row.token))
    if (data.length < PAGE_SIZE) return tokens
  }
}

const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
])

async function deleteTokens(tokens) {
  if (tokens.length === 0) return
  for (const batch of chunk(tokens, FILTER_CHUNK)) {
    const { error } = await supabase.from('push_subscriptions').delete().in('token', batch)
    if (error) {
      console.error('  무효 토큰 정리 실패:', error.message)
      return
    }
  }
  console.log(`  무효 토큰 ${tokens.length}개 정리`)
}

// 발송에 성공한 토큰은 "아직 살아있는 기기"라는 뜻이라 last_seen_at을 갱신한다 —
// cleanup_stale_push_tokens()가 이 값을 기준으로 오래된 토큰만 지운다.
async function touchTokens(tokens) {
  if (tokens.length === 0) return
  const now = new Date().toISOString()
  for (const batch of chunk(tokens, FILTER_CHUNK)) {
    const { error } = await supabase
      .from('push_subscriptions')
      .update({ last_seen_at: now })
      .in('token', batch)
    if (error) {
      // 컬럼이 아직 없는 환경(마이그레이션 미적용)에서도 발송 자체는 성공했으므로
      // 실패로 처리하지 않는다.
      console.warn('  last_seen_at 갱신 건너뜀:', error.message)
      return
    }
  }
  console.log(`  살아있는 토큰 ${tokens.length}개 last_seen_at 갱신`)
}

// 이번 실행에서 한 번이라도 발송에 성공한 토큰 (마지막에 모아서 last_seen_at 갱신)
const deliveredTokens = new Set()

// 무효로 확인돼 이미 지운 토큰. 한 번 실행에서 알림을 여러 건 보내는데(예매 오픈 + 행사
// 임박), 죽은 토큰을 걸러내지 않으면 남은 알림마다 같은 토큰으로 또 보내고 또 실패한다.
const deadTokens = new Set()

async function notify(allTokens, { title, body, url }) {
  const tokens = allTokens.filter(t => !deadTokens.has(t))
  if (tokens.length === 0) {
    console.log('  구독자 없음, 발송 스킵')
    return
  }
  let successCount = 0
  let failureCount = 0
  const invalid = []

  for (const batch of chunk(tokens, SEND_CHUNK)) {
    const response = await messaging.sendEachForMulticast({
      tokens: batch,
      notification: { title, body },
      data: { url },
    })
    successCount += response.successCount
    failureCount += response.failureCount
    response.responses.forEach((r, i) => {
      if (r.success) deliveredTokens.add(batch[i])
      else if (DEAD_TOKEN_CODES.has(r.error?.code)) invalid.push(batch[i])
    })
  }

  console.log(`  발송 결과: 성공 ${successCount} / 실패 ${failureCount}`)
  await deleteTokens(invalid)
  for (const token of invalid) {
    deliveredTokens.delete(token)
    deadTokens.add(token)
  }
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

  await touchTokens([...deliveredTokens])

  // 오래된 토큰 정리. 이 함수를 부르는 워크플로가 따로 없어서 여기에 붙였다 —
  // service_role로만 실행 가능하고, 조건에 맞는 행이 없으면 아무것도 안 지운다.
  const { data: deleted, error: cleanupError } = await supabase.rpc('cleanup_stale_push_tokens')
  if (cleanupError) console.warn('오래된 토큰 정리 건너뜀:', cleanupError.message)
  else if (deleted) console.log(`오래된 토큰 ${deleted}개 삭제`)

  console.log('완료')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
