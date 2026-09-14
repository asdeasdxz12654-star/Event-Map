-- 호요랜드 2026 굿즈 재정리 v2 — 원신 굿즈 추가 + 분류 정정 (2026-09-14)
-- Supabase 대시보드 > SQL Editor 에서 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 확인 방법
--   공지가 전부 이미지라, 원신 공식 카페(cafe.naver.com/genshin) 공지 글
--   "🌙Welcome to 호요랜드2026 | 달빛에 전하는 세레나데 상세 안내🌙"(articleId 6723746)의
--   본문 이미지를 내려받아 직접 읽었다. 한 장이 1200x42,500px짜리 세로 이미지라
--   1700px 단위로 잘라서 봤다(25조각).
--
-- 정정한 것
--   앞선 마이그레이션에서 "호요랜드2026 시리즈"를 전 타이틀 공용 굿즈로 넣었는데 틀렸다.
--   원신 공지를 보니 원신도 "호요랜드2026 시리즈" 이름으로 자기 상품을 따로 판다
--   (장패드 25,000원은 같지만, 아크릴스탠드는 스타레일 24,000원 / 원신 세트 32,000원으로
--    가격도 구성도 다르다). 즉 게임 공통 상품이 아니라 게임마다 있는 "한정 굿즈 라인"이다.
--   그래서 기존 6종은 출처였던 붕괴: 스타레일 쪽으로 옮긴다.
--
-- 굿즈존 부스에는 상품 대신 구매 방식과 특전만 남긴다(타이틀 무관하게 공통인 부분).
--
-- 원신 "공식 굿즈"는 캐릭터별 변형이 수십 종이라 SKU를 전부 넣지 않고 라인 단위로 적었다.
-- 행사 정보 화면에서 필요한 건 "무엇을 얼마쯤에 파는가"지 전 품목 재고표가 아니다.

do $$
declare
  ev text; b_gs uuid; b_hsr uuid; b_zzz uuid; b_goods uuid; n int;
begin
  select id into ev from public.events
  where title = '호요랜드 2026' and start_date = date '2026-10-02' limit 1;
  if ev is null then raise notice '행사가 없습니다.'; return; end if;

  select id into b_gs    from public.event_booths where event_id = ev and name = '원신 | 달빛에 전하는 세레나데';
  select id into b_hsr   from public.event_booths where event_id = ev and name = '붕괴: 스타레일 | 환락, 상상 그 이상으로';
  select id into b_zzz   from public.event_booths where event_id = ev and name = '젠레스 존 제로 | 구름 너머로 내려앉은 시';
  select id into b_goods from public.event_booths where event_id = ev and name = '공식 굿즈 판매존';

  delete from public.event_booth_items where event_id = ev and kind = 'goods';

  insert into public.event_booth_items (event_id, booth_id, kind, name, price, price_note, note, sort_order) values
  -- 원신 한정 굿즈 (호요랜드2026 시리즈) — 품목별 1인 최대 5개 --------------
  (ev, b_gs, 'goods', '미니피규어 디오라마 세트 — 콜롬비나', 24000, null, '호요랜드2026 시리즈 · 1인 5개 제한', 1),
  (ev, b_gs, 'goods', '장패드', 25000, null, '호요랜드2026 시리즈 · 1인 5개 제한', 2),
  (ev, b_gs, 'goods', '아크릴스탠드 세트', 32000, null, '호요랜드2026 시리즈 · 1인 5개 제한', 3),
  (ev, b_gs, 'goods', '에폭시 마그넷 카드', 7000, null, '호요랜드2026 시리즈 · 랜덤 · 1인 5개 제한', 4),
  (ev, b_gs, 'goods', '기도의 밤 필름 티켓', 6000, null, '호요랜드2026 시리즈 · 랜덤 · 1인 5개 제한', 5),
  (ev, b_gs, 'goods', '미니아크릴 디오라마', 55000, null, '호요랜드2026 시리즈 · 1인 5개 제한', 6),
  (ev, b_gs, 'goods', '포토카드 수납케이스', 15000, null, '호요랜드2026 시리즈 · 1인 5개 제한', 7),
  (ev, b_gs, 'goods', '아크릴 포토프롭 홀더키링', 12000, null, '호요랜드2026 시리즈 · 랜덤 · 1인 5개 제한', 8),
  -- 원신 공식 굿즈 — 일별 수량 한정, 인당 구매 제한 없음. 캐릭터 변형은 라인으로 묶음
  (ev, b_gs, 'goods', 'SD캔배지 (신월의 축복)', 5000, '낱개 랜덤', '9종 세트 45,000원 · 공식 굿즈(일별 수량 한정)', 11),
  (ev, b_gs, 'goods', 'SD 미니 아크릴스탠드 (신월의 축복)', 10000, null, 'A·B 2종 · 공식 굿즈', 12),
  (ev, b_gs, 'goods', '아크릴 색지', 18000, null, '「어느 겨울밤, 한 여행자」·「극북의 야행시」 등 · 공식 굿즈', 13),
  (ev, b_gs, 'goods', '아크릴 액자 (극북의 야행시)', 22000, null, '공식 굿즈', 14),
  (ev, b_gs, 'goods', '기념 티켓카드 세트 (5주년)', 13000, null, '공식 굿즈', 15),
  (ev, b_gs, 'goods', '봉제인형 키링 (눈 속의 즐거움)', 26000, null, '종려·스카크·타르탈리아·나히다·두린 · 공식 굿즈', 16),
  (ev, b_gs, 'goods', '봉제인형 키링 (달콤한 꿈의 속삭임)', 28000, null, '소·느비예트·타이나리·키니치·카미사토 아야토 · 공식 굿즈', 17),
  (ev, b_gs, 'goods', '문구 세트 (고요한 밤의 환상)', 15000, null, '아를레키노·키니치·클레·방랑자·라이오슬리 등 · 공식 굿즈', 18),

  -- 붕괴: 스타레일 한정 굿즈 (호요랜드2026 시리즈) ------------------------
  (ev, b_hsr, 'goods', '아크릴 스탠드', 24000, null, '호요랜드2026 시리즈 · 1품목 5개 제한', 1),
  (ev, b_hsr, 'goods', '여권 케이스', 24000, null, '호요랜드2026 시리즈 · 1품목 5개 제한', 2),
  (ev, b_hsr, 'goods', '장패드', 25000, null, '호요랜드2026 시리즈 · 1품목 5개 제한', 3),
  (ev, b_hsr, 'goods', '말랑 모찌 쿠션', 28000, '개당', '호요랜드2026 시리즈 · 1품목 5개 제한', 4),
  (ev, b_hsr, 'goods', '테마 패키지', 39000, '개당', '홀로그램 색지 · 키링 · 캔배지 등', 5),
  (ev, b_hsr, 'goods', '비치타올', 24000, null, '스타레일 입장권 선택 시 웰컴 키트로 무료', 6),
  -- 붕괴: 스타레일 전용 굿즈
  (ev, b_hsr, 'goods', '유사 아크릴 스탠드 (광추 시리즈)', 22000, null, null, 11),
  (ev, b_hsr, 'goods', '아크릴 코롯토 (파이논)', 18000, null, null, 12),
  (ev, b_hsr, 'goods', '아크릴 스탠드 (캐릭터 일러스트)', 18000, null, null, 13),
  (ev, b_hsr, 'goods', '허수아비 아크릴 스프링 스탠드', 16000, null, '개척자 허수아비', 14),
  (ev, b_hsr, 'goods', '캔배지 (캐릭터 일러스트)', 7000, null, null, 15),
  (ev, b_hsr, 'goods', '사각쿠션 (여자 기숙사)', 28000, null, null, 16),
  (ev, b_hsr, 'goods', '봉제인형', 58000, null, null, 17),
  (ev, b_hsr, 'goods', '대형 봉제인형', 76000, null, null, 18),
  (ev, b_hsr, 'goods', '미니 피규어 (1팩)', 9800, null, '팩 종류에 따라 9,800~19,800원', 19),
  (ev, b_hsr, 'goods', '장우산 (파이논)', 44000, null, null, 20),
  (ev, b_hsr, 'goods', '1/7 피규어 어벤츄린', 440000, null, null, 21),

  -- 젠레스 — 공지 슬라이드 9장 어디에도 판매 굿즈 목록이 없다 --------------
  (ev, b_zzz, 'goods', '굿즈 목록 미공개', null, null,
   '한정 굿즈를 팔지만 공지(슬라이드 9장) 어디에도 상품명·가격이 없다. 공개되면 채울 예정', 41),

  -- 굿즈존 공통 — 상품이 아니라 구매 방식과 특전 ---------------------------
  (ev, b_goods, 'goods', '구매 방법', null, null, '입장 팔찌의 QR로 온라인 페이지에 접속해 고르고 카드 결제', 51),
  (ev, b_goods, 'goods', '구매 특전 · 1만원 이상', null, null, '쇼핑백 1종 선택 증정 (총 3종)', 52),
  (ev, b_goods, 'goods', '구매 특전 · 3만원 이상', null, null, '엽서 3종 세트 증정', 53),
  (ev, b_goods, 'goods', '구매 특전 · 15~16시 픽업', null, null, '회차별 선착순 100명 럭키드로우 쿠폰 (총 500명)', 54);

  get diagnostics n = row_count;

  update public.event_booths
  set goods = '상품은 게임별 부스에서 확인. 여기는 구매 방식과 금액별 특전만 안내한다(특전 내용은 젠레스 공지 기준).'
  where id = b_goods;

  raise notice '굿즈 항목 % 건 재등록 완료', n;
end $$;
