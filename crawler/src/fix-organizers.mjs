// 주최측(organizer)이 없는 행사에 네이버 뉴스 검색 + Groq 추출로 주최사를 채운다.
// 실행: node src/fix-organizers.mjs [--fix]
// 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NAVER_CLIENT_ID, NAVER_CLIENT_SECRET, GROQ_API_KEY
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const FIX = process.argv.includes('--fix')

const NAVER_NEWS_URL = 'https://naverapihub.apigw.ntruss.com/search/v1/news'
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL = 'openai/gpt-oss-20b'

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
function stripHtml(s = '') { return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() }

// 타이틀 패턴으로 주최사를 확정할 수 있는 경우를 먼저 처리한다.
const KNOWN_ORGANIZERS = [
  { match: t => /띵조|명조.*(페스티벌|콘서트|월드 투어)|명조 콘서트/.test(t), organizer: '쿠로게임즈' },
  { match: t => /호요랜드/.test(t),                                             organizer: '호요버스' },
  { match: t => /이환/.test(t),                                                 organizer: '페이퍼게임즈' },
  { match: t => /지스타/.test(t),                                               organizer: '한국게임산업협회' },
  { match: t => /코스앤코믹/.test(t),                                            organizer: '코스앤코믹' },
  { match: t => /XMF|XNTERSTELLAR/.test(t),                                    organizer: 'XMF 조직위원회, 일한문화교류회' },
  { match: t => /AGF/.test(t),                                                  organizer: 'AGF 조직위원회' },
]

// AGF는 킨텍스 개최인데 DB에 코엑스로 잘못 들어간 경우를 수정한다.
const VENUE_CORRECTIONS = [
  {
    match: (t, v) => /AGF/.test(t) && v?.includes('코엑스'),
    venue: 'KINTEX 제1전시장',
    venue_address: '경기도 고양시 일산서구 킨텍스로 217-60',
  },
]

function resolveKnown(title) {
  return KNOWN_ORGANIZERS.find(r => r.match(title))?.organizer ?? null
}

async function searchNaverNews(query) {
  const url = new URL(NAVER_NEWS_URL)
  url.searchParams.set('query', query)
  url.searchParams.set('display', '5')
  url.searchParams.set('sort', 'sim')
  const res = await fetch(url, {
    headers: {
      'X-NCP-APIGW-API-KEY-ID': process.env.NAVER_CLIENT_ID,
      'X-NCP-APIGW-API-KEY': process.env.NAVER_CLIENT_SECRET,
    },
    signal: AbortSignal.timeout(8_000),
  })
  if (!res.ok) return []
  const data = await res.json()
  return data.items ?? []
}

async function extractOrganizerWithGroq(title, snippets) {
  if (!process.env.GROQ_API_KEY) return null
  const context = snippets.map((s, i) => `[${i + 1}] ${s}`).join('\n')
  const prompt = `행사명: "${title}"\n\n뉴스 기사 발췌:\n${context}\n\n위 행사의 주최사(주최, 주관, 주최측)가 어디인지 짧게 답해라. 명확하지 않으면 null을 답해라.\n반드시 JSON 형식으로만: {"organizer": "주최사명" | null}`

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: 80,
      }),
      signal: AbortSignal.timeout(15_000),
    })

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('retry-after') ?? '10')
      console.log(`    [Groq] 429 → ${retryAfter}s 대기`)
      await sleep(retryAfter * 1000)
      continue
    }
    if (!res.ok) { console.warn(`    [Groq] HTTP ${res.status}`); return null }

    const data = await res.json()
    const text = data.choices?.[0]?.message?.content ?? ''
    try {
      const match = text.match(/\{[\s\S]*\}/)
      if (!match) return null
      const parsed = JSON.parse(match[0])
      return parsed.organizer ?? null
    } catch { return null }
  }
  return null
}

async function main() {
  const { data: events, error } = await supabase
    .from('events')
    .select('id, title, start_date, venue')
    .is('organizer', null)
    .order('start_date')

  if (error) { console.error('조회 실패:', error.message); process.exit(1) }
  console.log(`주최측 없는 행사 ${events.length}건 (--fix: ${FIX})\n`)

  let updated = 0

  for (const event of events) {
    console.log(`[${event.start_date}] ${event.title}`)

    // 1) 타이틀 패턴으로 즉시 해결
    const known = resolveKnown(event.title)
    if (known) {
      console.log(`  -> 패턴 매칭: ${known}`)
      const patch = { organizer: known }

      // 장소 보정이 필요한 경우 함께 처리
      const venueCorr = VENUE_CORRECTIONS.find(r => r.match(event.title, event.venue))
      if (venueCorr) {
        patch.venue = venueCorr.venue
        patch.venue_address = venueCorr.venue_address
        console.log(`  -> 장소 보정: ${event.venue} → ${venueCorr.venue}`)
      }

      if (FIX) {
        const { error: e } = await supabase.from('events').update(patch).eq('id', event.id)
        if (e) console.error(`  -> 저장 실패: ${e.message}`)
        else { console.log(`  -> 저장 완료`); updated++ }
      }
      await sleep(100)
      continue
    }

    // 2) 네이버 뉴스 검색
    let items = []
    try {
      items = await searchNaverNews(`${event.title} 주최`)
      if (items.length === 0) items = await searchNaverNews(event.title)
    } catch (err) {
      console.warn(`  -> 뉴스 검색 실패: ${err.message}`)
      await sleep(300)
      continue
    }

    if (items.length === 0) {
      console.log('  -> 뉴스 없음, 스킵')
      await sleep(300)
      continue
    }

    const snippets = items.map(i => `${stripHtml(i.title)} — ${stripHtml(i.description)}`).slice(0, 5)
    const organizer = await extractOrganizerWithGroq(event.title, snippets)

    if (!organizer) {
      console.log('  -> 주최사 미확인, 스킵')
      await sleep(300)
      continue
    }

    console.log(`  -> Groq 추출: ${organizer}`)
    if (FIX) {
      const { error: e } = await supabase.from('events').update({ organizer }).eq('id', event.id)
      if (e) console.error(`  -> 저장 실패: ${e.message}`)
      else { console.log(`  -> 저장 완료`); updated++ }
    }

    await sleep(400)
  }

  console.log(`\n완료: ${updated}건 업데이트`)
}

main().catch(err => { console.error(err); process.exit(1) })
