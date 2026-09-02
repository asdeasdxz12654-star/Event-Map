-- game-event-hub: 이벤트별로 어떤 알림을 이미 보냈는지 기록해서 중복 발송을 막는 테이블.
-- Supabase 대시보드 > SQL Editor 에서 실행하세요.

create table if not exists public.event_notifications (
  id         uuid primary key default gen_random_uuid(),
  event_id   text not null references public.events(id) on delete cascade,
  type       text not null check (type in ('ticket_open', 'starting_soon')),
  sent_at    timestamptz not null default now(),
  unique (event_id, type)
);

alter table public.event_notifications enable row level security;
-- 정책 없음 = anon 완전 차단. 발송 스크립트(GitHub Actions)는 service_role 키로만 접근.
