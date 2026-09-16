-- event_drafts 접근을 service_role 전용으로 되돌린다 (2026-09-16)
-- Supabase 대시보드 > SQL Editor 에서 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 왜 지우나
--   event_drafts_admin_policies.sql이 이런 정책 두 개를 두고 있었다.
--
--     using ((auth.jwt() ->> 'email') = 'asdeasdxz12654@gmail.com')
--
--   검수 화면(/admin/drafts)이 브라우저에서 Supabase를 직접 부르던 시절의 장치다.
--   그래서 이 화면 하나만 구글 로그인이 따로 필요했다 — 사이트의 나머지 관리 기능은
--   전부 Worker의 관리자 코드를 쓰는데도.
--
--   두 로그인이 따로 놀면서 고약한 실패가 생겼다. RLS는 권한이 없을 때 에러가 아니라
--   **빈 배열**을 준다. 관리자 코드로만 로그인한 상태에서 검수 화면은 오류 하나 없이
--   "검수할 기사가 없습니다"라고 말했다. "없는 것"과 "못 보는 것"이 화면에서 같아 보였다.
--
--   이제 이 화면도 Worker(service_role)를 거친다. 브라우저가 event_drafts를 직접 볼
--   이유가 사라졌으므로, 이메일을 하드코딩한 정책도 같이 걷어낸다.
--   (정책을 남겨두면 "지금도 구글 로그인이 필요한가?"를 다음 사람이 다시 따져봐야 한다.)
--
-- 되돌리려면 supabase/event_drafts_admin_policies.sql을 다시 실행하면 된다.

drop policy if exists "admin can read all drafts" on public.event_drafts;
drop policy if exists "admin can update drafts" on public.event_drafts;

-- RLS는 켜진 채로 둔다. 정책이 하나도 없으면 anon/authenticated는 전부 막히고
-- service_role만 통과한다 — 다른 모든 테이블의 쓰기와 같은 상태다.
alter table public.event_drafts enable row level security;

-- 확인용. 여기서 0이 나와야 한다.
do $$
declare n int;
begin
  select count(*) into n from pg_policies
  where schemaname = 'public' and tablename = 'event_drafts';
  raise notice 'event_drafts에 남은 정책 % 개 (0이어야 정상)', n;
end $$;
