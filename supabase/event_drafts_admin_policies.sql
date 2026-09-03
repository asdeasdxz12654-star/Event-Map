-- event_drafts에 대한 관리자 검수 페이지(앱 내 /admin/drafts) 접근 정책.
-- event_drafts.sql은 기본적으로 RLS를 켜고 정책을 하나도 만들지 않아 anon/authenticated는
-- 전부 막혀있다 (service_role만 접근). 이 파일은 그 위에 "관리자 이메일 한 명"만 읽기/수정할
-- 수 있는 정책을 추가한다. Supabase 대시보드 > SQL Editor에서 실행하세요.
--
-- 관리자 이메일: asdeasdxz12654@gmail.com (프론트엔드 VITE_ADMIN_EMAIL과 반드시 같은 값이어야 함).
--
-- promote_event_draft() 트리거(event_drafts.sql)는 security definer로 실행되므로, 관리자가
-- authenticated 세션으로 status를 'approved'로 바꿔도 events 테이블 insert는 정상적으로
-- 동작합니다 (트리거 자체는 수정할 필요 없음).

drop policy if exists "admin can read all drafts" on public.event_drafts;
create policy "admin can read all drafts"
  on public.event_drafts for select
  using ((auth.jwt() ->> 'email') = 'asdeasdxz12654@gmail.com');

drop policy if exists "admin can update drafts" on public.event_drafts;
create policy "admin can update drafts"
  on public.event_drafts for update
  using ((auth.jwt() ->> 'email') = 'asdeasdxz12654@gmail.com');
