-- 출연진·세트리스트(게임음악 행사용) + 부스/굿즈 공개 상태 메모 마이그레이션
-- Supabase 대시보드 > SQL Editor 에서 실행하세요.

-- 콘서트/음악회류(category='게임음악') 행사 상세페이지, "행사 신뢰도" 카드 하단에
-- 출연 가수·세트리스트를 보여주기 위한 테이블. event_booths와 같은 구조.
create table if not exists public.event_performers (
  id          uuid primary key default gen_random_uuid(),
  event_id    text not null references public.events(id) on delete cascade,
  artist_name text not null,
  songs       text,                   -- 자유 텍스트(줄바꿈으로 여러 곡 구분). 미공개면 null.
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists event_performers_event_id_idx on public.event_performers(event_id);

alter table public.event_performers enable row level security;

drop policy if exists "event_performers are publicly readable" on public.event_performers;
create policy "event_performers are publicly readable"
  on public.event_performers for select
  using (true);
-- 쓰기는 events/event_booths와 동일하게 api-proxy Worker가 service_role로 직접 처리.

alter publication supabase_realtime add table public.event_performers;

-- 참가업체/부스/굿즈 공개 상태 메모. admission_fee와 같은 자유 텍스트 방식 —
-- "미공개"(공식적으로 공개 안 하는 걸로 확인됨) 또는 "행사 2~3주 전 공개 예상" 같은
-- 예상 시점 안내를 넣는다. booth 목록이 비어있을 때 이 값을 대신 보여준다.
alter table public.events
  add column if not exists booth_info_note text;

comment on column public.events.booth_info_note is
  '참가업체/부스/굿즈 공개 상태 메모 (자유 텍스트). "미공개" 또는 예상 공개 시점 안내.
   event_booths가 비어있을 때 이 값을 대신 표시한다.';
