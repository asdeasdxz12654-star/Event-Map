-- push_subscriptions.user_agent 길이 제한이 실제로는 안 걸려 있던 것 수정 (2026-09-10)
-- Supabase 대시보드 > SQL Editor 에서 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 무엇이 문제였나
--   push_subscriptions_hardening.sql은 길이 제한을 이렇게 걸려고 했다:
--     alter table public.push_subscriptions
--       add column if not exists user_agent text check (char_length(user_agent) <= 500);
--   그런데 user_agent 컬럼은 push_subscriptions.sql에서 이미 만들어져 있었다. "add column
--   if not exists"는 컬럼이 있으면 그 문장 전체를 건너뛰기 때문에, 뒤에 붙인 check 제약도
--   같이 조용히 무시됐다. 즉 지금까지 길이 제한이 없는 상태였다 —
--   anon 키로 insert가 열려 있는 테이블이라(자기 기기 토큰 등록용) 아무 길이의 문자열을
--   넣을 수 있었다.
--
-- 제약을 컬럼 정의와 분리해서 따로 건다. not valid로 먼저 붙여 기존 행 검사 때문에
-- 실패하지 않게 하고, 길이를 넘는 기존 값이 있으면 잘라낸 뒤 검증한다.

-- 이미 500자를 넘긴 값이 있으면 잘라둔다 (User-Agent는 앞부분만으로 충분히 식별된다).
update public.push_subscriptions
set user_agent = left(user_agent, 500)
where user_agent is not null and char_length(user_agent) > 500;

alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_user_agent_length;

alter table public.push_subscriptions
  add constraint push_subscriptions_user_agent_length
  check (user_agent is null or char_length(user_agent) <= 500) not valid;

alter table public.push_subscriptions
  validate constraint push_subscriptions_user_agent_length;

-- 확인용:
-- select conname, pg_get_constraintdef(oid) from pg_constraint
-- where conrelid = 'public.push_subscriptions'::regclass and contype = 'c';
