-- 호요랜드 2026 지도 좌표 채우기 (2026-09-14)
--
-- 등록 시점에 venue_address가 비어 있어서 자동 좌표 조회가 실패했고, 그 조회는 draft를
-- 처음 승인할 때 한 번만 돌기 때문에 좌표가 계속 null로 남아 상세 화면에 지도가 안 떴다.
-- (재조회 로직은 crawler/src/known-events.mjs에 추가했다 — 다음 크롤부터는 자동 복구된다.
--  이 파일은 다음 크롤을 기다리지 않고 지금 바로 고치고 싶을 때 쓴다.)
--
-- 좌표는 KINTEX 제2전시장(킨텍스로 217-59). 제1전시장과 613m 떨어진 별개 건물이다.
-- 검증: OpenStreetMap의 "한국국제전시장 1전시장" 값이 이 프로젝트가 쓰는 제1전시장
--       좌표(네이버 지역검색 유래)와 45m 이내로 일치 — 같은 데이터셋의 2전시장 값을 신뢰.

update public.events
set venue_lat = 37.6647381,
    venue_lng = 126.7418699,
    venue_address = coalesce(venue_address, '경기도 고양시 일산서구 킨텍스로 217-59')
where title = '호요랜드 2026'
  and start_date = date '2026-10-02'
  and venue_lat is null      -- 이미 좌표가 있으면 건드리지 않는다
  and admin_edited_at is null;
