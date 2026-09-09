// 날짜를 공식으로 계산할 수 있는 정기 행사를 LLM 없이 event_drafts에 직접 삽입한다.
import { lookupVenueCoords } from './naver-local.mjs'
// source_url: known-event://{slug}/{year} 형식으로 연도별 중복 삽입을 방지한다.
// promote_event_draft() 트리거의 title+start_date dedup으로 events 테이블 중복도 방지된다.

// 행사 유형별 고정 대표 포스터 — 회차마다 검색하지 않고 하나로 통일한다.
// 교체 시 이 상수만 수정하면 이후 새 회차에 자동 반영된다.
const COMICWORLD_POSTER = 'https://tong.visitkorea.or.kr/cms/resource/38/4076738_image2_1.png'
const COSANDCOMIC_POSTER = 'https://pbs.twimg.com/media/HOo8nV4bUAAdTNo?format=webp&name=medium'
const ILLUSTARFES_POSTER = 'http://imgnews.naver.net/image/5401/2026/05/20/0000387802_001_20260520085212709.jpeg'

// KINTEX 좌표. AGF·코믹월드 등 다른 행사들은 이미 네이버 지역검색으로 정확히
// geocode된 37.669119 / 126.7460896을 쓰고 있어서 그 값에 맞췄다 — 위키백과 좌표
// (37.66889, 126.74556)와도 40m 이내로 거의 같다.
// 예전엔 행사마다 좌표를 따로 박아넣어서 잘못된 값(37.6727, 126.756)이 여러 행사에
// 중복 반영돼 있었다 — 이제 여기 하나만 고치면 다음 push 때 전체 행사에 반영된다.
const KINTEX_LAT = 37.669119
const KINTEX_LNG = 126.7460896

function toDateStr(date) {
  return date.toISOString().slice(0, 10) // YYYY-MM-DD
}

// 이 행사들은 한국 기준(KST) 행사라 "오늘"도 KST로 계산한다 — UTC로 계산하면
// 자정 근처(00:00~08:59 KST, 전날 UTC) 9시간 동안 하루 전으로 잘못 판단해서 연도 계산이
// 어긋날 수 있다 (notifier/send-notifications.mjs의 todayKST()와 동일한 이유/방식).
function todayKST() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 10)
}

// 해당 연도·월의 N번째 특정 요일을 반환한다 (n: 1-indexed).
// month: 0-indexed (0=1월 … 11=12월), weekday: 0=일, 1=월 … 5=금, 6=토
function nthWeekday(year, month, weekday, n) {
  const first = new Date(Date.UTC(year, month, 1))
  const daysToFirst = (weekday - first.getUTCDay() + 7) % 7
  return new Date(Date.UTC(year, month, 1 + daysToFirst + (n - 1) * 7))
}

// 기본은 "올해" 회차만 등록한다. 올해 행사가 아직 남았는데 내년 회차를 미리 노출하면
// 사용자가 헷갈리므로, 올해 행사가 이미 끝난 뒤에만 내년 회차를 추가로 등록한다.
// source_url dedup이 있으므로 이미 등록된 연도는 자동으로 스킵된다.
function targetYears(build) {
  const today = todayKST()
  const year = Number(today.slice(0, 4))
  const thisYear = build(year)
  if (thisYear.end_date && today > thisYear.end_date) return [year, year + 1]
  return [year]
}

// 날짜를 요일 공식으로 계산할 수 있는 연간 정기 행사
const KNOWN_EVENTS = [
  {
    slug: 'gstar',
    build: (year) => {
      // 11월 셋째 주 목요일 ~ 일요일 (4=목)
      const start = nthWeekday(year, 10, 4, 3)
      const end   = new Date(Date.UTC(year, 10, start.getUTCDate() + 3))
      return {
        is_event: true,
        title: `지스타 ${year}`,
        category: '게임전시',
        start_date: toDateStr(start),
        end_date: toDateStr(end),
        venue: 'BEXCO 제1전시장',
        venue_address: '부산광역시 해운대구 APEC로 55',
        venue_lat: 35.1688,
        venue_lng: 129.1363,
        organizer: '한국게임산업협회',
        description: '국내 최대 게임 전시회. 매년 11월 셋째 주 목~일, 부산 BEXCO 개최.',
        ticket_url: 'https://www.gstar.or.kr/',
        // 예매 오픈일은 회차마다 공식 발표로 확정되는 값이라 공식으로 계산 못 함.
        // 확인되는 연도만 여기에 하나씩 추가.
        ticket_open_date: year === 2026 ? '2026-09-29' : null,
        ticket_open_time: null,
        admission_fee: '성인 18,000원 / 청소년 8,000원 (BTC 일반 사전예매, 100% 예매제)',
        website: 'https://www.gstar.or.kr/',
        tags: ['게임전시', '지스타', '부산', 'BEXCO'],
        confidence: 'high',
      }
    },
  },
  {
    slug: 'playxfour',
    build: (year) => {
      // 5월 넷째 주 목요일 ~ 일요일 (4=목)
      const start = nthWeekday(year, 4, 4, 4)
      const end   = new Date(Date.UTC(year, 4, start.getUTCDate() + 3))
      return {
        is_event: true,
        title: `플레이엑스포 ${year}`,
        category: '게임전시',
        start_date: toDateStr(start),
        end_date: toDateStr(end),
        venue: 'KINTEX 제1전시장',
        venue_address: '경기도 고양시 일산서구 킨텍스로 217-60',
        venue_lat: KINTEX_LAT,
        venue_lng: KINTEX_LNG,
        organizer: '경기콘텐츠진흥원',
        description: '경기도 고양 KINTEX에서 열리는 게임·콘텐츠 박람회. 매년 5월 넷째 주 목~일 개최.',
        ticket_url: 'https://www.playx4.or.kr/',
        ticket_open_date: null,
        admission_fee: '3,000원 (미취학아동·만 65세 이상·장애인·국가유공자·현역 군인/경찰/소방관 무료)',
        website: 'https://www.playx4.or.kr/',
        tags: ['게임전시', '플레이엑스포', 'PlayX4', '고양', 'KINTEX'],
        confidence: 'high',
      }
    },
  },
  {
    slug: 'agf',
    build: (year) => {
      // 12월 첫째 주 금요일 ~ 일요일 (5=금) — 2026부터 KINTEX 이전·3일 개최로 변경
      const start = nthWeekday(year, 11, 5, 1)
      const end   = new Date(Date.UTC(year, 11, start.getUTCDate() + 2))
      return {
        is_event: true,
        title: `AGF ${year}`,
        category: '코스프레',
        start_date: toDateStr(start),
        end_date: toDateStr(end),
        venue: 'KINTEX 제1전시장',
        venue_address: '경기도 고양시 일산서구 킨텍스로 217-60',
        venue_lat: KINTEX_LAT,
        venue_lng: KINTEX_LNG,
        organizer: null,
        description: '국내 최대 서브컬처·코스프레 행사. 매년 12월 첫째 주 금~일, KINTEX 개최.',
        ticket_url: 'https://www.agfkorea.com/',
        ticket_open_date: null,
        admission_fee: '공식 미정',
        website: 'https://www.agfkorea.com/',
        tags: ['코스프레', 'AGF', '고양', 'KINTEX', '서브컬처'],
        confidence: 'high',
      }
    },
  },
  {
    slug: 'bic',
    build: (year) => {
      // 8월 둘째 주 금요일 ~ 일요일 (5=금)
      const start = nthWeekday(year, 7, 5, 2)
      const end   = new Date(Date.UTC(year, 7, start.getUTCDate() + 2))
      return {
        is_event: true,
        title: `부산인디커넥트페스티벌 ${year}`,
        category: '게임전시',
        start_date: toDateStr(start),
        end_date: toDateStr(end),
        venue: 'BEXCO',
        venue_address: '부산광역시 해운대구 APEC로 55',
        venue_lat: 35.1688,
        venue_lng: 129.1363,
        organizer: '부산정보산업진흥원',
        description: '국내 인디게임 개발자를 위한 축제. 매년 8월 둘째 주 금~일, 부산 BEXCO 개최.',
        ticket_url: 'https://www.bicfest.org/',
        ticket_open_date: null,
        admission_fee: '오프라인 1일권 성인 15,000원·청소년 12,500원 / 2일권 성인 30,000원·청소년 25,000원 (공식 홈페이지 사전예매 20% 할인)',
        website: 'https://www.bicfest.org/',
        tags: ['게임전시', 'BIC', '인디게임', '부산', 'BEXCO'],
        confidence: 'high',
      }
    },
  },
]

// 날짜가 확정된 특정 회차 행사 — 정기 공식으로 계산이 어렵거나 회차별로 개최지·날짜가
// 다른 행사를 직접 입력한다. source_url dedup이 있으므로 크롤러가 반복 실행돼도
// 중복 삽입되지 않는다. 다음 회차가 확정되면 아래에 항목을 추가한다.
const ONE_OFF_EVENTS = [
  // ── 2026년 하반기 (web 검색 기반 확인, 2026-09-06 조사) ──
  {
    slug: 'comicworld-336-ilsan', year: 2026,
    posterUrl: COMICWORLD_POSTER,
    data: {
      is_event: true, title: '코믹월드 336 일산', category: '코스프레',
      start_date: '2026-09-12', end_date: '2026-09-13',
      venue: 'KINTEX 제1전시장', venue_address: '경기도 고양시 일산서구 킨텍스로 217-60',
      venue_lat: KINTEX_LAT, venue_lng: KINTEX_LNG,
      organizer: null,
      description: '국내 최대 2차 창작 동인·코스프레 행사.',
      ticket_url: 'https://comicw.net/', ticket_open_date: null, admission_fee: '사전예매 7,000원 (현장 구매 10,000원)',
      website: 'https://comicw.net/', tags: ['코믹월드', '동인', '코스프레', '일산', 'KINTEX'],
      confidence: 'high',
    },
  },
  {
    slug: 'bicof-2026', year: 2026,
    data: {
      is_event: true, title: '제29회 부천국제만화축제', category: '게임전시',
      start_date: '2026-09-18', end_date: '2026-09-20',
      venue: '한국만화박물관 일원', venue_address: '경기도 부천시 길주로 1',
      venue_lat: null, venue_lng: null,
      organizer: '부천문화재단',
      description: '만화·웹툰 중심의 국제 문화축제. 야외 만화카페·마켓, 작가 대담·사인회 등.',
      ticket_url: 'https://www.bicof.com/', ticket_open_date: null,
      admission_fee: '일반 5,000원 / 부천시민 2,500원 / 19세 이하 무료',
      website: 'https://www.bicof.com/', tags: ['부천국제만화축제', 'BICOF', '부천', '만화', '웹툰'],
      confidence: 'high',
    },
  },
  {
    slug: 'cosandcomic-94', year: 2026,
    posterUrl: COSANDCOMIC_POSTER,
    data: {
      is_event: true, title: '제94회 코스앤코믹 페스티벌', category: '코스프레',
      start_date: '2026-09-19', end_date: '2026-09-20',
      venue: '서울랜드', venue_address: '경기도 과천시 광명로 181',
      venue_lat: null, venue_lng: null,
      organizer: null,
      description: '코스프레·동인 행사. 서울랜드 입장권 할인 혜택 제공.',
      ticket_url: null, ticket_open_date: null, admission_fee: '공식 미정',
      website: null, tags: ['코스앤코믹', '코코페', '코스프레', '서울랜드'],
      confidence: 'high',
    },
  },
  {
    slug: 'comicworld-337-ulsan', year: 2026,
    posterUrl: COMICWORLD_POSTER,
    data: {
      is_event: true, title: '코믹월드 337 울산', category: '코스프레',
      start_date: '2026-10-03', end_date: '2026-10-04',
      venue: '울산전시컨벤션센터', venue_address: '울산광역시 남구 삼산동 1553',
      venue_lat: null, venue_lng: null,
      organizer: null,
      description: '국내 최대 2차 창작 동인·코스프레 행사.',
      ticket_url: 'https://comicw.net/', ticket_open_date: null, admission_fee: '사전예매 7,000원 (현장 구매 10,000원)',
      website: 'https://comicw.net/', tags: ['코믹월드', '동인', '코스프레', '울산'],
      confidence: 'high',
    },
  },
  {
    slug: 'illustarfes-12-kintex', year: 2026,
    posterUrl: ILLUSTARFES_POSTER,
    data: {
      is_event: true, title: '일러스타 페스 14', category: '코스프레',
      start_date: '2026-10-10', end_date: '2026-10-11',
      venue: 'KINTEX 제1전시장', venue_address: '경기도 고양시 일산서구 킨텍스로 217-60',
      venue_lat: KINTEX_LAT, venue_lng: KINTEX_LNG,
      organizer: '스타라이크',
      description: '일러스트·서브컬처 종합 이벤트. 동인지·굿즈 판매 부스, 코스프레 포토존 운영.',
      ticket_url: 'https://illustar.net/', ticket_open_date: null,
      admission_fee: '선행입장권 12,000원(입장권만)·14,000원(탈의실 이용권 포함) / 일반입장권 7,000원·9,000원',
      website: 'https://illustar.net/', tags: ['일러스타페스', '서브컬처', '코스프레', '일러스트', 'KINTEX'],
      confidence: 'high',
    },
  },
  {
    slug: 'cosandcomic-95', year: 2026,
    posterUrl: COSANDCOMIC_POSTER,
    data: {
      is_event: true, title: '제95회 코스앤코믹 페스티벌', category: '코스프레',
      start_date: '2026-10-17', end_date: '2026-10-18',
      venue: '서울랜드', venue_address: '경기도 과천시 광명로 181',
      venue_lat: null, venue_lng: null,
      organizer: null,
      description: '코스프레·동인 행사. 서울랜드 입장권 할인 혜택 제공.',
      ticket_url: null, ticket_open_date: null, admission_fee: '공식 미정',
      website: null, tags: ['코스앤코믹', '코코페', '코스프레', '서울랜드'],
      confidence: 'high',
    },
  },
  {
    slug: 'biaf-2026', year: 2026,
    data: {
      is_event: true, title: 'BIAF 2026 부천국제애니메이션페스티벌', category: '게임전시',
      start_date: '2026-10-23', end_date: '2026-10-27',
      venue: '부천 한국만화박물관·CGV 부천', venue_address: '경기도 부천시 길주로 1',
      venue_lat: null, venue_lng: null,
      organizer: '부천문화재단',
      description: '34개국 122편 애니메이션 상영, 콘텐츠마켓·전시·학술포럼 등. 매년 10월 부천 개최.',
      ticket_url: 'https://www.biaf.or.kr/', ticket_open_date: null,
      admission_fee: '개막작 30,000원 / 일반 상영작 8,000원 / 특별토크 15,000원 (2025년 기준, 2026년 가격 미확정)',
      website: 'https://www.biaf.or.kr/', tags: ['BIAF', '부천국제애니메이션페스티벌', '부천', '애니메이션'],
      confidence: 'high',
    },
  },
  {
    slug: 'comicworld-338-suwon', year: 2026,
    posterUrl: COMICWORLD_POSTER,
    data: {
      is_event: true, title: '코믹월드 338 수원', category: '코스프레',
      start_date: '2026-10-24', end_date: '2026-10-25',
      venue: '수원메쎄', venue_address: '경기도 수원시 권선구 수성로 89',
      venue_lat: null, venue_lng: null,
      organizer: null,
      description: '국내 최대 2차 창작 동인·코스프레 행사.',
      ticket_url: 'https://comicw.net/', ticket_open_date: null, admission_fee: '사전예매 7,000원 (현장 구매 10,000원)',
      website: 'https://comicw.net/', tags: ['코믹월드', '동인', '코스프레', '수원'],
      confidence: 'high',
    },
  },
  {
    slug: 'wonderlivet-2026', year: 2026,
    data: {
      is_event: true, title: 'WONDERLIVET 2026', category: '게임음악',
      start_date: '2026-11-20', end_date: '2026-11-22',
      venue: 'KINTEX 7·8·9·10홀', venue_address: '경기도 고양시 일산서구 킨텍스로 217-60',
      venue_lat: KINTEX_LAT, venue_lng: KINTEX_LNG,
      organizer: null,
      description: '국내 최대 J-POP·애니메이션 음악 라이브 페스티벌. 3일간 42팀 출연.',
      ticket_url: 'https://ticket.yes24.com/Perf/59840', ticket_open_date: null,
      admission_fee: '3일권 329,000원 / 2일권 229,000원 / 1일권 143,000원',
      website: null, tags: ['WONDERLIVET', '원더리벳', 'J-POP', '음악페스티벌', 'KINTEX'],
      confidence: 'high',
    },
  },
]

async function upsertOneEvent(supabase, slug, year, extracted, posterUrl = null) {
  const sourceUrl = `known-event://${slug}/${year}`

  const { data: existing } = await supabase
    .from('event_drafts')
    .select('id, promoted_event_id')
    .eq('source_url', sourceUrl)
    .maybeSingle()

  if (existing) {
    await syncExistingEvent(supabase, slug, year, extracted, existing.promoted_event_id)
    return
  }

  const { data, error } = await supabase
    .from('event_drafts')
    .insert({
      source_name: 'known-events',
      source_url: sourceUrl,
      source_title: extracted.title,
      published_at: null,
      extracted,
    })
    .select('id')
    .single()

  if (error) {
    console.error(`[known-events] ${slug}/${year} 저장 실패:`, error.message)
    return
  }

  console.log(`[known-events] ${extracted.title} 저장 (${extracted.start_date} ~ ${extracted.end_date})`)

  const { data: approved, error: approveError } = await supabase
    .from('event_drafts')
    .update({ status: 'approved' })
    .eq('id', data.id)
    .select('promoted_event_id')
    .single()

  if (approveError) {
    console.error(`[known-events] ${slug}/${year} 자동 승인 실패:`, approveError.message)
  } else {
    console.log(`[known-events] ${extracted.title} 자동 승인됨`)
    const hardcodedCoords = (extracted.venue_lat && extracted.venue_lng)
      ? { lat: extracted.venue_lat, lng: extracted.venue_lng }
      : null
    const coords = hardcodedCoords ?? await lookupVenueCoords(extracted.venue, extracted.venue_address)
    if (coords && approved?.promoted_event_id) {
      const { error: coordError } = await supabase
        .from('events')
        .update({ venue_lat: coords.lat, venue_lng: coords.lng })
        .eq('id', approved.promoted_event_id)
        .is('venue_lat', null)
        .is('admin_edited_at', null)
      if (coordError) console.warn(`[known-events] 좌표 저장 실패:`, coordError.message)
      else console.log(`[known-events] 좌표 설정: ${coords.lat}, ${coords.lng}`)
    }
    if (posterUrl && approved?.promoted_event_id) {
      const { error: posterError } = await supabase
        .from('events')
        .update({ poster_url: posterUrl })
        .eq('id', approved.promoted_event_id)
        .is('poster_url', null)
        .is('admin_edited_at', null)
      if (posterError) console.warn(`[known-events] 포스터 저장 실패:`, posterError.message)
      else console.log(`[known-events] 포스터 설정됨`)
    }
  }
}

// 이미 event_drafts에 등록된(=예전에 upsertOneEvent가 한 번 삽입·승인한) 고정 행사를
// 다시 만났을 때, known-events.mjs에 적힌 최신 값으로 events 테이블을 동기화한다.
// 단, 관리자가 화면에서 직접 수정해 admin_edited_at이 찍힌 행은 절대 덮어쓰지 않는다.
async function syncExistingEvent(supabase, slug, year, extracted, promotedEventId) {
  if (!promotedEventId) {
    console.log(`[known-events] ${slug}/${year} 이미 등록됨(미승인 상태), 스킵`)
    return
  }

  const patch = {
    title: extracted.title,
    category: extracted.category,
    start_date: extracted.start_date,
    end_date: extracted.end_date,
    venue: extracted.venue,
    venue_address: extracted.venue_address,
    organizer: extracted.organizer,
    description: extracted.description,
    ticket_url: extracted.ticket_url,
    ticket_open_date: extracted.ticket_open_date,
    ticket_open_time: extracted.ticket_open_time ?? null,
    admission_fee: extracted.admission_fee,
    website: extracted.website,
    tags: extracted.tags ?? [],
  }
  // 좌표는 known-events.mjs에 하드코딩된 경우(KINTEX_LAT 상수 수정 등)에만 동기화한다 —
  // lookupVenueCoords()로 자동 조회한 좌표까지 여기서 덮어쓰면 안 되므로 하드코딩된
  // 케이스만 골라서 반영.
  if (extracted.venue_lat && extracted.venue_lng) {
    patch.venue_lat = extracted.venue_lat
    patch.venue_lng = extracted.venue_lng
  }

  const { data, error } = await supabase
    .from('events')
    .update(patch)
    .eq('id', promotedEventId)
    .is('admin_edited_at', null)
    .select('id')

  if (error) {
    console.error(`[known-events] ${slug}/${year} 동기화 실패:`, error.message)
  } else if (data.length === 0) {
    console.log(`[known-events] ${slug}/${year} 이미 등록됨, 관리자가 수정한 행이라 스킵`)
  } else {
    console.log(`[known-events] ${slug}/${year} 이미 등록됨, 최신 값으로 동기화함`)
  }
}

export async function upsertKnownEvents(supabase) {
  // 공식 기반 연간 정기 행사
  for (const { slug, build } of KNOWN_EVENTS) {
    for (const year of targetYears(build)) {
      await upsertOneEvent(supabase, slug, year, build(year))
    }
  }
  // 회차별 확정 행사 (ONE_OFF_EVENTS)
  for (const { slug, year, data, posterUrl } of ONE_OFF_EVENTS) {
    await upsertOneEvent(supabase, slug, year, data, posterUrl ?? null)
  }
}
