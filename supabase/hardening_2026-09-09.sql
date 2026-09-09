-- 백엔드 점검(2026-09-09) 후속 마이그레이션.
-- Supabase 대시보드 > SQL Editor 에서 위에서부터 그대로 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 담긴 내용
--   1) events.start_date 인덱스 (메인 조회가 gte/lte로 이 컬럼을 필터)
--   2) event_drafts.promoted_event_id FK에 on delete set null
--   3) promote_event_draft(): search_path 고정 + 실패 시 rejected 처리 + 중복 방지 복원
--   4) cleanup_stale_push_tokens(): search_path 고정 + last_seen_at 기준으로 변경

-- ---------------------------------------------------------------------------
-- 1) events.start_date 인덱스
-- 프론트 메인 조회가 start_date를 gte/lte로 거는데 인덱스가 없어서 매번 풀스캔이었다.
create index if not exists events_start_date_idx on public.events(start_date);

-- ---------------------------------------------------------------------------
-- 2) event_drafts.promoted_event_id FK -> on delete set null
-- 지금까지는 제약이 restrict라 행사를 지우려면 api-proxy Worker가 매번 draft의 참조를
-- 먼저 NULL로 밀어야 했다(그 두 번의 요청 사이에 실패하면 반쯤 정리된 상태로 남는다).
-- DB가 알아서 끊게 바꾸고, Worker의 수동 정리 코드는 제거했다.
-- 기존 제약은 이름을 짐작하지 말고 실제로 붙어 있는 걸 찾아서 지운다 — 이름이 다르면
-- drop이 조용히 넘어가고 FK가 두 개(restrict + set null) 걸려서 삭제가 계속 막힌다.
do $$
declare
  con record;
begin
  for con in
    select conname
    from pg_constraint
    where conrelid = 'public.event_drafts'::regclass
      and contype = 'f'
      and conkey = (
        select array[attnum]::smallint[]
        from pg_attribute
        where attrelid = 'public.event_drafts'::regclass
          and attname = 'promoted_event_id'
      )
  loop
    execute format('alter table public.event_drafts drop constraint %I', con.conname);
  end loop;
end $$;

alter table public.event_drafts
  add constraint event_drafts_promoted_event_id_fkey
  foreign key (promoted_event_id) references public.events(id) on delete set null;

-- 자동 게시가 실패했을 때 그 이유를 남길 자리. 검수 화면에서 반려 사유로 보여준다.
alter table public.event_drafts
  add column if not exists review_note text;

comment on column public.event_drafts.review_note is
  '자동 게시(promote) 실패 사유. 성공하거나 사람이 반려한 경우엔 null.';

-- ---------------------------------------------------------------------------
-- 3) promote_event_draft() 재정의
--
-- (a) security definer인데 search_path가 고정돼 있지 않았다. 호출자가 search_path를
--     조작해 같은 이름의 가짜 테이블/함수를 앞에 끼워 넣으면 이 함수의 권한으로 실행되므로
--     실제 권한 상승 벡터다(Supabase 린터도 잡는 항목).
-- (b) LLM이 뽑은 category가 check 제약 밖이거나 날짜 형식이 깨져 있으면 insert가 예외를
--     던지고, 그게 그대로 올라가 "승인" update 자체가 raw PG 에러로 실패했다. 이제는
--     예외를 잡아서 해당 draft를 rejected + review_note로 마감한다.
-- (c) ticket_open_note.sql에서 트리거를 다시 정의하면서 event_drafts_dedup.sql의 중복
--     방지 로직(같은 제목+시작일이면 새로 만들지 않고 기존 행사에 연결)이 빠져 있었다.
--     여기서 되살린다.
create or replace function public.promote_event_draft()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_event_id text;
  existing_event_id text;
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    begin
      -- 여러 뉴스 소스가 같은 행사를 각자 기사로 다루는 일이 잦다. 승인 직전에 제목+시작일이
      -- 같은 행사가 이미 있는지 보고, 있으면 새로 만들지 않고 연결만 한다.
      select id into existing_event_id
      from public.events
      where title = new.extracted->>'title'
        and start_date = (new.extracted->>'start_date')::date
      limit 1;

      if existing_event_id is not null then
        new.promoted_event_id := existing_event_id;
        new.reviewed_at := now();
        new.review_note := null;
        return new;
      end if;

      new_event_id := 'nd-' || to_char(now(), 'YYYYMMDD') || '-' || substr(md5(random()::text), 1, 6);

      insert into public.events (
        id, title, category, start_date, end_date, venue, venue_address,
        organizer, description, ticket_url, ticket_open_date, ticket_open_time,
        ticket_open_note, admission_fee, website, tags
      )
      values (
        new_event_id,
        new.extracted->>'title',
        new.extracted->>'category',
        (new.extracted->>'start_date')::date,
        -- end_date가 비어있으면(단일 하루 행사 등) start_date로 채운다
        coalesce((new.extracted->>'end_date')::date, (new.extracted->>'start_date')::date),
        new.extracted->>'venue',
        new.extracted->>'venue_address',
        new.extracted->>'organizer',
        new.extracted->>'description',
        new.extracted->>'ticket_url',
        (new.extracted->>'ticket_open_date')::date,
        new.extracted->>'ticket_open_time',
        new.extracted->>'ticket_open_note',
        new.extracted->>'admission_fee',
        new.extracted->>'website',
        case when new.extracted->'tags' is not null
          then array(select jsonb_array_elements_text(new.extracted->'tags'))
          else '{}'::text[]
        end
      );

      new.promoted_event_id := new_event_id;
      new.reviewed_at := now();
      new.review_note := null;
    exception when others then
      -- category check 위반, 날짜 파싱 실패, title null 등. 승인 update 전체를 깨뜨리는
      -- 대신 이 draft만 반려 처리하고 사유를 남긴다(events에 넣던 행은 롤백된다).
      new.status := 'rejected';
      new.promoted_event_id := null;
      new.reviewed_at := now();
      new.review_note := '자동 게시 실패: ' || sqlerrm;
    end;
  elsif new.status = 'rejected' and old.status is distinct from new.status then
    new.reviewed_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists event_drafts_promote on public.event_drafts;
create trigger event_drafts_promote
  before update on public.event_drafts
  for each row execute function public.promote_event_draft();

-- ---------------------------------------------------------------------------
-- 4) cleanup_stale_push_tokens() 재정의
--
-- (a) 위와 같은 이유로 search_path 고정.
-- (b) created_at 기준이라 "매일 잘 받고 있는 활성 토큰"도 등록 90일이면 지워졌다.
--     마지막으로 발송에 성공한 시각(last_seen_at)을 기준으로 바꾼다 — notifier가
--     발송 성공한 토큰의 last_seen_at을 매 실행마다 갱신한다(send-notifications.mjs).
--     아직 한 번도 발송된 적이 없는 토큰은 created_at으로 대체 판정한다.
alter table public.push_subscriptions
  add column if not exists last_seen_at timestamptz;

comment on column public.push_subscriptions.last_seen_at is
  '마지막으로 푸시 발송에 성공한 시각. null이면 아직 한 번도 발송된 적 없음(created_at으로 판정).';

create or replace function public.cleanup_stale_push_tokens()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  deleted_count integer;
begin
  delete from public.push_subscriptions
  where coalesce(last_seen_at, created_at) < now() - interval '90 days';
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

-- 일반 사용자(anon, authenticated)는 이 함수를 실행할 수 없도록 권한 차단.
-- 호출은 notifier(send-notifications.mjs)가 service_role 키로 매 실행 끝에 한다.
revoke execute on function public.cleanup_stale_push_tokens() from public, anon, authenticated;
