-- 중복 들어간 창작자 부스 정리 (2026-09-16)
-- Supabase 대시보드 > SQL Editor 에서 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 무슨 일이 있었나
--   comicw.net 부스컷 페이지는 요일 패널(첫날/둘째날) 둘로 나뉘어 있고, 양일 참가
--   동아리는 양쪽에 모두 실린다. 첫 수집기(comicworld-booths.mjs)가 그걸 모르고
--   카드 하나당 한 행씩 넣어서, 같은 동아리가 두 번 들어갔다.
--
--   2026-09-16 확인: 337회 64칸 중 27칸, 338회 103칸 중 44칸이 같은 동아리였다.
--   첫 실행에서 171행이 들어갔는데 그중 70행 남짓이 중복이다.
--
--   수집기는 고쳤다(data-itid로 묶는다). 이미 들어간 행은 여기서 지운다.
--
-- 무엇을 남기나
--   같은 행사·같은 이름 중에서 부스 번호가 있는 행을 먼저, 그다음 먼저 만들어진 행을
--   남긴다. 번호는 나중에 배정되므로 한쪽에만 붙어 있을 수 있는데, 그때 번호 없는 쪽을
--   남기면 애써 받아둔 번호를 잃는다.
--
--   operator='creator'만 건드린다. 기업·주최 부스는 사람이 넣은 것이라 이름이 겹쳐도
--   그럴 만한 이유가 있을 수 있고, 자동 수집이 만든 문제가 아니다.

with ranked as (
  select
    id,
    row_number() over (
      partition by event_id, name
      order by (booth_no is null), created_at, id
    ) as rn
  from public.event_booths
  where operator = 'creator'
)
delete from public.event_booths b
using ranked r
where b.id = r.id
  and r.rn > 1;

-- 같은 일이 다시 일어나지 않게 제약을 건다.
--
-- 수집기가 고쳐졌어도 제약이 있으면 "조용히 중복"이 아니라 "저장 실패"가 되어 바로 드러난다.
-- 부분 인덱스로 creator에만 건다 — 기업·주최 부스는 같은 이름이 둘 있을 수 있다
-- (예: 같은 브랜드가 홀을 나눠 두 곳에 부스를 내는 경우).
create unique index if not exists event_booths_creator_name_uniq
  on public.event_booths(event_id, name)
  where operator = 'creator';
