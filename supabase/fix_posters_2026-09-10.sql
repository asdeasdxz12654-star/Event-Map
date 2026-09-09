-- 포스터 정정 (2026-09-10)
-- Supabase 대시보드 > SQL Editor 에서 실행하세요. 여러 번 실행해도 안전합니다.

-- 1) 제29회 부천국제만화축제 — 2026년 공식 포스터로 교체
--    기존 값은 2016년 제19회 포스터였다(서울신문 이미지 서버). 제목에 연도가 없는
--    행사라 연도 검사가 동작하지 않아 10년 전 포스터가 그대로 붙어 있었다.
--    아래 이미지는 부천시 공식 뉴스포털에 올라온 2026년 포스터로, 행사 기간
--    (2026.9.18~9.20, 한국만화박물관 일대)과 주최·주관 로고까지 확인했다.
update public.events
set poster_url = 'https://news.bucheon.go.kr/resource/attach/202608181028393138.jpg'
where id = 'nd-20260906-295551' -- 제29회 부천국제만화축제 (2026-09-18)
  and admin_edited_at is null;

-- 2) 지스타 2027 — 포스터 비움
--    내년 행사라 공식 포스터가 아직 없다. 검색으로 채우려다 GstarCAD 소프트웨어
--    패키지 사진이 붙었다. 해가 바뀌면 그때 채우면 되므로 지금은 비워둔다
--    (크롤러도 내년 이후 행사는 포스터를 검색하지 않도록 고쳤다).
update public.events
set poster_url = null
where id = 'nd-20260903-f5227b' -- 지스타 2027 (2027-11-18)
  and admin_edited_at is null;

-- 확인용:
-- select id, title, start_date, poster_url from public.events
-- where id in ('nd-20260906-295551', 'nd-20260903-f5227b');
