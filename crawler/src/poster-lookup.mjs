// 행사 한 건의 공식 포스터를 찾아 events.poster_url에 채운다.
//
// 같은 일을 세 군데가 따로 하고 있었다 — crawl.mjs(새로 자동승인된 행사),
// fix-poster-images.mjs(일괄 채우기), known-events.mjs(정기 행사). 그런데 known-events는
// 검색을 아예 안 하고 코드에 박아둔 포스터만 썼고(실제로 박혀 있는 건 코스앤코믹 95회
// 하나뿐이다), crawl.mjs는 자동 승인되는 그 한순간에만 시도했다. 그 결과 올해 열리는
// 행사인데도 "공식 포스터 미정"으로 남는 게 대부분이었다. 한 군데로 모아 세 경로가
// 같은 규칙으로 돌게 한다.
//
// 연도 정책은 그대로다 — 내년 행사는 검색하지 않는다(fetchEventPosterUrl과
// fetchPosterFromOfficialSite가 eventYear로 막는다). 아직 이번 회차 자료가 안 올라와서
// 지난 회차 포스터가 그대로 붙기 때문이고, 해가 바뀌면 그때 채워진다.
// 반대로 "올해 안에 열리는 행사"는 회차 행사(제29회·336회 등)를 포함해 전부 찾는다.
import { fetchEventPosterUrl } from './serpapi-image.mjs'
import { resolveOfficialUrls, isDedicatedSite } from './official-site-lookup.mjs'
import { fetchPosterFromOfficialSite } from './official-site-poster.mjs'
import { storePoster } from './poster-storage.mjs'

// 포스터를 찾는 순서: 이미지 검색 -> 공식 사이트 배너.
//
// 검색이 먼저인 이유는 정확도다. "site:공식도메인 포스터"는 파일 이름이 POSTER인 진짜
// 포스터를 집어내는데, 첫 화면 배너는 같은 사이트라도 캐릭터 컷이나 배경 이미지인 경우가
// 있다(AGF 첫 화면에서 집히는 건 AGF_POSTER가 아니라 img_character다).
// 배너는 검색이 빈손일 때의 받침이다 — 포켓몬 메가페스타처럼 검색으로는 안 나오지만
// 공식 사이트에는 키비주얼이 걸려 있는 행사가 여기서 채워진다. 크레딧도 안 든다.
export async function findEventPoster(supabase, { title, officialUrls = [], eventYear = null }) {
  const fromSearch = await fetchEventPosterUrl(title, officialUrls, eventYear)
  if (fromSearch) return fromSearch

  // 여러 행사가 함께 쓰는 사이트(comicw.net 등)의 배너는 이 행사 것이 아니다.
  const site = officialUrls[0]
  if (site && await isDedicatedSite(supabase, site, title)) {
    return await fetchPosterFromOfficialSite(site, { eventYear })
  }
  return null
}

// 포스터가 비어 있는 행사에 찾아서 채운다. 채웠으면 저장된 URL, 아니면 null.
// 공식 사이트(website)를 모르면 먼저 찾아서 함께 저장한다 — 포스터 정확도가 거기서 갈린다.
export async function attachEventPoster(supabase, eventId, { title, website, ticketUrl, startDate } = {}) {
  if (!eventId || !title) return null

  // 찾기 전에 이미 포스터가 있는지부터 본다. dedup으로 기존 행사에 연결된 경우가 흔한데,
  // 그때마다 검색을 돌리면 저장도 못 할 결과에 SerpAPI 크레딧만 나간다(무료 월 250회).
  const { data: existing } = await supabase
    .from('events')
    .select('poster_url, website, ticket_url, start_date')
    .eq('id', eventId)
    .maybeSingle()
  if (existing?.poster_url) return null

  const eventStart = existing?.start_date ?? startDate ?? null
  const eventYear = eventStart ? Number(String(eventStart).slice(0, 4)) : null

  const officialUrls = await resolveOfficialUrls(supabase, {
    id: eventId,
    title,
    website: existing?.website ?? website,
    ticket_url: existing?.ticket_url ?? ticketUrl,
  })

  const posterUrl = await findEventPoster(supabase, { title, officialUrls, eventYear })
  if (!posterUrl) return null

  // 인쇄용 원본처럼 큰 포스터는 줄여서 우리 저장소 사본으로 (poster-storage.mjs)
  const finalUrl = await storePoster(supabase, eventId, posterUrl) ?? posterUrl
  const { error } = await supabase
    .from('events')
    .update({ poster_url: finalUrl })
    .eq('id', eventId)
    .is('poster_url', null)       // 이미 포스터가 있으면 덮어쓰지 않음
    .is('admin_edited_at', null)  // 관리자가 직접 손댄 행은 건드리지 않음

  if (error) {
    console.warn('  [이미지] 포스터 저장 실패:', error.message)
    return null
  }
  return finalUrl
}
