import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'

// DB 행(snake_case) -> 컴포넌트가 쓰는 draft 객체(camelCase)로 변환
function mapDraft(row) {
  return {
    id: row.id,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    sourceTitle: row.source_title,
    publishedAt: row.published_at,
    status: row.status,
    extracted: row.extracted ?? {},
    promotedEventId: row.promoted_event_id,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
  }
}

// 관리자 검수 페이지용: status별 event_drafts 목록 (admin RLS 정책 필요, supabase/event_drafts_admin_policies.sql 참고)
export function useEventDrafts(status = 'pending') {
  const [drafts, setDrafts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = useCallback(() => {
    setLoading(true)
    supabase
      .from('event_drafts')
      .select('*')
      .eq('status', status)
      .order('created_at', { ascending: false })
      .then(({ data, error: fetchError }) => {
        if (fetchError) setError(fetchError)
        else setDrafts(data.map(mapDraft))
        setLoading(false)
      })
  }, [status])

  useEffect(() => { refresh() }, [refresh])

  return { drafts, loading, error, refresh }
}

// 승인/반려 공용 — 나머지(events 반영)는 promote_event_draft() 트리거가 처리한다
export async function setDraftStatus(id, status) {
  const { error } = await supabase.from('event_drafts').update({ status }).eq('id', id)
  if (error) throw error
}
