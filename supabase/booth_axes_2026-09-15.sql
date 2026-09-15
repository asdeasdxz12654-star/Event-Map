-- 부스·굿즈의 축 추가 (2026-09-15)
-- Supabase 대시보드 > SQL Editor 에서 위에서부터 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 왜
--   지금 event_booths에는 name·booth_no·goods·image_url뿐이라 "누가 운영하는 부스인지"가
--   없다. 지스타의 넥슨 부스와, 코믹월드의 개인 창작자 부스와, 주최가 직접 운영하는
--   포토존이 전부 같은 카드로 나온다. 규모도(수십 vs 수천) 찾는 방법도(훑기 vs 검색)
--   전혀 다른데 화면이 같다.
--
--   굿즈 쪽에는 "타이틀(IP)" 축이 없다. 호요랜드는 부스 = 게임 타이틀이라 부스 필터가
--   곧 게임 필터였지만, 지스타의 넥슨 부스 하나에는 메이플·던파 굿즈가 섞이고
--   AGF의 애니플러스 부스에는 여러 작품 굿즈가 섞인다. 그 우연이 깨진다.

-- ---------------------------------------------------------------------------
-- 1) 부스 운영 주체 · 구역 · 장르
--
-- operator 하나가 부스 탭의 세그먼트와 표시 방식을 모두 정한다.
--   company : 기업·브랜드 참가 부스 (넥슨, 애니플러스, 호요버스)
--   creator : 개인·동아리·학교 참가 부스 (코믹월드 서클, 학과 부스)
--   host    : 주최측이 직접 운영 (포토존, 스탬프 랠리, 공식 굿즈 판매존, 이벤트존)
--
-- 기본값을 'company'로 둬서 기존 행은 전부 기업 부스가 된다 — 지금 들어 있는 부스가
-- 실제로 전부 기업/공식 부스라 옮겨 적을 것이 거의 없다.
alter table public.event_booths
  add column if not exists operator text
    check (operator in ('company', 'creator', 'host')) default 'company',
  -- 홀·구역. 배치도와 목록을 잇는 값이다 ("1홀", "A구역", "야외").
  add column if not exists hall text,
  -- 창작자 부스 검색용 장르 ("일러스트", "2차창작", "소설", "굿즈").
  add column if not exists genre text;

comment on column public.event_booths.operator is
  '부스 운영 주체 — company: 기업 참가, creator: 개인·동아리·학교 참가, host: 주최 직접 운영.';
comment on column public.event_booths.hall is
  '홀·구역명. 부스 탭의 구역 필터에 쓴다. 값이 두 종류 이상일 때만 필터가 나타난다.';
comment on column public.event_booths.genre is
  '창작자 부스의 장르. 수백~수천 개 목록에서 좁혀 찾는 용도.';

-- 공식 굿즈 판매존·스탬프 랠리처럼 주최가 직접 운영하는 부스를 표시한다.
-- 이름으로 판단하므로 새로 생긴 행사에는 관리자가 직접 지정해야 한다.
update public.event_booths
   set operator = 'host'
 where operator is distinct from 'host'
   and (name like '%공식 굿즈%' or name like '%굿즈 판매존%'
     or name like '%스탬프%' or name like '%포토존%');

-- ---------------------------------------------------------------------------
-- 2) 부스 항목의 타이틀(IP) 축과 현장 상태
--
-- title을 nullable로 두고 "비어 있으면 부스명을 타이틀로 본다"는 규칙을 화면에서 쓴다.
-- 그래야 호요랜드 데이터(부스 = 타이틀)를 한 줄도 고치지 않고 그대로 동작시킬 수 있다.
alter table public.event_booth_items
  add column if not exists title text,
  add column if not exists status text
    check (status is null or status in ('soldout', 'limited', 'preorder'));

comment on column public.event_booth_items.title is
  '이 항목이 속한 게임·작품(IP). null이면 부스 이름을 타이틀로 본다.
   호요랜드: 부스 "원신 | …" → null. 지스타: 부스 "넥슨" → "메이플스토리".';
comment on column public.event_booth_items.status is
  '현장 상태 — soldout: 품절, limited: 수량 한정, preorder: 예약 판매. null이면 표시 없음.';

-- ---------------------------------------------------------------------------
-- 3) 빈 상태 메모를 네 종류로
--
-- booth_info_note · stage_info_note · floor_plan_note는 이미 있다. 같은 규칙을 쓴다.
--   '미공개'   : 주최가 공식적으로 공개하지 않는 행사
--   그 외 문구 : 공개 예정 시점·위치 안내
--   null       : 아직 확인하지 못함 → 화면에 아무것도 그리지 않는다
alter table public.events
  add column if not exists goods_info_note text,
  add column if not exists cosplay_info_note text;

comment on column public.events.goods_info_note is
  '굿즈 공개 상태 메모. 굿즈 항목이 하나도 없을 때 대신 표시한다.';
comment on column public.events.cosplay_info_note is
  '코스어 라인업 공개 상태 메모. 등록된 코스어가 없을 때 대신 표시한다.';
