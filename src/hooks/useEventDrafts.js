import { useCallback, useEffect, useState } from 'react'
import { adminApi } from '../lib/adminApi'
import { httpUrl } from '../lib/url'

// DB 행(snake_case) -> 컴포넌트가 쓰는 draft 객체(camelCase)로 변환
// sourceUrl은 검수 화면에서 "원문 보기" 링크로 나가므로 http(s)만 통과시킨다
// (크롤러가 넣는 값이라 형식이 보장되지는 않는다 — 이유는 src/lib/url.js 참고).
export function mapDraft(row) {
  return {
    id: row.id,
    sourceName: row.source_name,
    sourceUrl: httpUrl(row.source_url),
    sourceTitle: row.source_title,
    publishedAt: row.published_at,
    status: row.status,
    extracted: row.extracted ?? {},
    promotedEventId: row.promoted_event_id,
    reviewNote: row.review_note ?? null,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
  }
}

// 관리자 검수 페이지용: status별 event_drafts 목록.
//
// 예전엔 여기서 Supabase를 직접 불렀고, event_drafts의 RLS가 "auth.jwt()->>'email'이
// 관리자 이메일인가"로 막았다. 그래서 이 화면 하나만 구글 로그인이 따로 필요했다 —
// 다른 관리 기능은 전부 Worker의 관리자 코드를 쓰는데도. 더 나쁜 건 실패하는 방식이었다:
// RLS는 권한이 없으면 에러가 아니라 **빈 배열**을 준다. 관리자 코드로만 로그인한 상태에서
// 이 화면은 오류 없이 "검수할 기사가 없습니다"라고 말했다.
//
// 이제 Worker(service_role)를 거친다. 로그인은 사이트 전체와 같은 관리자 코드 하나다.
export function useEventDrafts(status = 'pending') {
  const [drafts, setDrafts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = useCallback(() => {
    let cancelled = false
    setLoading(true)
    adminApi
      .listDrafts(status)
      .then(rows => {
        if (cancelled) return
        setDrafts(rows.map(mapDraft))
        setError(null)
      })
      .catch(err => { if (!cancelled) setError(err) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [status])

  // 탭을 빠르게 옮기면 먼저 보낸 요청이 나중에 도착해 다른 탭의 목록을 덮어쓸 수 있다.
  // refresh가 돌려주는 취소 함수를 정리 단계에서 부른다.
  useEffect(() => refresh(), [refresh])

  return { drafts, loading, error, refresh }
}

// 승인/반려 공용 — 나머지(events 반영)는 promote_event_draft() 트리거가 처리한다.
// 트리거가 승인을 실패 처리(rejected + review_note)할 수도 있어서, 실제로 저장된 행을
// 돌려받아 호출부가 결과를 확인할 수 있게 한다.
export async function setDraftStatus(id, status) {
  const row = await adminApi.updateDraft(id, { status })
  return row ? mapDraft(row) : null
}
