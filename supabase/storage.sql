-- posters 버킷: 행사 포스터 이미지 공개 저장소
-- Supabase 대시보드 > SQL Editor 에서 실행하세요.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'posters',
  'posters',
  true,
  5242880,  -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- 누구나 읽기 가능 (public 버킷이므로 URL만 알면 접근)
create policy "posters are publicly readable"
  on storage.objects for select
  using (bucket_id = 'posters');

-- 업로드는 서비스 롤 키(관리자)만 가능 — 아래 정책은 anon 업로드를 막음
-- 실제 업로드 방법:
--   A) Supabase 대시보드 > Storage > posters 버킷에서 직접 드래그&드롭
--   B) CLI:  npx supabase storage cp poster.jpg ss:///posters/<event-id>.jpg
--   C) 크롤러/관리 스크립트에서 서비스 롤 키로 supabase.storage.from('posters').upload(...)
--
-- 업로드 후 events 테이블의 poster_url을 아래처럼 채워 주면 됩니다:
--   UPDATE events
--   SET poster_url = 'https://<project>.supabase.co/storage/v1/object/public/posters/<event-id>.jpg'
--   WHERE id = '<event-id>';
