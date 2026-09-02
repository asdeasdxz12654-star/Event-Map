-- push_subscriptions 보안 강화
-- Supabase 대시보드 > SQL Editor 에서 실행하세요.

-- 1) 오래된 토큰 정리 함수 (90일 이상 미사용 토큰 삭제)
--    GitHub Actions 등 서버 사이드에서 주기적으로 호출하거나,
--    Supabase Dashboard > Database > Functions 에서 수동 실행.
create or replace function public.cleanup_stale_push_tokens()
returns integer
language plpgsql
security definer
as $$
declare
  deleted_count integer;
begin
  delete from public.push_subscriptions
  where created_at < now() - interval '90 days';
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

-- 일반 사용자(anon, authenticated)는 이 함수를 실행할 수 없도록 권한 차단
revoke execute on function public.cleanup_stale_push_tokens() from public, anon, authenticated;

-- 2) 테이블 행 수 급증을 막기 위한 RLS 정책 강화
--    토큰 하나당 한 번만 insert 가능 (unique 제약이 이미 있으나 명시적 정책으로 이중 보호)
drop policy if exists "anyone can register a push token" on public.push_subscriptions;
create policy "anyone can register a push token"
  on public.push_subscriptions for insert
  with check (
    -- 토큰 길이 제한: FCM 토큰은 보통 152~163자
    char_length(token) between 100 and 300
  );

-- 3) user_agent 길이 제한 (과도하게 긴 문자열 삽입 방지)
alter table public.push_subscriptions
  add column if not exists user_agent text check (char_length(user_agent) <= 500);
