-- 부산 게임 취업 토크콘서트 중복 정리 (2026-09-17)
-- Supabase 대시보드 > SQL Editor 에서 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 무슨 일이 있었나
--   크롤러가 같은 행사를 29초 간격으로 두 번 등록했다.
--
--     nd-20260914-d05dd0  "제2회 부산콘텐츠아카데미 게임 취업토크콘서트"  04:38:49
--     nd-20260914-7b221d  "제2회 게임 취업 토크콘서트"                   04:39:18
--
--   둘 다 2026-09-18 · 부산문화콘텐츠콤플렉스다. 서로 다른 기사가 같은 행사를 다르게
--   불렀고, 제목 문자열이 실제로 다르기 때문에 normalized_title() 중복 검사
--   (dedupe_events_by_title_2026-09-16.sql)에 안 걸렸다.
--
--   그 파일 끝에 "이건 사람이 판단할 일"이라고 적어둔 바로 그 건이다.
--
-- 어느 쪽을 남기나 — nd-20260914-7b221d ("제2회 게임 취업 토크콘서트")
--   채워진 정보가 더 많다.
--     입장료  "무료"        vs  (없음)
--     장소    "…콤플렉스 5층" vs  "…콤플렉스"   ← 층까지 있다
--     설명    컴투스·크래프톤 현직자, 오후 1시 시작까지 적혀 있다
--     카테고리 게임전시      vs  게임음악      ← 취업 토크콘서트는 게임음악이 아니다
--
--   지우는 쪽에서 더 나은 값 하나만 가져온다: 주최.
--     "부산광역시와 부산정보산업진흥원"  (지우는 쪽)
--     "부산정보산업진흥원"              (남기는 쪽)
--
-- 안전장치
--   두 행 모두 하위 데이터(부스·굿즈·무대·코스어·탭)가 0건이고 event_drafts 연결도
--   없다는 것을 지우기 전에 확인한다. 하나라도 있으면 아무것도 하지 않고 멈춘다 —
--   자동 판정이 틀렸을 때 사람이 넣은 것을 지우면 되돌릴 수 없다.

do $$
declare
  keep_id text := 'nd-20260914-7b221d';  -- 제2회 게임 취업 토크콘서트
  drop_id text := 'nd-20260914-d05dd0';  -- 제2회 부산콘텐츠아카데미 게임 취업토크콘서트
  children int;
  drop_organizer text;
begin
  -- 이미 정리된 뒤 다시 실행한 경우
  if not exists (select 1 from public.events where id = drop_id) then
    raise notice '이미 정리됨 — % 가 없습니다.', drop_id;
    return;
  end if;

  if not exists (select 1 from public.events where id = keep_id) then
    raise exception '남길 행사 % 가 없습니다. 잘못된 id이거나 이미 지워졌습니다.', keep_id;
  end if;

  select
    (select count(*) from public.event_booths      where event_id = drop_id)
  + (select count(*) from public.event_booth_items where event_id = drop_id)
  + (select count(*) from public.event_stage_slots where event_id = drop_id)
  + (select count(*) from public.event_cosplayers  where event_id = drop_id)
  + (select count(*) from public.event_performers  where event_id = drop_id)
  + (select count(*) from public.event_tabs        where event_id = drop_id)
  into children;

  if children > 0 then
    raise exception '% 에 하위 데이터가 % 건 있습니다. 옮길 것이 있는지 먼저 확인하세요.',
      drop_id, children;
  end if;

  -- 주최만 더 나은 값으로 옮긴다. 남기는 쪽 값이 이미 더 길면 건드리지 않는다.
  select organizer into drop_organizer from public.events where id = drop_id;
  update public.events
  set organizer = drop_organizer
  where id = keep_id
    and drop_organizer is not null
    and length(drop_organizer) > length(coalesce(organizer, ''));

  -- 이 행사를 가리키던 제보가 있으면 남기는 쪽으로 옮긴다
  -- (event_reports.event_id는 on delete cascade라, 안 옮기면 같이 지워진다).
  update public.event_reports set event_id = keep_id where event_id = drop_id;

  -- 승격 기록은 promoted_event_id가 on delete set null이라 따로 정리할 필요가 없다.
  delete from public.events where id = drop_id;

  raise notice '정리 완료 — % 삭제, % 유지', drop_id, keep_id;
end $$;

-- 확인 — 1이 나와야 한다.
select count(*) as "2026-09-18 부산 토크콘서트 행 수"
from public.events
where start_date = date '2026-09-18' and venue like '부산문화콘텐츠콤플렉스%';
