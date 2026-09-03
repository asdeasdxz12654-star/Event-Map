// 게임 뉴스 RSS를 훑어서 행사(전시회/코스프레/콘서트) 소개 기사로 보이는 것만 골라
// Groq(무료 티어)로 구조화 정보를 추출하고, Supabase의 event_drafts 테이블에 "검수 대기"
// 상태로 저장한다. 원래 Anthropic Claude를 썼는데, 유료 크레딧 없이도 돌리고 싶어서 Groq의
// 무료 오픈모델(openai/gpt-oss-20b)로 교체했다 — 실제 한글 기사로 구조화 추출 품질 확인함.
// KOPIS(공연예술통합전산망) 공식 API에서 게임음악 관련 공연도 같은 큐에 합류시킨다 (kopis.mjs).
// KOPIS는 이미 구조화된 공식 데이터라 LLM 없이 필드를 그대로 매핑한다.
// 네이버 뉴스 검색으로 지스타/코믹월드처럼 자체 API 없는 고정 행사도 능동적으로 찾는다
// (naver.mjs) — 이쪽은 RSS와 마찬가지로 자유 텍스트라 Groq 추출을 그대로 거친다.
// 실행: node src/crawl.mjs
// 환경변수: GROQ_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//         KOPIS_API_KEY(선택), NAVER_CLIENT_ID/NAVER_CLIENT_SECRET(선택)
import Parser from 'rss-parser'
import { createClient } from '@supabase/supabase-js'
import { EventExtractionSchema } from './schema.mjs'
import { fetchKopisCandidates, buildKopisDraft } from './kopis.mjs'
import { fetchNaverCandidates } from './naver.mjs'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
// gpt-oss-20b: Groq 무료 티어에서 구조화 추출 품질/속도 확인함. reasoning_effort를 낮게 줘서
// 내부 사고 과정에 토큰을 낭비하지 않고 바로 JSON을 뱉게 한다.
const GROQ_MODEL = 'openai/gpt-oss-20b'

const FEEDS = [
  { name: '게임메카', url: 'https://www.gamemeca.com/rss.php' },
  { name: '루리웹', url: 'https://bbs.ruliweb.com/news/rss' },
  { name: '게임뷰', url: 'https://www.gamevu.co.kr/rss/allArticle.xml' },
  { name: '게임톡', url: 'https://www.gametoc.co.kr/rss/allArticle.xml' },
  { name: '인벤', url: 'https://webzine.inven.co.kr/news/rss.php' },
  { name: '게임인사이트', url: 'https://www.gameinsight.co.kr/rss/allArticle.xml' },
]

// RSS 요약만으로는 정보가 부족한 기사가 많아서, LLM 호출 전에 1차로 걸러내는 키워드.
// (리뷰/업데이트/공략 기사 등은 대부분 여기 안 걸림 -> API 비용 절감)
const KEYWORDS = [
  '전시', '박람회', '페스티벌', '코스프레', '콘서트', '공연', '오케스트라',
  '축제', '행사', '개최', '개막', '티켓', '예매', '지스타', '부스', '컨벤션',
  '팝업스토어', '팝업', '동인', '체험전', '굿즈전', '원화전', '컬래버',
]

const FEED_ITEM_LIMIT = 30 // 피드당 최신 N개까지만 검사

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const parser = new Parser()

// Groq는 Anthropic의 zodOutputFormat 같은 스키마 강제 기능이 없어서, JSON 모양을 프롬프트에
// 직접 명시한다 (schema.mjs의 EventExtractionSchema와 필드가 어긋나지 않게 같이 고칠 것).
const EXTRACTION_SYSTEM_PROMPT = `너는 한국 게임/코스프레/게임음악 행사 뉴스를 분류·추출하는 도우미다.
주어진 기사 제목과 요약을 보고, 이 기사가 "특정 행사(전시회, 코스프레 행사, 콘서트 등)를 구체적으로 소개/공지"하는 기사인지 판단해라.
신작 게임 리뷰, 업데이트 소식, 순위 기사 등 특정 행사 공지가 아니면 is_event를 false로 하고 나머지 필드는 null로 둔다.
행사 공지가 맞으면 알 수 있는 정보만 채우고, 확실하지 않은 필드는 반드시 null로 남겨라 (추측해서 채우지 말 것).
반드시 아래 JSON 형식으로만 답해라 (설명 문장 없이 JSON 객체 하나만):
{"is_event":boolean,"title":string|null,"category":"게임전시"|"코스프레"|"게임음악"|null,"start_date":"YYYY-MM-DD"|null,"end_date":"YYYY-MM-DD"|null,"venue":string|null,"venue_address":string|null,"organizer":string|null,"description":string|null,"ticket_url":string|null,"ticket_open_date":"YYYY-MM-DD"|null,"admission_fee":string|null,"website":string|null,"tags":string[]|null,"confidence":"high"|"medium"|"low"}`

function stripHtml(html = '') {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function looksRelevant(item) {
  const text = `${item.title ?? ''} ${item.contentSnippet ?? item.content ?? ''}`
  return KEYWORDS.some(k => text.includes(k))
}

async function extractEvent(item) {
  const articleText = [
    `제목: ${item.title}`,
    `요약: ${stripHtml(item.contentSnippet ?? item.content ?? '')}`,
    item.pubDate ? `발행일: ${item.pubDate}` : null,
    `링크: ${item.link}`,
  ].filter(Boolean).join('\n')

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

  if (!res.ok) throw new Error(`Groq 요청 실패: HTTP ${res.status} ${await res.text()}`)

  const data = await res.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('Groq 응답에 content 없음')

  return EventExtractionSchema.parse(JSON.parse(content))
}

async function alreadyCollected(sourceUrl) {
  const { data } = await supabase
    .from('event_drafts')
    .select('id')
    .eq('source_url', sourceUrl)
    .maybeSingle()
  return !!data
}

// RSS/KOPIS/네이버 공통 저장 로직 — 성공하면 true, 실패(로그만 남기고 계속 진행)하면 false
async function saveDraft({ source_name, source_url, source_title, published_at, extracted }) {
  const { error } = await supabase.from('event_drafts').insert({
    source_name, source_url, source_title, published_at, extracted,
  })
  if (error) {
    console.error('  -> 저장 실패:', error.message)
    return false
  }
  console.log(`  -> event_drafts에 저장 (신뢰도: ${extracted.confidence})`)
  return true
}

async function main() {
  let scanned = 0
  let candidates = 0
  let saved = 0

  for (const feed of FEEDS) {
    let parsed
    try {
      parsed = await parser.parseURL(feed.url)
    } catch (err) {
      console.error(`[${feed.name}] RSS 조회 실패:`, err.message)
      continue
    }

    for (const item of parsed.items.slice(0, FEED_ITEM_LIMIT)) {
      scanned++
      if (!item.link || !item.title) continue
      if (!looksRelevant(item)) continue
      if (await alreadyCollected(item.link)) continue

      candidates++
      console.log(`[${feed.name}] 후보: ${item.title}`)

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

      const ok = await saveDraft({
        source_name: feed.name,
        source_url: item.link,
        source_title: item.title,
        published_at: item.pubDate ? new Date(item.pubDate).toISOString() : null,
        extracted,
      })
      if (ok) saved++
    }
  }

  console.log(`\n검사한 기사 ${scanned}건 / 키워드 후보 ${candidates}건 / 새로 저장 ${saved}건`)

  // KOPIS(공연예술통합전산망) 게임음악 공연 수집 — 키가 없으면 조용히 스킵 (로컬/부분 실행 지원)
  let kopisScanned = 0
  let kopisSaved = 0

  if (!process.env.KOPIS_API_KEY) {
    console.log('KOPIS_API_KEY 미설정, KOPIS 수집 스킵')
  } else {
    let kopisCandidates = []
    try {
      kopisCandidates = await fetchKopisCandidates()
    } catch (err) {
      console.error('[KOPIS] 후보 조회 실패:', err.message)
    }

    for (const candidate of kopisCandidates) {
      kopisScanned++
      if (!candidate.source_url || !candidate.source_title) continue
      if (await alreadyCollected(candidate.source_url)) continue

      console.log(`[KOPIS] 후보: ${candidate.source_title}`)

      // Claude 호출 없이 KOPIS 원본 필드를 기계적으로 매핑 (비용 없음, 대신 confidence로
      // 신뢰도를 표시해 관리자 검수 페이지에서 최종 판단하도록 함)
      let extracted
      try {
        extracted = buildKopisDraft(candidate)
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
      if (ok) kopisSaved++
    }

    console.log(`[KOPIS] 조회 ${kopisScanned}건 / 새로 저장 ${kopisSaved}건`)
  }

  // 네이버 뉴스 검색 — 지스타/코믹월드처럼 자체 API 없는 고정 행사 보완 (RSS와 동일하게 Claude 추출)
  let naverScanned = 0
  let naverSaved = 0

  if (!process.env.NAVER_CLIENT_ID || !process.env.NAVER_CLIENT_SECRET) {
    console.log('NAVER_CLIENT_ID/NAVER_CLIENT_SECRET 미설정, 네이버 검색 스킵')
  } else {
    let naverItems = []
    try {
      naverItems = await fetchNaverCandidates()
    } catch (err) {
      console.error('[네이버] 후보 조회 실패:', err.message)
    }

    for (const item of naverItems) {
      naverScanned++
      if (!item.link || !item.title) continue
      if (await alreadyCollected(item.link)) continue

      console.log(`[네이버] 후보: ${item.title}`)

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

      const ok = await saveDraft({
        source_name: '네이버검색',
        source_url: item.link,
        source_title: item.title,
        published_at: item.pubDate ? new Date(item.pubDate).toISOString() : null,
        extracted,
      })
      if (ok) naverSaved++
    }

    console.log(`[네이버] 조회 ${naverScanned}건 / 새로 저장 ${naverSaved}건`)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
