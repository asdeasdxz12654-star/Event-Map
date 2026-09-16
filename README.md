# 게임이벤트허브

국내 게임·코스프레·게임음악·일러스트 행사를 한곳에 모으는 사이트.

행사 정보는 크롤러가 매일 모아 오고, 사람이 검수해 게시한다. 부스·굿즈·무대 시간표·
코스어처럼 공식이 나중에 발표하는 것들은 관리자가 직접 채운다.

```
https://event-map.pages.dev              (주 주소)
https://asdeasdxz12654-star.github.io/Event-Map/   (미러)
```

## 무엇으로 되어 있나

| | |
|---|---|
| 프론트엔드 | React 19 · Vite 8 · Tailwind v4 · react-router 7 · PWA |
| 데이터 | Supabase (PostgREST + Realtime + Storage) |
| 쓰기 API | Cloudflare Worker (`workers/api-proxy`) |
| 수집 | GitHub Actions + Node 크롤러 (`crawler/`) |
| 알림 | Firebase Cloud Messaging (`notifier/`) |
| 배포 | Cloudflare Pages (주) · GitHub Pages (미러) |

**읽기는 브라우저가 Supabase를 직접 부르고(anon 키 + RLS), 쓰기는 전부 Worker를 거친다.**
service_role 키는 Worker와 크롤러에만 있고 브라우저 번들에는 들어가지 않는다.

## 폴더

```
src/                프론트엔드
  pages/            홈 · 달력 · 북마크 · 행사 상세
  pages/admin/      관리자 (대시보드 · 행사 · 검수 · 소스 감시)
  components/       화면 조각
  hooks/            Supabase 조회 + 실시간 구독
  lib/              순수 함수 (부스 분류 · 탭 구성 · 이미지 자르기 · 페이징)
workers/api-proxy/  관리자 쓰기 API · 서울시 혼잡도 프록시
crawler/            행사 수집 · 포스터 · 부스 · 소스 감시
notifier/           푸시 알림 발송
functions/          Cloudflare Pages Functions (행사별 링크 미리보기)
supabase/           마이그레이션 SQL (대시보드에서 손으로 실행)
scripts/            빌드 보조 (SPA 폴백 · 아이콘 · 비밀번호 해시)
```

## 개발

```bash
npm install
cp .env.example .env     # Supabase URL·anon 키 등을 채운다
npm run dev
```

```bash
npm run build            # vite build + GitHub Pages용 404.html 복사
npm run lint             # oxlint
```

`npm run build`의 뒷단계(`scripts/copy-spa-fallback.mjs`)가 중요하다 —
`GITHUB_PAGES=true`일 때만 `dist/404.html`을 만든다. Cloudflare에서는 그 파일이 있으면
`public/_redirects`의 `/* /index.html 200`이 무시돼 딥링크가 404로 응답한다.
그래서 **`npx vite build`로만 빌드하면 GitHub Pages 배포가 깨진다.**

## 데이터베이스

마이그레이션은 `supabase/*.sql`이고 **Supabase 대시보드 SQL Editor에서 손으로 실행**한다.
전부 여러 번 실행해도 안전하게 쓰여 있다(`if not exists` / `drop ... if exists`).

⚠️ **옛 파일을 다시 실행하면 안 된다.** `promote_event_draft()`를 여러 파일이 재정의해서,
오래된 파일을 나중에 돌리면 함수가 구버전으로 되돌아간다. 실제로 한 번 일어났고
`supabase/fix_promote_trigger_2026-09-16.sql`이 복구한 이력이 있다.

주요 테이블: `events` · `event_booths` · `event_booth_items` · `event_stages` ·
`event_stage_slots` · `event_cosplayers` · `event_tabs` · `event_drafts` · `source_watches`

## 자동 실행 (GitHub Actions)

| 워크플로 | 주기(KST) | 하는 일 |
|---|---|---|
| `crawl-news` | 매일 06:00 | 뉴스·공식 소스에서 행사 수집 → `event_drafts` |
| `mirror-images` | 매일 06:30 | 외부 이미지를 우리 저장소 사본으로 |
| `send-notifications` | 매일 07:00 | 예매 오픈일·행사 전날 푸시 |
| `watch-sources` | 매일 07:00 | 공식 사이트 변경 감지 + 코믹월드 부스 |
| `fill-posters` | 월요일 07:30 | 포스터·공식 사이트 채우기 |
| `verify-event-data` | 수동 | 포스터·좌표 검증, 주최·장소 보수 |
| `deploy` | master push | GitHub Pages 배포 |

Cloudflare Pages는 대시보드 깃 연동으로 자동 빌드된다(워크플로 없음).

## 관리자

사이트 우상단 ⚙ → 관리자 → 코드 입력. 로그인하면 두 가지가 켜진다.

- **인라인 편집** — 보고 있는 화면에서 바로 고친다(행사·부스·굿즈·무대·코스어)
- **`/admin`** — 대시보드(빈 자리·중복 의심) · 행사 표 · 검수 · 소스 감시

행사 편집(`/admin/events/:id`)에는 탭 구성과 **긴 배너에서 굿즈 사진 잘라내기**가 있다.
공식이 굿즈를 1200×42,500px 같은 긴 이미지 한 장으로만 올리는 경우가 많아서다.

## 설계에서 지키는 것

- **자동으로 값을 만들어 내지 않는다.** 이미지 속 가격표·시간표를 모델로 읽는 건 한 번
  틀린 값을 만들어 본 방법이다. 감지와 수집까지만 자동이고, 읽는 일은 사람이 한다.
- **"없음"과 "미공개"와 "못 찾음"을 구분해 적는다**(`DisclosureNote`).
- **주소는 네 겹으로 거른다** — 크롤러 · Worker · DB CHECK · 렌더 직전.
  `javascript:` 같은 값이 링크가 되지 않게.
- 관리자가 직접 고친 행사는 크롤러가 건너뛴다(`admin_edited_at`). 어드민에서 다시 켤 수 있다.
