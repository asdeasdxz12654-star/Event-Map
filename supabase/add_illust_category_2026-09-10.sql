-- 카테고리에 '일러스트' 추가 (2026-09-10)
-- Supabase 대시보드 > SQL Editor 에서 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 왜 필요한가
--   서브컬처 행사일정을 훑어보니 일러스트레이션페어·문구전·캐릭터페어 같은 행사가
--   꾸준히 열리는데, 지금 카테고리(게임전시·코스프레·게임음악) 어디에도 맞지 않는다.
--   억지로 코스프레나 게임전시로 넣으면 필터가 의미를 잃으므로 카테고리를 하나 늘린다.
--
--   events.category에는 CHECK 제약이 걸려 있어서, 새 값을 쓰려면 이 마이그레이션을
--   먼저 실행해야 한다. 실행 전에 크롤러가 '일러스트'로 넣으려 하면 그 행만 실패한다
--   (promote_event_draft 트리거가 예외를 잡아 해당 draft만 rejected 처리한다).

alter table public.events
  drop constraint if exists events_category_check;

alter table public.events
  add constraint events_category_check
  check (category in ('게임전시', '코스프레', '게임음악', '일러스트'));

-- 확인용:
-- select conname, pg_get_constraintdef(oid) from pg_constraint
-- where conrelid = 'public.events'::regclass and contype = 'c';
