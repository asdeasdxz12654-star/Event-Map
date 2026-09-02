-- game-event-hub: 뉴스 크롤러가 추출한 행사 후보를 담아두는 테이블 + 검수 승인 시 자동 게시 트리거.
-- Supabase 대시보드 > SQL Editor 에서 실행하세요.

create table if not exists public.event_drafts (
  id                 uuid primary key default gen_random_uuid(),
  source_name        text not null,             -- 예: '게임메카', '루리웹'
  source_url         text not null unique,       -- 원문 기사 링크. 중복 수집 방지용
  source_title       text not null,              -- 원문 기사 제목
  published_at       timestamptz,
  status             text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  extracted          jsonb not null,             -- Claude가 추출한 구조화 필드 (events 테이블과 같은 컬럼명)
  promoted_event_id  text references public.events(id),
  created_at         timestamptz not null default now(),
  reviewed_at        timestamptz
);

create index if not exists event_drafts_status_idx on public.event_drafts(status);

alter table public.event_drafts enable row level security;
-- 정책을 하나도 안 만들면 RLS가 기본적으로 전부 막는다.
-- anon 키로는 읽기/쓰기 둘 다 불가 — 크롤러(GitHub Actions)와 검수는 service_role 키로만 접근.

-- status를 'approved'로 바꾸는 순간, extracted의 내용을 실제 events 테이블에 반영한다.
-- (Supabase 대시보드 Table Editor에서 status 컬럼 값만 바꿔주면 그게 곧 "게시" 버튼 역할을 한다)
create or replace function public.promote_event_draft()
returns trigger as $$
declare
  new_event_id text;
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    new_event_id := 'nd-' || to_char(now(), 'YYYYMMDD') || '-' || substr(md5(random()::text), 1, 6);

    insert into public.events (
      id, title, category, start_date, end_date, venue, venue_address,
      organizer, description, ticket_url, ticket_open_date, admission_fee,
      website, tags
    )
    values (
      new_event_id,
      new.extracted->>'title',
      new.extracted->>'category',
      (new.extracted->>'start_date')::date,
      -- end_date가 비어있으면(단일 하루 행사 등) start_date로 채운다
      coalesce((new.extracted->>'end_date')::date, (new.extracted->>'start_date')::date),
      new.extracted->>'venue',
      new.extracted->>'venue_address',
      new.extracted->>'organizer',
      new.extracted->>'description',
      new.extracted->>'ticket_url',
      (new.extracted->>'ticket_open_date')::date,
      new.extracted->>'admission_fee',
      new.extracted->>'website',
      case when new.extracted->'tags' is not null
        then array(select jsonb_array_elements_text(new.extracted->'tags'))
        else '{}'::text[]
      end
    );

    new.promoted_event_id := new_event_id;
    new.reviewed_at := now();
  elsif new.status = 'rejected' and old.status is distinct from new.status then
    new.reviewed_at := now();
  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists event_drafts_promote on public.event_drafts;
create trigger event_drafts_promote
  before update on public.event_drafts
  for each row execute function public.promote_event_draft();
