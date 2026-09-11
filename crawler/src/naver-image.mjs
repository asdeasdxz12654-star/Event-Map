// 네이버 이미지 검색으로 행사 포스터를 찾는 어댑터. **지금은 아무 데서도 안 쓴다** —
// 포스터 검색은 serpapi-image.mjs(구글·빙)로 옮겼다. 네이버는 결과에 "이미지가 실린
// 페이지"가 없어서 기사 CDN(cdn.job-post.co.kr)을 언론사 사진으로 알아보기 어려웠다.
//
// 그래도 지워두지 않은 이유는 SerpAPI 무료 플랜이 월 250회뿐이라서다. 한도가 문제가
// 되면 여기로 되돌리거나 SerpAPI가 빈손일 때의 보조로 붙일 수 있다. 되돌릴 땐
// crawl.mjs / fix-poster-images.mjs / verify-poster-images.mjs의 import만 바꾸면 된다
// (함수 이름과 인자는 serpapi-image.mjs와 같다).
//
// 채택 기준은 poster-filter.mjs에 공통으로 있다 — 엔진만 다르지 판정은 똑같다.
// 환경변수: NAVER_CLIENT_ID, NAVER_CLIENT_SECRET (naver.mjs, naver-local.mjs와 동일)
import { judgeCandidate, isUsableImageUrl } from './poster-filter.mjs'
import { todayKST } from './date-kst.mjs'

const NAVER_IMAGE_URL = 'https://naverapihub.apigw.ntruss.com/search/v1/image'

async function searchImage(query) {
  const url = new URL(NAVER_IMAGE_URL)
  url.searchParams.set('query', query)
  url.searchParams.set('display', '20')
  url.searchParams.set('filter', 'large')
  url.searchParams.set('sort', 'sim')

  const res = await fetch(url, {
    headers: {
      'X-NCP-APIGW-API-KEY-ID': process.env.NAVER_CLIENT_ID,
      'X-NCP-APIGW-API-KEY': process.env.NAVER_CLIENT_SECRET,
    },
    signal: AbortSignal.timeout(5_000),
  })
  if (!res.ok) return []
  const data = await res.json()
  // poster-filter가 보는 공통 모양으로 바꾼다. 네이버는 페이지 URL을 주지 않는다.
  return (data.items ?? []).map(item => ({
    imageUrl: item.link,
    pageUrl: null,
    title: item.title,
    width: item.sizewidth,
    height: item.sizeheight,
  }))
}

// 행사명과 관련 있고 "공식 홍보물로 볼 근거가 있는" 후보만 점수 높은 순으로 돌려준다.
// (URL 접속 확인은 안 함)
export async function findPosterCandidates(title, officialUrls = [], eventYear = null) {
  if (!process.env.NAVER_CLIENT_ID || !process.env.NAVER_CLIENT_SECRET) return []
  if (!title) return []

  const queries = [`${title} 포스터`, title]
  const seen = new Set()
  const candidates = []

  for (const query of queries) {
    let items = []
    try {
      items = await searchImage(query)
    } catch (err) {
      console.warn(`  [이미지] 검색 실패: ${err.message}`)
      continue
    }

    for (const item of items) {
      if (!item.imageUrl || seen.has(item.imageUrl)) continue
      seen.add(item.imageUrl)
      const judged = judgeCandidate(item, title, officialUrls, eventYear)
      if (judged) candidates.push({ ...judged, engine: 'naver' })
    }

    if (candidates.length > 0) break // 1차 쿼리에서 건졌으면 2차는 안 돈다
  }

  return candidates.sort((a, b) => b.score - a.score)
}

// 관련 있는 후보 중 실제로 열리는 첫 번째 이미지를 반환한다.
// 조건을 만족하는 게 없으면 null (= 포스터 없음으로 두고 기본 이미지 사용).
export async function fetchEventPosterUrl(title, officialUrls = [], eventYear = null) {
  // 아직 한참 남은(내년 이후) 행사는 공식 포스터가 나오기 전이라, 검색해봐야 옛 회차
  // 포스터나 엉뚱한 이미지가 걸린다. 해가 바뀌면 그때 다시 채우면 된다.
  if (eventYear && eventYear > Number(todayKST().slice(0, 4))) { // 연도 판정도 KST 기준
    console.log(`  -> 포스터: ${eventYear}년 행사라 아직 검색하지 않음`)
    return null
  }

  const candidates = await findPosterCandidates(title, officialUrls, eventYear)
  if (candidates.length === 0) {
    if (title) console.log('  -> 포스터: 관련 있는 이미지 없음, 건너뜀')
    return null
  }

  for (const candidate of candidates.slice(0, 5)) {
    if (!await isUsableImageUrl(candidate.link)) continue
    console.log(`  -> 포스터: ${candidate.title} (일치도 ${candidate.score.toFixed(2)}) ${candidate.link.slice(0, 60)}...`)
    return candidate.link
  }

  console.log('  -> 포스터: 후보는 있었으나 열리는 이미지가 없음, 건너뜀')
  return null
}
