-- 중복 행사 정리 + 중복 방지 강화 (2026-09-10)
-- Supabase 대시보드 > SQL Editor 에서 위에서부터 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 무엇이 문제였나
--   promote_event_draft()의 중복 방지는 "제목이 완전히 같고 시작일도 같을 때"만 걸린다.
--   그런데 같은 행사를 여러 소스가 각자 다르게 적는다 —
--     "GXG 2026" / "게임문화축제 GXG 2026" / "게임문화축제 ‘GXG 2026’"
--   게다가 기사에서 날짜를 뽑다 보면 하루씩 어긋나기도 한다. 그래서 GXG 2026 하나가
--   행사 5건으로 등록돼 목록에 같은 행사가 네 번 더 보였다.

-- ---------------------------------------------------------------------------
-- 1) 제목 비교용 정규화 함수
-- 공백·따옴표·괄호·가운뎃점 등 표기 차이만 걷어낸다. 회차 번호나 연도는 남긴다 —
-- "코믹월드 336"과 "코믹월드 337"은 다른 행사이므로 절대 합쳐지면 안 된다.
-- 글자·숫자만 남긴다. 지울 문자를 하나씩 나열하면 따옴표 종류(''‘’"“”)마다 이스케이프를
-- 신경 써야 해서, 반대로 "남길 것"만 지정한다.
create or replace function public.norm_event_title(t text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(coalesce(t, ''), '[^[:alnum:]가-힣]', '', 'g'))
$$;

-- 확인용:
-- select public.norm_event_title('게임문화축제 ‘GXG 2026’');  -- gxg2026이 포함된 문자열
-- select public.norm_event_title('GXG 2026');                -- gxg2026

-- ---------------------------------------------------------------------------
-- 2) promote_event_draft() — 중복 판정을 "표기 차이 무시 + 날짜 ±2일"로 넓힌다
--
-- 판정 기준: 정규화한 제목이 서로 포함 관계이고(한쪽이 다른 쪽을 품고 있고),
--            시작일이 2일 이내로 차이 나면 같은 행사로 본다.
--   "게임문화축제gxg2026" ⊃ "gxg2026"  + 날짜 하루 차이 -> 같은 행사 (연결만)
--   "코믹월드336일산"  vs "코믹월드337울산"          -> 포함 관계 아님 -> 다른 행사
--   "agf2026"        vs "agf2027"                 -> 날짜가 1년 차이  -> 다른 행사
--
-- 나머지(실패 시 rejected 처리, search_path 고정, 필드 매핑)는 hardening_2026-09-09.sql과 같다.
create or replace function public.promote_event_draft()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_event_id text;
  existing_event_id text;
  norm_new text;
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    begin
      norm_new := public.norm_event_title(new.extracted->>'title');

      -- 표기가 조금 다르거나 날짜가 하루이틀 어긋난 같은 행사가 이미 있는지 본다.
      -- 너무 짧은 제목(2글자 미만)은 아무거나 포함 관계가 되므로 제외한다.
      if length(norm_new) >= 2 then
        select e.id into existing_event_id
        from public.events e
        where length(public.norm_event_title(e.title)) >= 2
          and (
            strpos(public.norm_event_title(e.title), norm_new) > 0
            or strpos(norm_new, public.norm_event_title(e.title)) > 0
          )
          and abs(e.start_date - (new.extracted->>'start_date')::date) <= 2
        -- 이미 포스터·공식 사이트가 채워진 행을 우선 연결한다 (가장 잘 정리된 행)
        order by (e.poster_url is not null) desc, (e.website is not null) desc, e.created_at asc
        limit 1;
      end if;

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

-- ---------------------------------------------------------------------------
-- 3) 이미 들어간 GXG 2026 중복 4건 정리
--
-- 남길 행: nd-20260909-0dec79
--   "GXG 2026" 2026-09-11 ~ 09-12, 판교역 광장 일대 — 공식 사이트(gxg.world)의 포스터에
--   찍힌 "09.11 금 - 09.12 토"와 일치하고, 포스터·공식 사이트가 이미 채워져 있다.
--
-- 지울 행 (전부 기사에서 날짜를 잘못 뽑은 같은 행사):
--   nd-20260910-134f40  "게임문화축제 GXG 2026"      2026-09-10 (하루짜리)
--   nd-20260910-6c86d2  "게임문화축제 ‘GXG 2026’"    2026-09-11 (하루짜리)
--   nd-20260910-7fc630  "게임문화축제 GXG 2026"      2026-11-11 (9월 행사인데 11월로 들어옴)
--   nd-20260910-00d0da  "GXG 2026"                 2026-11-11 (위와 같음)
--
-- event_drafts.promoted_event_id는 on delete set null이라 참조는 알아서 끊긴다.
-- 그 draft들은 approved 상태로 남으므로 다음 크롤에서 같은 기사를 다시 수집하지도 않는다.
delete from public.events
where id in (
  'nd-20260910-134f40',
  'nd-20260910-6c86d2',
  'nd-20260910-7fc630',
  'nd-20260910-00d0da'
);

-- 확인용 — 실행 후 GXG 행사가 1건만 남아야 한다:
-- select id, title, start_date, end_date, venue from public.events
-- where title ilike '%GXG%' or title ilike '%게임문화축제%' order by start_date;
