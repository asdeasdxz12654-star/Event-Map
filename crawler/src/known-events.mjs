// 날짜를 공식으로 계산할 수 있는 정기 행사를 LLM 없이 event_drafts에 직접 삽입한다.
// source_url: known-event://{slug}/{year} 형식으로 연도별 중복 삽입을 방지한다.
// promote_event_draft() 트리거의 title+start_date dedup으로 events 테이블 중복도 방지된다.

function toDateStr(date) {
  return date.toISOString().slice(0, 10) // YYYY-MM-DD
}

// 이 행사들(지스타 등)은 한국 기준(KST) 행사라 "오늘"도 KST로 계산한다 — UTC로 계산하면
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
        organizer: '한국게임산업협회',
        description: '국내 최대 게임 전시회. 매년 11월 셋째 주 목~일, 부산 BEXCO 개최.',
        ticket_url: 'https://www.gstar.or.kr/',
        ticket_open_date: null,
        admission_fee: null,
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
        organizer: '경기콘텐츠진흥원',
        description: '경기도 고양 KINTEX에서 열리는 게임·콘텐츠 박람회. 매년 5월 넷째 주 목~일 개최.',
        ticket_url: 'https://www.playx4.or.kr/',
        ticket_open_date: null,
        admission_fee: null,
        website: 'https://www.playx4.or.kr/',
        tags: ['게임전시', '플레이엑스포', 'PlayX4', '고양', 'KINTEX'],
        confidence: 'high',
      }
    },
  },
  {
    slug: 'agf',
    build: (year) => {
      // 12월 첫째 주 토요일 ~ 일요일 (6=토)
      const start = nthWeekday(year, 11, 6, 1)
      const end   = new Date(Date.UTC(year, 11, start.getUTCDate() + 1))
      return {
        is_event: true,
        title: `AGF ${year}`,
        category: '코스프레',
        start_date: toDateStr(start),
        end_date: toDateStr(end),
        venue: '코엑스',
        venue_address: '서울특별시 강남구 영동대로 513',
        organizer: null,
        description: '국내 최대 서브컬처·코스프레 행사. 매년 12월 첫째 주 토~일, 코엑스 개최.',
        ticket_url: 'https://www.agfkorea.com/',
        ticket_open_date: null,
        admission_fee: null,
        website: 'https://www.agfkorea.com/',
        tags: ['코스프레', 'AGF', '서울', '코엑스', '서브컬처'],
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
        organizer: '부산정보산업진흥원',
        description: '국내 인디게임 개발자를 위한 축제. 매년 8월 둘째 주 금~일, 부산 BEXCO 개최.',
        ticket_url: 'https://www.bicfest.org/',
        ticket_open_date: null,
        admission_fee: null,
        website: 'https://www.bicfest.org/',
        tags: ['게임전시', 'BIC', '인디게임', '부산', 'BEXCO'],
        confidence: 'high',
      }
    },
  },
]

export async function upsertKnownEvents(supabase) {
  for (const { slug, build } of KNOWN_EVENTS) {
    for (const year of targetYears(build)) {
      const sourceUrl = `known-event://${slug}/${year}`

      const { data: existing } = await supabase
        .from('event_drafts')
        .select('id')
        .eq('source_url', sourceUrl)
        .maybeSingle()

      if (existing) {
        console.log(`[known-events] ${slug}/${year} 이미 등록됨, 스킵`)
        continue
      }

      const extracted = build(year)
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
        continue
      }

      console.log(`[known-events] ${extracted.title} 저장 (${extracted.start_date} ~ ${extracted.end_date})`)

      const { error: approveError } = await supabase
        .from('event_drafts')
        .update({ status: 'approved' })
        .eq('id', data.id)

      if (approveError) {
        console.error(`[known-events] ${slug}/${year} 자동 승인 실패:`, approveError.message)
      } else {
        console.log(`[known-events] ${extracted.title} 자동 승인됨`)
      }
    }
  }
}
