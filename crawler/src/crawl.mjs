// 게임 뉴스 RSS를 훑어서 행사(전시회/코스프레/콘서트) 소개 기사로 보이는 것만 골라
// Claude로 구조화 정보를 추출하고, Supabase의 event_drafts 테이블에 "검수 대기" 상태로 저장한다.
// KOPIS(공연예술통합전산망) 공식 API에서 게임음악 관련 공연도 같은 큐에 합류시킨다 (kopis.mjs).
// 실행: node src/crawl.mjs
// 환경변수: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, KOPIS_API_KEY(선택)
import Parser from 'rss-parser'
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { createClient } from '@supabase/supabase-js'
import { EventExtractionSchema } from './schema.mjs'
import { fetchKopisCandidates, extractKopisEvent } from './kopis.mjs'

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

const client = new Anthropic()
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const parser = new Parser()

const EXTRACTION_SYSTEM_PROMPT = `너는 한국 게임/코스프레/게임음악 행사 뉴스를 분류·추출하는 도우미다.
주어진 기사 제목과 요약을 보고, 이 기사가 "특정 행사(전시회, 코스프레 행사, 콘서트 등)를 구체적으로 소개/공지"하는 기사인지 판단해라.
신작 게임 리뷰, 업데이트 소식, 순위 기사 등 특정 행사 공지가 아니면 is_event를 false로 하고 나머지 필드는 null로 둔다.
행사 공지가 맞으면 알 수 있는 정보만 채우고, 확실하지 않은 필드는 반드시 null로 남겨라 (추측해서 채우지 말 것).`

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

  const response = await client.messages.parse({
    model: 'claude-opus-5',
    max_tokens: 2048,
    output_config: {
      effort: 'low', // 짧은 텍스트 분류/추출이라 낮은 effort로 충분, 대량 처리 비용 절감
      format: zodOutputFormat(EventExtractionSchema),
    },
    system: EXTRACTION_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: articleText }],
  })

  return response.parsed_output
}

async function alreadyCollected(sourceUrl) {
  const { data } = await supabase
    .from('event_drafts')
    .select('id')
    .eq('source_url', sourceUrl)
    .maybeSingle()
  return !!data
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

      const { error } = await supabase.from('event_drafts').insert({
        source_name: feed.name,
        source_url: item.link,
        source_title: item.title,
        published_at: item.pubDate ? new Date(item.pubDate).toISOString() : null,
        extracted,
      })

      if (error) {
        console.error('  -> 저장 실패:', error.message)
      } else {
        saved++
        console.log(`  -> event_drafts에 저장 (신뢰도: ${extracted.confidence})`)
      }
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

      let extracted
      try {
        extracted = await extractKopisEvent(candidate)
      } catch (err) {
        console.error('  -> 추출 실패:', err.message)
        continue
      }

      if (!extracted || !extracted.is_event) {
        console.log('  -> 게임음악 공연 아님, 스킵')
        continue
      }

      const { error } = await supabase.from('event_drafts').insert({
        source_name: candidate.source_name,
        source_url: candidate.source_url,
        source_title: candidate.source_title,
        published_at: candidate.published_at,
        extracted,
      })

      if (error) {
        console.error('  -> 저장 실패:', error.message)
      } else {
        kopisSaved++
        console.log(`  -> event_drafts에 저장 (신뢰도: ${extracted.confidence})`)
      }
    }

    console.log(`[KOPIS] 조회 ${kopisScanned}건 / 새로 저장 ${kopisSaved}건`)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
