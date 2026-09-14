-- 호요랜드 2026 굿즈 재정리 (2026-09-14)
-- Supabase 대시보드 > SQL Editor 에서 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 왜 다시 넣는가
--   앞선 booth_items 마이그레이션에서 굿즈 8종을 전부 "공식 굿즈 판매존" 하나에 몰아넣었다.
--   그런데 그 목록에 들어 있던 "장우산(파이논)"과 "1/7 피규어 어벤츄린"은 파이논·어벤츄린이
--   붕괴: 스타레일 캐릭터다 — 전 타이틀 공용이 아니라 스타레일 전용 상품이었다.
--   원본(붕괴: 스타레일 상세 공지)을 다시 보니 굿즈가 두 묶음으로 나뉘어 있다.
--     · 호요랜드2026 시리즈 = 전 타이틀 공용 (게임 상관없이 같은 상품)
--     · 타이틀 전용        = 그 게임 캐릭터·세계관 상품
--   그래서 공용은 굿즈존 부스에, 전용은 해당 게임 부스에 붙인다.
--
-- 확인한 범위 (중요)
--   붕괴: 스타레일 — 상세 공지에 상품명·가격이 텍스트로 실려 있어 그대로 옮겼다.
--     상품명은 실제 판매처(에스엠라지 등)에도 같은 이름으로 존재하는 정품이라 교차 확인됨.
--   젠레스 존 제로 / 원신 — 공지에 굿즈가 "이미지로만" 실려 있어 상품명·가격이 텍스트로
--     공개돼 있지 않다. 추측해서 채우지 않고 "미공개" 한 줄만 남긴다.
--     (조사 중 한 요약 도구가 젠레스 굿즈 가격표를 그럴듯하게 만들어 냈는데, 같은 글을
--      다시 읽으니 내용이 달랐다. 원문 확인 결과 이미지뿐이었다 — 그 값은 버렸다.)
--   붕괴3rd / 미해결사건부 — 테마명 외 아무것도 공개되지 않음.

do $$
declare
  ev text;
  b_gs uuid; b_hsr uuid; b_zzz uuid; b_goods uuid;
  n int;
begin
  select id into ev from public.events
  where title = '호요랜드 2026' and start_date = date '2026-10-02' limit 1;

  if ev is null then
    raise notice '호요랜드 2026 행사가 없습니다.';
    return;
  end if;

  select id into b_gs    from public.event_booths where event_id = ev and name = '원신 | 달빛에 전하는 세레나데';
  select id into b_hsr   from public.event_booths where event_id = ev and name = '붕괴: 스타레일 | 환락, 상상 그 이상으로';
  select id into b_zzz   from public.event_booths where event_id = ev and name = '젠레스 존 제로 | 구름 너머로 내려앉은 시';
  select id into b_goods from public.event_booths where event_id = ev and name = '공식 굿즈 판매존';

  if b_goods is null then
    raise notice '부스가 없습니다 — hoyoland2026_booths SQL을 먼저 실행하세요.';
    return;
  end if;

  -- 굿즈 항목만 지우고 다시 넣는다(체험·푸드 항목은 건드리지 않는다).
  delete from public.event_booth_items where event_id = ev and kind = 'goods';

  -- 굿즈 탭에서 공용 상품이 맨 위에 오게 한다. 이 부스는 굿즈만 있어서 부스 탭에는
  -- 나오지 않으므로, 순서를 바꿔도 다른 화면에는 영향이 없다.
  update public.event_booths set sort_order = 0 where id = b_goods;

  insert into public.event_booth_items (event_id, booth_id, kind, name, price, price_note, note, sort_order) values
  -- 전 타이틀 공용: 호요랜드2026 시리즈 ---------------------------------------
  (ev, b_goods, 'goods', '아크릴 스탠드', 24000, null, '호요랜드2026 시리즈 · 전 타이틀 공용', 1),
  (ev, b_goods, 'goods', '여권 케이스', 24000, null, '호요랜드2026 시리즈 · 전 타이틀 공용', 2),
  (ev, b_goods, 'goods', '장패드', 25000, null, '호요랜드2026 시리즈 · 전 타이틀 공용', 3),
  (ev, b_goods, 'goods', '말랑 모찌 쿠션', 28000, '개당', '호요랜드2026 시리즈 · 전 타이틀 공용', 4),
  (ev, b_goods, 'goods', '테마 패키지', 39000, '개당', '홀로그램 색지 · 키링 · 캔배지 등', 5),
  (ev, b_goods, 'goods', '비치타올', 24000, null, '입장권에서 그 게임을 고르면 웰컴 키트로 무료', 6),
  (ev, b_goods, 'goods', '구매 특전 · 1만원 이상', null, null, '쇼핑백 1종 선택 증정 (총 3종)', 7),
  (ev, b_goods, 'goods', '구매 특전 · 3만원 이상', null, null, '엽서 3종 세트 증정', 8),
  (ev, b_goods, 'goods', '구매 특전 · 15~16시 픽업', null, null, '회차별 선착순 100명 럭키드로우 쿠폰 (총 500명)', 9),

  -- 붕괴: 스타레일 전용 ------------------------------------------------------
  (ev, b_hsr, 'goods', '유사 아크릴 스탠드 (광추 시리즈)', 22000, null, null, 21),
  (ev, b_hsr, 'goods', '아크릴 코롯토 (파이논)', 18000, null, null, 22),
  (ev, b_hsr, 'goods', '아크릴 스탠드 (캐릭터 일러스트)', 18000, null, null, 23),
  (ev, b_hsr, 'goods', '허수아비 아크릴 스프링 스탠드', 16000, null, '개척자 허수아비', 24),
  (ev, b_hsr, 'goods', '캔배지 (캐릭터 일러스트)', 7000, null, null, 25),
  (ev, b_hsr, 'goods', '사각쿠션 (여자 기숙사)', 28000, null, null, 26),
  (ev, b_hsr, 'goods', '봉제인형', 58000, null, null, 27),
  (ev, b_hsr, 'goods', '대형 봉제인형', 76000, null, null, 28),
  (ev, b_hsr, 'goods', '미니 피규어 (1팩)', 9800, null, '팩 종류에 따라 9,800~19,800원', 29),
  (ev, b_hsr, 'goods', '장우산 (파이논)', 44000, null, null, 30),
  (ev, b_hsr, 'goods', '1/7 피규어 어벤츄린', 440000, null, null, 31),

  -- 아직 공개되지 않은 타이틀 -------------------------------------------------
  -- 빈칸으로 두면 "굿즈가 없는 게임"으로 읽힌다. 없는 게 아니라 아직 안 나온 것이므로
  -- 그 사실을 한 줄로 남긴다. 상품명·가격이 공개되면 이 줄을 지우고 채우면 된다.
  (ev, b_zzz, 'goods', '굿즈 목록 미공개', null, null,
   '한정 굿즈가 판매되지만 공지에 이미지로만 실려 있어 상품명·가격이 공개되지 않았습니다', 41),
  (ev, b_gs, 'goods', '굿즈 목록 미공개', null, null,
   '위 공용 굿즈는 구매 가능. 원신 전용 상품의 상품명·가격은 아직 공개되지 않았습니다', 42);

  get diagnostics n = row_count;

  update public.events
  set booth_info_note = '게임 5종 테마관 + 파트너 부스(구글플레이·몬스터 에너지) + 공식 굿즈 판매존 + 2차 창작 전시존으로 구성. 굿즈는 "호요랜드2026 시리즈"(전 타이틀 공용)와 타이틀 전용으로 나뉘고, 품목당 1인 최대 5개까지 살 수 있다(매일 재입고, 일별 판매 수량 제한). 붕괴3rd(환야의 숨바꼭질)·미해결사건부(미림 장터·사계절의 러브레터)는 테마만 공개되고 세부 프로그램은 미공개. 부스 배치도도 아직 미공개.'
  where id = ev and admin_edited_at is null;

  raise notice '굿즈 항목 % 건 재등록 완료', n;
end $$;
