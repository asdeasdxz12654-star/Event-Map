-- 방문자 제보 · 정보 오류 신고 (2026-09-17)
-- Supabase 대시보드 > SQL Editor 에서 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 무엇을 푸는가
--   지금 방문자가 할 수 있는 일은 보기·북마크·공유뿐이다. 틀린 정보를 발견해도
--   알려줄 곳이 없고, 우리가 모르는 행사를 알아도 알려줄 곳이 없다.
--
--   운영 쪽에서도 같은 구멍이다. 행사 51건 중 포스터 31 · 예매링크 17 · 공식사이트 26만
--   채워져 있다. 크롤러가 못 찾는 값을 실제로 그 행사에 가는 사람은 알고 있다.
--
-- 왜 event_drafts를 안 쓰나
--   event_drafts는 크롤러가 넣고 트리거가 승격시키는 자동 파이프라인이다. 사람이 손으로
--   쓴 글을 거기 섞으면 승격 규칙(제목+날짜 중복 검사, LLM 추출 형식)이 사람 글에까지
--   적용된다. 성격이 다른 입력은 테이블을 나눈다.

create table if not exists public.event_reports (
  id         uuid primary key default gen_random_uuid(),

  -- 'correction' = 이 행사 정보가 틀렸다 (event_id 필수)
  -- 'new_event'  = 목록에 없는 행사를 알려준다 (event_id 없음)
  kind       text not null check (kind in ('correction', 'new_event')),

  -- 행사가 지워지면 신고도 같이 지운다. 대상이 없는 신고는 읽을 수 없다.
  event_id   text references public.events(id) on delete cascade,

  -- 본문. 길이 상한을 DB에서도 건다 — Worker가 먼저 막지만, 그 한 겹만 믿지 않는다.
  message    text not null check (length(btrim(message)) between 5 and 2000),

  -- 답을 원하면 남기는 연락처(선택). 이메일·SNS 등 형식을 강제하지 않는다 —
  -- 형식을 강제하면 "카톡 아이디로 연락 주세요" 같은 실제 쓰임을 막는다.
  contact    text check (contact is null or length(contact) <= 200),

  status     text not null default 'open' check (status in ('open', 'resolved', 'rejected')),
  -- 관리자가 처리하며 남기는 메모. 왜 반려했는지는 남겨둬야 같은 제보가 또 왔을 때 안다.
  admin_note text,

  created_at   timestamptz not null default now(),
  reviewed_at  timestamptz,

  -- correction은 대상이 있어야 하고, new_event는 대상이 없어야 한다.
  constraint event_reports_shape check (
    (kind = 'correction' and event_id is not null)
    or (kind = 'new_event' and event_id is null)
  )
);

create index if not exists event_reports_status_idx on public.event_reports(status, created_at desc);
create index if not exists event_reports_event_id_idx on public.event_reports(event_id);

-- ---------------------------------------------------------------------------
-- RLS — 아무도 직접 못 쓴다. 넣기도 읽기도 Worker(service_role)를 거친다.
--
-- 넣기를 anon에 열지 않는 이유: 그러면 브라우저에서 무제한으로 밀어 넣을 수 있다.
-- Worker를 거치면 IP 기준 속도 제한과 길이 검사를 한 곳에서 건다.
-- 읽기를 anon에 열지 않는 이유: 남이 쓴 제보에 연락처가 들어 있다.
alter table public.event_reports enable row level security;

-- 정책을 하나도 만들지 않는다 = anon/authenticated 전부 차단, service_role만 통과.
-- (다른 테이블은 공개 읽기 정책이 있지만 여기는 일부러 없다.)

comment on table public.event_reports is
  '방문자가 보낸 정보 오류 신고와 행사 제보. Worker를 거쳐서만 들어오고 읽힌다.';
