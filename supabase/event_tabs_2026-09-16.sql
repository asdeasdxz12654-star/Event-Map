-- 행사 상세페이지의 탭 구성 (2026-09-16)
-- Supabase 대시보드 > SQL Editor 에서 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 무엇을 푸는가
--   지금 상세페이지의 탭은 데이터가 정한다. 부스가 있으면 부스 탭이 생기고, 없으면
--   그 자리가 개요 아래로 내려간다(EventDetailPage.jsx:182-185, :298-301).
--   대부분의 행사에는 이게 맞다 — 관리자가 탭을 켜고 끌 일이 없다.
--
--   그런데 세 가지가 안 된다.
--     1) 이름을 못 바꾼다. "부스"라는 말이 안 맞는 행사가 있다(일러스트페어의 "참가 작가").
--     2) 순서를 못 바꾼다. 굿즈가 주인공인 행사에서도 굿즈가 세 번째다.
--     3) 행사마다 다른 안내를 넣을 곳이 없다. 교통편·주의사항·입장 순서 같은 것들이
--        지금은 description 한 덩어리에 뭉쳐 들어간다.
--
--   이 표는 그 세 가지만 담는다. 행이 없으면 지금과 똑같이 동작한다 —
--   즉 기본값은 "코드가 정하던 대로"이고, 행은 그걸 덮어쓰는 예외다.

create table if not exists public.event_tabs (
  id         uuid primary key default gen_random_uuid(),
  event_id   text not null references public.events(id) on delete cascade,

  -- 기본 탭이면 'booths' | 'stage' | 'goods' | 'cosplay',
  -- 직접 만든 탭이면 관리자가 정한 슬러그('traffic', 'notice' 등).
  key        text not null,

  -- 이 행이 기본 탭을 덮어쓰는 것인지, 새로 만든 탭인지.
  -- key만 봐서는 구분할 수 없다 — 관리자가 'goods'라는 슬러그로 새 탭을 만들 수도 있다.
  builtin    boolean not null default false,

  -- null이면 코드의 기본 이름을 쓴다. 기본 탭의 이름은 카테고리에 따라 달라지기도 해서
  -- ('무대' / 게임음악이면 '출연진'), 빈 값을 "안 바꿈"으로 두는 편이 안전하다.
  label      text,

  -- 직접 만든 탭의 본문. 기본 탭이면 null이다(내용은 부스·굿즈 테이블에서 온다).
  body       text,

  visible    boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),

  -- 한 행사에 같은 key가 두 번 있으면 어느 쪽이 이기는지 알 수 없다.
  unique (event_id, key),

  -- 기본 탭은 본문을 갖지 않고, 직접 만든 탭은 이름이 반드시 있어야 한다.
  -- (이름 없는 커스텀 탭은 화면에 그릴 글자가 없다.)
  constraint event_tabs_shape check (
    (builtin and body is null)
    or (not builtin and label is not null and length(btrim(label)) > 0)
  )
);

create index if not exists event_tabs_event_id_idx on public.event_tabs(event_id, sort_order);

-- ---------------------------------------------------------------------------
-- RLS — 다른 하위 테이블과 같은 패턴(공개 읽기, 쓰기는 Worker가 service_role로)
alter table public.event_tabs enable row level security;

drop policy if exists "event_tabs are publicly readable" on public.event_tabs;
create policy "event_tabs are publicly readable"
  on public.event_tabs for select using (true);

-- 실시간 구독 — 관리자가 순서를 바꾸면 열려 있는 상세페이지가 바로 따라온다.
-- 이미 추가돼 있으면 에러가 나므로 감싼다(여러 번 실행 안전).
do $$
begin
  alter publication supabase_realtime add table public.event_tabs;
exception when duplicate_object then null;
end $$;

comment on table public.event_tabs is
  '행사 상세페이지 탭의 이름·순서·표시 여부와, 직접 만든 탭의 본문. '
  '행이 없으면 코드의 기본 동작(데이터가 있는 탭만 표시)을 그대로 따른다.';
