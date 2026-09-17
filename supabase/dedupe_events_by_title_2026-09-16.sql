-- ⚠ 이 파일에는 promote_event_draft()의 **옛 정의**가 들어 있다.
--   지금 쓰는 정의는 supabase/functions/promote_event_draft.sql 하나뿐이다.
--   이 파일을 통째로 다시 실행하면 그 함수가 옛 버전으로 되돌아간다 — 실제로 한 번 그랬다.
--   여기서 필요한 것(테이블·컬럼·제약)만 골라 실행하고, 함수 정의 블록은 건너뛸 것.
--   지금 살아 있는 버전 확인:
--     select obj_description('public.promote_event_draft()'::regprocedure);

-- 제목 띄어쓰기 차이로 중복 등록된 행사 정리 + 재발 방지 (2026-09-16)
-- Supabase 대시보드 > SQL Editor 에서 위에서부터 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 무슨 일이 있었나
--   목록에 "호요랜드 2026"이 두 개 떴다. 확인해 보니 정말 두 행이었다.
--
--     nd-20260903-7ae385  "호요랜드2026"   (뉴스 크롤러, 9/3)  하위 데이터 0건
--     nd-20260914-5f09e9  "호요랜드 2026"  (known-events, 9/14) 부스 8 · 항목 76 · 무대 22
--
--   promote_event_draft()의 중복 검사가 제목 "완전 일치"였기 때문이다.
--       where title = new.extracted->>'title'
--   "호요랜드2026" ≠ "호요랜드 2026" — 띄어쓰기 하나로 빠져나갔다.
--
--   뉴스 기사는 행사명을 제각각 적는다. 띄어쓰기·가운뎃점·괄호가 조금씩 다르면
--   같은 행사가 계속 새로 생긴다. 문자열을 그대로 비교하는 한 반복될 문제다.

-- ---------------------------------------------------------------------------
-- 1) 비교용으로 제목을 다듬는 함수
--
-- 띄어쓰기와 흔한 문장부호만 뗀다. 글자는 건드리지 않는다 —
-- "코믹월드 337"과 "코믹월드 338"은 여전히 다른 제목이어야 한다.
create or replace function public.normalized_title(t text)
returns text
language sql
immutable
as $$
  -- 두 번에 나눠 지운다. 한 문자 클래스에 -, ], \ 를 같이 넣으면 엔진마다 해석이
  -- 달라져서 조용히 다른 것을 지울 수 있다. 공백 먼저, 그다음 문장부호.
  -- 가운뎃점들(·∙‧・)은 로케일에 따라 [[:punct:]]에 안 들어갈 수 있어 따로 적는다.
  select lower(
    regexp_replace(
      regexp_replace(coalesce(t, ''), '[[:space:]]+', '', 'g'),
      '[[:punct:]·∙‧・]+', '', 'g'
    )
  );
$$;

comment on function public.normalized_title(text) is
  '중복 판정용으로 제목에서 띄어쓰기·문장부호를 뗀 형태. 글자는 그대로 둔다.';

-- 중복 검사가 매 승인마다 도는 쿼리라 인덱스를 준다.
create index if not exists events_normalized_title_idx
  on public.events(public.normalized_title(title), start_date);

-- ---------------------------------------------------------------------------
-- 2) 이미 들어간 중복 정리
--
-- 안전장치를 두 겹 둔다. 자동 판정이 틀렸을 때 사람이 넣은 것을 지우면 되돌릴 수 없다.
--   · 하위 데이터(부스·항목·무대·출연진·코스어)가 하나라도 붙은 행은 절대 지우지 않는다
--   · 관리자가 손댄 행(admin_edited_at)도 지우지 않는다
-- 남길 행은 하위 데이터가 많은 쪽 → 채워진 정보가 많은 쪽 → 먼저 만들어진 쪽 순으로 고른다.
do $$
declare
  removed int;
begin
  with counted as (
    select
      e.id,
      e.created_at,
      e.admin_edited_at,
      public.normalized_title(e.title) as key,
      e.start_date,
      (select count(*) from public.event_booths      b where b.event_id = e.id)
    + (select count(*) from public.event_booth_items i where i.event_id = e.id)
    + (select count(*) from public.event_stage_slots s where s.event_id = e.id)
    + (select count(*) from public.event_performers  p where p.event_id = e.id)
    + (select count(*) from public.event_cosplayers  c where c.event_id = e.id) as children,
      (e.ticket_url    is not null)::int
    + (e.poster_url    is not null)::int
    + (e.admission_fee is not null)::int
    + (e.website       is not null)::int as filled
    from public.events e
  ),
  ranked as (
    select id, children, admin_edited_at,
      row_number() over (
        partition by key, start_date
        order by children desc, filled desc, created_at
      ) as rn
    from counted
  )
  delete from public.events e
  using ranked r
  where e.id = r.id
    and r.rn > 1
    and r.children = 0
    and r.admin_edited_at is null;

  get diagnostics removed = row_count;
  raise notice '중복 행사 % 건 삭제', removed;
end $$;

-- ---------------------------------------------------------------------------
-- 3) 앞으로는 다듬은 제목으로 비교한다
--
-- event_drafts_dedup.sql의 트리거와 같되, 중복 판정 조건만 바뀐다.
-- (승격할 때 채우는 컬럼 목록은 그대로 둔다 — 나머지 컬럼은 known-events.mjs가
--  승인 뒤에 따로 update한다.)
create or replace function public.promote_event_draft()
returns trigger as $$
declare
  new_event_id text;
  existing_event_id text;
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    -- 띄어쓰기·문장부호만 다른 제목은 같은 행사로 본다.
    -- 뉴스마다 "호요랜드2026"·"호요랜드 2026"처럼 제각각 적기 때문이다.
    select id into existing_event_id
    from public.events
    where public.normalized_title(title) = public.normalized_title(new.extracted->>'title')
      and start_date = (new.extracted->>'start_date')::date
    limit 1;

    if existing_event_id is not null then
      -- 이미 같은 행사가 있음 -> 새로 만들지 않고 기존 행사에 연결만 하고 끝낸다.
      new.promoted_event_id := existing_event_id;
      new.reviewed_at := now();
      return new;
    end if;

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

-- ---------------------------------------------------------------------------
-- 남는 문제 — 제목이 정말로 다른 경우는 여기서 못 잡는다
--
--   "제2회 게임 취업 토크콘서트"
--   "제2회 부산콘텐츠아카데미 게임 취업토크콘서트"
--   둘 다 2026-09-18 · 부산문화콘텐츠콤플렉스. 같은 행사를 두 기사가 다르게 부른 것이다.
--
-- 띄어쓰기를 떼도 서로 다른 문자열이라 이 규칙으로는 안 잡힌다. 여기서 더 느슨하게
-- (예: 날짜+장소만 같으면 같은 행사로) 잡으면, 한 전시장에서 같은 날 열리는 별개
-- 행사를 합쳐버린다 — 잘못 합치는 쪽이 중복으로 남는 것보다 나쁘다.
-- 그 판단은 사람이 /admin/drafts에서 하는 것이 맞다.
