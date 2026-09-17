import { describe, expect, it } from 'vitest'
import { buildDescription, buildEventJsonLd, buildPreview, jsonLdScript, periodText } from './[id].js'

// 행사별 링크 미리보기와 검색엔진용 구조화 데이터.
//
// 이 값들은 봇만 읽는다. 잘못돼도 화면상으로는 아무 차이가 없어서, 확인할 방법이 없으면
// "됐겠거니" 하고 넘어가게 된다. 실제로 이 파일을 쓰면서 치환이 완전한 무의미였던 적이
// 있다 — '<'를 그대로 적어서 JS가 '<' 한 글자로 읽었고, 눈으로는 전혀 안 보였다.

const EVENT = {
  title: '호요랜드 2026',
  description: '호요버스 대표 게임 IP 축제',
  start_date: '2026-10-02',
  end_date: '2026-10-05',
  venue: 'KINTEX 제2전시장',
  venue_address: '경기 고양시 킨텍스로 217-60',
  organizer: '호요버스',
  website: 'https://hoyoland.kr',
  admission_fee: '무료',
  ticket_url: 'https://ticket.x/1',
  ticket_status: 'soldout',
  poster_url: null,
}

describe('periodText', () => {
  it('같은 해면 종료일은 월·일만', () => {
    expect(periodText({ start_date: '2026-10-02', end_date: '2026-10-05' })).toBe('2026.10.02 ~ 10.05')
  })
  it('하루짜리는 한 번만', () => {
    expect(periodText({ start_date: '2026-10-02', end_date: '2026-10-02' })).toBe('2026.10.02')
  })
  it('해를 넘기면 둘 다 적는다', () => {
    expect(periodText({ start_date: '2026-12-30', end_date: '2027-01-02' })).toBe('2026.12.30 ~ 2027.01.02')
  })
  it('시작일이 없으면 빈 문자열', () => {
    expect(periodText({})).toBe('')
  })
})

describe('buildDescription', () => {
  it('160자를 넘으면 자른다 (미리보기 봇이 그 뒤를 안 읽는다)', () => {
    const long = buildDescription({ ...EVENT, description: '가'.repeat(300) })
    expect(long.length).toBeLessThanOrEqual(160)
    expect(long.endsWith('...')).toBe(true)
  })
})

describe('buildPreview', () => {
  it('포스터가 없으면 기본 이미지를 쓴다', () => {
    const p = buildPreview(EVENT, 'https://x', '/events/e1')
    expect(p.image).toBe('https://x/og-image.png')
    expect(p.isPoster).toBe(false)
  })
  it('http 포스터는 안 쓴다 (미리보기 봇이 자주 무시한다)', () => {
    const p = buildPreview({ ...EVENT, poster_url: 'http://x/p.jpg' }, 'https://x', '/events/e1')
    expect(p.isPoster).toBe(false)
  })
  it('https 포스터는 쓴다', () => {
    const p = buildPreview({ ...EVENT, poster_url: 'https://x/p.jpg' }, 'https://x', '/events/e1')
    expect(p.image).toBe('https://x/p.jpg')
    expect(p.isPoster).toBe(true)
  })
})

describe('buildEventJsonLd', () => {
  const ld = buildEventJsonLd(EVENT, 'https://x/events/e1', 'https://x/og-image.png')

  it('구글이 요구하는 필수 필드가 있다', () => {
    for (const k of ['@context', '@type', 'name', 'startDate', 'endDate', 'location', 'url']) {
      expect(ld[k]).toBeTruthy()
    }
    expect(ld['@type']).toBe('Event')
  })

  it('매진을 SoldOut으로 옮긴다', () => {
    expect(ld.offers.availability).toBe('https://schema.org/SoldOut')
  })

  it('"무료"일 때만 price 0을 적는다', () => {
    expect(ld.offers.price).toBe('0')
    const paid = buildEventJsonLd({ ...EVENT, admission_fee: '1일권 15,000원' }, 'u', 'i')
    // 숫자를 뽑으면 어느 권종의 가격인지 우리가 정하는 셈이 된다.
    expect(paid.offers.price).toBeUndefined()
  })

  it('비어 있는 값은 아예 안 넣는다', () => {
    const bare = buildEventJsonLd({ title: 'A', start_date: '2026-01-01' }, 'u', 'i')
    expect(bare.location).toBeUndefined()
    expect(bare.organizer).toBeUndefined()
    expect(bare.offers).toBeUndefined()
  })

  it('종료일이 없으면 시작일로 채운다', () => {
    const oneDay = buildEventJsonLd({ title: 'A', start_date: '2026-01-01' }, 'u', 'i')
    expect(oneDay.endDate).toBe('2026-01-01')
  })
})

describe('jsonLdScript', () => {
  it('</script>로 태그를 닫고 나가지 못한다', () => {
    const out = jsonLdScript({ name: 'a</script><script>alert(1)</script>' })
    expect(out).not.toMatch(/<\/script><script>/)
    expect(out).toContain('\\u003c')
  })

  it('이스케이프해도 JSON 내용은 그대로다', () => {
    const name = 'a</script>b'
    const out = jsonLdScript({ name })
    const json = out.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '')
    expect(JSON.parse(json).name).toBe(name)
  })
})
