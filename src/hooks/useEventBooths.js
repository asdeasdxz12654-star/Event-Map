import { useEventChildList } from './useEventChildList'
import { httpUrl } from '../lib/url'

// DB 행(snake_case) -> 컴포넌트가 쓰는 부스 객체(camelCase)로 변환
function mapBooth(row) {
  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    boothNo: row.booth_no,
    // 운영 주체 — 기업(company) · 개인·동아리(creator) · 주최 직영(host).
    // 값이 없는 옛 행은 기업 부스로 본다(DB 기본값과 같다).
    operator: row.operator ?? 'company',
    hall: row.hall ?? null,
    genre: row.genre ?? null,
    // goods는 항목(event_booth_items)이 하나도 없을 때만 쓰는 옛 자유 텍스트 필드다.
    goods: row.goods,
    // 관리자 입력이라 형식이 보장되지 않는다 — <img src>로 나가므로 거른다.
    imageUrl: httpUrl(row.image_url),
    sortOrder: row.sort_order ?? 0,
  }
}

// 특정 행사의 참가 업체·부스 목록을 초기 로드 + 실시간 구독한다.
export function useEventBooths(eventId) {
  const { items, loading, error, retry } = useEventChildList({
    table: 'event_booths',
    eventId,
    mapRow: mapBooth,
    sortName: booth => booth.name,
  })
  return { booths: items, loading, error, retry }
}
