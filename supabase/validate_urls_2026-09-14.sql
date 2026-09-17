-- ⚠ 이 파일에는 promote_event_draft()의 **옛 정의**가 들어 있다.
--   지금 쓰는 정의는 supabase/functions/promote_event_draft.sql 하나뿐이다.
--   이 파일을 통째로 다시 실행하면 그 함수가 옛 버전으로 되돌아간다 — 실제로 한 번 그랬다.
--   여기서 필요한 것(테이블·컬럼·제약)만 골라 실행하고, 함수 정의 블록은 건너뛸 것.
--   지금 살아 있는 버전 확인:
--     select obj_description('public.promote_event_draft()'::regprocedure);

-- 보안 점검(2026-09-14) 후속: 링크로 나가는 컬럼에 http(s) 주소만 들어가게 한다.
-- Supabase 대시보드 > SQL Editor 에서 위에서부터 그대로 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 왜
--   events.poster_url / ticket_url / website / floor_plan_url은 사람이 입력한 값이 아니다.
--   크롤러가 뉴스 기사를 LLM(Groq)에 넣어 뽑아낸 문자열이 event_drafts를 거쳐 자동 승인으로
--   그대로 들어온다. 그 값이 프론트에서 <a href>·<img src>가 되므로, "모델이 만들어낸
--   문자열"이 곧 링크가 되는 구조였다.
--
--   막는 곳을 네 군데 둔다 — 한 곳이 뚫려도 나머지가 받는다.
--     크롤러 저장 직전   crawler/src/util.mjs httpUrl()
--     관리자 API         workers/api-proxy/src/index.js assertUrlColumns()
--     DB (이 파일)       is_http_url() 체크 제약 + promote 트리거의 safe_url()
--     화면 렌더 직전     src/lib/url.js httpUrl()

-- ---------------------------------------------------------------------------
-- 1) 검사 함수
-- 체크 제약에서 쓰려면 immutable이어야 한다. null·빈 문자열은 "값 없음"이라 통과시킨다.
create or replace function public.is_http_url(value text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select value is null or value = '' or value ~* '^https?://[^[:space:]]+$'
$$;

comment on function public.is_http_url(text) is
  'http(s) 주소이거나 값이 없으면 true. 링크로 나가는 컬럼의 체크 제약용.';

-- 값이 http(s)면 그대로, 아니면 null. 트리거에서 "거르고 계속 진행"할 때 쓴다.
create or replace function public.safe_url(value text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case when public.is_http_url(value) then nullif(value, '') else null end
$$;

-- ---------------------------------------------------------------------------
-- 2) events 체크 제약
--
-- not valid로 건다 — 이미 저장된 행은 검사하지 않고, 앞으로의 insert/update만 막는다.
-- (기존 행에 형식이 깨진 주소가 있으면 제약 추가 자체가 실패해서 마이그레이션이 멈춘다.)
--
-- 기존 행 중 걸리는 게 있는지 먼저 확인하고 싶다면:
--   select id, title, poster_url, ticket_url, website, floor_plan_url
--   from public.events
--   where not (is_http_url(poster_url) and is_http_url(ticket_url)
--              and is_http_url(website) and is_http_url(floor_plan_url));
-- 없거나 다 정리했다면 아래 한 줄로 제약을 완전히 켤 수 있다:
--   alter table public.events validate constraint events_urls_are_http;
alter table public.events
  drop constraint if exists events_urls_are_http;

alter table public.events
  add constraint events_urls_are_http check (
    public.is_http_url(poster_url)
    and public.is_http_url(ticket_url)
    and public.is_http_url(website)
    and public.is_http_url(floor_plan_url)
  ) not valid;

-- ---------------------------------------------------------------------------
-- 3) promote_event_draft() 재정의
--
-- hardening_2026-09-09.sql의 정의를 그대로 두고 ticket_url·website에만 safe_url()을 씌운다.
-- 트리거는 거르고 계속 진행한다 — 주소 형식 하나 때문에 행사 등록 자체를 반려하면
-- 멀쩡한 행사가 통째로 사라진다(제목·날짜·장소가 본체고 링크는 부가 정보다).
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
      -- 여러 뉴스 소스가 같은 행사를 각자 기사로 다루는 일이 잦다. 승인 직전에 제목+시작일이
      -- 같은 행사가 이미 있는지 보고, 있으면 새로 만들지 않고 연결만 한다.
      select id into existing_event_id
      from public.events
      where title = new.extracted->>'title'
        and start_date = (new.extracted->>'start_date')::date
      limit 1;

      if existing_event_id is not null then
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

drop trigger if exists event_drafts_promote on public.event_drafts;
create trigger event_drafts_promote
  before update on public.event_drafts
  for each row execute function public.promote_event_draft();
