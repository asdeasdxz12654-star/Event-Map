-- 부스 항목(event_booth_items) 테이블 + 부스 대표 이미지 (2026-09-14)
-- Supabase 대시보드 > SQL Editor 에서 위에서부터 그대로 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 왜
--   event_booths는 부스마다 자유 텍스트 goods 한 칸만 갖는다. 호요랜드처럼 한 부스에
--   웰컴 키트·무료 체험·유료 체험·DIY·푸드존이 전부 들어가는 행사에서는 그 한 칸이
--   수백 자짜리 문단이 되고, 상세 화면 한가운데가 읽히지 않는 회색 벽이 된다.
--   가격으로 정렬할 수도, 종류별로 묶을 수도, 이미지를 붙일 수도 없다.
--
--   항목을 행으로 쪼개면 화면이 종류별 묶음 + 가격 우측 정렬 + 이미지로 바뀐다.
--
-- 하위 호환
--   goods 컬럼은 지우지 않는다. 항목이 하나도 없는 부스는 지금처럼 goods 텍스트를
--   그대로 보여준다(BoothCard가 판단). 관리자가 급히 한 줄 적어두는 자리로도 남는다.

-- ---------------------------------------------------------------------------
-- 1) 부스 대표 이미지
alter table public.event_booths
  add column if not exists image_url text;

comment on column public.event_booths.image_url is
  '부스/게임 대표 이미지 URL. 없으면 이름 첫 글자로 만든 색 타일이 대신 표시된다.';

-- ---------------------------------------------------------------------------
-- 2) 부스 항목
--
-- event_id를 함께 둔다(정규화상으론 booth_id만으로 충분하지만):
--   프론트의 실시간 구독이 event_id 필터로만 동작하고(useEventChildList), 관리자 API도
--   /admin/events/:eventId/<하위목록> 패턴으로 event_id를 URL에서 서버가 직접 넣는다.
--   booth_id만 두면 그 두 가지를 모두 특수 처리해야 한다.
create table if not exists public.event_booth_items (
  id         uuid primary key default gen_random_uuid(),
  event_id   text not null references public.events(id) on delete cascade,
  booth_id   uuid not null references public.event_booths(id) on delete cascade,
  -- 화면에서 묶는 단위. 순서도 이 순서대로 보여준다 — 실제 관람 동선과 같다
  -- (입장하며 받고 → 공짜부터 돌고 → 돈 쓰고 → 만들고 → 먹고 → 사서 나간다).
  kind       text not null check (kind in ('welcome', 'free', 'paid', 'diy', 'food', 'goods')),
  name       text not null,
  price      integer,   -- 원 단위. null이면 무료이거나 가격 미공개
  price_note text,      -- "회당", "최대 2연"처럼 가격에 붙는 단서
  note       text,      -- 보상·조건 한 줄
  image_url  text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists event_booth_items_event_id_idx on public.event_booth_items(event_id);
create index if not exists event_booth_items_booth_id_idx on public.event_booth_items(booth_id);

alter table public.event_booth_items enable row level security;

drop policy if exists "event_booth_items are publicly readable" on public.event_booth_items;
create policy "event_booth_items are publicly readable"
  on public.event_booth_items for select
  using (true);
-- 쓰기 정책 없음 = anon 차단. events/event_booths와 동일하게 api-proxy Worker가
-- service_role 키로 처리한다.

-- 이미 추가돼 있으면 에러가 나므로 감싼다(여러 번 실행 안전).
do $$
begin
  alter publication supabase_realtime add table public.event_booth_items;
exception when duplicate_object then
  null;
end $$;

-- ---------------------------------------------------------------------------
-- 3) 호요랜드 2026의 goods 텍스트를 항목으로 옮긴다
--
-- 텍스트를 파싱하지 않고 손으로 옮겨 적는다 — 파싱은 구분자 하나만 어긋나도 조용히
-- 틀린 값을 만든다. 원본은 hoyoland2026_booths_2026-09-14.sql과 같은 공식 공지다.
do $$
declare
  ev text;
  b_gs uuid; b_hsr uuid; b_zzz uuid; b_goods uuid;
  n int;
begin
  select id into ev from public.events
  where title = '호요랜드 2026' and start_date = date '2026-10-02' limit 1;

  if ev is null then
    raise notice '호요랜드 2026 행사가 없습니다 — hoyoland2026_booths SQL을 먼저 실행하세요.';
    return;
  end if;

  select id into b_gs    from public.event_booths where event_id = ev and name = '원신 | 달빛에 전하는 세레나데';
  select id into b_hsr   from public.event_booths where event_id = ev and name = '붕괴: 스타레일 | 환락, 상상 그 이상으로';
  select id into b_zzz   from public.event_booths where event_id = ev and name = '젠레스 존 제로 | 구름 너머로 내려앉은 시';
  select id into b_goods from public.event_booths where event_id = ev and name = '공식 굿즈 판매존';

  if b_gs is null then
    raise notice '호요랜드 부스가 없습니다 — hoyoland2026_booths SQL을 먼저 실행하세요.';
    return;
  end if;

  -- 이 행사의 항목을 전부 지우고 다시 넣는다(여러 번 실행해도 중복되지 않게).
  delete from public.event_booth_items where event_id = ev;

  insert into public.event_booth_items (event_id, booth_id, kind, name, price, price_note, note, sort_order) values
  -- 원신 -------------------------------------------------------------------
  (ev, b_gs, 'welcome', '미니피규어 디오라마 세트 — 콜롬비나', null, null, '호요랜드2026 시리즈. 달 구조체가 빛을 흡수해 어두운 곳에서 발광', 1),
  (ev, b_gs, 'welcome', '리딤코드', null, null, '원석 100 · 모라 20,000 · 영웅의 경험 5 · 정제용 마법 광물 5 (모험등급 5 이상, 계정당 4회, 10/2~11/30)', 2),
  (ev, b_gs, 'free',    '체험존 전체', null, null, '원신 이벤트 가이드북을 반드시 소지해야 참여 가능, 증정품 제공', 3),
  (ev, b_gs, 'paid',    '점괘 뽑기', 2000, '회당', '1·10·30회 중 선택 결제 · 보상 109종', 4),
  (ev, b_gs, 'paid',    '도전! 고리 던지기', 3000, null, '1회 결제당 5회 시도 · A~D상 등급별 차등', 5),
  (ev, b_gs, 'paid',    '무는 범고래', 4000, '회당', '착석 후 진행', 6),
  (ev, b_gs, 'food',    '달빛 한줄기의 축제 핫도그', null, null, '콜롬비나 푸드픽 증정', 7),
  (ev, b_gs, 'food',    '모험가 특제 닭구이', null, null, '린네아 푸드픽 증정', 8),
  (ev, b_gs, 'food',    '커피에 비친 술식 디저트 세트', null, null, '산드로네 푸드픽 증정', 9),
  (ev, b_gs, 'food',    '뚝딱뚝딱 디저트 공방 크레이프', null, null, '아이노 푸드픽 증정 · 소진 시 조기 종료', 10),

  -- 붕괴: 스타레일 ----------------------------------------------------------
  (ev, b_hsr, 'welcome', '호요랜드2026 비치타올', null, null, '굿즈존 별도 판매가 24,000원', 1),
  (ev, b_hsr, 'welcome', '홀로그램 티켓', null, null, null, 2),
  (ev, b_hsr, 'welcome', '리딤코드', null, null, '성옥 100 · 신용포인트 20,000 · 여행 가이드 5 · 정제한 에테르 5 (계정당 4회, 10/1~12/31)', 3),
  (ev, b_hsr, 'free',    '너굴통신 견습 기자 등록', null, null, '일일 견습 기자증 발급 — 다른 체험의 출발점', 4),
  (ev, b_hsr, 'free',    '잠입 작전: 카메라를 피해라', null, null, 'CCTV 회피 게임', 5),
  (ev, b_hsr, 'free',    '긴급 취재: 스파키 LIVE', null, null, '스파키와 춤 대결', 6),
  (ev, b_hsr, 'free',    '특종! 망상 병원 취재', null, null, '힌트 찾기', 7),
  (ev, b_hsr, 'free',    '취재 완료! 수사 현장 보고서', null, null, '체험 후기 작성', 8),
  (ev, b_hsr, 'paid',    '스타피스 보석 감정 시스템', 10000, '회당', '최대 2회 · 부서 배정 후 경품 도전', 9),
  (ev, b_hsr, 'paid',    '또또또 주사위를 던져라!', 8000, '회당', '최대 4회 · 카드팩 획득', 10),
  (ev, b_hsr, 'food',    '오므라이스 & 가라아게', null, null, '가격 미공개', 11),
  (ev, b_hsr, 'food',    '황금 만두', null, null, '가격 미공개', 12),
  (ev, b_hsr, 'food',    '팬케이크', null, null, '가격 미공개', 13),
  (ev, b_hsr, 'food',    '카페라떼', null, null, '가격 미공개', 14),

  -- 젠레스 존 제로 ----------------------------------------------------------
  (ev, b_zzz, 'welcome', '이아스 블록', null, null, null, 1),
  (ev, b_zzz, 'welcome', '홀로그램 티켓', null, null, null, 2),
  (ev, b_zzz, 'welcome', '리딤코드', null, null, '폴리크롬 100 · 데니 20,000 · 선임 조사원 기록 3 (UID당 4회, 10/1~2027/1/1, 현장 교환 불가)', 3),
  (ev, b_zzz, 'free',    'Welcome to 로스캘리퍼!', null, null, '버스 도착 시간에 맞춰 버튼 누르기 → 오렐리아 아카데미 학생증', 4),
  (ev, b_zzz, 'free',    '긴급 대비책: 「Bangboo」 복귀 작전', null, null, '벨리나의 부채로 Bangboo를 지정 자리로 → 벨리나 공무원증', 5),
  (ev, b_zzz, 'free',    'Two to Tango', null, null, '레미엘과 왈츠 → 레미엘 수배령 (각 이벤트별 1회)', 6),
  (ev, b_zzz, 'paid',    '행운의 애프터눈 티', 2000, '회당', '최대 10연 · 포토카드 14종', 7),
  (ev, b_zzz, 'paid',    '「Bangboo」 극장', 14000, '회당', '최대 2연 · 팝콘 속 공식 굿즈 랜덤 1종 + Bangboo 모자', 8),
  (ev, b_zzz, 'diy',     '지퍼백 키링', 4000, null, '카드 결제 후 영수증 제시', 9),
  (ev, b_zzz, 'diy',     '에코백', 10000, null, '스티커 추가 시 +3,000원', 10),
  (ev, b_zzz, 'food',    '<한 잔의 여유> 세트', null, null, '가격 미공개', 11),
  (ev, b_zzz, 'food',    '<트루 블루스> 세트', null, null, '가격 미공개', 12),
  (ev, b_zzz, 'food',    '이아스 쿠키', null, null, '가격 미공개', 13),
  (ev, b_zzz, 'food',    '<오렐리아 아카데미 급식> A코스·B코스', null, null, '가격 미공개', 14),

  -- 공식 굿즈 판매존 --------------------------------------------------------
  (ev, b_goods, 'goods', '호요랜드2026 아크릴 스탠드', 24000, null, '호요랜드 시리즈', 1),
  (ev, b_goods, 'goods', '말랑 모찌 쿠션', 28000, null, null, 2),
  (ev, b_goods, 'goods', '테마 패키지', 39000, null, '홀로그램 색지 · 키링 · 캔배지 등', 3),
  (ev, b_goods, 'goods', '여권 케이스', 24000, null, null, 4),
  (ev, b_goods, 'goods', '장패드', 25000, null, null, 5),
  (ev, b_goods, 'goods', '비치타올', 24000, null, '입장권 구매 시 웰컴 키트로 무료', 6),
  (ev, b_goods, 'goods', '장우산 (파이논)', 44000, null, null, 7),
  (ev, b_goods, 'goods', '1/7 피규어 어벤츄린', 440000, null, null, 8);

  get diagnostics n = row_count;
  raise notice '호요랜드 2026(%) 부스 항목 % 건 등록 완료', ev, n;
end $$;
