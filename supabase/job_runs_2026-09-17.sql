-- 자동 작업 실행 기록.
--
-- 왜 필요한가
--   크롤러가 조용히 멈춰도 아무도 모른다. 지금 알 수 있는 건 두 가지뿐이다 —
--   GitHub Actions 탭을 직접 열어 보거나, 며칠 뒤 "요즘 새 행사가 안 들어오네"
--   하고 사람이 눈치채거나. 둘 다 늦다.
--
--   더 나쁜 건 워크플로가 **초록불인 채로** 아무것도 못 가져오는 경우다.
--   파서가 깨지거나 API 키가 만료되면 스크립트는 0건을 기록하고 정상 종료한다.
--   Actions 탭은 전부 초록색이고, 대시보드의 "검수 대기 0건"은 "밀린 일 없음"과
--   똑같이 생겼다. 그 둘을 갈라 보려면 "언제 돌았고 몇 건을 가져왔는가"가 필요하다.
--
-- 한 줄 = 한 번의 실행 (덮어쓰지 않는다)
--   마지막 실행만 남기면 "며칠째 0건인가"를 영영 알 수 없다. 그게 정확히
--   찾아내고 싶은 고장이라 이력을 쌓는다. 작업 6종 × 하루 1회면 1년에 2천 행쯤이다.
--
-- 읽기는 Worker(service_role)로만 한다
--   error 컬럼에 외부 API의 응답이 그대로 들어올 수 있고, 그 안에 요청 URL이
--   섞이면 키가 딸려 온다. 크롤러 쪽에서 한 번 지우지만(job-run.mjs redactSecrets),
--   지우는 규칙이 완벽하다고 가정하지 않는다. 공개 select를 아예 열지 않는 쪽이 낫다.
create table if not exists public.job_runs (
  id uuid primary key default gen_random_uuid(),
  -- 워크플로 파일 이름이 아니라 "하는 일"의 이름이다. 워크플로 하나가 스크립트를
  -- 여러 개 돌리기도 한다(watch-sources.yml = 감지 + 코믹월드 부스 수집).
  job_key text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (status in ('ok', 'failed')),
  duration_ms integer,
  -- 그 실행이 실제로 만들어낸 것의 개수. 0이 정상일 수도 있으므로 이것만으로
  -- 고장을 판정하지 않는다 — 연속 0건이 며칠째인지를 화면에서 센다.
  items integer,
  -- 작업마다 세는 것이 다르다. 키가 곧 화면에 찍히는 이름이다(매핑표를 따로 두면
  -- 그 표가 먼저 낡는다).
  detail jsonb,
  error text,
  created_at timestamptz not null default now()
);

comment on table public.job_runs is
  '자동 작업(크롤·감지·알림 등) 실행 기록. 한 행 = 한 번의 실행. 관리자 대시보드가 Worker를 통해 읽는다.';

-- 화면은 언제나 "작업별 최근 N건"을 본다.
create index if not exists job_runs_key_started_idx
  on public.job_runs(job_key, started_at desc);

alter table public.job_runs enable row level security;

-- 정책을 하나도 만들지 않는다 = anon/authenticated는 아무것도 못 읽는다.
-- service_role은 RLS를 우회하므로 크롤러(쓰기)와 Worker(읽기)만 접근한다.
-- 혹시 예전에 열어둔 게 있으면 닫는다.
drop policy if exists "job_runs are publicly readable" on public.job_runs;

-- 이력이 무한정 쌓이지 않게 한다. 90일이면 "며칠째 0건"을 판단하기에 충분하고,
-- 그보다 오래된 실행은 들여다볼 일이 없다. 쓰는 쪽(job-run.mjs)이 가끔 부른다.
create or replace function public.prune_job_runs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  delete from public.job_runs where started_at < now() - interval '90 days';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.prune_job_runs() from public, anon, authenticated;
