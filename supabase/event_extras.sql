-- 예상 혼잡도·부스 배치도·참가 부스 목록 마이그레이션
-- Supabase 대시보드 > SQL Editor 에서 실행하세요.
--
-- 혼잡도(crowd_level)는 실시간 인원 데이터가 아니라 "과거 참가 규모 기반 추정치"다.
-- KINTEX·BEXCO 등 우리 행사 대부분이 위치한 지역엔 실시간 유동인구를 공개하는
-- 공공 API가 없다(서울시 실시간 도시데이터는 서울 시내 명소만 지원, 지역 밖이라
-- 적용 불가). 그래서 매진 여부·과거 관람객 수 기록으로 추정한 값을 수동으로
-- 채워 넣는다 — AI 뉴스 크롤러가 추측해서 채우면 안 되므로 크롤러 스키마엔 넣지
-- 않고, known-events.mjs(고정 행사)와 관리자 화면에서만 채운다.

alter table public.events
  add column if not exists crowd_level text
    check (crowd_level in ('low', 'medium', 'high', 'very_high')),
  add column if not exists floor_plan_url text;

comment on column public.events.crowd_level is
  '예상 혼잡도(실시간 아님, 과거 참가 규모 기반 추정) — low: 한산, medium: 보통,
   high: 혼잡, very_high: 매우 혼잡. null이면 추정 근거 없음(미표시).';
comment on column public.events.floor_plan_url is
  '부스 배치도 이미지 URL. 없으면 null.';

-- 참가 업체/부스 목록 — 행사 하나에 여러 개가 달리므로 별도 테이블로 관리.
create table if not exists public.event_booths (
  id          uuid primary key default gen_random_uuid(),
  event_id    text not null references public.events(id) on delete cascade,
  name        text not null,          -- 참가 업체/브랜드명
  booth_no    text,                   -- 부스 번호/위치 (예: "A-12", "1홀 서쪽")
  goods       text,                   -- 제공(무료 배포)·판매하는 굿즈 설명
  sort_order  int not null default 0, -- 관리자가 지정하는 표시 순서
  created_at  timestamptz not null default now()
);

create index if not exists event_booths_event_id_idx on public.event_booths(event_id);

alter table public.event_booths enable row level security;

drop policy if exists "event_booths are publicly readable" on public.event_booths;
create policy "event_booths are publicly readable"
  on public.event_booths for select
  using (true);
-- 쓰기는 정책을 안 만들어서 기본 차단 — 관리자는 api-proxy Worker가
-- service_role 키로 직접 insert/update/delete (events 테이블과 동일한 패턴).

alter publication supabase_realtime add table public.event_booths;
