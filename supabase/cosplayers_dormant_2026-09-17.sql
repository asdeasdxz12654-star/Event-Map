-- cosplayers · cosplayer_events — 왜 비어 있는지 스키마에 적어둔다 (2026-09-17)
-- Supabase 대시보드 > SQL Editor 에서 실행하세요. 여러 번 실행해도 안전합니다.
-- 데이터를 건드리지 않습니다 — 설명만 붙입니다.
--
-- 무슨 일이 있었나
--   cosplayers.sql이 테이블·인덱스·트리거·RLS 정책 8개까지 전부 만들어 뒀는데,
--   저장소 어디에도 이 테이블을 읽거나 쓰는 코드가 없다(2026-09-17 전수 확인).
--   행도 0개다. 스키마만 보면 "쓰는 기능인데 데이터가 없는 것"처럼 보여서,
--   실제로 이번 점검에서 그렇게 오해했다.
--
-- 왜 아직 안 만들었나
--   이 표는 "코스어 본인이 가입해서 자기 프로필을 올리는" 디렉토리다. 그러려면
--   방문자 로그인이 필요한데(RLS가 auth.uid()를 본다), 지금 이 사이트에는 방문자
--   계정이 없다. 관리자 로그인 하나뿐이다.
--
--   더 근본적으로는, 관리자가 직접 넣는 코스어 명단(event_cosplayers)조차 0명이다.
--   화면·필터·타임라인 병합·입력 폼까지 다 만들어져 있는데 데이터가 없다.
--   그 1층이 비어 있는 상태에서 "본인 가입" 2층을 올릴 이유가 없다.
--
-- 지우지 않는 이유
--   되돌릴 수 없고, 급하지도 않다. 빈 테이블 두 개가 차지하는 비용은 사실상 0이다.
--   대신 다음에 스키마를 읽는 사람이 다시 헷갈리지 않게 설명을 붙인다.
--
-- 되살리려면 필요한 것
--   1) Supabase Authentication > Providers > Google 활성화
--   2) 방문자 로그인 화면 (예전 src/hooks/useAuth.js가 하던 일 — 관리자 로그인을
--      관리자 코드로 통일하면서 2026-09-16에 지웠다. git에 남아 있다)
--   3) 프로필 등록·수정 화면과 /cosplayers 목록
--   4) event_cosplayers.cosplayer_id 연결 (Worker SUB_RESOURCES 화이트리스트에도 추가)
--   5) 개인정보처리방침·탈퇴 안내 — 실명이 아니라도 활동명·SNS를 모으는 순간 필요하다

comment on table public.cosplayers is
  '[미사용 · 2026-09-17 확인] 코스어 본인 가입 디렉토리용. 방문자 로그인이 없어서 '
  '아직 아무 화면도 이 표를 쓰지 않고 행도 0개다. 관리자가 넣는 코스어 명단은 '
  'event_cosplayers 쪽이다. 되살리는 데 필요한 것은 supabase/cosplayers_dormant_2026-09-17.sql 참고.';

comment on table public.cosplayer_events is
  '[미사용 · 2026-09-17 확인] cosplayers와 한 벌. 행사별 참가 예정 연결용이지만 '
  '아직 쓰이지 않는다. 행사 상세에 나오는 코스어는 event_cosplayers에서 온다.';

comment on column public.event_cosplayers.cosplayer_id is
  '[항상 null · 2026-09-17 확인] 위 cosplayers 표와 잇기 위해 자리만 열어둔 컬럼. '
  'Worker의 허용 컬럼 목록에도 없어서 현재 API로는 값을 넣을 수 없다.';

-- 확인용 — 둘 다 0이어야 지금 설명과 맞는다.
do $$
declare a int; b int;
begin
  select count(*) into a from public.cosplayers;
  select count(*) into b from public.cosplayer_events;
  raise notice 'cosplayers % 행 / cosplayer_events % 행 (둘 다 0이어야 위 설명과 일치)', a, b;
end $$;
