import { useEventChildList } from './useEventChildList'

// DB 행(snake_case) -> 컴포넌트가 쓰는 부스 객체(camelCase)로 변환
function mapBooth(row) {
  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    boothNo: row.booth_no,
    goods: row.goods,
    sortOrder: row.sort_order ?? 0,
  }
}

// 특정 행사의 참가 업체·부스 목록을 초기 로드 + 실시간 구독한다.
export function useEventBooths(eventId) {
  const { items, loading } = useEventChildList({
    table: 'event_booths',
    eventId,
    mapRow: mapBooth,
    sortName: booth => booth.name,
  })
  return { booths: items, loading }
}
