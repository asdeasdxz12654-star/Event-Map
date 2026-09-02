-- ticket_status 컬럼 추가 마이그레이션
-- Supabase 대시보드 > SQL Editor 에서 실행하세요.
--
-- 매진 정보는 외부 API로 자동 수집이 어려워 수동 업데이트 방식을 채택합니다.
-- 업데이트 예시:
--   UPDATE public.events SET ticket_status = 'soldout' WHERE id = 'e1';
--   UPDATE public.events SET ticket_status = 'available' WHERE id = 'e2';

alter table public.events
  add column if not exists ticket_status text
    not null default 'unknown'
    check (ticket_status in ('available', 'soldout', 'unknown'));

comment on column public.events.ticket_status is
  'available: 예매 가능 | soldout: 매진 | unknown: 확인 불가 (기본값)';
