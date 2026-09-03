// 공식 행사 사이트에서 직접 일정을 확인한다 — 뉴스/카페보다 날짜 정보가 정확하고 빠르다.
// 페이지를 fetch → HTML 태그 제거 → Groq 추출 순으로 처리하며, crawl.mjs의
// processTextCandidates와 동일한 흐름을 탄다.
//
// 자바스크립트로만 렌더링되는 페이지는 fetch로 내용이 안 나올 수 있다. 그런 경우
// 로그에 경고가 찍히고 해당 사이트는 그 회차엔 스킵된다.
//
// checkInterval:
//   'yearly'  — 연 1회 개최 행사. source_url에 연도를 붙여 연 1회만 draft를 생성한다.
//   'monthly' — 연중 여러 번 개최(코믹월드·일러스타페스 등). 월 1회 체크한다.

const UA = 'Mozilla/5.0 (compatible; EventMapCrawler/1.0; +https://github.com)'

function site(name, url, activeMonths = null, checkInterval = 'yearly') {
  return { name, url, activeMonths, checkInterval }
}

export const OFFICIAL_SITES = [
  // 게임 전시
  site('지스타',       'https://www.gstar.or.kr/',                          [8, 9, 10, 11]),
  site('플레이엑스포', 'https://www.playx4.or.kr/b2c/main/main.php',        [3, 4, 5]),
  site('BIC페스티벌',  'https://www.bicfest.org/tickets',                   [6, 7, 8]),
  // 애니/코스프레
  site('코믹월드',     'https://comicw.net/c',                              null, 'monthly'),
  site('AGF',          'https://www.agfkorea.com/exhibition?idx=1',         [10, 11, 12]),
  site('일러스타페스', 'https://illustar.net/',                             null, 'monthly'),
]

// script·style 제거 후 태그 걷어내고 공백 정리
function stripTags(html = '') {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

// dedup용 source_url: 같은 행사를 여러 번 draft에 넣지 않으려고 연도(연 1회) 또는
// 연월(월 1회)을 fragment로 붙인다. promote_event_draft()의 title+start_date dedup과
// 이중으로 걸려 events 테이블 중복도 방지된다.
function buildSourceUrl(url, checkInterval) {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const tag = checkInterval === 'monthly' ? `${year}-${month}` : `${year}`
  return `${url}#crawl-${tag}`
}

export async function fetchOfficialSiteCandidates() {
  const currentMonth = new Date().getMonth() + 1
  const results = []

  for (const { name, url, activeMonths, checkInterval } of OFFICIAL_SITES) {
    if (activeMonths && !activeMonths.includes(currentMonth)) continue

    let html
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(15_000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      html = await res.text()
    } catch (err) {
      console.error(`[공식사이트] "${name}" 조회 실패:`, err.message)
      continue
    }

    const text = stripTags(html).slice(0, 4000)
    if (text.length < 200) {
      console.warn(`[공식사이트] "${name}" 내용이 너무 짧음 — JS 렌더링 페이지일 수 있음`)
      continue
    }

    results.push({
      // 제목에 [공식] 접두어 → Groq 프롬프트가 is_event를 항상 true로 처리
      title: `[공식] ${name} 일정`,
      contentSnippet: text,
      link: buildSourceUrl(url, checkInterval),
      pubDate: new Date().toISOString(),
    })
  }

  return results
}
