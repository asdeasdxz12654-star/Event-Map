-- 제95회 코스앤코믹 페스티벌의 공식 포스터 복구.
-- Supabase 대시보드 > SQL Editor 에서 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 무슨 일이 있었나
--   이 이미지는 실제로 95회 공식 포스터가 맞다(포스터에 "95회", "2026년 10월 17일~18일",
--   서울랜드 로고가 찍혀 있다). 그런데 크롤러가 같은 상수를 94회에도 함께 쓰고 있었고,
--   검증 스크립트가 "여러 행사가 공유하는 이미지 = 개별 포스터 아님" 규칙으로 두 건 모두
--   비워버렸다. 94회에서 지운 건 맞지만 95회는 원래 자기 포스터였다.
--   크롤러 쪽은 회차별 포스터만 넣도록 고쳤고(known-events.mjs), 이미 비워진 값은
--   자동으로 되돌아오지 않으므로 여기서 직접 넣는다.
--
-- 94회는 그대로 비워둔다 — 그 회차의 공식 포스터를 아직 확보하지 못했다.
-- (포스터가 없으면 카테고리 기본 이미지가 표시된다)

update public.events
set poster_url = 'https://pbs.twimg.com/media/HOo8nV4bUAAdTNo?format=webp&name=medium'
where id = 'nd-20260906-460cf0' -- 제95회 코스앤코믹 페스티벌 (2026-10-17)
  and admin_edited_at is null;

-- 확인용:
-- select id, title, start_date, poster_url from public.events
-- where title like '%코스앤코믹%' order by start_date;
