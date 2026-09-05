// 행사 이름으로 Naver 뉴스를 검색해 주최사 단서를 출력한다.
import { createClient } from '@supabase/supabase-js'

const NAVER_NEWS_URL = 'https://naverapihub.apigw.ntruss.com/search/v1/news'
function stripHtml(s = '') { return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() }

async function search(query) {
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

const queries = [
  '코스앤코믹 주최',
  '야마다 료스케 내한공연 주최',
  'XMF XNTERSTELLAR MUSIC FESTIVAL 주최',
  'AGF 2026 코엑스 주최',
]

for (const q of queries) {
  console.log(`\n=== ${q} ===`)
  const items = await search(q)
  if (!items.length) { console.log('  (결과 없음)'); continue }
  for (const it of items) {
    console.log(`  - ${stripHtml(it.title)}`)
    console.log(`    ${stripHtml(it.description).slice(0, 150)}`)
  }
  await new Promise(r => setTimeout(r, 200))
}
