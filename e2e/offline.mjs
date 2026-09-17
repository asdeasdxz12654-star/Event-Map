// 못 불러왔을 때 화면이 그렇다고 말하는가.
//
// 실행
//   1) .env(.env.example 참고)를 채우고  npm run dev -- --port 5190 --strictPort
//   2) node e2e/offline.mjs
//
// 오프라인은 "새로고침"이 아니라 "앱을 열어둔 채 연결이 끊기는" 쪽으로 잰다.
// 그게 더 흔하기도 하고(지하철에 들어간다), 새로고침 쪽은 서비스워커가 앱 셸을
// 캐시에서 띄워줘야 하는데 그 워커는 빌드본에만 있어서 dev에서는 잴 수가 없다.
// 두 경우 모두 화면 코드는 같은 길을 지난다 — useEvents가 실패하고 LoadError가 뜬다.
//
// 이 검사가 잡으려는 것은 "오류가 났다"가 아니라 **"오류가 난 줄 모르게 보인다"** 이다.
// 화면이 빈 목록이나 스켈레톤을 그리면 실패했다는 신호가 어디에도 안 남는다.
//
// 여기서 실제로 잡은 것 (2026-09-17)
//   · 부스 목록 조회만 막으면 부스 8개짜리 행사가 "아직 등록된 부스 정보가 없습니다"로
//     보였다. 탭의 개수 배지도 사라져서 티가 더 안 났다.
//   · 오프라인에서는 supabase-js가 네 번 재시도하느라 8초 동안 스켈레톤만 돌았고,
//     그 뒤 뜨는 문구는 원인(연결 끊김)을 말하지 않았다. 다시 시도 버튼도 없었다.
import { chromium } from 'playwright'

const BASE = 'http://localhost:5190'
const EVENT = '/events/nd-20260914-5f09e9'   // 호요랜드 2026 — 부스·굿즈·무대가 다 있다
const out = []
const ok = (name, pass, extra = '') => out.push(`${pass ? '✓' : '✗'} ${name}${extra ? ` — ${extra}` : ''}`)

const browser = await chromium.launch()

// ── 1) 하위 목록만 실패 — 다른 탭은 멀쩡해야 한다 ──────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
  await page.route('**/rest/v1/event_booths*', r => r.abort())
  await page.goto(BASE + EVENT, { waitUntil: 'networkidle' })
  await page.waitForTimeout(9000)

  const boothTab = page.locator('[role="tab"]', { hasText: '부스' }).first()
  ok('부스 조회가 실패해도 탭은 남는다', await boothTab.count() === 1)

  if (await boothTab.count()) {
    await boothTab.click()
    await page.waitForTimeout(800)
    const panel = (await page.locator('[role="tabpanel"]').first().innerText()).replace(/\s+/g, ' ')
    ok('"불러오지 못했습니다"라고 말한다', panel.includes('불러오지 못했습니다'), panel.slice(0, 60))
    ok('"아직 등록된 …가 없습니다"로 둔갑하지 않는다', !panel.includes('아직 등록된 참가'))
    ok('다시 시도 버튼이 있다', await page.locator('[role="tabpanel"] button', { hasText: '다시 시도' }).count() > 0)
  }

  // 부스만 막았으므로 굿즈·무대는 멀쩡해야 한다.
  const goodsTab = page.locator('[role="tab"]', { hasText: '굿즈' }).first()
  ok('다른 탭은 멀쩡하다 (한 탭 실패가 화면을 덮지 않는다)',
    (await goodsTab.count()) > 0 && /\d/.test(await goodsTab.innerText()),
    await goodsTab.count() ? await goodsTab.innerText() : '굿즈 탭 없음')

  await page.close()
}

// ── 2) 앱을 열어둔 채 연결이 끊긴다 ────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)

  // 북마크 화면을 한 번 열어 둔다. 라우트마다 코드가 따로 내려오는데(코드 스플리팅),
  // 오프라인에서 처음 여는 화면은 그 코드를 못 받아서 데이터 문제가 아니라 화면이
  // 통째로 안 뜬다 — 그건 이 검사가 보려는 것이 아니다. 배포본은 서비스워커가 모든
  // 코드를 미리 받아두므로 실제로는 안 생기는 일이다.
  await page.locator('a[href="/bookmarks"]').first().click()
  await page.waitForTimeout(2000)
  await page.locator('a[href="/"]').first().click()
  await page.waitForTimeout(1500)

  // 여기서 연결이 끊긴다. 화면은 그대로 떠 있고, 다음 이동부터 데이터를 못 받는다.
  await ctx.setOffline(true)
  await page.locator('a[href="/bookmarks"]').first().click()
  await page.waitForTimeout(3000)

  const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
  const t = await text()
  ok('연결이 끊긴 것을 바로 말한다 (8초를 기다리지 않는다)', t.includes('인터넷 연결이 끊겼습니다'), t.slice(-70))
  ok('스켈레톤이 남아 있지 않다', await page.evaluate(() => document.querySelectorAll('[class*=animate-pulse]').length) === 0)
  ok('다시 시도 버튼이 있다', await page.locator('button', { hasText: '다시 시도' }).count() > 0)

  // 연결이 돌아오면 새로고침 없이 이어서 쓸 수 있어야 한다.
  //
  // 버튼을 눌러야만 살아나는 것은 아니다 — online 이벤트가 오면 화면이 스스로 기다리는
  // 모습으로 돌아가고, 재시도 중이던 조회가 그대로 이어진다. 그래서 버튼이 남아 있으면
  // 누르고, 없으면 그냥 기다린 뒤 **복구되었는지만** 본다. 검사를 건너뛰면 안 된다 —
  // 조용히 안 도는 검사는 아무것도 말해주지 않는다.
  await ctx.setOffline(false)
  await page.waitForTimeout(800)
  const retryBtn = page.locator('button', { hasText: '다시 시도' })
  const pressed = await retryBtn.count() > 0
  if (pressed) await retryBtn.first().click()
  await page.waitForTimeout(5000)
  const after = await text()
  ok('연결이 돌아오면 화면이 살아난다' + (pressed ? ' (다시 시도를 눌러서)' : ' (스스로)'),
    !after.includes('인터넷 연결이 끊겼습니다') && after.includes('북마크'), after.slice(-70))

  await ctx.close()
}

// ── 3) 서버 오류(500)는 연결 끊김과 다르게 말한다 ──────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.route('**/rest/v1/events*', r =>
    r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"boom"}' }))
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(5000)
  const t = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ')
  ok('서버 오류는 "불러오지 못했습니다"다', t.includes('불러오지 못했습니다'), t.slice(-60))
  ok('서버 오류를 연결 끊김이라고 하지 않는다', !t.includes('인터넷 연결이 끊겼습니다'))
  await page.close()
}

console.log(out.join('\n'))
await browser.close()
