-- promote_event_draft() 회귀 복구 (2026-09-16)
-- Supabase 대시보드 > SQL Editor 에서 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 무슨 일이 있었나
--   dedupe_events_by_title_2026-09-16.sql이 이 함수를 다시 정의하면서 중복 판정만
--   normalized_title() 비교로 바꾸고, 직전 버전(validate_urls_2026-09-14.sql)에 있던
--   나머지를 옮겨 적지 않았다. 그래서 네 가지가 한꺼번에 사라졌다.
--
--     1) set search_path = public, pg_temp
--        security definer 함수에서 search_path를 고정하지 않으면, 호출자가 만든 스키마가
--        앞에 끼어들어 우리가 부르려던 함수 대신 남의 함수가 실행될 수 있다.
--        (Supabase 린터가 지적하는 바로 그 항목이다.)
--
--     2) safe_url(ticket_url) / safe_url(website)
--        extracted는 뉴스 기사를 LLM에 넣어 뽑아낸 값이라 주소 형식이 보장되지 않는다.
--        이게 빠지면서 http(s)가 아닌 문자열이 events에 그대로 들어가게 됐다.
--        events_urls_are_http CHECK가 not valid라 신규 insert는 막히긴 하지만,
--        그러면 이번엔 3)이 없어서 승인 자체가 터진다.
--
--     3) begin ... exception → rejected + review_note
--        insert가 실패하면 승인 UPDATE 전체가 raw PostgreSQL 에러로 터진다.
--        관리자 화면에는 "23514: new row violates check constraint..." 같은 문구가 그대로
--        뜨고, 무엇을 고쳐야 하는지는 아무 데도 안 남는다. 원래는 그 draft만 반려하고
--        사유를 review_note에 적었다.
--
--     4) insert 컬럼 ticket_open_time, ticket_open_note
--        크롤러가 뽑아둔 값이 승격 과정에서 조용히 버려지고 있었다.
--
--   이 파일은 09-14의 네 가지를 되돌리고, 09-16이 가져온 normalized_title 비교는 유지한다.
--   즉 두 버전의 합집합이다.

-- 이 파일이 의존하는 것들이 실제로 있는지 먼저 본다. 없는 상태로 함수만 바꾸면
-- 승인할 때가 되어서야 "함수가 없다"로 터진다 — 그때는 원인을 찾기 어렵다.
do $$
begin
  if to_regprocedure('public.safe_url(text)') is null then
    raise exception 'public.safe_url(text)이 없습니다. supabase/validate_urls_2026-09-14.sql을 먼저 실행하세요.';
  end if;
  if to_regprocedure('public.normalized_title(text)') is null then
    raise exception 'public.normalized_title(text)이 없습니다. supabase/dedupe_events_by_title_2026-09-16.sql을 먼저 실행하세요.';
  end if;
end $$;

create or replace function public.promote_event_draft()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_event_id text;
  existing_event_id text;
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    begin
      -- 띄어쓰기·문장부호만 다른 제목은 같은 행사로 본다.
      -- 뉴스마다 "호요랜드2026"·"호요랜드 2026"처럼 제각각 적기 때문이다.
      select id into existing_event_id
      from public.events
      where public.normalized_title(title) = public.normalized_title(new.extracted->>'title')
        and start_date = (new.extracted->>'start_date')::date
      limit 1;

      if existing_event_id is not null then
        -- 이미 같은 행사가 있음 -> 새로 만들지 않고 연결만 하고 끝낸다.
        new.promoted_event_id := existing_event_id;
        new.reviewed_at := now();
        new.review_note := null;
        return new;
      end if;

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
        -- end_date가 비어있으면(단일 하루 행사 등) start_date로 채운다
        coalesce((new.extracted->>'end_date')::date, (new.extracted->>'start_date')::date),
        new.extracted->>'venue',
        new.extracted->>'venue_address',
        new.extracted->>'organizer',
        new.extracted->>'description',
        -- LLM이 만들어낸 주소라 형식이 보장되지 않는다. http(s)가 아니면 null로 떨군다.
        public.safe_url(new.extracted->>'ticket_url'),
        (new.extracted->>'ticket_open_date')::date,
        new.extracted->>'ticket_open_time',
        new.extracted->>'ticket_open_note',
        new.extracted->>'admission_fee',
        public.safe_url(new.extracted->>'website'),
        case when new.extracted->'tags' is not null
          then array(select jsonb_array_elements_text(new.extracted->'tags'))
          else '{}'::text[]
        end
      );

      new.promoted_event_id := new_event_id;
      new.reviewed_at := now();
      new.review_note := null;
    exception when others then
      -- category check 위반, 날짜 파싱 실패, title null 등. 승인 update 전체를 깨뜨리는
      -- 대신 이 draft만 반려 처리하고 사유를 남긴다(events에 넣던 행은 롤백된다).
      new.status := 'rejected';
      new.promoted_event_id := null;
      new.reviewed_at := now();
      new.review_note := '자동 게시 실패: ' || sqlerrm;
    end;
  elsif new.status = 'rejected' and old.status is distinct from new.status then
    new.reviewed_at := now();
  end if;

  return new;
end;
$$;

-- 트리거 자체는 event_drafts.sql에서 만들어졌고 함수만 바뀌었으므로 재생성이 필요 없지만,
-- 이 파일만 실행한 환경에서도 붙어 있도록 확인해 둔다.
drop trigger if exists event_drafts_promote on public.event_drafts;
create trigger event_drafts_promote
  before update on public.event_drafts
  for each row execute function public.promote_event_draft();

comment on function public.promote_event_draft() is
  '승인된 draft를 events로 승격한다. 제목은 normalized_title로 비교해 중복을 막고, '
  '주소는 safe_url로 거르며, 실패하면 그 draft만 rejected + review_note로 남긴다.';
