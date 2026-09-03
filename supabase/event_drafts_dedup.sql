-- (1) 초기 화면 확인용 샘플 데이터(schema.sql) 삭제.
delete from public.events where id in ('e1', 'e2', 'e3', 'e4', 'e5');

-- (2) promote_event_draft() 트리거를 중복 방지 로직으로 교체.
-- 여러 뉴스 소스(RSS 여러 곳 + 네이버 검색)가 같은 행사를 각자 기사로 다루면, 승인 시마다
-- events에 똑같은 행사가 여러 번 들어갈 수 있다. 승인 직전에 "제목+시작일이 이미 events에
-- 있는지" 확인해서, 있으면 새로 insert하지 않고 기존 행사에 연결만 한다.
create or replace function public.promote_event_draft()
returns trigger as $$
declare
  new_event_id text;
  existing_event_id text;
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    select id into existing_event_id
    from public.events
    where title = new.extracted->>'title'
      and start_date = (new.extracted->>'start_date')::date
    limit 1;

    if existing_event_id is not null then
      -- 이미 같은 행사가 있음 -> 새로 만들지 않고 기존 행사에 연결만 하고 끝낸다.
      new.promoted_event_id := existing_event_id;
      new.reviewed_at := now();
      return new;
    end if;

    new_event_id := 'nd-' || to_char(now(), 'YYYYMMDD') || '-' || substr(md5(random()::text), 1, 6);

    insert into public.events (
      id, title, category, start_date, end_date, venue, venue_address,
      organizer, description, ticket_url, ticket_open_date, admission_fee,
      website, tags
    )
    values (
      new_event_id,
      new.extracted->>'title',
      new.extracted->>'category',
      (new.extracted->>'start_date')::date,
      coalesce((new.extracted->>'end_date')::date, (new.extracted->>'start_date')::date),
      new.extracted->>'venue',
      new.extracted->>'venue_address',
      new.extracted->>'organizer',
      new.extracted->>'description',
      new.extracted->>'ticket_url',
      (new.extracted->>'ticket_open_date')::date,
      new.extracted->>'admission_fee',
      new.extracted->>'website',
      case when new.extracted->'tags' is not null
        then array(select jsonb_array_elements_text(new.extracted->'tags'))
        else '{}'::text[]
      end
    );

    new.promoted_event_id := new_event_id;
    new.reviewed_at := now();
  elsif new.status = 'rejected' and old.status is distinct from new.status then
    new.reviewed_at := now();
  end if;

  return new;
end;
$$ language plpgsql security definer;
