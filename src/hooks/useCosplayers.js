import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'

// 공개 디렉토리: approved 코스어 전체 목록
export function useCosplayers() {
  const [cosplayers, setCosplayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    supabase
      .from('cosplayers')
      .select('*, cosplayer_events(event_id)')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .then(({ data, error: err }) => {
        if (err) setError(err)
        else setCosplayers(data ?? [])
        setLoading(false)
      })
  }, [])

  return { cosplayers, loading, error }
}

// 특정 행사에 참가 예정인 코스어 목록
export function useCosplayersByEvent(eventId) {
  const [cosplayers, setCosplayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!eventId) { setLoading(false); return }
    supabase
      .from('cosplayers')
      .select('*, cosplayer_events!inner(event_id)')
      .eq('status', 'approved')
      .eq('cosplayer_events.event_id', eventId)
      .order('created_at', { ascending: false })
      .then(({ data, error: err }) => {
        if (err) setError(err)
        else setCosplayers(data ?? [])
        setLoading(false)
      })
  }, [eventId])

  return { cosplayers, loading, error }
}

// 로그인한 사용자의 본인 프로필 (없으면 null, 로딩 중이면 undefined)
export function useMyProfile(userId) {
  const [profile, setProfile] = useState(undefined)

  const refresh = useCallback(() => {
    if (!userId) { setProfile(null); return }
    supabase
      .from('cosplayers')
      .select('*, cosplayer_events(event_id)')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => setProfile(data ?? null))
  }, [userId])

  useEffect(() => { refresh() }, [refresh])

  return { profile, refresh }
}

// 프로필 저장 (create or update) + 참가 행사 동기화
export async function saveProfile(userId, fields, selectedEventIds = []) {
  // 기존 프로필 확인
  const { data: existing } = await supabase
    .from('cosplayers')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()

  let cosplayerId

  if (existing) {
    cosplayerId = existing.id
    const { error } = await supabase
      .from('cosplayers')
      .update(fields)
      .eq('id', cosplayerId)
    if (error) throw error
  } else {
    const { data, error } = await supabase
      .from('cosplayers')
      .insert({ ...fields, user_id: userId })
      .select('id')
      .single()
    if (error) throw error
    cosplayerId = data.id
  }

  // 참가 행사 목록 교체 (삭제 후 재삽입)
  await supabase.from('cosplayer_events').delete().eq('cosplayer_id', cosplayerId)
  if (selectedEventIds.length > 0) {
    const rows = selectedEventIds.map(eventId => ({ cosplayer_id: cosplayerId, event_id: eventId }))
    const { error } = await supabase.from('cosplayer_events').insert(rows)
    if (error) throw error
  }
}

export async function deleteProfile(cosplayerId) {
  const { error } = await supabase.from('cosplayers').delete().eq('id', cosplayerId)
  if (error) throw error
}
