-- admin_edited_at 컬럼 추가 마이그레이션
-- Supabase 대시보드 > SQL Editor 에서 실행하세요.
--
-- 관리자가 화면에서 행사를 직접 수정하면 이 컬럼에 시각이 찍힌다.
-- known-events.mjs가 같은 행사를 다시 동기화(upsert)할 때, 이 컬럼이 채워진
-- 행은 절대 덮어쓰지 않는다 — 관리자의 수동 수정이 크롤러 값에 밀려서
-- 사라지는 걸 막기 위함.

alter table public.events
  add column if not exists admin_edited_at timestamptz;

comment on column public.events.admin_edited_at is
  '관리자가 마지막으로 수동 수정한 시각. null이면 크롤러(known-events.mjs)가
   최신 값으로 자유롭게 덮어써도 되는 행이라는 뜻.';
