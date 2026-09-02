-- game-event-hub: 웹 푸시(FCM) 토큰 저장 테이블
-- Supabase 대시보드 > SQL Editor 에서 실행하세요.

create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  token      text not null unique,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

-- 로그인 없는 MVP라 익명(anon) 키로 자기 기기 토큰을 등록만 할 수 있게 허용.
-- select 정책은 만들지 않음 — 다른 사람 토큰 목록을 조회/스크래핑하지 못하도록.
-- 발송 스크립트(추후 GitHub Actions 등)는 anon 키가 아니라 service_role 키를 써서 전체 조회.
drop policy if exists "anyone can register a push token" on public.push_subscriptions;
create policy "anyone can register a push token"
  on public.push_subscriptions for insert
  with check (true);
