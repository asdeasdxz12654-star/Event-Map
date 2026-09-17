// 키보드로 이 사이트를 쓸 수 있는가.
//
// 실행
//   1) .env(.env.example 참고)를 채우고  npm run dev -- --port 5190 --strictPort
//   2) node e2e/a11y.mjs
//
// npm test에 넣지 않은 이유: 돌아가는 서버와 실제 행사 데이터가 필요하다. CI에서
// 돌리려면 둘 다 만들어 줘야 하는데, 그러다 느리고 잘 깨지는 검사가 되어 아무도
// 안 보게 된다. 대신 모달·포커스를 건드렸을 때 손으로 한 번 돌리는 용도다.
//
// 여기서 실제로 잡은 것 (2026-09-17)
//   · 사진 뷰어를 닫으면 포커스가 body로 떨어졌다. 트랩은 도는데 복귀만 조용히
//     안 됐다 — autoFocus가 훅보다 먼저 돌아서 "열었던 버튼" 대신 모달 안쪽을
//     기억하고 있었고, 그 요소는 닫을 때 같이 사라진다.
//   · 관리자 로그인 창이 비밀번호 칸 대신 닫기 버튼으로 포커스를 받았다.

import { chromium } from 'playwright'

const BASE = 'http://localhost:5190'
const out = []
const ok = (name, pass, extra = '') => out.push(`${pass ? '✓' : '✗'} ${name}${extra ? ` — ${extra}` : ''}`)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

const active = () => page.evaluate(() => {
  const el = document.activeElement
  return {
    tag: el?.tagName,
    id: el?.id,
    label: el?.getAttribute('aria-label') ?? el?.textContent?.trim().slice(0, 24),
    inDialog: !!el?.closest('[role="dialog"]'),
  }
})

// ── 1) 본문 바로가기 ────────────────────────────────────────────────────────
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.keyboard.press('Tab')
const first = await active()
ok('첫 탭에 "본문 바로가기"가 잡힌다', first.label === '본문 바로가기', JSON.stringify(first))

const visible = await page.evaluate(() => {
  const a = document.querySelector('a[href="#main"]')
  const r = a.getBoundingClientRect()
  return r.width > 20 && r.height > 10
})
ok('포커스를 받으면 화면에 보인다', visible)

await page.keyboard.press('Enter')
await page.waitForTimeout(150)
const afterSkip = await active()
ok('누르면 포커스가 <main>으로 간다', afterSkip.id === 'main', JSON.stringify(afterSkip))

// ── 2) 설정 모달 — 트랩 · Esc · 포커스 복귀 ─────────────────────────────────
const settings = page.locator('button[aria-label="설정"]')
await settings.focus()
await settings.click()
await page.waitForSelector('[role="dialog"][aria-label="설정"]')
await page.waitForTimeout(150)

const opened = await active()
ok('열리면 포커스가 모달 안으로 들어간다', opened.inDialog, JSON.stringify(opened))

// 탭을 충분히 눌러 한 바퀴 이상 돌려 본다 — 한 번이라도 밖으로 새면 실패다.
let escaped = null
for (let i = 0; i < 25; i++) {
  await page.keyboard.press('Tab')
  const a = await active()
  if (!a.inDialog) { escaped = { i, a }; break }
}
ok('탭 25번이 모달 밖으로 새지 않는다', escaped === null, escaped ? JSON.stringify(escaped) : '')

await page.keyboard.press('Escape')
await page.waitForTimeout(200)
const closed = await page.locator('[role="dialog"][aria-label="설정"]').count()
ok('Esc로 닫힌다', closed === 0)
const restored = await active()
ok('닫으면 열었던 버튼으로 포커스가 돌아온다', restored.label === '설정', JSON.stringify(restored))

// ── 3) 겹친 모달 — Esc는 맨 위만 닫는다 ────────────────────────────────────
await settings.click()
await page.waitForTimeout(150)
const adminBtn = page.locator('[role="dialog"][aria-label="설정"] button', { hasText: '로그인' }).first()
if (await adminBtn.count()) {
  await adminBtn.click()
  await page.waitForTimeout(200)
  const adminOpen = await page.locator('[role="dialog"][aria-label="관리자"]').count()
  ok('설정 위에 관리자 모달이 뜬다', adminOpen === 1)

  const adminFocus = await active()
  ok('관리자 모달은 비밀번호 칸으로 바로 간다', adminFocus.tag === 'INPUT', JSON.stringify(adminFocus))

  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  const adminGone = await page.locator('[role="dialog"][aria-label="관리자"]').count()
  const settingsStill = await page.locator('[role="dialog"][aria-label="설정"]').count()
  ok('Esc가 관리자만 닫고 설정은 남긴다', adminGone === 0 && settingsStill === 1,
    `관리자 ${adminGone} · 설정 ${settingsStill}`)
} else {
  out.push('· 관리자 버튼을 못 찾아 겹친 모달 확인은 건너뜀')
}
await page.keyboard.press('Escape')
await page.waitForTimeout(200)

// ── 4) 포스터 전체 보기 — 포커스 복귀 ──────────────────────────────────────
await page.goto(BASE, { waitUntil: 'networkidle' })
const card = page.locator('a[href^="/events/"]').first()
await card.click()
await page.waitForTimeout(1200)

const posterBtn = page.locator('button[aria-label="포스터 전체 보기"]').first()
if (await posterBtn.count()) {
  await posterBtn.focus()
  await posterBtn.click()
  await page.waitForTimeout(250)
  const zoomFocus = await active()
  ok('포스터 뷰어 안으로 포커스가 들어간다', zoomFocus.inDialog, JSON.stringify(zoomFocus))

  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  const stillIn = await active()
  ok('닫기 버튼 하나뿐이어도 탭이 밖으로 안 샌다', stillIn.inDialog, JSON.stringify(stillIn))

  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
  const back = await active()
  ok('닫으면 포스터 버튼으로 포커스가 돌아온다', back.label === '포스터 전체 보기', JSON.stringify(back))
} else {
  out.push('· 이 행사에는 포스터가 없어 뷰어 확인은 건너뜀')
}

// ── 필터 시트(Sheet) — 트랩 · Esc · 복귀 ───────────────────────────────────
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)

const filterBtn = page.locator('button', { hasText: '필터' }).first()
if (await filterBtn.count()) {
  await filterBtn.click()
  await page.waitForTimeout(250)
  const f = await active()
  ok('필터 시트 안으로 포커스가 들어간다', f.inDialog, JSON.stringify(f))

  let leaked = null
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('Tab')
    const a = await active()
    if (!a.inDialog) { leaked = a; break }
  }
  ok('필터 시트에서 탭이 안 샌다', leaked === null, leaked ? JSON.stringify(leaked) : '')

  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
  const back = await active()
  ok('필터 시트를 닫으면 필터 버튼으로 돌아온다', String(back.label).includes('필터'), JSON.stringify(back))
} else {
  out.push('· 필터 버튼을 못 찾음')
}

// ── 굿즈 라이트박스 — 좌우 넘김이 살아 있는가 ──────────────────────────────
// Esc와 스크롤 잠금을 훅으로 옮기면서 같은 이펙트에 있던 좌우 넘김을 건드렸다.
// 그게 안 깨졌는지 본다.
let found = false
const links = await page.locator('a[href^="/events/"]').evaluateAll(
  els => [...new Set(els.map(e => e.getAttribute('href')))]
)

for (const href of links) {
  await page.goto(BASE + href, { waitUntil: 'networkidle' })
  await page.waitForTimeout(900)
  const goodsTab = page.locator('[role="tab"]', { hasText: '굿즈' }).first()
  if (!await goodsTab.count()) continue
  await goodsTab.click()
  await page.waitForTimeout(600)
  // 굿즈 카드는 group w-full text-left 버튼이다(GoodsGrid.jsx:306).
  // 부스 칩·필터 버튼과 섞이지 않게 그것만 고른다.
  const goodsBtn = page.locator('button.group.w-full.text-left')
  if (!await goodsBtn.count()) continue

  await goodsBtn.first().click()
  await page.waitForTimeout(400)
  if (!await page.locator('[role="dialog"]').count()) continue

  found = true
  const f = await active()
  ok(`굿즈 뷰어 안으로 포커스가 들어간다 (${href})`, f.inDialog, JSON.stringify(f))

  const counter = () => page.locator('[role="dialog"] span.tabular-nums').first().innerText()
  const before = await counter()
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(350)
  const after = await counter()
  ok('→ 키로 다음 굿즈로 넘어간다', before !== after, `${before} → ${after}`)

  await page.keyboard.press('ArrowLeft')
  await page.waitForTimeout(350)
  ok('← 키로 돌아온다', (await counter()) === before, `${after} → ${await counter()}`)

  let leaked = null
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press('Tab')
    const a = await active()
    if (!a.inDialog) { leaked = a; break }
  }
  ok('굿즈 뷰어에서 탭이 안 샌다', leaked === null, leaked ? JSON.stringify(leaked) : '')

  await page.keyboard.press('Escape')
  await page.waitForTimeout(350)
  ok('Esc로 닫힌다 (굿즈 뷰어)', (await page.locator('[role="dialog"]').count()) === 0)
  break
}
if (!found) out.push('· 굿즈가 있는 행사를 못 찾음')

console.log(out.join('\n'))
await browser.close()
