-- 공식 포스터 일괄 반영 (2026-09-10)
-- Supabase 대시보드 > SQL Editor 에서 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 아래 이미지는 모두 직접 내려받아 눈으로 확인했다. 각 주석의 괄호 안이 포스터에
-- 인쇄된 회차·날짜·장소이며, DB의 start_date와 일치하는 것까지 확인한 값이다.
--
-- admin_edited_at을 함께 찍는 이유
--   크롤러와 검증 스크립트는 admin_edited_at이 있는 행을 건드리지 않는다. 사람이
--   확인한 공식 포스터가 나중에 자동 검증에 걸려 지워지는 일을 막기 위해 같이 찍는다.
--   (특히 포켓몬 메가페스타는 인벤 CDN 경로라 "기사 이미지" 규칙에 걸릴 수 있다)

-- WONDERLIVET 2026 (포스터: 11.20~22, KINTEX HALL 7/8/9/10, 주최 LIVET·WANDERLOCH)
update public.events set
  poster_url = 'https://talkimg.imbc.com/TVianUpload/tvian/TViews/image/2026/08/21/9ded7147-07d6-47b3-a97d-0aedbeb4daf7.jpg',
  admin_edited_at = now()
where id = 'nd-20260906-4d974d';

-- 코믹월드 336 일산 (포스터: 336회, 2026.9.12-13, 일산 킨텍스 제1전시장) — 킨텍스 공식 게시물
-- 주의: 원본이 4996x7052 PNG(약 7MB)라 카드 로딩이 무겁다. 더 가벼운 공식 이미지를
--       찾으면 교체할 것.
update public.events set
  poster_url = 'https://www.kintex.com/imageView.do?atchmnflNo=469332&fileseq=1',
  admin_edited_at = now()
where id = 'nd-20260906-0e02b4';

-- 코믹월드 337 울산 (포스터: 337회, 2026.10.3-4, 울산 유에코(UECO)) — UECO 공식 사이트
update public.events set
  poster_url = 'https://ueco.or.kr/data/upload/event/964/0146698e-7bfa-4041-984f-66d6406f9b64_%EC%82%AC%EB%B3%B8%20-%EC%BD%94%EB%AF%B9%EC%9B%94%EB%93%9C%20337%20%EC%9A%B8%EC%82%B0_%ED%8F%AC%EC%8A%A4%ED%84%B0_1080x1920.jpg',
  admin_edited_at = now()
where id = 'nd-20260906-951013';

-- 코믹월드 338 수원 (포스터: 338회, 2026.10.24-25, 수원메쎄 전관) — 코믹월드 공식(comicw.net)
update public.events set
  poster_url = 'https://comicw.net/data/item/1788916238/thumb-338_7IiY7JuQ_7J6E7Iuc7Ys7Iqk7YSw_600x600.jpg',
  admin_edited_at = now()
where id = 'nd-20260906-bcf8ac';

-- BIAF 2026 (포스터: 제28회 BIAF 부천국제애니메이션페스티벌) — biaf.or.kr 공식
update public.events set
  poster_url = 'https://biaf.or.kr/__upload/user/Lma5aff75/size_1778717143_7381.jpg',
  admin_edited_at = now()
where id = 'nd-20260906-527d2c';

-- 제94회 코스앤코믹 페스티벌 (포스터: 94회, 2026.9.19~9.20, 서울랜드)
update public.events set
  poster_url = 'https://pbs.twimg.com/media/HMI53ntaAAAOpC4.jpg',
  admin_edited_at = now()
where id = 'nd-20260906-95522b';

-- 포켓몬 메가페스타 2026 (키비주얼: "포켓몬 메가 페스타 2026 / 피카츄의 가을 나들이",
-- 포켓몬 30주년 로고) — 공식 키비주얼이지만 인벤 CDN 경로다
update public.events set
  poster_url = 'https://static.inven.co.kr/column/2026/09/03/news/i1786388111.jpg',
  admin_edited_at = now()
where id = 'nd-20260903-f50362';

-- 야마다 료스케 내한공연 (포스터: RYOSUKE YAMADA ASIA TOUR 2026 Red.Y, 9.13 SEOUL 장충체육관)
update public.events set
  poster_url = 'https://news.nateimg.co.kr/orgImg/my/2026/05/12/2026051213084584530_l.jpg',
  admin_edited_at = now()
where id = 'nd-20260904-41f8bc';

-- 일러스타 페스 14는 넣지 않았다.
--   받은 링크(encrypted-tbn0.gstatic.com/...)는 구글 이미지 캐시 썸네일로 194x259밖에
--   안 되고(카드에서 뭉개짐) 구글 캐시 URL이라 언제든 만료된다. 포스터 내용 자체는
--   맞다("일러스타 페스 14 × 초VOCA STAR 3, 2026.10.10-11, 일산 KINTEX 제1전시장").
--   공식 사이트(illustar.net)가 SPA라 이미지 주소를 얻지 못했다 — 공식 X 게시물이나
--   사이트에서 원본 주소를 확보하면 그때 넣는다. 그 전까지는 "공식 포스터 미정"으로 표시된다.

-- 확인용:
-- select id, title, start_date, poster_url is not null as has_poster, admin_edited_at
-- from public.events where start_date >= '2026-01-01' order by start_date;
