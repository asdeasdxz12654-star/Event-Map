-- 코스어 디렉토리 스키마 (옵트인)
-- Supabase 대시보드 > SQL Editor 에서 실행하세요.
--
-- 사전 작업: Supabase 대시보드 > Authentication > Providers > Google 활성화
-- (Google Cloud Console에서 OAuth 클라이언트 ID/Secret 발급 필요)

-- 1) 코스어 프로필
create table if not exists public.cosplayers (
  id            text primary key default gen_random_uuid()::text,
  user_id       uuid unique not null references auth.users(id) on delete cascade,
  nickname      text not null unique,
  bio           text        check (char_length(bio) <= 200),
  profile_url   text        check (profile_url is null or profile_url ~* '^https://'),
  twitter_url   text        check (twitter_url is null or twitter_url ~* '^https://'),
  instagram_url text        check (instagram_url is null or instagram_url ~* '^https://'),
  other_url     text        check (other_url is null or other_url ~* '^https://'),
  -- 'approved': 공개, 'hidden': 본인/관리자 비공개
  -- MVP에서는 제출 즉시 approved. 심사가 필요해지면 'pending' 추가.
  status        text not null default 'approved'
                  check (status in ('approved', 'hidden')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists cosplayers_status_idx on public.cosplayers(status);

-- 2) 코스어↔행사 참가 예정 연결 (선택)
create table if not exists public.cosplayer_events (
  cosplayer_id  text not null references public.cosplayers(id) on delete cascade,
  event_id      text not null references public.events(id) on delete cascade,
  primary key   (cosplayer_id, event_id)
);

-- updated_at 자동 갱신
create or replace function public.set_cosplayer_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists cosplayers_set_updated_at on public.cosplayers;
create trigger cosplayers_set_updated_at
  before update on public.cosplayers
  for each row execute function public.set_cosplayer_updated_at();

-- RLS
alter table public.cosplayers enable row level security;
alter table public.cosplayer_events enable row level security;

-- 누구나 approved 프로필 읽기 가능
drop policy if exists "approved cosplayers are publicly readable" on public.cosplayers;
create policy "approved cosplayers are publicly readable"
  on public.cosplayers for select
  using (status = 'approved' or auth.uid() = user_id);

-- 본인만 자기 프로필 생성
drop policy if exists "user can insert own profile" on public.cosplayers;
create policy "user can insert own profile"
  on public.cosplayers for insert
  with check (auth.uid() = user_id);

-- 본인만 자기 프로필 수정
drop policy if exists "user can update own profile" on public.cosplayers;
create policy "user can update own profile"
  on public.cosplayers for update
  using (auth.uid() = user_id);

-- 본인만 자기 프로필 삭제 (탈퇴)
drop policy if exists "user can delete own profile" on public.cosplayers;
create policy "user can delete own profile"
  on public.cosplayers for delete
  using (auth.uid() = user_id);

-- cosplayer_events: 공개 읽기, 본인만 수정
drop policy if exists "cosplayer_events are publicly readable" on public.cosplayer_events;
create policy "cosplayer_events are publicly readable"
  on public.cosplayer_events for select using (true);

drop policy if exists "user can manage own cosplayer_events" on public.cosplayer_events;
create policy "user can manage own cosplayer_events"
  on public.cosplayer_events for all
  using (
    cosplayer_id in (
      select id from public.cosplayers where user_id = auth.uid()
    )
  );
