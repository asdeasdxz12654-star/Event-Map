-- 방문자 브라우저에서 난 오류.
--
-- 왜 필요한가
--   지금 앱이 방문자 화면에서 터지면 아무도 모른다. ErrorBoundary가 "화면을 표시하지
--   못했습니다"를 띄우고 console.error를 남기는데, 그 콘솔은 방문자 브라우저에만 있다.
--   우리가 볼 수 있는 유일한 길은 그 사람이 직접 제보를 보내주는 것뿐이다 —
--   대부분은 그냥 창을 닫는다.
--
--   실제로 이 저장소에서 그런 종류의 고장이 여러 번 났다. 데이터 한 건의 모양이
--   예상과 달라 화면 전체가 백지가 된 적이 있고(그래서 ErrorBoundary를 넣었다),
--   Firebase SDK가 페이지를 옮길 때마다 내부 에러를 던지는 것도 우연히 발견했다.
--
-- 한 줄 = 한 종류의 오류 (같은 오류가 백 번 나도 한 줄)
--   발생할 때마다 행을 쌓으면 인기 있는 고장 하나가 표를 덮어버리고, 정작 "어제부터
--   새로 생긴 것"이 그 아래 묻힌다. fingerprint로 묶고 횟수만 센다.
--
-- 읽기는 Worker(service_role)로만 한다
--   stack에 우리 코드 구조가 들어 있고, 방문자의 user_agent도 함께 담긴다.
--   공개할 이유가 없다.
create table if not exists public.client_errors (
  id uuid primary key default gen_random_uuid(),
  -- 메시지 + 스택 첫 줄을 해시한 값. 같은 고장을 같은 줄로 모으는 열쇠다.
  fingerprint text not null unique,
  message text not null,
  stack text,
  -- boundary: React 렌더 중 (ErrorBoundary가 잡음)
  -- error: window.onerror  ·  unhandledrejection: 처리 안 된 Promise 거부
  kind text not null check (kind in ('boundary', 'error', 'unhandledrejection')),
  -- 경로만 남기고 쿼리스트링은 버린다(검색어가 들어 있을 수 있다).
  path text,
  user_agent text,
  -- 어느 빌드에서 났는지. 이미 고친 오류가 옛 빌드를 열어둔 탭에서 계속 올라오는 것을
  -- 새 고장으로 착각하지 않으려면 이게 필요하다.
  app_build text,
  count integer not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open', 'resolved', 'ignored')),
  admin_note text
);

comment on table public.client_errors is
  '방문자 브라우저에서 난 오류. fingerprint로 묶어 한 종류당 한 줄. 관리자 화면이 Worker를 통해 읽는다.';

create index if not exists client_errors_open_idx
  on public.client_errors(status, last_seen_at desc);

alter table public.client_errors enable row level security;
-- 정책을 하나도 만들지 않는다 = anon/authenticated는 아무것도 못 읽고 못 쓴다.
-- 넣는 것도 Worker를 거친다 — 브라우저가 직접 넣게 하면 속도 제한을 걸 자리가 없다.

-- 같은 오류가 또 나면 새 줄을 만들지 않고 횟수만 올린다.
--
-- Worker가 upsert 대신 이 함수를 부르는 이유: PostgREST의 on_conflict는 "기존 값에
-- 1을 더한다"를 표현할 수 없다. 클라이언트가 읽고 더해서 쓰면 같은 오류가 동시에
-- 여러 번 올라올 때 숫자가 어긋난다.
create or replace function public.record_client_error(
  p_fingerprint text,
  p_message text,
  p_stack text,
  p_kind text,
  p_path text,
  p_user_agent text,
  p_app_build text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.client_errors
    (fingerprint, message, stack, kind, path, user_agent, app_build)
  values
    (p_fingerprint, p_message, p_stack, p_kind, p_path, p_user_agent, p_app_build)
  on conflict (fingerprint) do update set
    count = client_errors.count + 1,
    last_seen_at = now(),
    -- 가장 최근 발생을 기준으로 갱신한다. 어느 화면에서, 어느 빌드에서 나는지가
    -- 시간이 지나면서 바뀌는데, 첫 발생 때 값만 들고 있으면 이미 옮겨간 고장을
    -- 옛 자리에서 찾게 된다.
    stack = excluded.stack,
    path = excluded.path,
    user_agent = excluded.user_agent,
    app_build = excluded.app_build,
    -- 처리했다고 표시한 오류가 또 나면 다시 열어야 한다 — 안 그러면 "고쳤다"고
    -- 적어둔 채로 계속 나고 있는데 목록에서는 안 보인다.
    -- 다만 "무시"는 사람이 "이건 우리가 어쩔 수 없다"고 판단한 것이라 그대로 둔다
    -- (브라우저 확장, 크롤러 봇이 던지는 것들).
    status = case when client_errors.status = 'ignored' then 'ignored' else 'open' end;
end;
$$;

revoke all on function public.record_client_error(text, text, text, text, text, text, text)
  from public, anon, authenticated;
