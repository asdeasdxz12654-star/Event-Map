// 네이버 게임 라운지 공지사항에서 오프라인 행사 공지를 수집한다.
// comm-api.game.naver.com 내부 JSON API를 직접 호출하며, 인증 없이 공개 접근 가능 (확인됨).
// 게임사 운영자(game_manager) 글만 수집하고, 오프라인 행사 키워드 사전 필터 후 Groq로 추출한다.
//
// URL 형식: /nng_main/v1/user/{userIdHash}/feeds?limit=20&loungeId={loungeId}&offset=0&order=NEW
// 응답 구조: data.content.feeds[] — 각 항목: feed(title/contents/createdDate), user(userRoleCode), feedLink(pc)

import { UA } from './util.mjs'

const USER_FEEDS_API = 'https://comm-api.game.naver.com/nng_main/v1/user'

const LOUNGES = [
  {
    // ⚠️ 2026-09-14 확인: 이 해시로는 피드가 0건이다(다른 세 라운지는 482~4,825건 정상).
    //    공지를 올리는 실제 계정은 'zenlesszone0'인데, 이 API는 로그인 ID가 아니라 네이버
    //    내부 해시만 받고 그 해시는 외부에서 계산할 수 없다(md5 아님 — 확인함).
    //    그래서 라운지 화면에서 해시를 직접 떠와야 고쳐진다. 그때까지는 아래 0건 경고가 뜬다.
    name: '젠레스 존 제로',
    userId: '9186dc92e8c6dda1f94af1c7d82a07ec',
    loungeId: 'ZZZ',
    keywords: ['호요랜드', '콜라보', '팝업스토어', '축제', '콘서트', '음악회', '공연', '굿즈', '오프라인', '주년', '부스', '시연'],
  },
  {
    name: '승리의 여신: 니케',
    userId: '6cd045bd8eedfccc068bd0e70a81ea26',
    loungeId: 'NIKKE_The_Goddess_of_Victory',
    keywords: ['콜라보', '콘서트', '음악회', '무대', '공연', '오프라인', '팝업스토어', '굿즈', '현장', '주년', '부스', '시연'],
  },
  {
    name: '명조',
    userId: '682d60022b932fdd0264e843596ba233',
    loungeId: 'WutheringWaves',
    keywords: ['콜라보', '띵조 페스티벌', '월드 투어', '띵조카니발', '띵조파크', '띵조마켓', '굿즈', '띵조월드', '띵조', '콘서트', '음악회', '공연', '주년', '부스', '시연'],
  },
  {
    name: '이환',
    userId: '75e5b10204562ac8c168240d3a5546cf',
    loungeId: 'NTE',
    keywords: ['콜라보', '굿즈', '오프라인', '공연', '콘서트', '음악회', '팝업스토어', '주년', '부스', '시연'],
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

  for (const { name, userId, loungeId, keywords } of LOUNGES) {
    const url = `${USER_FEEDS_API}/${userId}/feeds?limit=20&loungeId=${loungeId}&offset=0&order=NEW`

    let data
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      data = await res.json()
      succeeded++
    } catch (err) {
      console.error(`[라운지] "${name}" 조회 실패:`, err.message)
      continue
    }

    // 총 글이 0건이면 "새 글이 없다"가 아니라 userId 해시가 더 이상 유효하지 않다는 뜻이다.
    // 이 API는 존재하지 않는/바뀐 계정에도 200 + 빈 배열을 돌려주기 때문에, 위의 succeeded++가
    // 그대로 통과해서 "정상인데 글이 없는 라운지"처럼 보인다. 실제로 젠레스 존 제로가 이 상태로
    // 방치돼 호요랜드2026 상세공지(2026-09-12)를 통째로 놓쳤다 — 조용히 실패하지 않게 경고한다.
    // 운영 중인 라운지는 totalCount가 항상 수백~수천 건이라 오탐 걱정이 없다.
    if ((data?.content?.totalCount ?? 0) === 0) {
      console.error(
        `[라운지] "${name}"(${loungeId}) 피드 0건 — userId 해시가 만료됐을 수 있습니다.\n` +
        `         고치는 법: game.naver.com/lounge/${loungeId} 에서 공지 글을 열어 주소 끝의 feedId를 확인한 뒤\n` +
        `         https://comm-api.game.naver.com/nng_main/v1/community/feed/{feedId} 를 열면 실제 작성 계정(userId)이 보인다.`
      )
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
