-- 기존 cosplayers 테이블에 보안 제약 추가
-- Supabase 대시보드 > SQL Editor 에서 실행하세요.

-- 1) 닉네임 중복 방지
alter table public.cosplayers
  add constraint cosplayers_nickname_unique unique (nickname);

-- 2) bio 200자 제한
alter table public.cosplayers
  add constraint cosplayers_bio_length check (char_length(bio) <= 200);

-- 3) URL 필드는 https:// 필수
alter table public.cosplayers
  add constraint cosplayers_profile_url_https
    check (profile_url is null or profile_url ~* '^https://');

alter table public.cosplayers
  add constraint cosplayers_twitter_url_https
    check (twitter_url is null or twitter_url ~* '^https://');

alter table public.cosplayers
  add constraint cosplayers_instagram_url_https
    check (instagram_url is null or instagram_url ~* '^https://');

alter table public.cosplayers
  add constraint cosplayers_other_url_https
    check (other_url is null or other_url ~* '^https://');
