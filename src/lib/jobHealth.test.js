import { describe, expect, it } from 'vitest'
import { JOBS, jobsNeedingAttention, lateAfterHours, relativeAge, summarizeJobs } from './jobHealth'

// 자동 작업 감시.
//
// 이 판정이 틀리면 둘 중 하나가 된다 — 멀쩡한데 매일 아침 빨간불이 뜨거나(그러면
// 아무도 안 믿게 된다), 크롤러가 죽었는데 조용하거나. 둘 다 화면만 봐서는 구분이
// 안 되는 종류의 실패라서 여기서 잡는다.

const NOW = new Date('2026-09-17T09:00:00Z')

// n시간 전에 시작한 실행 한 건.
function run(jobKey, hoursAgo, extra = {}) {
  return {
    job_key: jobKey,
    started_at: new Date(NOW.getTime() - hoursAgo * 3600_000).toISOString(),
    status: 'ok',
    items: 1,
    ...extra,
  }
}

function pick(rows, key) {
  return summarizeJobs(rows, NOW).find(s => s.key === key)
}

describe('summarizeJobs', () => {
  it('기록이 아예 없으면 never다 (실패가 아니다)', () => {
    const s = pick([], 'crawl-news')
    expect(s.state).toBe('never')
    expect(s.last).toBeNull()
    expect(s.ageHours).toBeNull()
  })

  it('어제 돌았으면 ok다', () => {
    expect(pick([run('crawl-news', 20)], 'crawl-news').state).toBe('ok')
  })

  it('몇 시간 밀린 것은 ok다 (Actions 스케줄은 정시 보장이 아니다)', () => {
    // 매일 도는 작업이 26시간 만에 돌았다 — 흔한 일이고 고장이 아니다.
    expect(pick([run('crawl-news', 26)], 'crawl-news').state).toBe('ok')
  })

  it('주기의 1.5배를 넘기면 late다', () => {
    expect(pick([run('crawl-news', 40)], 'crawl-news').state).toBe('late')
  })

  it('주간 작업은 하루이틀 늦어도 late가 아니다', () => {
    // fill-posters는 주 1회다. 매일 도는 작업과 같은 잣대를 대면 늘 빨간불이다.
    expect(pick([run('fill-posters', 40)], 'fill-posters').state).toBe('ok')
    expect(pick([run('fill-posters', 24 * 11)], 'fill-posters').state).toBe('late')
  })

  it('마지막 실행이 실패면 failed다 — 더 최근에 돈 것이 기준이다', () => {
    const s = pick([
      run('crawl-news', 2, { status: 'failed', items: null, error: '어쩌고' }),
      run('crawl-news', 26),
    ], 'crawl-news')
    expect(s.state).toBe('failed')
    // 마지막 성공은 따로 들고 있는다 — "언제까지는 됐었나"를 알아야 원인을 좁힌다.
    expect(s.lastSuccess.started_at).toBe(run('crawl-news', 26).started_at)
  })

  it('행 순서가 뒤섞여 있어도 가장 최근 것을 고른다', () => {
    // Worker가 정렬해서 주지만, 그 정렬에 기대지 않는다.
    const s = pick([run('crawl-news', 50), run('crawl-news', 2), run('crawl-news', 30)], 'crawl-news')
    expect(s.state).toBe('ok')
    expect(s.runs).toHaveLength(3)
  })

  it('모르는 job_key는 버린다', () => {
    const all = summarizeJobs([run('없어진-작업', 1)], NOW)
    expect(all).toHaveLength(JOBS.length)
    expect(all.every(s => s.state === 'never')).toBe(true)
  })

  it('작업마다 따로 센다 (한 워크플로가 여러 작업을 돌린다)', () => {
    // watch-sources.yml은 감지와 코믹월드 부스 수집을 이어서 돌린다. 감지가 멀쩡해도
    // 부스 수집만 죽을 수 있고, 합쳐서 세면 그게 안 보인다.
    const rows = [run('watch-sources', 2)]
    expect(pick(rows, 'watch-sources').state).toBe('ok')
    expect(pick(rows, 'comicworld-booths').state).toBe('never')
  })
})

describe('zeroStreak — 초록불인 채로 죽는 경우', () => {
  it('0건이 이어진 횟수를 센다', () => {
    const rows = [
      run('crawl-news', 2, { items: 0 }),
      run('crawl-news', 26, { items: 0 }),
      run('crawl-news', 50, { items: 0 }),
      run('crawl-news', 74, { items: 4 }),
    ]
    expect(pick(rows, 'crawl-news').zeroStreak).toBe(3)
    // 실행 자체는 정상이라 state는 ok다 — 0건이 정상인 날도 있으므로 판정하지 않고
    // 숫자만 보여준다.
    expect(pick(rows, 'crawl-news').state).toBe('ok')
  })

  it('가장 최근이 0건이 아니면 0이다', () => {
    const rows = [run('crawl-news', 2, { items: 3 }), run('crawl-news', 26, { items: 0 })]
    expect(pick(rows, 'crawl-news').zeroStreak).toBe(0)
  })

  it('실패에서 멈춘다', () => {
    const rows = [
      run('crawl-news', 2, { items: 0 }),
      run('crawl-news', 26, { status: 'failed', items: null }),
      run('crawl-news', 50, { items: 0 }),
    ]
    expect(pick(rows, 'crawl-news').zeroStreak).toBe(1)
  })

  it('안 센 실행(items 없음)에서 멈춘다 — "0건"과 "안 셌다"는 다른 말이다', () => {
    const rows = [run('crawl-news', 2, { items: null }), run('crawl-news', 26, { items: 0 })]
    expect(pick(rows, 'crawl-news').zeroStreak).toBe(0)
  })
})

describe('jobsNeedingAttention', () => {
  it('failed와 late만 센다', () => {
    const rows = [
      run('crawl-news', 2),                                     // ok
      run('mirror-images', 100),                                // late
      run('watch-sources', 1, { status: 'failed', items: null }), // failed
    ]
    const need = jobsNeedingAttention(summarizeJobs(rows, NOW))
    expect(need.map(s => s.key).sort()).toEqual(['mirror-images', 'watch-sources'])
  })

  it('기록이 하나도 없을 때 전부 고장이라고 하지 않는다', () => {
    // 마이그레이션 직후가 정확히 이 상태다. 여기서 "7건 고장"이 뜨면 이 화면의
    // 첫인상이 통째로 거짓말이 된다.
    expect(jobsNeedingAttention(summarizeJobs([], NOW))).toHaveLength(0)
  })
})

describe('lateAfterHours', () => {
  it('짧은 주기에도 최소 6시간은 봐준다', () => {
    expect(lateAfterHours(1)).toBe(7)
    expect(lateAfterHours(24)).toBe(36)
    expect(lateAfterHours(24 * 7)).toBe(252)
  })
})

describe('relativeAge', () => {
  it.each([
    [null, '기록 없음'],
    [0.2, '방금'],
    [5, '5시간 전'],
    [23.9, '23시간 전'],
    [24, '1일 전'],
    [73, '3일 전'],
  ])('%s → %s', (hours, expected) => {
    expect(relativeAge(hours)).toBe(expected)
  })
})
