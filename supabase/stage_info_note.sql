-- 무대 프로그램 공개 상태 메모 마이그레이션
-- Supabase 대시보드 > SQL Editor 에서 실행하세요.
--
-- booth_info_note와 같은 방식(자유 텍스트) — 다만 대상이 다르다.
-- booth_info_note: 참가업체/부스/굿즈(누가 뭘 파는지)
-- stage_info_note: 무대 프로그램(콘서트/토크쇼/코스프레 경연 등 시간표)
-- 코스앤코믹처럼 부스는 미공개인데 무대 라인업은 공개하는 행사가 있어서 컬럼을
-- 분리한다 — 하나로 합치면 그런 차이를 표현할 수 없다.

alter table public.events
  add column if not exists stage_info_note text;

comment on column public.events.stage_info_note is
  '무대 프로그램(공연·토크쇼·경연 등) 공개 상태 메모 (자유 텍스트).
   "미공개" 또는 예상 공개 시점 안내. event_performers가 비어있을 때 대신 표시.';
