-- 부천국제만화축제 중복 정리 (2026-09-17)
-- Supabase 대시보드 > SQL Editor 에서 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 무슨 일이 있었나
--   한 축제가 세 줄이 됐다. 뒤의 둘은 오늘(9/17) 크롤에서 새로 들어왔다.
--
--     nd-20260906-295551  "제29회 부천국제만화축제"        09.18~09.20 · 한국만화박물관 일원
--     nd-20260917-2142bb  "제29회 부천국제만화축제(BICOF)"  09.18~09.20 · 부천시
--     nd-20260917-f929ca  "부천 국제만화축제"              09.18       · 부천
--
--   normalized_title()은 띄어쓰기·문장부호만 뗀다(글자는 건드리지 않는다 —
--   "코믹월드 337"과 "338"이 같아지면 안 되기 때문이다). 그래서 셋이 전부 다른
--   제목으로 남았다.
--
--     제29회부천국제만화축제  ≠  제29회부천국제만화축제bicof  ≠  부천국제만화축제
--
--   부산 토크콘서트(dedupe_busan_talk_2026-09-17.sql)와 같은 종류다. 기사마다 행사명을
--   다르게 적고, 크롤러는 그걸 그대로 받는다.
--
--   이번엔 정리만 하고 끝내지 않는다. 대시보드의 "중복 의심"이 이런 짝을 잡도록
--   고쳤다(src/lib/duplicates.js) — 자동으로 합치지는 않고, 사람 눈에 띄게만 한다.
--   자동 병합을 느슨하게 하면 언젠가 다른 행사 둘을 합치고, 그건 되돌릴 수 없다.
--
-- 어느 쪽을 남기나 — nd-20260906-295551
--   장소   "한국만화박물관 일원"  vs  "부천시" · "부천"     ← 실제로 찾아갈 수 있는 값
--   기간   09.18~09.20           vs  09.18(하루)           ← 셋째는 종료일이 틀렸다
--   설명   행사 자체를 설명       vs  기사 문장이 그대로 들어와 있다
--
--   지우는 쪽에 있고 남기는 쪽에 없는 값은 가져온다(예매 링크·포스터·공식사이트 등).
--
-- 안전장치
--   지울 행에 하위 데이터(부스·굿즈·무대·출연진·코스어·탭)가 하나라도 있거나
--   관리자가 손댄 흔적(admin_edited_at)이 있으면 아무것도 하지 않고 멈춘다.
--   자동 판정이 틀렸을 때 사람이 넣은 것을 지우면 되돌릴 수 없다.

do $$
declare
  keep_id  text := 'nd-20260906-295551';  -- 제29회 부천국제만화축제
  drop_ids text[] := array[
    'nd-20260917-2142bb',  -- 제29회 부천국제만화축제(BICOF)
    'nd-20260917-f929ca'   -- 부천 국제만화축제
  ];
  drop_id  text;
  children int;
  touched  timestamptz;
  removed  int := 0;
begin
  if not exists (select 1 from public.events where id = keep_id) then
    raise exception '남길 행사 % 가 없습니다. 잘못된 id이거나 이미 지워졌습니다.', keep_id;
  end if;

  foreach drop_id in array drop_ids loop
    if not exists (select 1 from public.events where id = drop_id) then
      raise notice '이미 정리됨 — % 가 없습니다.', drop_id;
      continue;
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

    select admin_edited_at into touched from public.events where id = drop_id;
    if touched is not null then
      raise exception '% 는 관리자가 직접 수정한 행입니다(%). 손으로 확인하고 지우세요.',
        drop_id, touched;
    end if;

    -- 남기는 쪽이 비어 있는 칸만 채운다. 이미 값이 있으면 건드리지 않는다 —
    -- 남길 행을 고른 이유가 그 값들이 더 낫기 때문이다.
    update public.events k
    set ticket_url       = coalesce(k.ticket_url,       d.ticket_url),
        ticket_open_date = coalesce(k.ticket_open_date, d.ticket_open_date),
        ticket_open_time = coalesce(k.ticket_open_time, d.ticket_open_time),
        poster_url       = coalesce(k.poster_url,       d.poster_url),
        website          = coalesce(k.website,          d.website),
        admission_fee    = coalesce(k.admission_fee,    d.admission_fee),
        organizer        = coalesce(k.organizer,        d.organizer),
        venue_address    = coalesce(k.venue_address,    d.venue_address),
        venue_lat        = coalesce(k.venue_lat,        d.venue_lat),
        venue_lng        = coalesce(k.venue_lng,        d.venue_lng)
    from public.events d
    where k.id = keep_id and d.id = drop_id;

    -- 이 행사를 가리키던 제보는 남기는 쪽으로 옮긴다
    -- (event_reports.event_id는 on delete cascade라, 안 옮기면 같이 지워진다).
    update public.event_reports set event_id = keep_id where event_id = drop_id;

    -- 승격 기록은 promoted_event_id가 on delete set null이라 따로 정리할 필요가 없다.
    delete from public.events where id = drop_id;
    removed := removed + 1;
    raise notice '삭제 — %', drop_id;
  end loop;

  raise notice '정리 완료 — % 건 삭제, % 유지', removed, keep_id;
end $$;

-- 확인 — 1이 나와야 한다.
select count(*) as "2026-09-18 부천 만화축제 행 수", string_agg(title, ' / ') as "남은 제목"
from public.events
where start_date = date '2026-09-18'
  and public.normalized_title(title) like '%부천%만화축제%';
