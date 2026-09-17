import { useEventChildList } from './useEventChildList'
import { httpUrl } from '../lib/url'

// DB 행(snake_case) -> 컴포넌트가 쓰는 항목 객체(camelCase)로 변환
function mapItem(row) {
  return {
    id: row.id,
    eventId: row.event_id,
    boothId: row.booth_id,
    kind: row.kind,
    name: row.name,
    price: row.price,
    priceNote: row.price_note,
    // 이 항목이 속한 게임·작품. 비어 있으면 화면이 부스 이름을 타이틀로 쓴다 —
    // 호요랜드처럼 부스 = 타이틀인 행사의 옛 데이터를 그대로 살리기 위해서다.
    title: row.title ?? null,
    status: row.status ?? null,
    note: row.note,
    // 이미지 주소는 관리자 입력이라 형식이 보장되지 않는다 — <img src>로 나가므로 거른다.
    imageUrl: httpUrl(row.image_url),
    sortOrder: row.sort_order ?? 0,
  }
}

// 특정 행사의 부스 항목 전체를 초기 로드 + 실시간 구독한다.
//
// 항목은 부스에 딸려 있지만 event_id도 함께 갖는다(booth_items_2026-09-14.sql 참고) —
// 그래서 부스별로 나눠 조회하지 않고 행사 단위로 한 번에 받아 화면에서 묶는다.
// 부스가 8개인 행사에서 요청이 8번 나가지 않는다.
export function useEventBoothItems(eventId) {
  const { items, loading, error, retry } = useEventChildList({
    table: 'event_booth_items',
    eventId,
    mapRow: mapItem,
    sortName: item => item.name,
  })
  return { items, loading, error, retry }
}
