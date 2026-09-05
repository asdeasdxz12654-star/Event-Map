// 네이버 게임 라운지 공지사항에서 오프라인 행사 공지를 수집한다.
// comm-api.game.naver.com 내부 JSON API를 직접 호출하며, 인증 없이 공개 접근 가능 (확인됨).
// 게임사 운영자(game_manager) 글만 수집하고, 오프라인 행사 키워드 사전 필터 후 Groq로 추출한다.
//
// 확인된 라운지/boardId:
//   ZZZ(젠레스 존 제로): boardId=11 "🔊공지사항"
//   NTE(이환):           boardId=1  "📢공지사항"
//   WutheringWaves(명조): boardId=1 "📢공지사항"

const LOUNGE_API = 'https://comm-api.game.naver.com/nng_main/v1/community/lounge'

const LOUNGES = [
  {
    name: '젠레스 존 제로', loungeId: 'ZZZ', boardId: 11,
    keywords: ['호요랜드', '콜라보', '팝업스토어', '축제', '콘서트', '굿즈', '오프라인'],
  },
  {
    name: '이환', loungeId: 'NTE', boardId: 1,
    keywords: ['콜라보', '굿즈', '오프라인', '공연', '콘서트', '팝업스토어'],
  },
  {
    name: '명조', loungeId: 'WutheringWaves', boardId: 1,
    keywords: ['콜라보', '띵조 페스티벌', '월드 투어', '띵조카니발', '띵조파크', '띵조마켓', '굿즈', '띵조월드', '띵조'],
  },
]

function looksOfflineEvent(title, text, keywords) {
  const combined = `${title} ${text}`
  return keywords.some(k => combined.includes(k))
}

// "20260831130036" → ISO 문자열 (KST)
function parseNaverDate(dateStr) {
  if (!dateStr || dateStr.length < 8) return null
  const y   = dateStr.slice(0, 4)
  const mon = dateStr.slice(4, 6)
  const d   = dateStr.slice(6, 8)
  const h   = dateStr.slice(8, 10) || '00'
  const min = dateStr.slice(10, 12) || '00'
  const s   = dateStr.slice(12, 14) || '00'
  return new Date(`${y}-${mon}-${d}T${h}:${min}:${s}+09:00`).toISOString()
}

// 네이버 스마트에디터 JSON에서 텍스트 노드만 추출한다.
// contents 필드는 JSON 문자열이며, document.components[] 안에 type=text 컴포넌트가 들어있다.
function extractText(contentsJson) {
  try {
    const doc = JSON.parse(contentsJson)
    const parts = []
    for (const comp of doc?.document?.components ?? []) {
      if (comp['@ctype'] === 'text') {
        for (const para of comp.value ?? []) {
          for (const node of para.nodes ?? []) {
            if (node['@ctype'] === 'textNode' && node.value) parts.push(node.value)
          }
        }
      }
    }
    return parts.join(' ').trim()
  } catch {
    return ''
  }
}

export async function fetchNaverLoungeCandidates() {
  const results = []
  let succeeded = 0

  for (const { name, loungeId, boardId, keywords } of LOUNGES) {
    const url = `${LOUNGE_API}/${loungeId}/feed?boardId=${boardId}&buffFilteringYN=N&limit=25&offset=0&order=NEW`

    let data
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EventMapCrawler/1.0)' },
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      data = await res.json()
      succeeded++
    } catch (err) {
      console.error(`[라운지] "${name}" 조회 실패:`, err.message)
      continue
    }

    const feeds = data?.content?.feeds ?? []
    for (const { feed, feedLink, user } of feeds) {
      if (user?.userRoleCode !== 'game_manager') continue // 운영자 글만

      const title = feed?.title ?? ''
      const text = extractText(feed?.contents ?? '')

      if (!looksOfflineEvent(title, text, keywords)) continue // 오프라인 행사 아니면 스킵

      const link = feedLink?.pc
      if (!link) continue

      results.push({
        title,
        contentSnippet: text.slice(0, 1500),
        link,
        pubDate: parseNaverDate(feed.createdDate),
      })
    }
  }

  // 라운지가 하나도 조회 안 됐으면(전체 네트워크 장애 등) 예외를 던져서 crawl.mjs가
  // "오늘 조회 완료" sentinel을 남기지 않게 한다 — 일부만 실패한 경우는 부분 결과라도
  // 반환한다 (라운지별로 개별 실패는 위에서 이미 로그를 남겼음).
  if (succeeded === 0) {
    throw new Error('모든 라운지 조회 실패')
  }

  return results
}
