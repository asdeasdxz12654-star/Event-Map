import { useEventChildList } from './useEventChildList'

// 상세페이지 탭 구성.
//
// 행이 없으면 화면은 지금까지와 똑같이 동작한다. 이 표의 행은 기본 동작을 덮어쓰는
// 예외이지 기본값이 아니다 — 행사 141개 중 대부분은 탭을 손댈 이유가 없다.
function mapTab(row) {
  return {
    id: row.id,
    eventId: row.event_id,
    key: row.key,
    builtin: row.builtin ?? false,
    label: row.label ?? null,
    body: row.body ?? null,
    visible: row.visible ?? true,
    sortOrder: row.sort_order ?? 0,
  }
}

// useEventChildList는 mapRow/sortName을 의존성에서 일부러 뺀다 — 매 렌더 새 함수가
// 들어오면 실시간 구독이 끊겼다 붙었다 한다. 그래서 모듈 스코프에 고정해 둔다.
const sortName = t => t.label ?? t.key

export function useEventTabs(eventId) {
  const { items, loading } = useEventChildList({
    table: 'event_tabs',
    eventId,
    mapRow: mapTab,
    sortName,
  })
  return { tabs: items, loading }
}
