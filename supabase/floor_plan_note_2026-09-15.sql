-- 부스 배치도 공개 상태 메모 (2026-09-15)
-- Supabase 대시보드 > SQL Editor 에서 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 왜 booth_info_note로 충분하지 않은가
--   지금은 "참가 부스 목록"과 "부스 배치도"가 booth_info_note 한 칸에 섞여 있다.
--   실제로 두 값은 따로 논다 —
--     코믹월드: 참가 동아리는 comicw.net에 상시 공개, 배치도만 행사 임박 시 공개
--     지스타  : 둘 다 미공개지만 공개되는 페이지가 서로 다르다
--   그래서 화면에서 "부스 목록은 있는데 배치도 자리가 왜 비었나"를 설명할 수 없었다.
--   floor_plan_url이 null이면 그냥 아무것도 안 그리고 끝이었기 때문이다.
--
-- 값 규칙 — booth_info_note·stage_info_note와 동일하게 맞춘다.
--   '미공개'   : 주최가 공식적으로 배치도를 내지 않는 행사
--   그 외 문구 : 공개 예정 시점·위치 안내 ("행사 2~3주 전 gstar.or.kr에 공개")
--   null       : 아직 확인하지 못함 → 화면에 아무것도 그리지 않는다(지금과 같음)
--
-- floor_plan_url이 채워지면 이 메모는 화면에서 자동으로 물러난다(이미지가 이긴다).
-- 값을 지울 필요가 없으므로, 다음 회차에 다시 비어도 안내가 그대로 되살아난다.

alter table public.events
  add column if not exists floor_plan_note text;

comment on column public.events.floor_plan_note is
  '부스 배치도 공개 상태 메모 (자유 텍스트). "미공개" 또는 공개 예정 시점·위치 안내.
   floor_plan_url이 비어 있을 때 배치도 자리에 대신 표시한다.';
