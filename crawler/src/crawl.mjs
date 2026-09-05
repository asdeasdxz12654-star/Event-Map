// 게임 행사(전시회/코스프레/콘서트) 소개 기사로 보이는 것만 골라 Groq(무료 티어)로 구조화
// 정보를 추출하고, Supabase의 event_drafts 테이블에 "검수 대기" 상태로 저장한다. 원래
// Anthropic Claude를 썼는데, 유료 크레딧 없이도 돌리고 싶어서 Groq의 무료 오픈모델
// (openai/gpt-oss-20b)로 교체했다 — 실제 한글 기사로 구조화 추출 품질 확인함.
// KOPIS(공연예술통합전산망) 공식 API에서 게임음악 관련 공연도 같은 큐에 합류시킨다 (kopis.mjs).
// KINTEX(경기데이터드림 오픈API)의 행사 일정도 게임/애니/코스프레 키워드로 걸러 같은 방식으로
// 합류시킨다 (kintex.mjs). 영등위 "외국인 국내 공연추천"에서는 일본 애니송/J-POP 아티스트
// 내한공연과 게임/애니 콘서트를 찾는다 (kmrb.mjs). 셋 다 이미 구조화된 공식 데이터라 LLM
// 없이 필드를 그대로 매핑한다.
// 네이버 뉴스 검색으로 지스타/코믹월드처럼 자체 API 없는 고정 행사도 능동적으로 찾는다
// (naver.mjs) — 자유 텍스트라 Groq 추출을 거친다. 게임메카·루리웹·인벤 등 개별 매체 RSS는
// 쓰지 않는다 — 네이버가 이 매체들을 포함해 전부 색인하므로, 매체별 RSS/스크래핑을 유지
// 보수하는 대신 naver.mjs의 검색어에 원하는 키워드를 추가하는 쪽이 훨씬 안정적이다
// (매체 사이트 개편에 안 깨지고, 원문 링크도 그대로 나옴).
// confidence:high는 검수 없이 바로 승인해서 자동으로 사이트에 노출된다 (saveDraft 참고).
// 실행: node src/crawl.mjs
// 환경변수: GROQ_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//         KOPIS_API_KEY(선택), NAVER_CLIENT_ID/NAVER_CLIENT_SECRET(선택), KINTEX_API_KEY(선택),
//         KMRB_API_KEY(선택)
import { createClient } from '@supabase/supabase-js'
import { EventExtractionSchema } from './schema.mjs'
import { fetchKopisCandidates, buildKopisDraft } from './kopis.mjs'
import { fetchKintexCandidates, buildKintexDraft } from './kintex.mjs'
import { fetchKmrbCandidates, buildKmrbDraft } from './kmrb.mjs'
import { fetchNaverCandidates, fetchNaverCafeCandidates } from './naver.mjs'
import { lookupVenueCoords } from './naver-local.mjs'
import { fetchOfficialSiteCandidates } from './official-sites.mjs'
import { fetchNaverLoungeCandidates } from './naver-lounge.mjs'
import { upsertKnownEvents } from './known-events.mjs'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
// gpt-oss-20b: Groq 무료 티어에서 구조화 추출 품질/속도 확인함. reasoning_effort를 낮게 줘서
// 내부 사고 과정에 토큰을 낭비하지 않고 바로 JSON을 뱉게 한다.
const GROQ_MODEL = 'openai/gpt-oss-20b'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Groq는 Anthropic의 zodOutputFormat 같은 스키마 강제 기능이 없어서, JSON 모양을 프롬프트에
// 직접 명시한다 (schema.mjs의 EventExtractionSchema와 필드가 어긋나지 않게 같이 고칠 것).
const EXTRACTION_SYSTEM_PROMPT = `너는 한국 게임/코스프레/게임음악 행사 뉴스를 분류·추출하는 도우미다.
주어진 기사 제목과 요약을 보고, 이 기사가 행사(전시회, 코스프레 행사, 콘서트 등)와 관련된 기사인지 판단해라.
신작 게임 리뷰, 업데이트 소식, 순위 기사 등 행사와 무관한 기사는 is_event를 false로 하고 나머지 필드는 null로 둔다.
행사를 직접 소개하는 기사뿐 아니라, 'OO사가 지스타 2026에 참가한다', 'PlayX4에 부스를 운영한다'처럼
특정 업체의 행사 참가를 알리는 기사도 is_event를 true로 하고, 그 기사로 알 수 있는 행사 자체의
정보(title, 날짜, 장소)를 추출해라. 참가하는 회사명은 organizer 대신 tags에 담아라.
제목이 '[공식]'으로 시작하는 항목은 행사 공식 웹사이트에서 가져온 내용이므로 is_event는 항상 true다.
페이지에서 파악되는 가장 가까운 예정 또는 진행 중인 행사 일정을 추출해라.
한국 국내에서 개최되는 행사만 is_event를 true로 한다. 해외(일본·중국·대만·미국 등)에서 열리는 행사는 is_event를 false로 한다.
알 수 있는 정보만 채우고, 확실하지 않은 필드는 반드시 null로 남겨라 (추측해서 채우지 말 것).
confidence 기준 — 아래를 엄격히 따라라:
- "high"  : title·start_date·venue 세 가지가 모두 기사에서 명확히 확인됨
- "medium": title은 확실하지만 start_date 또는 venue 중 하나가 불확실하거나 null
- "low"   : start_date·venue 둘 다 불확실하거나 미정
티켓·입장료·웹사이트 등 다른 필드가 null이어도 위 세 가지만 있으면 "high"로 줘라.
title은 반드시 "행사 자체의 정식 명칭"이어야 한다 (예: "지스타 2026"). 기사 헤드라인이나
"OO사, 지스타 참가" 같은 참가사 중심 문장을 그대로 title로 쓰지 마라 — 같은 행사를 다루는
기사마다 title이 달라지면 나중에 중복 행사로 잘못 등록된다. 여러 회사가 같은 행사에
참가하는 기사여도 title/start_date/venue는 그 행사 자체의 정보로 통일해서 채워라.
반드시 아래 JSON 형식으로만 답해라 (설명 문장 없이 JSON 객체 하나만):
{"is_event":boolean,"title":string|null,"category":"게임전시"|"코스프레"|"게임음악"|null,"start_date":"YYYY-MM-DD"|null,"end_date":"YYYY-MM-DD"|null,"venue":string|null,"venue_address":string|null,"organizer":string|null,"description":string|null,"ticket_url":string|null,"ticket_open_date":"YYYY-MM-DD"|null,"admission_fee":string|null,"website":string|null,"tags":string[]|null,"confidence":"high"|"medium"|"low"}`

function stripHtml(html = '') {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const GROQ_MAX_RETRIES = 5 // 무료 티어 분당 토큰 한도(TPM)에 자주 걸려서, 서버가 알려주는
// 대기 시간만큼 기다렸다가 재시도한다 (고정 딜레이보다 실제 토큰 버킷 상태에 맞게 정확함).

async function callGroq(articleText) {
  for (let attempt = 0; attempt <= GROQ_MAX_RETRIES; attempt++) {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        reasoning_effort: 'low', // 내부 사고에 토큰 낭비 안 하고 바로 JSON 출력하게 함
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
          { role: 'user', content: articleText },
        ],
        max_tokens: 1024,
      }),
    })

    if (res.ok) return res

    const bodyText = await res.text()
    if (res.status === 429 && attempt < GROQ_MAX_RETRIES) {
      const waitSec = parseFloat(bodyText.match(/try again in ([\d.]+)s/i)?.[1] ?? '5')
      const waitMs = Math.ceil(waitSec * 1000) + 300 // 여유분 300ms
      console.log(`  -> Groq 분당 한도 초과, ${(waitMs / 1000).toFixed(1)}초 대기 후 재시도`)
      await sleep(waitMs)
      continue
    }
    throw new Error(`Groq 요청 실패: HTTP ${res.status} ${bodyText}`)
  }
}

const VALID_CATEGORIES = ['게임전시', '코스프레', '게임음악']

const OVERSEAS_KEYWORDS = [
  '타이베이', '도쿄', '오사카', '교토', '나고야', '요코하마', '삿포로', '후쿠오카',
  '상하이', '베이징', '광저우', '청두', '홍콩', '마카오', '싱가포르', '방콕',
  '뉴욕', '로스앤젤레스', '라스베가스', '런던', '파리', 'taipei', 'tokyo',
  'osaka', 'shanghai', 'beijing', 'hongkong', 'singapore', 'bangkok',
]

function isOverseasVenue(venue, venueAddress) {
  const text = `${venue ?? ''} ${venueAddress ?? ''}`.toLowerCase()
  return OVERSEAS_KEYWORDS.some(kw => text.includes(kw.toLowerCase()))
}

async function extractEvent(item) {
  const articleText = [
    `제목: ${item.title}`,
    `요약: ${stripHtml(item.contentSnippet ?? item.content ?? '')}`,
    item.pubDate ? `발행일: ${item.pubDate}` : null,
    `링크: ${item.link}`,
  ].filter(Boolean).join('\n')

  const res = await callGroq(articleText)
  const data = await res.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('Groq 응답에 content 없음')

  const raw = JSON.parse(content)
  // Anthropic의 tool-use와 달리 Groq는 enum을 강제하지 못해서, 가끔 셋 중 하나가 아닌 값을
  // 뱉을 때가 있다 (예: "콘서트"). 그 필드 하나 때문에 통째로 버리지 않고 null로 완화한다.
  if (raw.category && !VALID_CATEGORIES.includes(raw.category)) raw.category = null

  return EventExtractionSchema.parse(raw)
}

async function alreadyCollected(sourceUrl) {
  const { data } = await supabase
    .from('event_drafts')
    .select('id')
    .eq('source_url', sourceUrl)
    .maybeSingle()
  return !!data
}

// 행사 ID가 있고 venue 정보가 있을 때만 네이버 지역 API로 좌표를 조회해 events에 업데이트한다.
// 좌표가 이미 있는 행사(dedup으로 기존 행사에 연결된 경우)는 덮어쓰지 않는다.
async function attachCoords(eventId, venue, venueAddress) {
  if (!eventId) return
  const coords = await lookupVenueCoords(venue, venueAddress)
  if (!coords) return
  const { error } = await supabase
    .from('events')
    .update({ venue_lat: coords.lat, venue_lng: coords.lng })
    .eq('id', eventId)
    .is('venue_lat', null) // 이미 좌표가 있으면 덮어쓰지 않음
  if (error) console.warn('  [지역검색] 좌표 저장 실패:', error.message)
  else console.log(`  -> 좌표 설정: ${coords.lat}, ${coords.lng}`)
}

// RSS/KOPIS/네이버 공통 저장 로직 — 성공하면 true, 실패(로그만 남기고 계속 진행)하면 false.
// 자동 승인 조건:
//   1) confidence:high — Groq가 title·start_date·venue 모두 확인했다고 판단
//   2) confidence:medium이어도 start_date·venue 둘 다 null이 아닌 경우
//      (티켓·입장료 등 부가 정보가 없어서 medium이 된 케이스를 구제)
// 잘못 승인된 경우 events에서 직접 삭제하면 된다.
function shouldAutoApprove(extracted) {
  if (extracted.confidence === 'high') return true
  if (extracted.confidence === 'medium' && extracted.start_date && extracted.venue) return true
  return false
}

async function saveDraft({ source_name, source_url, source_title, published_at, extracted }) {
  const { data, error } = await supabase
    .from('event_drafts')
    .insert({ source_name, source_url, source_title, published_at, extracted })
    .select('id')
    .single()

  if (error) {
    console.error('  -> 저장 실패:', error.message)
    return false
  }
  console.log(`  -> event_drafts에 저장 (신뢰도: ${extracted.confidence})`)

  if (shouldAutoApprove(extracted)) {
    const { data: approved, error: approveError } = await supabase
      .from('event_drafts')
      .update({ status: 'approved' }) // promote_event_draft() 트리거가 events에 반영
      .eq('id', data.id)
      .select('promoted_event_id')
      .single()
    if (approveError) {
      console.error('  -> 자동 승인 실패(검수 대기로 남음):', approveError.message)
    } else {
      console.log(`  -> confidence:${extracted.confidence} + 날짜·장소 확정 -> 자동 승인됨`)
      await attachCoords(approved?.promoted_event_id, extracted.venue, extracted.venue_address)
    }
  }

  return true
}

// KOPIS/KINTEX/KMRB처럼 이미 구조화된 공식 데이터 소스를 공통으로 처리한다 — Groq 호출 없이
// buildFn이 원본 필드를 그대로 매핑하고(비용 없음), "진짜 관련 행사인지"는 confidence로
// 표시해 관리자 검수 페이지에서 최종 판단하도록 한다. envVar가 없으면 조용히 스킵한다
// (로컬/부분 실행 지원).
async function processStructuredSource({ label, envVar, fetchFn, buildFn }) {
  if (!process.env[envVar]) {
    console.log(`${envVar} 미설정, ${label} 수집 스킵`)
    return
  }

  let candidates = []
  try {
    candidates = await fetchFn()
  } catch (err) {
    console.error(`[${label}] 후보 조회 실패:`, err.message)
  }

  let scanned = 0
  let saved = 0

  for (const candidate of candidates) {
    scanned++
    if (!candidate.source_url || !candidate.source_title) continue
    if (await alreadyCollected(candidate.source_url)) continue

    console.log(`[${label}] 후보: ${candidate.source_title}`)

    let extracted
    try {
      extracted = buildFn(candidate)
    } catch (err) {
      console.error('  -> 매핑 실패:', err.message)
      continue
    }

    const ok = await saveDraft({
      source_name: candidate.source_name,
      source_url: candidate.source_url,
      source_title: candidate.source_title,
      published_at: candidate.published_at,
      extracted,
    })
    if (ok) saved++
  }

  console.log(`[${label}] 조회 ${scanned}건 / 새로 저장 ${saved}건`)
}

// 네이버 뉴스/카페 검색 결과처럼 "RSS 아이템과 같은 모양의 자유 텍스트 후보"를 공통으로
// 처리한다 (자유 텍스트라 위 구조화 소스와 달리 Groq 추출이 필요함).
async function processTextCandidates(label, sourceName, items) {
  let scanned = 0
  let saved = 0

  for (const item of items) {
    scanned++
    if (!item.link || !item.title) continue
    if (await alreadyCollected(item.link)) continue

    console.log(`[${label}] 후보: ${item.title}`)

    let extracted
    try {
      extracted = await extractEvent(item)
    } catch (err) {
      console.error('  -> 추출 실패:', err.message)
      continue
    }

    if (!extracted || !extracted.is_event) {
      console.log('  -> 행사 소개 기사 아님, 스킵')
      continue
    }

    if (isOverseasVenue(extracted.venue, extracted.venue_address)) {
      console.log(`  -> 해외 행사(${extracted.venue}), 스킵`)
      continue
    }

    const ok = await saveDraft({
      source_name: sourceName,
      source_url: item.link,
      source_title: item.title,
      published_at: item.pubDate ? new Date(item.pubDate).toISOString() : null,
      extracted,
    })
    if (ok) saved++
  }

  console.log(`[${label}] 조회 ${scanned}건 / 새로 저장 ${saved}건`)
}

async function main() {
  // 날짜 공식으로 계산 가능한 정기 행사를 LLM 없이 먼저 등록
  await upsertKnownEvents(supabase)

  // 구조화된 공식 데이터 소스 3종 — KOPIS(게임음악 공연), KINTEX(경기데이터드림, 게임/애니/
  // 코스프레 행사), 영등위(외국인 국내 공연추천, 일본 애니송/J-POP 내한). 각 API 키가 없으면
  // 해당 소스만 조용히 스킵된다 (로컬/부분 실행 지원).
  const STRUCTURED_SOURCES = [
    { label: 'KOPIS', envVar: 'KOPIS_API_KEY', fetchFn: fetchKopisCandidates, buildFn: buildKopisDraft },
    { label: '킨텍스', envVar: 'KINTEX_API_KEY', fetchFn: fetchKintexCandidates, buildFn: buildKintexDraft },
    { label: '영등위', envVar: 'KMRB_API_KEY', fetchFn: fetchKmrbCandidates, buildFn: buildKmrbDraft },
  ]
  for (const source of STRUCTURED_SOURCES) {
    await processStructuredSource(source)
  }

  // 네이버 뉴스 검색 — 지스타/코믹월드처럼 자체 API 없는 고정 행사 보완 (RSS와 동일하게 Groq 추출)
  if (!process.env.NAVER_CLIENT_ID || !process.env.NAVER_CLIENT_SECRET) {
    console.log('NAVER_CLIENT_ID/NAVER_CLIENT_SECRET 미설정, 네이버 검색 스킵')
  } else {
    let naverItems = []
    try {
      naverItems = await fetchNaverCandidates() // 제목 필터는 naver.mjs 안에서 적용됨
      console.log(`[네이버] 제목 필터 후 후보 ${naverItems.length}건`)
    } catch (err) {
      console.error('[네이버] 후보 조회 실패:', err.message)
    }
    await processTextCandidates('네이버', '네이버검색', naverItems)

    // 네이버 카페 검색 — 호요버스 게임(원신/붕괴 스타레일)은 공식 카페 공지에 행사가 먼저
    // 올라오는 경우가 많아서 별도로 찾는다 (같은 NAVER_CLIENT_ID/SECRET, 같은 시크릿 필요).
    let cafeItems = []
    try {
      cafeItems = await fetchNaverCafeCandidates()
    } catch (err) {
      console.error('[네이버카페] 후보 조회 실패:', err.message)
    }
    await processTextCandidates('네이버카페', '네이버카페', cafeItems)
  }

  // 네이버 게임 라운지 공지 — 하루 1회만 조회 (수동 실행 중복 방지)
  // 오늘 날짜를 source_url로 쓴 sentinel이 event_drafts에 없을 때만 API를 호출한다.
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD (UTC 기준, 실용상 무방)
  const loungeDailyKey = `naver-lounge://daily/${today}`
  if (await alreadyCollected(loungeDailyKey)) {
    console.log('[라운지] 오늘 이미 조회됨, 스킵')
  } else {
    let loungeItems = []
    let loungeFetchOk = false
    try {
      loungeItems = await fetchNaverLoungeCandidates()
      loungeFetchOk = true
    } catch (err) {
      console.error('[라운지] 후보 조회 실패:', err.message)
    }
    await processTextCandidates('라운지', '네이버라운지', loungeItems)

    if (!loungeFetchOk) {
      // 조회 자체가 실패했으면 sentinel을 남기지 않는다 — 남기면 오늘 재시도해도
      // alreadyCollected()가 true를 반환해서 실제로는 한 번도 성공 못 한 채 스킵된다.
      console.log('[라운지] 조회 실패로 오늘의 sentinel은 남기지 않음 (다음 실행에서 재시도)')
    } else {
      // 조회 완료 sentinel 삽입 — 다음 실행에서 alreadyCollected()가 true를 반환하게 됨
      const { error: sentinelError } = await supabase.from('event_drafts').insert({
        source_name: '네이버라운지',
        source_url: loungeDailyKey,
        source_title: `[라운지 일일 조회 완료] ${today}`,
        published_at: new Date().toISOString(),
        status: 'rejected',
        extracted: {
          is_event: false, confidence: 'low',
          title: null, category: null, start_date: null, end_date: null,
          venue: null, venue_address: null, organizer: null, description: null,
          ticket_url: null, ticket_open_date: null, admission_fee: null,
          website: null, tags: null,
        },
      })
      if (sentinelError) {
        console.error('[라운지] 일일 sentinel 저장 실패:', sentinelError.message)
      }
    }
  }

  // 공식 행사 사이트 직접 수집 — 뉴스/카페보다 날짜가 정확하고 빠름. 별도 환경변수 불필요.
  let officialItems = []
  try {
    officialItems = await fetchOfficialSiteCandidates()
  } catch (err) {
    console.error('[공식사이트] 후보 조회 실패:', err.message)
  }
  await processTextCandidates('공식사이트', '공식사이트', officialItems)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
