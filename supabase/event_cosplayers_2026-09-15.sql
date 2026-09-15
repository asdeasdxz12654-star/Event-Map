-- 행사에 오는 코스어 (2026-09-15)
-- Supabase 대시보드 > SQL Editor 에서 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 기존 cosplayers 테이블과 왜 합치지 않는가
--   cosplayers(cosplayers.sql)는 본인이 Google 로그인으로 가입해 자기 프로필을 관리하는
--   디렉토리다 — user_id가 필수고 RLS가 "본인만 수정"으로 걸려 있다.
--   이 테이블은 관리자가 공식 공지를 보고 적는 행사 정보다. 둘을 한 테이블로 만들면
--     · 계정이 없는 초청 코스어를 넣을 수 없고
--     · "본인만 수정"과 "관리자만 수정"이라는 두 정책이 서로 모순된다.
--   대신 cosplayer_id를 열어둬서, 나중에 본인이 가입하면 연결만 하면 된다.

create table if not exists public.event_cosplayers (
  id           uuid primary key default gen_random_uuid(),
  event_id     text not null references public.events(id) on delete cascade,
  name         text not null,        -- 활동명
  -- null = 주최 초청. 값이 있으면 그 부스가 초청한 코스어다.
  booth_id     uuid references public.event_booths(id) on delete set null,
  character    text,                 -- 코스 캐릭터
  title        text,                 -- 원작 ('원신', '블루 아카이브')
  photo_url    text,
  sns_url      text,
  day          date,                 -- 출연일. null이면 행사 기간 내내 상주
  start_time   time,                 -- 등장 시간(있으면 무대 타임라인에도 함께 뜬다)
  end_time     time,
  note         text,
  sort_order   int not null default 0,
  -- 본인 등록 디렉토리와 이을 자리. 지금은 늘 null이다.
  cosplayer_id text references public.cosplayers(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists event_cosplayers_event_id_idx on public.event_cosplayers(event_id);

alter table public.event_cosplayers enable row level security;

drop policy if exists "event_cosplayers are publicly readable" on public.event_cosplayers;
create policy "event_cosplayers are publicly readable"
  on public.event_cosplayers for select using (true);
-- 쓰기 정책 없음 = anon 차단. events/event_booths와 동일하게 api-proxy Worker가
-- service_role 키로 처리한다.

do $$
begin
  alter publication supabase_realtime add table public.event_cosplayers;
exception when duplicate_object then null;
end $$;
