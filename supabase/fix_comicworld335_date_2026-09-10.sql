-- 코믹월드 335 개최일 정정 (2026-09-10)
-- Supabase 대시보드 > SQL Editor 에서 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 무슨 일이 있었나
--   DB에는 2026-09-15로 들어가 있어 "예정" 탭에 계속 남아 있었지만, 실제로는 이미
--   끝난 행사다. 회차 번호만 봐도 336 일산(9/12~13)보다 뒤 날짜일 수가 없다.
--   코믹월드 공식 행사일정(comicw.co.kr/c)에 "2026-08-15 코믹월드 335 일산"으로
--   올라와 있어 그 날짜로 맞춘다. 이틀 행사(토·일)라 종료일은 8/16으로 둔다.
--   장소는 기존 값(일산 킨텍스)이 공식 표기와 일치해 그대로 둔다.
--
--   뉴스 기사에서 날짜를 추출하는 크롤러 특성상 이런 오차가 생길 수 있어서,
--   앞으로는 공식 행사일정 페이지를 소스로 쓰는 쪽을 검토 중이다.

update public.events
set start_date = '2026-08-15',
    end_date   = '2026-08-16'
where id = 'nd-20260906-06e5cb' -- 코믹월드 335 (일산 킨텍스)
  and admin_edited_at is null;

-- 확인용:
-- select id, title, start_date, end_date, venue from public.events
-- where title like '코믹월드%' order by start_date;
