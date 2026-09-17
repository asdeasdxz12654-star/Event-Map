// 방문자 화면에서 오류가 났을 때 정말로 우리에게 알려지는가.
//
// 실행
//   1) .env(.env.example 참고)를 채우고  npm run dev -- --port 5190 --strictPort
//   2) node e2e/error-reporting.mjs
//
// Worker로 실제로 보내지는 않는다 — 요청을 가로채서 "무엇을 보내려 했는지"만 본다.
// 이 검사가 답하는 질문은 "서버가 받나"가 아니라 "브라우저가 보내긴 하나"다.
// 후자가 조용히 안 되는 쪽이 훨씬 잦고, 화면상으로는 전혀 티가 안 난다.
import { chromium } from 'playwright'

const BASE = 'http://localhost:5190'
const out = []
const ok = (name, pass, extra = '') => out.push(`${pass ? '✓' : '✗'} ${name}${extra ? ` — ${extra}` : ''}`)

const browser = await chromium.launch()
const page = await browser.newPage()

const sent = []
await page.route('**/client-errors', async route => {
  sent.push(JSON.parse(route.request().postData() ?? '{}'))
  await route.fulfill({ status: 201, body: '{"ok":true}' })
})

const wait = async (n, ms = 1500) => {
  const until = Date.now() + ms
  while (sent.length < n && Date.now() < until) await page.waitForTimeout(50)
}

await page.goto(BASE, { waitUntil: 'networkidle' })

// ── 1) 처리 안 된 예외 ─────────────────────────────────────────────────────
await page.evaluate(() => { setTimeout(() => { throw new Error('테스트용 고장') }, 0) })
await wait(1)
ok('window 오류를 보낸다', sent.length === 1, JSON.stringify(sent[0]?.message))
ok('kind가 error다', sent[0]?.kind === 'error', sent[0]?.kind)
ok('경로를 함께 보낸다', sent[0]?.path === '/', sent[0]?.path)
ok('빌드 번호를 함께 보낸다', !!sent[0]?.app_build, sent[0]?.app_build)
ok('fingerprint가 있다', !!sent[0]?.fingerprint, sent[0]?.fingerprint)

// ── 2) 같은 오류는 한 탭에서 한 번만 ───────────────────────────────────────
const before = sent.length
await page.evaluate(() => { setTimeout(() => { throw new Error('테스트용 고장') }, 0) })
await page.waitForTimeout(700)
ok('같은 오류를 두 번 보내지 않는다', sent.length === before, `${before} → ${sent.length}`)

// ── 3) 처리 안 된 Promise 거부 ─────────────────────────────────────────────
await page.evaluate(() => { Promise.reject(new Error('거부된 약속')) })
await wait(before + 1)
const rejection = sent.find(s => s.message.includes('거부된 약속'))
ok('처리 안 된 Promise 거부를 보낸다', !!rejection)
ok('kind가 unhandledrejection이다', rejection?.kind === 'unhandledrejection', rejection?.kind)

// ── 4) 우리가 고칠 수 없는 것은 안 보낸다 ──────────────────────────────────
const noiseBefore = sent.length
await page.evaluate(() => {
  setTimeout(() => { throw new Error('ResizeObserver loop completed with undelivered notifications.') }, 0)
})
await page.evaluate(() => { Promise.reject(new Error('TypeError: Failed to fetch')) })
await page.waitForTimeout(800)
ok('ResizeObserver·끊긴 요청은 안 보낸다', sent.length === noiseBefore, `${noiseBefore} → ${sent.length}`)

// ── 5) 쿼리스트링은 안 보낸다 ──────────────────────────────────────────────
await page.goto(`${BASE}/?q=내가찾던것`, { waitUntil: 'networkidle' })
await page.evaluate(() => { setTimeout(() => { throw new Error('검색 중 고장') }, 0) })
await wait(sent.length + 1)
const last = sent[sent.length - 1]
ok('경로에 검색어가 안 실린다', last?.path === '/' && !JSON.stringify(last).includes('내가찾던것'),
  JSON.stringify(last?.path))

console.log(out.join('\n'))
await browser.close()
