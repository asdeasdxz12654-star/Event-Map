-- 무대(장소)와 시간표 (2026-09-15)
-- Supabase 대시보드 > SQL Editor 에서 위에서부터 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 왜 event_performers로는 안 되는가
--   지금 무대 일정은 event_performers의 songs 한 칸에 통째로 들어 있다. 실제 저장된 값:
--     '10/2(금) 12:30~13:30\n10/3(토) 11:00~12:00\n10/4(일) 12:00~13:00, 15:00~16:00'
--   프로그램 하나에 나흘치 시간이 한 문자열이다. 그래서
--     · "토요일에 뭐 하지"로 뽑을 수 없고
--     · 시간순 정렬이 안 돼 관리자가 sort_order를 손으로 매겨야 하고
--     · "지금 진행 중"을 표시할 수 없다.
--   게다가 "어디서 하는가"를 담을 칸이 없다. 호요랜드는 무대가 하나라 이 표가 곧 행사
--   전체 일정이지만, 지스타처럼 각 기업 부스에 자체 무대가 있는 행사에서는 뒤섞인다.
--
--   event_performers는 지우지 않는다 — 게임음악 행사의 "출연진·세트리스트"는 시간표가
--   아니라 라인업이라 성격이 다르다. 그 용도로 계속 쓴다.

-- ---------------------------------------------------------------------------
-- 1) 무대 = 장소
create table if not exists public.event_stages (
  id         uuid primary key default gen_random_uuid(),
  event_id   text not null references public.events(id) on delete cascade,
  name       text not null,           -- '메인 스테이지', '넥슨 부스 무대'
  -- null이면 행사 공용 무대. 값이 있으면 그 부스의 무대다(부스 탭과 색·링크가 이어진다).
  booth_id   uuid references public.event_booths(id) on delete cascade,
  location   text,                    -- '1홀 중앙', '야외 특설'
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists event_stages_event_id_idx on public.event_stages(event_id);

-- ---------------------------------------------------------------------------
-- 2) 시간표 한 줄
--
-- 같은 프로그램이 여러 날 반복되면 그만큼 행이 생긴다. 중복처럼 보이지만 그래야
-- 날짜로 거를 수 있다 — 한 행에 나흘을 넣은 게 지금 문제의 원인이다.
create table if not exists public.event_stage_slots (
  id         uuid primary key default gen_random_uuid(),
  -- event_id를 함께 둔다: 프론트 실시간 구독(useEventChildList)이 event_id 필터로만
  -- 동작하고, 관리자 API도 /admin/events/:eventId/<하위목록> 패턴을 쓴다.
  -- (event_booth_items가 같은 이유로 event_id를 들고 있다.)
  event_id   text not null references public.events(id) on delete cascade,
  stage_id   uuid not null references public.event_stages(id) on delete cascade,
  day        date not null,
  start_time time,                    -- null = 그날 진행은 확정인데 시간이 미정
  end_time   time,
  title      text not null,
  performer  text,                    -- 출연자·게스트
  note       text,                    -- 한 줄 설명
  kind       text check (kind is null or kind in ('talk', 'live', 'cosplay', 'event', 'etc')),
  sort_order int not null default 0,  -- 시작 시각이 같을 때만 쓴다
  created_at timestamptz not null default now()
);

create index if not exists event_stage_slots_event_id_idx on public.event_stage_slots(event_id);
create index if not exists event_stage_slots_day_idx on public.event_stage_slots(event_id, day, start_time);

-- ---------------------------------------------------------------------------
-- 3) RLS — events·event_booths와 같은 패턴(공개 읽기, 쓰기는 Worker가 service_role로)
alter table public.event_stages enable row level security;
alter table public.event_stage_slots enable row level security;

drop policy if exists "event_stages are publicly readable" on public.event_stages;
create policy "event_stages are publicly readable"
  on public.event_stages for select using (true);

drop policy if exists "event_stage_slots are publicly readable" on public.event_stage_slots;
create policy "event_stage_slots are publicly readable"
  on public.event_stage_slots for select using (true);

-- 이미 추가돼 있으면 에러가 나므로 감싼다(여러 번 실행 안전).
do $$
begin
  alter publication supabase_realtime add table public.event_stages;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.event_stage_slots;
exception when duplicate_object then null;
end $$;
