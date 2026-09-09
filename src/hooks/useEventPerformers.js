import { useEventChildList } from './useEventChildList'

// DB 행(snake_case) -> 컴포넌트가 쓰는 출연진 객체(camelCase)로 변환
function mapPerformer(row) {
  return {
    id: row.id,
    eventId: row.event_id,
    artistName: row.artist_name,
    songs: row.songs,
    sortOrder: row.sort_order ?? 0,
  }
}

// 특정 행사의 출연진·세트리스트(콘서트) / 무대 프로그램(그 외)을 실시간 구독한다.
export function useEventPerformers(eventId) {
  const { items, loading } = useEventChildList({
    table: 'event_performers',
    eventId,
    mapRow: mapPerformer,
    sortName: performer => performer.artistName,
  })
  return { performers: items, loading }
}
