-- 일회성 데이터 정정 (2026-09-09, 2차)
-- supabase/performers_and_booth_notes.sql을 먼저 실행한 뒤 이 파일을 실행하세요
-- (event_performers 테이블·booth_info_note 컬럼이 먼저 있어야 함).
-- 대상 행사들은 known-events.mjs가 아니라 뉴스 크롤러로 들어온 행사라 크롤러
-- 동기화 대상이 아님 — 직접 채워 넣는다.

-- 1. 호요랜드2026: 게임 라인업(5종)만 확정, 부스·굿즈 정보는 아직 미공개.
update public.events
set booth_info_note = '게임 라인업(붕괴3rd·원신·미해결사건부·붕괴:스타레일·젠레스 존 제로)만 확정, 부스·굿즈 정보는 미공개 (2차 창작 전시 선정결과 9/15 발표, 10월 초 상세 공개 예상)'
where id = 'nd-20260903-7ae385'
  and admin_edited_at is null;

-- 2. 포켓몬 메가페스타 2026: 이미 개장해 부스 구성이 공식 페이지에 공개돼 있음 —
--    확인된 실제 부스/존 정보를 채워 넣는다. (id가 uuid라 중복 방지 제약이 없으므로
--    이 INSERT는 한 번만 실행할 것 — 두 번 돌리면 그대로 중복 삽입됨)
insert into public.event_booths (event_id, name, booth_no, goods, sort_order)
values
  ('nd-20260903-f50362', 'Pokémon Pokopia 체험존', null, '포켓몬 포코피아 테마 체험', 0),
  ('nd-20260903-f50362', '라플레시아의 보물 창고', null, null, 1),
  ('nd-20260903-f50362', '팬텀의 숲속 오두막', null, null, 2),
  ('nd-20260903-f50362', '이브이의 비밀 산책로', null, null, 3),
  ('nd-20260903-f50362', '메타몽 놀이터', null, null, 4),
  ('nd-20260903-f50362', '피카츄 캠핑빌리지', null, '포토존', 5),
  ('nd-20260903-f50362', '가챠존', null, '가챠(캡슐토이) 상품 판매', 6),
  ('nd-20260903-f50362', '포켓몬 힐링 포레스트 스토어 / 스토어존', null, '포켓몬 오리지널 상품, 30주년 기념 굿즈 판매', 7);

-- 3. WONDERLIVET 2026: 42팀 전체 라인업은 8/29 공개됐지만 세트리스트(부르는 곡)는
--    미공개 — songs를 null로 둬서 상세페이지에 "세트리스트 미공개"로 뜨게 한다.
--    주요 헤드라이너만 우선 등록 (전체 42팀은 관리자 화면에서 추가 가능).
insert into public.event_performers (event_id, artist_name, songs, sort_order)
values
  ('nd-20260906-4d974d', 'THE ORAL CIGARETTES', null, 0),
  ('nd-20260906-4d974d', '[Alexandros]', null, 1),
  ('nd-20260906-4d974d', 'YUZU (유즈)', null, 2),
  ('nd-20260906-4d974d', 'SUKIMASWITCH (스키마스위치)', null, 3),
  ('nd-20260906-4d974d', 'Ai Otsuka (오오츠카 아이)', null, 4),
  ('nd-20260906-4d974d', 'SAMBOMASTER (샌보마스터)', null, 5),
  ('nd-20260906-4d974d', 'FREDERIC (프레데릭)', null, 6),
  ('nd-20260906-4d974d', 'indigo la End', null, 7),
  ('nd-20260906-4d974d', '星街すいせい Hoshimachi Suisei (호시마치 스이세이)', null, 8),
  ('nd-20260906-4d974d', 'Kuromi (쿠로미, 국내 첫 라이브)', null, 9),
  ('nd-20260906-4d974d', '한로로', null, 10),
  ('nd-20260906-4d974d', 'Nel (넬)', null, 11),
  ('nd-20260906-4d974d', 'Thorn Apple', null, 12);
