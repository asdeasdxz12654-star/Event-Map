-- ticket_open_note 컬럼 추가 마이그레이션
-- Supabase 대시보드 > SQL Editor 에서 실행하세요.
--
-- ⚠️ 이 파일은 지난 마이그레이션 기록이다. 이미 실행했다면 다시 실행하지 말 것 —
--    아래 promote_event_draft() 정의에는 중복 방지(제목+시작일이 같은 행사면 새로
--    만들지 않고 기존 행사에 연결)와 실패 시 반려 처리, search_path 고정이 빠져 있다.
--    현재 정의는 hardening_2026-09-09.sql에 있다.
--
-- ticket_open_date/ticket_open_time은 "가장 대표적인 예매 오픈 일시" 하나만 담을 수
-- 있는데, 실제로는 스페셜 패스 사전예매 → 온라인 사전예매 → 일반예매처럼 단계가
-- 여러 개인 행사가 많음. admission_fee처럼 자유 텍스트로 전체 일정을 설명하는
-- 컬럼을 따로 둔다.

alter table public.events
  add column if not exists ticket_open_note text;

comment on column public.events.ticket_open_note is
  '사전예매 등 예매 단계별 일정 설명 (자유 텍스트). 예:
   "스페셜 패스 사전예매: 팝업스토어 9/1~6 / KREAM 온라인 9/7 · 일반 예매 9/29".
   단계가 하나뿐이면 ticket_open_date/ticket_open_time만으로 충분하니 null로 둬도 됨.';

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
      ticket_open_note, admission_fee, website, tags
    )
    values (
      new_event_id,
      new.extracted->>'title',
      new.extracted->>'category',
      (new.extracted->>'start_date')::date,
      coalesce((new.extracted->>'end_date')::date, (new.extracted->>'start_date')::date),
      new.extracted->>'venue',
      new.extracted->>'venue_address',
      new.extracted->>'organizer',
      new.extracted->>'description',
      new.extracted->>'ticket_url',
      (new.extracted->>'ticket_open_date')::date,
      new.extracted->>'ticket_open_time',
      new.extracted->>'ticket_open_note',
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
