// 관리자 비밀번호를 ADMIN_PASSWORD_HASH 시크릿 값으로 바꿔준다.
//
// workers/api-proxy/src/index.js 주석이 이 스크립트를 쓰라고 안내하는데 정작 파일이
// 없어서, 권장 형식(PBKDF2)을 만들 방법이 없었다 — 그래서 예전 형식(salt 없는 SHA-256
// 1회)을 계속 쓸 수밖에 없었다.
//
// 사용법:
//   node scripts/hash-password.mjs '비밀번호'
//   npx wrangler secret put ADMIN_PASSWORD_HASH   # 출력된 한 줄을 그대로 붙여넣는다
//
// 출력 형식: pbkdf2$<반복횟수>$<salt(base64)>$<해시(base64)>
// Worker의 verifyPassword()가 이 형식을 그대로 읽는다 (PBKDF2-HMAC-SHA256).
import { pbkdf2Sync, randomBytes } from 'node:crypto'

// 반복 횟수를 올릴수록 시크릿이 유출됐을 때의 크랙 비용이 그만큼 비싸진다. 다만 검증은
// 로그인 요청마다 Worker 안에서 돌아가고, Cloudflare 무료 플랜은 요청당 CPU가 10ms라
// 크게 잡으면 로그인 요청 자체가 CPU 한도로 죽는다 (로그인이 아예 안 되는 쪽이 더 나쁘다).
// 실측(Node 24): 3만 회 ≈ 11ms, 5만 회 ≈ 15ms, 10만 회 ≈ 23ms.
// 그래서 기본값은 3만 회로 잡는다 — 예전 형식(salt 없는 SHA-256 1회)보다 크랙 비용이
// 3만 배 비싸면서 무료 플랜에서도 돈다.
// 유료 플랜이면 올려 두는 게 좋다:  PBKDF2_ITERATIONS=600000 node scripts/hash-password.mjs '...'
// (OWASP 권장치). 반복 횟수는 해시 문자열 안에 같이 들어가므로 Worker 코드는 안 고쳐도 된다.
const ITERATIONS = Number(process.env.PBKDF2_ITERATIONS ?? 30_000)
const SALT_BYTES = 16
const KEY_BYTES = 32

const password = process.argv[2]
if (!password) {
  console.error("사용법: node scripts/hash-password.mjs '<비밀번호>'")
  process.exit(1)
}
if (!Number.isInteger(ITERATIONS) || ITERATIONS < 1000) {
  console.error('PBKDF2_ITERATIONS는 1000 이상의 정수여야 합니다 (Worker가 그 미만은 거부한다).')
  process.exit(1)
}

const salt = randomBytes(SALT_BYTES)
const hash = pbkdf2Sync(password, salt, ITERATIONS, KEY_BYTES, 'sha256')

console.log(`pbkdf2$${ITERATIONS}$${salt.toString('base64')}$${hash.toString('base64')}`)
