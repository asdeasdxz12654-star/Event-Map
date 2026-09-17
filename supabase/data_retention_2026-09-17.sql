-- 오래된 데이터 정리 (2026-09-17)
-- Supabase 대시보드 > SQL Editor 에서 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 왜 지금 만드나
--   개인정보처리방침을 쓰다 보니 "얼마나 보관하는가"에 답할 수 없는 것이 둘 있었다.
--
--     client_errors.user_agent   보관 기간 없음 — 영원히 남는다
--     event_reports.contact      보관 기간 없음 — 처리한 뒤에도 영원히 남는다
--
--   처리방침에 "필요한 기간만 보관합니다"라고 적으려면 그게 사실이어야 한다.
--   문서가 코드보다 앞서가면 그 문서는 거짓말이 된다.
--
--   푸시 토큰은 이미 90일 규칙이 있다(hardening_2026-09-09.sql
--   cleanup_stale_push_tokens — 마지막 발송 성공으로부터 90일).
--   job_runs도 90일이 있다(job_runs_2026-09-17.sql prune_job_runs).
--   나머지 둘을 같은 자리로 데려온다.
--
-- 누가 부르나
--   shared/job-run.mjs가 자동 작업이 끝날 때 가끔(20번에 한 번) 부른다. 크론을 따로
--   두지 않는 이유는 크롤·감지·알림이 매일 도니까 그 김에 치우면 되기 때문이다.
--   정리 전용 워크플로를 만들면 그것이 멈췄는지 또 감시해야 한다.

-- 방문자 화면에서 난 오류 — 90일.
--
-- 그보다 오래된 오류는 이미 고쳤거나, 고칠 생각이 없거나, 그 사이 코드가 통째로
-- 바뀌어서 스택이 가리키는 자리가 없어졌다. 셋 다 들여다볼 이유가 없다.
create or replace function public.prune_client_errors()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  delete from public.client_errors where last_seen_at < now() - interval '90 days';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

-- 제보 연락처 — 처리가 끝나고 1년.
--
-- 제보 자체(내용·대상 행사)는 남긴다. 그건 "어떤 제보가 들어왔고 어떻게 처리했나"의
-- 기록이라 나중에 같은 제보가 또 왔을 때 필요하다. 지우는 것은 연락처뿐이다 —
-- 그건 "되묻기 위해" 받은 값이고, 처리가 끝나면 되물을 일이 없다.
--
-- 아직 처리 안 한 제보(status='open')는 건드리지 않는다. 오래 밀렸을 뿐 아직
-- 되물을 수 있는 건이다.
create or replace function public.clear_old_report_contacts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  cleared integer;
begin
  update public.event_reports
  set contact = null
  where contact is not null
    and status <> 'open'
    and coalesce(reviewed_at, created_at) < now() - interval '1 year';
  get diagnostics cleared = row_count;
  return cleared;
end;
$$;

-- 셋을 한 번에. 부르는 쪽(shared/job-run.mjs)이 규칙을 알 필요가 없게 한다 —
-- 보관 기간이 바뀌면 여기만 고친다.
create or replace function public.prune_old_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  runs integer;
  errors integer;
  contacts integer;
begin
  runs := public.prune_job_runs();
  errors := public.prune_client_errors();
  contacts := public.clear_old_report_contacts();
  return jsonb_build_object(
    'job_runs', runs,
    'client_errors', errors,
    'report_contacts', contacts
  );
end;
$$;

revoke all on function public.prune_client_errors() from public, anon, authenticated;
revoke all on function public.clear_old_report_contacts() from public, anon, authenticated;
revoke all on function public.prune_old_data() from public, anon, authenticated;

-- 한 번 지금 돌려서 이미 쌓인 것을 치운다(아직 아무것도 없으면 전부 0이 나온다).
select public.prune_old_data() as "정리한 행 수";
