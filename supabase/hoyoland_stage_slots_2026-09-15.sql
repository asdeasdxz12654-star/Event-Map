-- 호요랜드 2026 무대 일정을 event_stage_slots로 이전 (2026-09-15)
-- Supabase 대시보드 > SQL Editor 에서 stages_2026-09-15.sql 실행 후에 돌리세요.
-- 여러 번 실행해도 안전합니다.
--
-- 출처
--   hoyoland_stage_2026-09-14.sql과 같은 원본이다 — 젠레스 존 제로 공식 공지의
--   7번 슬라이드(무대 프로그램 타임테이블). 그 파일이 event_performers.songs 한 칸에
--   나흘치를 문자열로 넣어둔 것을, 여기서 하루 한 줄씩 행으로 편다.
--
-- 왜 코드로 파싱하지 않았나
--   '10/4(일) 12:00~13:00, 15:00~16:00' 같은 문자열을 코드로 쪼개면 구분자 하나만
--   어긋나도 조용히 틀린 시간이 저장된다. 무대 시간은 사람이 그 시각에 맞춰 움직이는
--   정보라 틀리면 그대로 손해다. 이 저장소가 지켜온 방식대로 손으로 옮겨 적는다
--   (booth_items_2026-09-14.sql 주석과 같은 원칙).
--
-- 무대는 하나뿐이다
--   공지에 "무대는 타이틀 공용으로 한 스테이지에서 진행"이라고 적혀 있다. 그래서
--   event_stages에 행이 하나만 생기고, 화면에서는 무대 필터가 나타나지 않는다.

do $$
declare
  ev text;
  st uuid;
  n int;
begin
  select id into ev from public.events
  where title = '호요랜드 2026' and start_date = date '2026-10-02' limit 1;

  if ev is null then
    raise notice '호요랜드 2026 행사가 없습니다 — known-events 크롤러를 먼저 돌리세요.';
    return;
  end if;

  -- 여러 번 실행해도 무대가 늘지 않게 지우고 다시 만든다.
  delete from public.event_stages where event_id = ev;
  insert into public.event_stages (event_id, name, booth_id, location, sort_order)
  values (ev, '메인 스테이지', null, '무대 스테이지', 0)
  returning id into st;

  insert into public.event_stage_slots
    (event_id, stage_id, day, start_time, end_time, title, note, kind, sort_order) values
  -- 10/2 (금) ---------------------------------------------------------------
  (ev, st, date '2026-10-02', time '11:00', time '12:00', '코스프레 런웨이', null, 'cosplay', 0),
  (ev, st, date '2026-10-02', time '12:30', time '13:30', '원신 무대', null, 'etc', 0),
  (ev, st, date '2026-10-02', time '14:00', time '15:00', '로스캘리퍼 특별 의회 with Google Play',
   '스토리 속 궁금증부터 예측불가 밸런스 게임까지, 함께 이야기해봐요!', 'talk', 0),
  (ev, st, date '2026-10-02', time '15:30', time '16:30', '붕괴: 스타레일 무대', null, 'etc', 0),
  (ev, st, date '2026-10-02', time '17:00', time '18:00', '럭키드로우',
   '무대 스테이지에서 랜덤 추첨으로 매일 총 80명에게 굿즈를 증정', 'event', 0),

  -- 10/3 (토) ---------------------------------------------------------------
  (ev, st, date '2026-10-03', time '11:00', time '12:00', '원신 무대', null, 'etc', 0),
  (ev, st, date '2026-10-03', time '12:30', time '13:30', '도전! 위험한 강습전',
   '호요랜드에 방문한 로프꾼 중 위험한 강습전의 최강자는?', 'event', 0),
  (ev, st, date '2026-10-03', time '14:00', time '15:00', '붕괴: 스타레일 무대', null, 'etc', 0),
  (ev, st, date '2026-10-03', time '15:30', time '16:30', '호요랜드 엔젤디 특별 공연!',
   '사랑과 꿈에 관한 무대에 여러분을 초대합니다!', 'live', 0),
  (ev, st, date '2026-10-03', time '17:00', time '18:00', '럭키드로우',
   '무대 스테이지에서 랜덤 추첨으로 매일 총 80명에게 굿즈를 증정', 'event', 0),

  -- 10/4 (일) ---------------------------------------------------------------
  (ev, st, date '2026-10-04', time '10:30', time '11:30', '뉴에리두 제목학원 w.Fairy',
   '로프꾼님의 상상력으로 완성한 제목, Fairy의 심사를 받아보세요!', 'talk', 0),
  (ev, st, date '2026-10-04', time '12:00', time '13:00', '원신 무대', null, 'etc', 0),
  (ev, st, date '2026-10-04', time '13:30', time '14:30', '붕괴: 스타레일 무대', null, 'etc', 0),
  (ev, st, date '2026-10-04', time '15:00', time '16:00', '원신 무대', null, 'etc', 0),
  (ev, st, date '2026-10-04', time '16:30', time '17:30', '럭키드로우',
   '무대 스테이지에서 랜덤 추첨으로 매일 총 80명에게 굿즈를 증정', 'event', 0),
  (ev, st, date '2026-10-04', time '18:00', time '19:00', '코스프레 퍼레이드', null, 'cosplay', 0),

  -- 10/5 (월) ---------------------------------------------------------------
  (ev, st, date '2026-10-05', time '10:30', time '11:30', '붕괴: 스타레일 무대', null, 'etc', 0),
  (ev, st, date '2026-10-05', time '12:00', time '13:00', '도전! 위험한 강습전',
   '호요랜드에 방문한 로프꾼 중 위험한 강습전의 최강자는?', 'event', 0),
  (ev, st, date '2026-10-05', time '13:30', time '14:30', '원신 무대', null, 'etc', 0),
  (ev, st, date '2026-10-05', time '15:00', time '16:00', '붕괴: 스타레일 무대', null, 'etc', 0),
  (ev, st, date '2026-10-05', time '16:30', time '17:30', '럭키드로우',
   '무대 스테이지에서 랜덤 추첨으로 매일 총 80명에게 굿즈를 증정', 'event', 0),
  (ev, st, date '2026-10-05', time '18:00', time '19:00', '코스프레 퍼레이드', null, 'cosplay', 0);

  get diagnostics n = row_count;

  -- 옮긴 원본은 지운다. 남겨두면 같은 일정이 두 곳에 있게 되고, 어느 쪽이 최신인지
  -- 알 수 없어진다. event_performers 테이블 자체는 게임음악 행사의 출연진·세트리스트용으로
  -- 계속 쓰인다 — 호요랜드(게임전시)의 행만 지운다.
  delete from public.event_performers where event_id = ev;

  raise notice '호요랜드 2026(%) 무대 슬롯 % 건 등록, 옛 event_performers 행 삭제', ev, n;
end $$;
