// 자동 작업이 아직 돌고 있는가.
//
// 왜 필요한가
//   크롤러가 멈춰도 화면은 아무 말이 없다. 대시보드의 "검수 대기 0건"은 두 가지를
//   똑같이 생긴 얼굴로 보여준다 — 밀린 일이 없는 것과, 크롤러가 죽어서 아무것도
//   안 들어오는 것. 이 둘을 가르려면 "마지막으로 언제 돌았고 몇 건을 가져왔는가"가
//   필요하고, 그 기록이 job_runs다(shared/job-run.mjs가 남긴다).
//
//   특히 워크플로가 **초록불인 채로** 죽는 경우가 있다. 파서가 깨지거나 API 키가
//   만료되면 스크립트는 0건을 기록하고 정상 종료한다. Actions 탭은 전부 초록색이다.
//   그래서 "실행됐는가"만 보지 않고 "며칠째 0건인가"도 함께 센다.
//
// 이 파일에 DB가 없는 이유
//   판정 규칙은 전부 여기서 순수 함수로 한다. 화면을 띄우지 않고 테스트할 수 있어야
//   규칙이 조용히 어긋나지 않는다(jobHealth.test.js).

const HOUR = 60 * 60 * 1000
const DAY = 24

// 돌고 있어야 하는 작업들. job_key는 shared/job-run.mjs를 부르는 쪽이 정한 값이다.
//
// 워크플로 하나가 작업 여러 개를 돌리기도 한다 — watch-sources.yml은 감지와 코믹월드
// 부스 수집을 이어서 돌리고, fill-posters.yml은 포스터와 공식사이트를 따로 채운다.
// 그래서 워크플로가 아니라 "하는 일" 단위로 센다. 합쳐 놓으면 한쪽만 죽었을 때
// 나머지가 그 자리를 메워서 티가 안 난다.
export const JOBS = [
  { key: 'crawl-news', label: '뉴스·공식 API 수집', everyHours: DAY, workflow: 'crawl-news.yml' },
  { key: 'mirror-images', label: '이미지 사본 만들기', everyHours: DAY, workflow: 'mirror-images.yml' },
  { key: 'watch-sources', label: '공식 소스 변경 감지', everyHours: DAY, workflow: 'watch-sources.yml' },
  { key: 'comicworld-booths', label: '코믹월드 동아리 수집', everyHours: DAY, workflow: 'watch-sources.yml' },
  { key: 'send-notifications', label: '알림 발송', everyHours: DAY, workflow: 'send-notifications.yml' },
  { key: 'fill-posters', label: '포스터 채우기', everyHours: DAY * 7, workflow: 'fill-posters.yml' },
  { key: 'fill-official-sites', label: '공식 사이트 채우기', everyHours: DAY * 7, workflow: 'fill-posters.yml' },
]

// 얼마나 늦어야 "늦었다"고 할 것인가.
//
// GitHub Actions의 schedule은 정시 보장이 아니라 몇십 분씩 밀린다. 주기를 1분이라도
// 넘기면 빨간불을 켜면 매일 아침 거짓 경보가 뜨고, 그러면 아무도 이 화면을 안 믿게 된다.
// 주기의 절반(최소 6시간)을 봐준다 — 하루짜리는 36시간, 주간은 10일 반.
export function lateAfterHours(everyHours) {
  return everyHours + Math.max(6, everyHours / 2)
}

// 연속 0건이 며칠째인가. 며칠씩 0건이면 대개 고장이다 — 파서가 깨졌거나, 보던
// 페이지의 주소가 바뀌었거나, 키가 만료됐거나.
//
// 다만 0건이 정상인 날도 많다(그날 오픈하는 행사가 없으면 알림은 0건이다). 그래서
// 이 숫자로 고장을 "판정"하지 않고, 화면에 함께 적어 사람이 보게만 한다.
function zeroStreakOf(runs) {
  let streak = 0
  for (const run of runs) {
    if (run.status !== 'ok') break
    // items가 없는 실행(집계를 안 돌려주는 작업, 중간에 빠져나간 실행)에서 멈춘다 —
    // "0건"과 "안 셌다"는 다른 말이다.
    if (run.items !== 0) break
    streak++
  }
  return streak
}

// rows: job_runs 행 목록 (순서는 신경 쓰지 않는다 — 여기서 최신순으로 정렬한다)
// now:  기준 시각
export function summarizeJobs(rows, now = new Date()) {
  const at = now instanceof Date ? now.getTime() : new Date(now).getTime()

  const byKey = new Map(JOBS.map(job => [job.key, []]))
  for (const row of rows ?? []) {
    // 모르는 job_key는 버린다. 이름을 바꾼 뒤 남은 옛 기록이 화면에 유령으로 남지 않게.
    if (byKey.has(row.job_key)) byKey.get(row.job_key).push(row)
  }

  return JOBS.map(job => {
    const runs = byKey.get(job.key)
      .slice()
      .sort((a, b) => new Date(b.started_at) - new Date(a.started_at))

    const last = runs[0] ?? null
    const lastSuccess = runs.find(r => r.status === 'ok') ?? null
    const ageHours = last ? (at - new Date(last.started_at).getTime()) / HOUR : null

    let state
    if (!last) state = 'never'
    else if (last.status === 'failed') state = 'failed'
    else if (ageHours > lateAfterHours(job.everyHours)) state = 'late'
    else state = 'ok'

    return {
      ...job,
      runs,
      last,
      lastSuccess,
      ageHours,
      state,
      zeroStreak: zeroStreakOf(runs),
    }
  })
}

// 지금 사람이 봐야 하는 작업 수.
//
// 'never'는 세지 않는다. 마이그레이션을 막 돌린 직후에는 모든 작업이 기록 0건이고,
// 그때 "7건 고장"이라고 외치면 첫인상이 통째로 거짓말이 된다. 기록이 없다는 사실은
// 목록에 "기록 없음"으로 그대로 보인다.
export function jobsNeedingAttention(summaries) {
  return summaries.filter(s => s.state === 'failed' || s.state === 'late')
}

// "3일 전"처럼 읽히게. 시각을 그대로 적으면 매번 오늘 날짜와 빼야 한다.
export function relativeAge(ageHours) {
  if (ageHours == null) return '기록 없음'
  if (ageHours < 1) return '방금'
  if (ageHours < 24) return `${Math.floor(ageHours)}시간 전`
  return `${Math.floor(ageHours / 24)}일 전`
}
