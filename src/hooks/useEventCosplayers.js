import { useEventChildList } from './useEventChildList'
import { httpUrl } from '../lib/url'

// 행사에 오는 코스어.
//
// 본인이 가입해 등록하는 cosplayers 디렉토리와는 다른 테이블이다
// (event_cosplayers_2026-09-15.sql 주석 참고) — 이쪽은 관리자가 공식 공지를 보고 적는다.
function mapCosplayer(row) {
  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    // null = 주최 초청. 값이 있으면 그 부스가 초청한 코스어다.
    boothId: row.booth_id ?? null,
    character: row.character ?? null,
    title: row.title ?? null,
    // 관리자 입력이라 형식이 보장되지 않는다 — <img src>·<a href>로 나가므로 거른다.
    photoUrl: httpUrl(row.photo_url),
    snsUrl: httpUrl(row.sns_url),
    day: row.day ?? null,
    startTime: row.start_time ?? null,
    endTime: row.end_time ?? null,
    note: row.note ?? null,
    sortOrder: row.sort_order ?? 0,
  }
}

export function useEventCosplayers(eventId) {
  const { items, loading, error, retry } = useEventChildList({
    table: 'event_cosplayers',
    eventId,
    mapRow: mapCosplayer,
    sortName: c => c.name,
  })
  return { cosplayers: items, loading, error, retry }
}
