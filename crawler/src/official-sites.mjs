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

import { todayKST } from './date-kst.mjs'
import { fetchHtml, htmlToText } from './util.mjs'

function site(name, url, activeMonths = null, checkInterval = 'yearly') {
  return { name, url, activeMonths, checkInterval }
}

export const OFFICIAL_SITES = []

// dedup용 source_url: 같은 행사를 여러 번 draft에 넣지 않으려고 연도(연 1회) 또는
// 연월(월 1회)을 fragment로 붙인다. promote_event_draft()의 title+start_date dedup과
// 이중으로 걸려 events 테이블 중복도 방지된다.
function buildSourceUrl(url, checkInterval) {
  // 날짜 기준은 KST — UTC로 재면 월말·연말에 하루 동안 한 칸 앞선 태그가 붙어서,
  // 그 달(해)의 체크가 한 번 더 도는 것처럼 보인다.
  const today = todayKST()
  const tag = checkInterval === 'monthly' ? today.slice(0, 7) : today.slice(0, 4)
  return `${url}#crawl-${tag}`
}

export async function fetchOfficialSiteCandidates() {
  const currentMonth = Number(todayKST().slice(5, 7))
  const results = []

  for (const { name, url, activeMonths, checkInterval } of OFFICIAL_SITES) {
    if (activeMonths && !activeMonths.includes(currentMonth)) continue

    let html
    try {
      html = await fetchHtml(url)
    } catch (err) {
      console.error(`[공식사이트] "${name}" 조회 실패:`, err.message)
      continue
    }

    const text = htmlToText(html).slice(0, 4000)
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
