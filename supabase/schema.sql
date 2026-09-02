-- game-event-hub: events 테이블 + 공개 읽기 정책 + realtime 구독 활성화
-- Supabase 대시보드 > SQL Editor 에서 그대로 실행하세요.

create table if not exists public.events (
  id                text primary key,
  title             text not null,
  category          text not null check (category in ('게임전시', '코스프레', '게임음악')),
  start_date        date not null,
  end_date          date not null,
  venue             text,
  venue_address     text,
  venue_lat         double precision,
  venue_lng         double precision,
  organizer         text,
  description       text,
  poster_url        text,
  ticket_url        text,
  ticket_open_date  date,
  admission_fee     text,
  website           text,
  trust_score       smallint check (trust_score >= 0 and trust_score <= 5),
  past_events       text[] default '{}',
  tags              text[] default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- updated_at 자동 갱신
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

-- RLS: 누구나 읽기는 가능, 쓰기는 기본적으로 막아둠 (관리자는 서비스 롤 키로 직접 insert/update)
alter table public.events enable row level security;

drop policy if exists "events are publicly readable" on public.events;
create policy "events are publicly readable"
  on public.events for select
  using (true);

-- 실시간 구독(추후 Supabase Realtime 연동용) 활성화
alter publication supabase_realtime add table public.events;

-- 샘플 데이터 (기존 events.js 목업과 동일) — 실데이터 입력 전 화면 확인용, 필요 없으면 지워도 됩니다
insert into public.events
  (id, title, category, start_date, end_date, venue, venue_address, venue_lat, venue_lng, organizer, description, ticket_url, ticket_open_date, admission_fee, website, trust_score, past_events, tags)
values
  ('e1', '지스타 2026', '게임전시', '2026-11-19', '2026-11-22', '벡스코 제1전시장', '부산광역시 해운대구 APEC로 55', 35.1694, 129.1284, '한국게임산업협회', '국내 최대 게임 전시회. B2B·B2C 통합 행사로 국내외 주요 게임사가 참가합니다.', 'https://example.com/gstar2026', '2026-10-01', '일반 15,000원 / 청소년 10,000원', 'https://example.com/gstar', 5, array['지스타 2024 정상 개최', '지스타 2025 정상 개최'], array['게임', '전시', '부산', '인디게임']),
  ('e2', '코믹월드 서울 2026 Vol.3', '코스프레', '2026-10-11', '2026-10-12', 'SETEC', '서울 강남구 테헤란로 521', 37.4839, 127.1239, '오키도키', '국내 최대 동인행사. 코스프레, 동인지, 굿즈 판매 등 다양한 콘텐츠.', 'https://example.com/comicworld', '2026-09-15', '1일권 5,000원', 'https://example.com/comicworld', 5, array['코믹월드 2024 정상 개최', '코믹월드 2025 정상 개최'], array['코스프레', '동인', '서울', '굿즈']),
  ('e3', '파이널판타지 오케스트라 콘서트', '게임음악', '2026-09-20', '2026-09-20', '예술의전당 콘서트홀', '서울 서초구 남부순환로 2406', 37.4777, 127.0153, '스퀘어에닉스 코리아', 'FF 시리즈 35주년 기념 오케스트라 공연. 노부오 우에마츠 선곡 기반.', 'https://example.com/ff-concert', '2026-08-20', 'R석 110,000원 / S석 88,000원 / A석 66,000원', 'https://example.com/ff-concert', 4, array['FF 30주년 콘서트 정상 개최'], array['콘서트', '오케스트라', '파이널판타지', '서울']),
  ('e4', '인디게임 페스티벌 2026', '게임전시', '2026-09-06', '2026-09-07', '코엑스 D홀', '서울 강남구 영동대로 513', 37.5130, 127.0587, '인디게임협회', '국내 인디 개발사들이 모이는 축제. 체험·투표·시상까지.', null, null, '무료', 'https://example.com/indiefest', 3, array['인디게임 페스티벌 2025 정상 개최'], array['인디게임', '서울', '무료']),
  ('e5', '코스프레 챔피언십 2026', '코스프레', '2026-08-10', '2026-08-10', '올림픽공원 88잔디마당', '서울 송파구 올림픽로 424', 37.5224, 127.1231, '코스프레문화협회', '전국 코스어들이 참가하는 연간 최대 코스프레 경연대회.', 'https://example.com/cosplay-champ', '2026-07-01', '관람 무료 / 참가비 별도', 'https://example.com/cosplay-champ', 4, array['코스프레 챔피언십 2024 정상 개최', '2025 취소 (장소 문제)'], array['코스프레', '경연', '서울', '무료관람'])
on conflict (id) do nothing;
