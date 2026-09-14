-- 호요랜드 2026 무대 타임테이블 + 젠레스 푸드존 가격 (2026-09-14)
-- Supabase 대시보드 > SQL Editor 에서 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 출처와 확인 방법
--   공식 공지가 글이 아니라 이미지(1920x1080 슬라이드)로만 올라와서, 텍스트로는 아무것도
--   읽을 수 없었다. 젠레스 존 제로 공지의 슬라이드 9장을 내려받아 직접 눈으로 읽었다.
--     ZZZ_HYLD2026_Notice_1920x1080_1~9.png (네이버 CDN nng-phinf.pstatic.net)
--   그중 7번 슬라이드가 "무대 프로그램" 전체 타임테이블이다 — 무대는 타이틀 공용이라
--   이 표 하나가 행사 전체 일정이다. 8번이 젠레스 푸드존 가격표, 9번이 파트너사 안내다.
--
--   그동안 "일자별 타임테이블 미공개"로 안내하고 있었는데, 실은 공개돼 있었고 글이 아니라
--   그림이라 못 읽고 있었던 것이다.

do $$
declare
  ev text;
  b_zzz uuid; b_google uuid;
begin
  select id into ev from public.events
  where title = '호요랜드 2026' and start_date = date '2026-10-02' limit 1;
  if ev is null then raise notice '호요랜드 2026 행사가 없습니다.'; return; end if;

  select id into b_zzz    from public.event_booths where event_id = ev and name = '젠레스 존 제로 | 구름 너머로 내려앉은 시';
  select id into b_google from public.event_booths where event_id = ev and name = '구글플레이 부스';

  -- ---------------------------------------------------------------------
  -- 1) 무대 프로그램
  -- event_performers는 "무대 일정·프로그램"으로도 쓰는 테이블이다(게임음악이 아닌
  -- 카테고리에서는 artist_name=프로그램명, songs=진행 시간·내용으로 표시된다).
  delete from public.event_performers where event_id = ev;

  insert into public.event_performers (event_id, artist_name, songs, sort_order) values
  (ev, '코스프레 런웨이',
   E'10/2(금) 11:00~12:00', 1),
  (ev, '원신 무대',
   E'10/2(금) 12:30~13:30\n10/3(토) 11:00~12:00\n10/4(일) 12:00~13:00, 15:00~16:00\n10/5(월) 13:30~14:30', 2),
  (ev, '붕괴: 스타레일 무대',
   E'10/2(금) 15:30~16:30\n10/3(토) 14:00~15:00\n10/4(일) 13:30~14:30\n10/5(월) 10:30~11:30, 15:00~16:00', 3),
  (ev, '로스캘리퍼 특별 의회 with Google Play',
   E'10/2(금) 14:00~15:00\n스토리 속 궁금증부터 예측불가 밸런스 게임까지, 함께 이야기해봐요!', 4),
  (ev, '도전! 위험한 강습전',
   E'10/3(토) 12:30~13:30\n10/5(월) 12:00~13:00\n호요랜드에 방문한 로프꾼 중 위험한 강습전의 최강자는?', 5),
  (ev, '호요랜드 엔젤디 특별 공연!',
   E'10/3(토) 15:30~16:30\n사랑과 꿈에 관한 무대에 여러분을 초대합니다!', 6),
  (ev, '뉴에리두 제목학원 w.Fairy',
   E'10/4(일) 10:30~11:30\n로프꾼님의 상상력으로 완성한 제목, Fairy의 심사를 받아보세요!', 7),
  (ev, '럭키드로우',
   E'10/2(금)·3(토) 17:00~18:00\n10/4(일)·5(월) 16:30~17:30\n무대 스테이지에서 랜덤 추첨으로 매일 총 80명에게 굿즈를 증정', 8),
  (ev, '코스프레 퍼레이드',
   E'10/4(일)·5(월) 18:00~19:00', 9);

  -- ---------------------------------------------------------------------
  -- 2) 젠레스 푸드존 — 가격이 슬라이드에 찍혀 있었다(그동안 "가격 미공개"로 두던 것)
  delete from public.event_booth_items where event_id = ev and booth_id = b_zzz and kind = 'food';

  insert into public.event_booth_items (event_id, booth_id, kind, name, price, price_note, note, sort_order) values
  (ev, b_zzz, 'food', '오렐리아 아카데미 급식 A코스 — 피시 앤 칩스 세트', 12000, null,
   '피시 앤 칩스 + 완두콩/브로콜리/당근 + 주스 · 와이즈&벨 푸드픽 제공', 11),
  (ev, b_zzz, 'food', '오렐리아 아카데미 급식 B코스 — 스테이크 세트', 13500, null,
   '선데이 로스트 + 감자 무스 샐러드 + 완두콩/브로콜리/당근 + 주스 · 와이즈&벨 푸드픽 제공', 12),
  (ev, b_zzz, 'food', 'CuppaMoment ‘한 잔의 여유’ 세트', 10000, null,
   '홍차 또는 밀크티 + 스콘 · 우유·펄 추가 시 1,000원', 13),
  (ev, b_zzz, 'food', 'CuppaMoment ‘트루 블루스’ 세트', 12000, null,
   '베일리스 하이볼(논알콜) + 소시지 롤', 14),
  (ev, b_zzz, 'food', '이아스 쿠키', 3000, null,
   '세트 메뉴 주문 시 레미엘·벨리나 푸드픽 2종 중 1종 랜덤 증정', 15);

  -- ---------------------------------------------------------------------
  -- 3) 파트너 부스 위치 (9번 슬라이드)
  update public.event_booths
  set booth_no = '제2전시장 8홀',
      goods = '부스 미션 달성 + 미니게임으로 호요버스 굿즈 경품 기회, 참여자 전원 레미엘 포토카드 증정, 구글플레이 포인트'
  where id = b_google;

  -- ---------------------------------------------------------------------
  -- 4) 무대 메모 갱신 — 이제 타임테이블이 있으므로 "미공개"가 아니다
  update public.events
  set stage_info_note = '무대는 타이틀 공용으로 한 스테이지에서 진행된다. 일자별 프로그램은 아래 목록 참고(공식 공지 이미지에서 옮김). 행사장 운영은 10/2~3 10:00~18:00, 10/4~5 10:00~19:00.'
  where id = ev and admin_edited_at is null;

  raise notice '무대 프로그램 9건 · 젠레스 푸드 5건 반영 완료';
end $$;
