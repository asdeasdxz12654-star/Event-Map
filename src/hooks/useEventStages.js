import { useEventChildList } from './useEventChildList'

// 무대(장소)와 시간표를 함께 받아온다.
//
// 두 테이블로 나뉜 이유는 stages_2026-09-15.sql에 적어뒀다 — 요약하면 "어디서"와 "언제"는
// 따로 변한다. 무대는 행사당 1~5개뿐이고 시간표는 수십 줄이며, 같은 프로그램이 여러 날
// 반복되면 슬롯만 늘어난다.
//
// 화면이 늘 같이 쓰므로 훅을 하나로 묶는다 — 호출부가 두 개를 따로 부르고 매번 이어
// 붙이면 정렬 규칙이 화면마다 갈라진다.

function mapStage(row) {
  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    // null이면 행사 공용 무대. 값이 있으면 그 부스의 무대다.
    boothId: row.booth_id ?? null,
    location: row.location ?? null,
    sortOrder: row.sort_order ?? 0,
  }
}

function mapSlot(row) {
  return {
    id: row.id,
    eventId: row.event_id,
    stageId: row.stage_id,
    day: row.day,                         // 'YYYY-MM-DD'
    startTime: row.start_time ?? null,    // 'HH:MM:SS' | null(시간 미정)
    endTime: row.end_time ?? null,
    title: row.title,
    performer: row.performer ?? null,
    note: row.note ?? null,
    kind: row.kind ?? null,
    sortOrder: row.sort_order ?? 0,
  }
}

export function useEventStages(eventId) {
  const { items: stages, loading: stagesLoading } = useEventChildList({
    table: 'event_stages',
    eventId,
    mapRow: mapStage,
    sortName: stage => stage.name,
  })
  const { items: rawSlots, loading: slotsLoading } = useEventChildList({
    table: 'event_stage_slots',
    eventId,
    mapRow: mapSlot,
    // useEventChildList는 sort_order로 먼저 정렬한다. 시간표는 sort_order가 거의 전부 0이라
    // 여기서 2차 기준을 "날짜+시각"으로 준다. 실제 정렬은 아래 sortSlots가 다시 잡는다.
    sortName: slot => `${slot.day} ${slot.startTime ?? '99:99'}`,
  })

  return { stages, slots: sortSlots(rawSlots), loading: stagesLoading || slotsLoading }
}

// 날짜 → 시작 시각 → sort_order 순.
//
// 시간이 없는 슬롯(start_time null)은 그날의 맨 뒤로 보낸다. "언제인지 모르는 것"이
// 시간표 중간에 끼면 그 아래 줄들이 전부 몇 시인지 의심스러워진다 — 표 전체를 못 믿게 된다.
export function sortSlots(slots) {
  return [...slots].sort((a, b) =>
    a.day.localeCompare(b.day)
    || (a.startTime ?? '~').localeCompare(b.startTime ?? '~')
    || a.sortOrder - b.sortOrder
    || a.title.localeCompare(b.title)
  )
}
