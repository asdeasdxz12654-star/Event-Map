-- event-images 버킷: 부스·굿즈·코스어·배치도 이미지 사본 (2026-09-15)
-- Supabase 대시보드 > SQL Editor 에서 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 왜 posters 버킷을 같이 쓰지 않는가
--   posters는 5MB 제한이고, 안에 든 것이 전부 "행사 하나당 포스터 하나"라 파일 이름이
--   행사 id로 정리돼 있다. 배치도는 확대해서 부스 번호를 읽는 그림이라 해상도를 줄일 수
--   없어 5MB를 넘길 수 있고, 굿즈·코스어 사진은 행사 하나에 수십~수백 장이 붙는다.
--   성격이 다르므로 버킷을 나눈다.
--
-- 왜 사본을 두는가
--   이 이미지들은 전부 주최 측 공지에 걸린 남의 주소다. 지금까지는 그 주소를 그대로
--   화면에 꽂았는데, 그러면
--     · 공지가 내려가거나 행사가 끝나 페이지가 정리되면 사진이 통째로 깨지고
--     · 핫링크를 막는 서버에서는 애초에 안 보이며(인벤이 그렇다)
--     · 원본이 인쇄용이면 목록에서 수 MB짜리를 그대로 받게 된다.
--   포스터는 이미 같은 이유로 사본을 쓰고 있다(poster-storage.mjs). 같은 방식을
--   나머지 이미지에도 적용한다.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-images',
  'event-images',
  true,
  15728640,  -- 15 MB. 배치도 원본이 커서 posters(5MB)보다 넉넉하게 잡는다.
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 누구나 읽기 가능 (public 버킷이므로 URL만 알면 접근)
drop policy if exists "event images are publicly readable" on storage.objects;
create policy "event images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'event-images');

-- 업로드는 서비스 롤 키만 — anon 정책을 만들지 않으면 기본 차단이다.
-- 실제 복사는 crawler/src/mirror-images.mjs가 한다
-- (GitHub Actions: .github/workflows/mirror-images.yml, 매일 자동 + 수동 실행).
