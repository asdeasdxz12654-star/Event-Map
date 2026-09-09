-- 일회성 데이터 정정 (2026-09-09)
-- Supabase 대시보드 > SQL Editor 에서 실행하세요.

-- 1. "지스타 2026" 팝업스토어(현대백화점 판교점, 9/1~6) 행이 본 행사(11월 BEXCO)와
--    제목이 같아서 헷갈리고, 입장료도 본 행사 BTC 티켓 가격이 잘못 들어가 있었음.
--    팝업스토어 자체는 무료 입장이고, '스페셜 패스'는 현장 판매 상품 가격임.
update public.events
set
  title = '지스타 2026 팝업스토어 (현대백화점 판교점)',
  admission_fee = '무료 입장 (스페셜 패스 판매: 일반 20,000원 / 청소년 10,000원)'
where id = 'nd-20260903-f21b0b'
  and admin_edited_at is null;

-- 2. "WONDERLIVET (원더리벳)"이 "WONDERLIVET 2026"과 같은 행사의 중복 행이었음.
--    "WONDERLIVET 2026"이 정본이므로 중복 행을 삭제. event_drafts의 FK부터 해제.
update public.event_drafts
set promoted_event_id = null
where promoted_event_id = 'nd-20260906-34a935';

delete from public.events
where id = 'nd-20260906-34a935';
