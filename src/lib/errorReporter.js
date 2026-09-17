// 방문자 화면에서 난 오류를 우리에게 알린다.
//
// 지금까지는 알 길이 없었다. ErrorBoundary가 "화면을 표시하지 못했습니다"를 띄우고
// console.error를 남기는데, 그 콘솔은 방문자 브라우저에만 있다. 우리가 볼 수 있는
// 유일한 길은 그 사람이 직접 제보를 보내주는 것뿐이고, 대부분은 그냥 창을 닫는다.
//
// 바깥 서비스를 쓰지 않는 이유
//   계정이 하나 더 늘고, 방문자의 오류 내용이 제3자 서버로 나간다. 이미 Worker와
//   Supabase와 관리자 화면이 있으니 그 길로 보낸다 — 새로 배울 것도, 새로 새는 곳도 없다.
//
// 보내지 않는 것
//   쿼리스트링(검색어가 들어 있다), 쿠키, 로컬스토리지, 사람을 식별할 수 있는 어떤 값도.
//   보내는 것은 메시지 · 스택 · 경로 · user-agent · 빌드 번호뿐이다.

const BASE = import.meta.env.VITE_ADMIN_API_URL || 'https://event-map-api-proxy.asdeasdxz12654.workers.dev'

// 우리가 고칠 수 없는 것들. 이것들이 섞이면 목록이 남의 고장으로 가득 차서,
// 정작 우리 것을 아무도 못 찾는다.
const IGNORED = [
  // 브라우저가 레이아웃 계산을 한 프레임 미룰 때 뱉는 경고. 화면에는 아무 일도 안 난다.
  'ResizeObserver loop',
  // 다른 출처(CORS)에서 난 오류는 브라우저가 내용을 지우고 이 문구만 준다.
  // 우리 코드인지 확장 프로그램인지조차 알 수 없어서 쌓아둘 값이 없다.
  'Script error',
  // 사용자가 탭을 닫거나 페이지를 옮기면 진행 중이던 요청이 이렇게 끊긴다. 정상이다.
  'AbortError',
  'The operation was aborted',
  'Load failed',
  'NetworkError when attempting to fetch resource',
  'Failed to fetch',
  // 배포 직후, 옛 페이지가 열린 탭이 사라진 청크를 가져오려다 나는 것.
  // 새로고침하면 끝이고 우리가 코드로 고칠 것이 없다.
  'Importing a module script failed',
  'Failed to fetch dynamically imported module',
  // Firebase Performance SDK의 알려진 내부 버그 (main.jsx에서 이미 막고 있다).
  'reportAllChanges',
]

// 확장 프로그램이 던진 것. 스택에 확장 주소가 찍힌다.
const EXTENSION = /(chrome|moz|safari|ms-browser)-extension:\/\//

export function shouldReport(message, stack = '') {
  const text = `${message ?? ''}`
  if (!text.trim()) return false
  if (IGNORED.some(pattern => text.includes(pattern))) return false
  if (EXTENSION.test(stack)) return false
  return true
}

// 같은 고장을 같은 줄로 모으는 열쇠.
//
// 메시지 + 스택 첫 줄을 쓴다. 스택 전체를 쓰면 호출 경로가 조금만 달라도 다른 고장이
// 되고, 메시지만 쓰면 서로 다른 곳에서 난 같은 이름의 오류가 한 줄로 뭉친다.
//
// 줄 번호가 붙은 위치(:12:34)는 떼어낸다 — 빌드할 때마다 바뀌어서, 배포 한 번에
// 모든 오류가 "새 고장"으로 다시 나타난다.
export function fingerprint(message, stack = '') {
  const topFrame = String(stack).split('\n').find(l => l.includes('at ') || l.includes('@')) ?? ''
  const stable = topFrame.replace(/:\d+:\d+/g, '').replace(/[?&]v=[^:)\s]+/g, '').trim()
  return hash(`${message}|${stable}`)
}

// 짧고 안정적인 문자열이면 된다 — 암호용이 아니다.
function hash(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

// 보낼 내용으로 다듬는다. 길이 제한은 서버도 한 번 더 건다.
export const LIMITS = { message: 500, stack: 4000, path: 200, userAgent: 300 }

export function buildPayload({ error, kind, path, userAgent, appBuild }) {
  const message = String(error?.message ?? error ?? '알 수 없는 오류').slice(0, LIMITS.message)
  const stack = error?.stack ? String(error.stack).slice(0, LIMITS.stack) : null
  return {
    fingerprint: fingerprint(message, stack ?? ''),
    message,
    stack,
    kind,
    // 쿼리스트링은 버린다 — 검색어가 들어 있다.
    path: String(path ?? '').split('?')[0].slice(0, LIMITS.path),
    user_agent: String(userAgent ?? '').slice(0, LIMITS.userAgent),
    app_build: appBuild ?? null,
  }
}

// 한 번 켜진 탭에서 무한히 보내지 않게 한다.
//
// 렌더 루프 안에서 터지는 오류는 초당 수십 번 난다. 그대로 보내면 방문자 회선을
// 먹고, 우리 Worker의 속도 제한에 걸려서 정작 다른 방문자의 오류가 막힌다.
const MAX_PER_SESSION = 8
const sent = new Set()
let count = 0

export function resetSessionLimit() {
  sent.clear()
  count = 0
}

export function report(error, { kind = 'error' } = {}) {
  const message = String(error?.message ?? error ?? '')
  const stack = error?.stack ?? ''
  if (!shouldReport(message, stack)) return false
  if (count >= MAX_PER_SESSION) return false

  const payload = buildPayload({
    error,
    kind,
    path: window.location.pathname,
    userAgent: navigator.userAgent,
    appBuild: typeof __APP_BUILD__ === 'string' ? __APP_BUILD__ : null,
  })

  // 같은 고장은 이 탭에서 한 번만 보낸다. 서버가 어차피 횟수를 세므로, 같은 탭에서
  // 열 번 더 보내도 알아내는 것이 없다.
  if (sent.has(payload.fingerprint)) return false
  sent.add(payload.fingerprint)
  count++

  // keepalive: 오류 직후 사용자가 창을 닫아도 요청이 살아서 나간다.
  // 실패는 삼킨다 — 오류를 보내다 난 오류를 또 보내면 끝이 없다.
  fetch(`${BASE}/client-errors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {})

  return true
}

// window 단위 오류를 잡는다. main.jsx에서 한 번 부른다.
export function installErrorReporter() {
  window.addEventListener('error', e => {
    // e.error가 없는 경우가 있다(이미지 로드 실패 등 리소스 오류). 그건 코드 오류가
    // 아니라서 보내지 않는다 — 깨진 포스터 주소는 대시보드의 "빈 자리"가 다룬다.
    if (!e.error) return
    report(e.error, { kind: 'error' })
  })

  window.addEventListener('unhandledrejection', e => {
    report(e.reason, { kind: 'unhandledrejection' })
  })
}
