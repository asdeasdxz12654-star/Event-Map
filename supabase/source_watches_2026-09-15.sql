-- 공식 소스 감시 상태 (2026-09-15)
-- Supabase 대시보드 > SQL Editor 에서 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 왜
--   부스·무대·굿즈·배치도는 전부 손으로 넣어야 하는데, "언제 올라오는지"를 아무도
--   알려주지 않는다. 지스타 배치도는 행사 2~3주 전에, 일러스타페스는 1~2주 전에,
--   코믹월드 배치도는 회차 임박해서 올라온다. 사람이 매일 여섯 사이트를 열어볼 수는 없다.
--
--   그래서 "값을 자동으로 채우는" 대신 "올라온 걸 알아채는" 일만 기계에 맡긴다.
--   틀려도 손해가 헛걸음 한 번이라, 자동으로 해도 되는 유일한 단계다.
--   (감지 다음 단계인 "이미지에서 값 읽기"는 이 저장소가 이미 틀린 가격표를 만들어 본
--    방법이라 사람이 한다 — hoyoland_goods_2026-09-14.sql 주석 참고.)
--
-- 감시 대상 목록은 DB가 아니라 코드(crawler/src/source-watches.mjs)에 있다.
-- 여기 있는 건 "마지막에 본 내용이 무엇이었나"라는 상태뿐이다 — 정의를 양쪽에 두면
-- 동기화할 일이 생기고, 그건 이 크기의 문제에 비해 과하다.

create table if not exists public.source_watches (
  key             text primary key,   -- 코드에 박힌 고정 식별자
  label           text not null,      -- 화면에 보일 이름
  url             text not null,
  event_title     text,               -- 관련 행사 (표시용 느슨한 연결)
  -- 관심 있는 링크·이미지 주소만 모아 만든 해시. 페이지 전체를 해시하면 배너·광고·
  -- 조회수 때문에 매번 달라져서 "바뀌었다"가 의미를 잃는다.
  content_hash    text,
  -- 배치도 후보 이미지 [{ url, width, height }]. 자동으로 게시하지 않는다 —
  -- 틀린 배치도는 사람을 엉뚱한 홀로 보낸다. 관리자가 고르라고 모아둘 뿐이다.
  candidates      jsonb not null default '[]'::jsonb,
  last_checked_at timestamptz,
  last_changed_at timestamptz,
  -- 관리자가 "확인함"을 누른 시각. last_changed_at보다 뒤면 새 알림이 아니다.
  acknowledged_at timestamptz,
  last_error      text,
  created_at      timestamptz not null default now()
);

create index if not exists source_watches_changed_idx
  on public.source_watches(last_changed_at desc nulls last);

alter table public.source_watches enable row level security;

-- 공개 읽기 — 담긴 것이 공식 사이트 주소와 해시뿐이라 가릴 것이 없고,
-- 관리자 화면이 anon 키로 읽는다(event_booths 등과 같은 패턴).
drop policy if exists "source_watches are publicly readable" on public.source_watches;
create policy "source_watches are publicly readable"
  on public.source_watches for select using (true);
-- 쓰기 정책 없음 = anon 차단. 크롤러는 service_role, 관리자 "확인함"은 api-proxy Worker가 처리.

do $$
begin
  alter publication supabase_realtime add table public.source_watches;
exception when duplicate_object then null;
end $$;
