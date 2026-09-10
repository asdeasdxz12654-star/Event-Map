// 행사 공식 사이트를 웹 검색(SerpAPI google)으로 찾는다.
// 환경변수: SERPAPI_KEY
//
// 포스터 검색은 공식 사이트를 알 때와 모를 때의 차이가 극단적이다.
// "site:agfkorea.com 포스터"는 첫 결과가 공식 포스터 파일인데, 사이트를 모르면
// "AGF 2026 포스터"로 일반 검색을 해야 하고 그 상위는 기사 사진·굿즈 매물·공모전이라
// 결국 하나도 못 건진다. 실제로 첫 실전 실행에서 10건 중 7건이 "공식 사이트를 모르는
// 행사"였고 그 7건 전부 0건이었다.
//
// 그래서 website가 비어 있는 행사는 검색으로 공식 사이트를 먼저 찾는다. 찾으면
// 포스터 검색에 쓰고, 행사 정보의 공식 사이트 링크로도 채운다(사이트에 노출되는
// 값이라 판정은 보수적으로 한다 — 아래 네 조건을 다 만족해야 채택).
//   1) 언론사·중고거래·행사 모음·예매처·SNS·위키가 아닌 도메인
//   2) 검색 결과 제목이나 주소에 행사 고유명이 들어 있을 것
//   3) 그 도메인 첫 화면의 <title>에도 행사명이 들어 있을 것
//   4) 그 페이지가 실제로 열릴 것
//
// 3번이 판정을 실제로 가르는 조건이다. 행사명으로 검색하면 상위가 기사와 행사 모음
// 사이트라 1·2번만으론 다 통과한다 — 실제로 "2026 대전콘텐츠페어"는 아이뉴스24 기사가,
// "제35회 디. 페스타"는 동인 행사 모음(dongne.co)이 1등이었다. 첫 화면 제목을 보면
// 갈린다: dcfair.co.kr는 "대전콘텐츠페어"인데 m.inews24.com은 "아이뉴스24 모바일"이다.
// 회사 사이트 안에 행사 페이지만 있는 경우(포켓몬코리아의 "피카츄의 가을 나들이")는 3번을
// 만족할 수 없어서 못 찾는다. 그 페이지 자체의 <title>로 대신 판정해 봤더니 기사 제목에도
// 행사명이 그대로 들어 있어서 뉴스 기사가 통과했다(대전콘텐츠페어 -> 아이뉴스24 기사).
// 그런 행사는 known-events.mjs에 주소를 손으로 넣는 편이 안전하다.
import { pathToFileURL } from 'node:url'
import {
  coreNameToken, isAggregatorUrl, isExcludedDomain, isNewsPhotoUrl,
  isResaleUrl, isSharedPlatform, hostOf, nameOverlapScore,
} from './poster-filter.mjs'
import { serpapiSearch, hasSearchAccess } from './serpapi.mjs'
import { UA } from './util.mjs'

// 행사를 설명하지만 공식 사이트는 아닌 곳 — 여기 링크를 "공식 사이트"로 걸면 안 된다.
const REFERENCE_HOSTS = ['namu.wiki', 'wikipedia.org', 'wikiwand.com', 'fandom.com', 'everytime.kr']

function isReferenceHost(url) {
  const host = hostOf(url)
  return REFERENCE_HOSTS.some(h => host === h || host.endsWith('.' + h))
}

// 공식 사이트로 볼 수 없는 도메인인지 (기사·중고·모음·예매처·SNS·위키)
function isDisqualified(url) {
  return isExcludedDomain(url) || isNewsPhotoUrl(url) || isResaleUrl(url) ||
    isAggregatorUrl(url) || isSharedPlatform(url) || isReferenceHost(url)
}

// 페이지가 실제로 열리는지. 검색 결과에는 이미 없어진 페이지도 섞여 있는데,
// 그걸 공식 사이트라고 저장하면 행사 카드에 죽은 링크가 걸린다.
async function isReachable(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA },
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
    })
    return res.ok
  } catch {
    return false
  }
}

// 도메인 첫 화면의 <title>. 같은 호스트를 여러 번 받지 않게 한 번 본 건 기억해둔다.
const rootTitleCache = new Map()

async function pageTitleOf(pageUrl) {
  if (rootTitleCache.has(pageUrl)) return rootTitleCache.get(pageUrl)
  let title = ''
  try {
    const res = await fetch(pageUrl, {
      headers: { 'User-Agent': UA },
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
    })
    if (res.ok) {
      const html = await res.text()
      title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? ''
    }
  } catch { /* 못 받으면 빈 제목 = 확인 실패 = 채택 안 함 */ }
  rootTitleCache.set(pageUrl, title)
  return title
}

// 도메인 첫 화면의 <title>
const rootTitle = host => pageTitleOf(`https://${host}/`)

// 행사명으로 공식 사이트를 찾는다. 못 찾으면 null.
// 찾으면 { url, host, title } — url은 검색 결과가 가리킨 페이지 그대로다
// (행사 개요 페이지인 경우가 많아서 홈으로 자르지 않는다).
export async function findOfficialSiteUrl(title) {
  if (!title || !hasSearchAccess()) return null

  const core = coreNameToken(title)
  if (!core) return null

  // 행사명만으로 검색해서 안 나오면 "공식 홈페이지"를 붙여 한 번 더 본다.
  for (const query of [title, `${title} 공식 홈페이지`]) {
    const data = await serpapiSearch('google', query, { hl: 'ko', gl: 'kr', num: '10' })
    const results = data?.organic_results ?? []

    for (const result of results) {
      const url = result.link
      if (!url?.startsWith('http') || isDisqualified(url)) continue

      // 제목이든 주소든 행사 고유명이 들어 있어야 한다. 검색 1순위라는 것만으로는
      // 부족하다 — 행사명이 일반적인 말이면 엉뚱한 회사 홈페이지가 1등으로 올라온다.
      // (본문 발췌는 안 본다. 행사 모음 사이트 첫 화면에는 온갖 행사 이름이 다 들어 있다.)
      let decodedUrl = url
      try { decodedUrl = decodeURI(url) } catch { /* 이상한 인코딩이면 원문 그대로 */ }
      if (!`${result.title ?? ''} ${decodedUrl}`.toLowerCase().includes(core)) continue

      // 그 도메인이 이 행사의 사이트인지 첫 화면 제목으로 확인한다.
      const host = hostOf(url)
      const home = await rootTitle(host)
      if (nameOverlapScore(title, home) < 0.5) continue

      if (!await isReachable(url)) continue
      return { url, host, title: result.title ?? '', homeTitle: home }
    }
    // 1순위부터 기사·모음 사이트로 덮이는 행사가 많다. 실제로 "2026 대전콘텐츠페어"는
    // 상위 8건이 전부 기사·SNS·위키였고 정작 공식 사이트(dcfair.co.kr)는 없었다.
    // 그래서 첫 검색이 빈손이면 말을 바꿔 한 번 더 본다 (검색 1회 추가).
  }

  return null
}

// 포스터 검색에 쓸 공식 URL 목록을 돌려준다.
// website·ticket_url이 이미 있으면 그대로 쓰고, 둘 다 없으면 검색으로 찾는다.
// 찾은 사이트는 events.website에도 채운다 — 포스터를 찾든 못 찾든 그 자체로 쓸모 있는
// 정보이고, 다음 실행 때 검색을 다시 하지 않아도 된다(크레딧 절약).
// 관리자가 직접 손댄 행사(admin_edited_at)는 건드리지 않는다.
export async function resolveOfficialUrls(supabase, event, { save = true } = {}) {
  const known = [event.website, event.ticket_url].filter(Boolean)
  if (known.length > 0) return known

  const site = await findOfficialSiteUrl(event.title)
  if (!site) return []

  console.log(`  -> 공식 사이트 찾음: ${site.url} (첫화면 "${site.homeTitle}")`)
  if (save && event.id) {
    const { error } = await supabase
      .from('events')
      .update({ website: site.url })
      .eq('id', event.id)
      .is('website', null)
      .is('admin_edited_at', null)
    if (error) console.warn(`  -> 공식 사이트 저장 실패: ${error.message}`)
  }
  return [site.url]
}

// 이 주소가 "그 행사 전용 사이트"인지. 같은 website를 쓰는 행사가 둘 이상이면 전용이 아니다.
//
// 공식 사이트 첫 화면의 배너를 포스터로 쓰려면(official-site-poster.mjs) 이 확인이 꼭
// 필요하다. comicw.net은 코믹월드·문구전·부코 등 여러 행사의 website로 들어가 있는데,
// 그 첫 화면 배너는 "지금 미는 행사" 것이라 나머지 행사에 붙이면 남의 포스터가 된다.
export async function isDedicatedSite(supabase, website) {
  if (!website) return false
  const { count, error } = await supabase
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('website', website)
  if (error) return false
  return count === 1
}

// DB 없이 한 건만 확인해 보고 싶을 때:
//   node src/official-site-lookup.mjs "2026 대전콘텐츠페어"
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const title = process.argv[2]
  if (!title) {
    console.error('사용법: node src/official-site-lookup.mjs "<행사명>"')
    process.exit(1)
  }
  const site = await findOfficialSiteUrl(title)
  console.log(site
    ? `${site.host}\n  ${site.url}\n  검색결과 제목: ${site.title}\n  첫화면 제목: ${site.homeTitle}`
    : '공식 사이트를 못 찾음')
}
