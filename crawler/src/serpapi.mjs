// SerpAPI 호출 공통부 — 이미지 검색(serpapi-image.mjs)과 웹 검색(official-site-lookup.mjs)이
// 같이 쓴다. 캐시·한도 처리를 한 군데 모아두려고 분리했다.
// 환경변수: SERPAPI_KEY
//
// 무료 플랜은 월 250회다. 게다가 SerpAPI는 같은 검색을 약 1시간 캐시해서 그 안엔 다시
// 물어봐도 크레딧이 안 나간다(실제로 같은 워크플로를 연달아 두 번 돌렸을 때 사용량이
// 그대로였다). 그래도 우리 쪽에서도 아낀다 — 아래 SERPAPI_CACHE_DIR과, 후보를 건지면
// 더 안 뒤지는 호출부 규칙이 그것이다.
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const SERPAPI_URL = 'https://serpapi.com/search'

// 캐시 디렉터리를 지정하면 같은 검색은 한 번만 실제로 호출한다.
// CI에서는 안 켜도 되고, 로컬에서 기준을 손보며 돌려볼 때 쓰라고 만든 스위치다.
const CACHE_DIR = process.env.SERPAPI_CACHE_DIR ?? ''

// 크레딧이 떨어지면 SerpAPI가 매 호출마다 같은 오류를 준다. 행사 수십 건을 도는
// 동안 그걸 계속 때리지 않도록, 한 번 확인하면 이후 호출을 아예 건너뛴다.
let quotaExhausted = false

export function isQuotaExhausted() { return quotaExhausted }

function cachePathFor(engine, query) {
  const key = createHash('sha1').update(`${engine}\n${query}`).digest('hex').slice(0, 16)
  return path.join(CACHE_DIR, `${engine}-${key}.json`)
}

async function readCache(engine, query) {
  if (!CACHE_DIR) return null
  try { return JSON.parse(await readFile(cachePathFor(engine, query), 'utf8')) }
  catch { return null }
}

async function writeCache(engine, query, data) {
  if (!CACHE_DIR) return
  try {
    await mkdir(CACHE_DIR, { recursive: true })
    await writeFile(cachePathFor(engine, query), JSON.stringify(data), 'utf8')
  } catch { /* 캐시는 실패해도 그냥 넘어간다 */ }
}

// 검색 결과 JSON을 그대로 돌려준다 (실패하면 null).
//   engine: 'google_images' | 'bing_images' | 'google'
//   extra : 엔진별 추가 파라미터
export async function serpapiSearch(engine, query, extra = {}) {
  const cached = await readCache(engine, query)
  if (cached) return cached
  if (quotaExhausted) return null
  if (!process.env.SERPAPI_KEY) return null

  const url = new URL(SERPAPI_URL)
  url.searchParams.set('engine', engine)
  url.searchParams.set('q', query)
  url.searchParams.set('api_key', process.env.SERPAPI_KEY)
  for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, value)

  let data = null
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
    data = await res.json().catch(() => null)
    if (!res.ok && !data?.error) {
      console.warn(`  [SerpAPI] ${engine} 검색 실패: HTTP ${res.status}`)
      return null
    }
  } catch (err) {
    console.warn(`  [SerpAPI] ${engine} 검색 실패: ${err.message}`)
    return null
  }

  if (data?.error) {
    // 무료 플랜 소진("Your account has run out of searches")·요금제 한도는 재시도해도 같다.
    if (/run out of searches|exceeded your searches|hourly searches/i.test(data.error)) {
      quotaExhausted = true
      console.warn(`  [SerpAPI] 검색 한도 소진 — 이후 검색은 건너뜁니다 (${data.error})`)
    } else {
      console.warn(`  [SerpAPI] ${engine} 검색 실패: ${data.error}`)
    }
    return null
  }

  await writeCache(engine, query, data)
  return data
}

// 캐시만으로도 돌려볼 수 있게 (키 없이 로컬에서 기준을 손볼 때)
export function hasSearchAccess() {
  return Boolean(process.env.SERPAPI_KEY || CACHE_DIR)
}
