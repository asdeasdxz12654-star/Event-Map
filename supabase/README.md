# supabase/ — 마이그레이션

Supabase 대시보드의 **SQL Editor에서 손으로 실행**한다. CLI도 마이그레이션 표도 쓰지
않는다. 규모가 작아서 그 편이 빨랐고, 지금도 그 판단은 유효하다.

다만 대가가 하나 있다 — **어떤 파일이 실행됐는지 아무 데도 안 적혀 있다.**
그래서 "DB에 지금 무엇이 들어 있나"는 파일이 아니라 DB에게 물어봐야 한다.

## 실행 순서

파일 이름에 날짜가 있으면 날짜순, 없으면 그게 더 오래된 것이다(초기 스키마).
새 환경을 처음 세운다면:

```
schema.sql                     테이블·RLS의 뼈대
event_drafts.sql               검수 큐
push_subscriptions.sql         알림 토큰
storage.sql                    이미지 버킷
그다음 날짜 있는 파일들을 오래된 것부터
마지막에  functions/*.sql
```

`functions/` 아래는 날짜가 없다. **언제나 마지막에, 항상 최신본을 실행**한다.

## functions/ — 정의가 하나뿐인 것들

```
functions/promote_event_draft.sql
```

이 폴더가 생긴 이유가 있다. `promote_event_draft()`가 **아홉 개 파일에 흩어져**
있었고, 그중 하나(`dedupe_events_by_title_2026-09-16.sql`)가 중복 판정만 새로 쓰고
나머지를 옮겨 적지 않았다. 그래서 한 번에 넷이 사라졌다.

- `set search_path` 고정 — security definer 함수에서 빠지면 남의 함수가 실행될 수 있다
- `safe_url()` — LLM이 만든 주소가 걸러지지 않고 들어간다
- 예외 → `rejected` + 사유 — 승인 UPDATE 전체가 raw 에러로 터진다
- `ticket_open_time` · `ticket_open_note` — 크롤러가 뽑아둔 값이 조용히 버려진다

**화면에는 아무 변화가 없었다.** 승인이 터지고 나서야 알았다.

그래서 이 함수의 정의는 `functions/` 아래 하나뿐이고, 옛 파일 아홉 개에는 여는 순간
보이도록 경고를 달아뒀다. 그 파일들은 "그때 무슨 일이 있었나"의 기록으로만 둔다.

## 지금 DB에 무엇이 살아 있나

```sql
-- 승격 트리거 버전
select obj_description('public.promote_event_draft()'::regprocedure) as 버전;

-- 있어야 할 함수가 다 있는가
select p.proname, obj_description(p.oid) as 설명
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname;

-- 있어야 할 표가 다 있는가
select tablename, rowsecurity as "RLS 켜짐"
from pg_tables where schemaname = 'public' order by tablename;
```

마지막 쿼리의 `RLS 켜짐`이 하나라도 `false`면 그 표는 anon 키로 통째로 읽힌다.
전부 `true`여야 한다.

## 보관 기간

개인정보처리방침(`/privacy`)에 적은 값이 실제로 지켜지는 자리다.

| 무엇 | 얼마나 | 어디서 |
|---|---|---|
| 푸시 토큰 | 마지막 발송 90일 | `cleanup_stale_push_tokens()` |
| 자동 작업 기록 | 90일 | `prune_job_runs()` |
| 방문자 오류 | 90일 | `prune_client_errors()` |
| 제보 연락처 | 처리 후 1년 | `clear_old_report_contacts()` |

넷을 `prune_old_data()`가 한 번에 부르고, 그걸 `shared/job-run.mjs`가 자동 작업이
끝날 때 가끔(20번에 한 번) 부른다. 정리 전용 워크플로를 따로 두지 않는 이유는,
그것이 멈췄는지 또 감시해야 하기 때문이다.

직접 돌려보려면:

```sql
select public.prune_old_data();
```

## 새 마이그레이션을 쓸 때

- 파일 이름에 날짜를 넣는다 — `무엇_YYYY-MM-DD.sql`
- **여러 번 실행해도 안전하게** 쓴다 (`if not exists`, `create or replace`,
  이미 정리된 경우를 확인하고 `return`). 손으로 실행하는 구조라 같은 파일을 두 번
  돌리는 일이 실제로 생긴다.
- 파일 맨 위에 "무슨 일이 있었나"를 적는다. 이 폴더의 파일 절반은 사고 기록이고,
  그 기록이 다음 사람(대개 몇 달 뒤의 자신)에게 가장 쓸모 있었다.
- 이미 있는 함수를 고칠 일이면 **그 함수의 정의가 어디 있는지 먼저 찾는다.**
  `functions/` 아래 있으면 거기를 고치고, 이 파일에서 다시 정의하지 않는다.
