-- ticket_open_time 컬럼 추가 마이그레이션
-- Supabase 대시보드 > SQL Editor 에서 실행하세요.
--
-- 지금까지 ticket_open_date(date)만 있어서 "몇월 며칠"까지만 저장 가능했고
-- "몇시"는 저장할 곳이 없었음. 시간 표기가 "20:00" / "오후 8시" 처럼 소스마다
-- 제각각이라 admission_fee와 같은 방식(자유 텍스트)으로 둠.
-- 예매 사이트명은 별도 컬럼 없이 ticket_url 호스트명에서 프론트가 유추한다
-- (src/lib/ticketSite.js).

alter table public.events
  add column if not exists ticket_open_time text;

comment on column public.events.ticket_open_time is
  '예매 오픈 시각 (자유 텍스트, 예: "20:00", "오후 8시"). 시간 정보가 없으면 null.';

-- event_drafts 승인 시 이 필드도 함께 events에 반영되도록 트리거 갱신
create or replace function public.promote_event_draft()
returns trigger as $$
declare
  new_event_id text;
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    new_event_id := 'nd-' || to_char(now(), 'YYYYMMDD') || '-' || substr(md5(random()::text), 1, 6);

    insert into public.events (
      id, title, category, start_date, end_date, venue, venue_address,
      organizer, description, ticket_url, ticket_open_date, ticket_open_time,
      admission_fee, website, tags
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
      new.extracted->>'ticket_open_time',
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
