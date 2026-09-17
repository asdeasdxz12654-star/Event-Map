-- promote_event_draft() — 검수 승인 시 events로 승격하는 트리거 함수.
--
-- ⚠ 이 파일이 **유일한 정의**다. 다른 파일에서 이 함수를 다시 정의하지 말 것.
--
-- 왜 이 파일이 생겼나
--   이 함수가 아홉 개 파일에 흩어져 있었다. 마이그레이션을 손으로 실행하는 구조라,
--   어느 파일을 언제 돌렸느냐에 따라 살아 있는 정의가 달라진다. 실제로 그랬다 —
--   dedupe_events_by_title_2026-09-16.sql이 중복 판정만 새로 쓰고 나머지를 옮겨
--   적지 않아서, search_path 고정·safe_url·예외 처리·컬럼 두 개가 한꺼번에 사라졌다.
--   화면에는 아무 변화가 없었고, 승인이 터지고 나서야 알았다.
--
--   같은 일이 또 나지 않게 정의를 여기 하나로 모은다. 옛 파일들은 그때 무슨 일이
--   있었는지 남기는 기록으로만 두고, 함수 정의 부분은 실행하지 않는다.
--
-- 바꿀 때
--   1) 이 파일을 고친다
--   2) 맨 아래 comment on function의 v날짜를 오늘로 올린다
--   3) 대시보드 SQL Editor에서 이 파일을 통째로 실행한다
--   4) supabase/README.md의 확인 쿼리로 버전이 바뀌었는지 본다
--
-- 지금 DB에 무엇이 살아 있는지 확인:
--   select obj_description('public.promote_event_draft()'::regprocedure);

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

-- 버전을 주석에 박아 둔다. 파일을 아무리 잘 관리해도 "DB에 지금 무엇이 들어 있는가"는
-- DB에게 물어봐야 알 수 있다 — 옛 파일을 잘못 실행하면 이 값이 옛날 것으로 돌아간다.
comment on function public.promote_event_draft() is
  'v2026-09-17 · 승인된 draft를 events로 승격한다. 제목은 normalized_title로 비교해 '
  '중복을 막고, 주소는 safe_url로 거르며, 실패하면 그 draft만 rejected + review_note로 남긴다. '
  '정의는 supabase/functions/promote_event_draft.sql 하나뿐이다.';

select obj_description('public.promote_event_draft()'::regprocedure) as "지금 살아 있는 버전";
