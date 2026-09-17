// 자동 작업 한 번의 실행을 job_runs에 남긴다.
//
// 왜 이게 필요한가
//   지금까지 "크롤러가 잘 돌고 있나"를 알 수 있는 곳은 GitHub Actions 탭뿐이었다.
//   거기를 안 열면 모르고, 열어도 초록불이 진실을 다 말해주지 않는다 — 파서가
//   깨져서 0건을 가져와도 스크립트는 정상 종료하므로 초록색이다. 그러면 대시보드의
//   "검수 대기 0건"이 "밀린 일 없음"인지 "크롤러가 죽었는지" 구분이 안 된다.
//
//   그래서 실행마다 시각·소요시간·건수·실패사유를 남기고, 관리자 대시보드가 그걸 읽어
//   "마지막 실행 3일 전"이라고 말하게 한다.
//
// 기록이 작업을 망가뜨리면 안 된다
//   job_runs에 못 써도 크롤은 계속돼야 한다. 기록은 전부 best-effort이고, 실패는
//   경고 한 줄로 끝낸다. 반대로 작업이 실패하면 종료 코드 1은 그대로 유지한다 —
//   Actions의 빨간불은 여전히 가장 빠른 신호다. 여기는 그것을 대체하는 게 아니라,
//   초록불이 거짓말할 때를 잡는 장치다.
//
// dry-run은 기록하지 않는다
//   기록하면 "확인만 해본 것"이 "정상 실행"으로 보인다. 그러면 몇 달간 --dry-run만
//   돌아가고 있어도 화면은 건강하다고 말한다.
// 의존성이 없다. PostgREST를 fetch로 직접 부른다 —
// 이 파일은 crawler와 notifier 양쪽에서 쓰는데, 두 패키지는 node_modules를 따로 갖는다
// (워크플로가 각자 자기 폴더에서만 npm install 한다). @supabase/supabase-js를 import하면
// 부르는 쪽 폴더에 그 패키지가 있어야 해서, 한쪽에서는 import 자체가 터진다.

// 외부 API 오류 메시지에는 우리가 보낸 요청이 통째로 실려 오는 경우가 있다.
// 그 안에 키가 들어 있으면 job_runs에 키가 저장된다. 지우고 넣는다.
//
// 완벽한 규칙이라고 가정하지 않는다 — 그래서 job_runs는 공개 select를 아예 열지
// 않았다(job_runs_2026-09-17.sql). 이건 두 겹 중 바깥쪽이다.
const SECRET_PARAMS = /([?&](?:[a-z_]*(?:key|token|secret|password|passwd|pwd|sig|signature)[a-z_]*)=)[^&\s"']+/gi
const BEARER = /\b(Bearer\s+)[\w.\-+/=]+/gi
const JWT = /\beyJ[\w-]{8,}\.[\w-]+\.[\w-]+/g

export function redactSecrets(text) {
  if (!text) return null
  return String(text)
    .replace(SECRET_PARAMS, '$1***')
    .replace(BEARER, '$1***')
    .replace(JWT, '***')
}

// 오류 메시지가 길어도 화면에 한 줄로 뜬다. 앞부분에 원인이 있다.
const MAX_ERROR = 600

export function errorText(err) {
  const raw = err?.stack || err?.message || String(err)
  const clean = redactSecrets(raw) ?? ''
  return clean.length > MAX_ERROR ? `${clean.slice(0, MAX_ERROR)}…` : clean
}

function config() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return { url: url.replace(/\/+$/, ''), key }
}

async function post(path, body) {
  const cfg = config()
  if (!cfg) {
    console.warn('[job_runs] SUPABASE_URL/SERVICE_ROLE_KEY가 없어 실행 기록을 남기지 않습니다.')
    return false
  }
  const res = await fetch(`${cfg.url}/rest/v1/${path}`, {
    method: 'POST',
    headers: {
      'apikey': cfg.key,
      'Authorization': `Bearer ${cfg.key}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    // 여기서 멈추면 안 된다. 기록은 부가 기능이고, 작업 자체의 성패와 무관하다.
    // 응답 본문에는 컬럼·제약 이름이 그대로 들어 있어 원인 파악에 필요하다.
    const detail = await res.text().catch(() => '')
    console.warn(`[job_runs] ${path} 실패 ${res.status}: ${redactSecrets(detail) ?? ''}`)
    return false
  }
  return true
}

async function save(row) {
  if (!await post('job_runs', row)) return
  // 오래된 것을 가끔 치운다. 매번 부르면 쓸데없는 쿼리가 되고, 아예 안 부르면 계속 자란다.
  // 20번에 한 번이면 하루 6개 작업 기준 사나흘에 한 번꼴이다.
  //
  // 실행 기록만이 아니라 보관 기간이 정해진 것을 한꺼번에 치운다(supabase/
  // data_retention_2026-09-17.sql) — 오류 기록 90일, 처리된 제보의 연락처 1년.
  // 정리 전용 워크플로를 따로 두지 않는 이유는, 그것이 멈췄는지 또 감시해야 하기
  // 때문이다. 크롤·감지·알림이 매일 도니까 그 김에 치운다.
  if (Math.random() < 0.05) await post('rpc/prune_old_data', {})
}

// fn은 { items, detail } 을 돌려준다.
//   items  그 실행이 실제로 만들어낸 것의 개수 (새 draft 수, 옮긴 이미지 수 …)
//   detail 작업마다 다른 세부 숫자. 키가 그대로 화면에 찍히므로 사람이 읽는 말로 적는다.
// 아무것도 안 돌려줘도 된다 — 그때는 시각과 성패만 남는다.
//
// record=false면 아무것도 남기지 않는다(dry-run).
export async function runJob(jobKey, fn, { record = true } = {}) {
  const started = Date.now()
  const startedAt = new Date(started).toISOString()

  let result
  try {
    result = await fn()
  } catch (err) {
    console.error(err)
    if (record) {
      await save({
        job_key: jobKey,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - started,
        status: 'failed',
        error: errorText(err),
      }).catch(() => {})
    }
    process.exit(1)
  }

  if (record) {
    await save({
      job_key: jobKey,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - started,
      status: 'ok',
      items: result?.items ?? null,
      detail: result?.detail ?? null,
    }).catch(() => {})
  }
}
