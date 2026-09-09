// ADMIN_PASSWORD_HASH 값을 만든다 (PBKDF2-SHA256, 무작위 salt).
//
// 사용 (권장 — 비밀번호가 셸 히스토리에 남지 않는다):
//   node scripts/hash-password.mjs
//     → 프롬프트에 입력 (화면에 안 보임)
//   node scripts/hash-password.mjs --stdin
//     → 비대화형 환경에서. 파이프로 넣는다: cat pw.txt | node scripts/hash-password.mjs --stdin
//
// 사용 (비권장 — 히스토리·프로세스 목록에 평문이 남는다):
//   node scripts/hash-password.mjs '비밀번호'
//
// 반복 횟수 지정 (기본 100000):
//   node scripts/hash-password.mjs --iterations 25000
//
// 출력된 한 줄을 그대로 시크릿에 넣는다:
//   npx wrangler secret put ADMIN_PASSWORD_HASH
//
// 반복 횟수는 해시 문자열 안에 같이 저장되므로 나중에 바꿔도 된다. 기본값 100,000은
// Worker에서 대략 수십 ms의 CPU를 쓴다 — 무료 플랜(요청당 CPU 10ms)에서 로그인 시
// "Exceeded CPU limit"이 뜨면 --iterations 25000 정도로 낮춰서 다시 만들면 된다.
// 낮추더라도 로그인 시도 횟수 제한이 걸려 있어서 온라인 추측 공격에는 충분하다.
import { pbkdf2Sync, randomBytes } from 'node:crypto'
import { createInterface } from 'node:readline'

const args = process.argv.slice(2)

let iterations = 100_000
const iterationsFlag = args.indexOf('--iterations')
if (iterationsFlag !== -1) {
  iterations = Number(args[iterationsFlag + 1])
  args.splice(iterationsFlag, 2)
}
if (!Number.isFinite(iterations) || iterations < 1000) {
  console.error('반복 횟수는 1000 이상이어야 합니다')
  process.exit(1)
}

// 화면에 입력을 표시하지 않는 프롬프트.
function promptHidden(question) {
  return new Promise(resolve => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    // 입력 중 화면에 찍히는 문자를 질문 이후로는 내보내지 않는다.
    let asked = false
    rl._writeToOutput = str => {
      if (!asked) { rl.output.write(str); asked = true; return }
      if (str.includes('\n')) rl.output.write('\n')
    }
    rl.question(question, answer => {
      rl.close()
      resolve(answer)
    })
  })
}

function readStdin() {
  return new Promise(resolve => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', chunk => { data += chunk })
    process.stdin.on('end', () => {
      // 메모장 등이 UTF-8 BOM을 붙여 저장하면 비밀번호 앞에 보이지 않는 문자가 붙는다.
      // 그대로 해시하면 로그인 폼에서 보내는 값과 영영 일치하지 않으므로 떼어낸다.
      // 줄바꿈도 파일 저장 방식(CRLF/LF)에 따라 붙으므로 함께 제거한다.
      resolve(data.replace(/^﻿/, '').replace(/\r?\n$/, ''))
    })
  })
}

async function readPassword() {
  if (args.includes('--stdin')) return readStdin()
  const fromArgv = args.find(a => !a.startsWith('--'))
  if (fromArgv) {
    console.error('⚠️  비밀번호를 인자로 넘겼습니다 — 셸 히스토리와 프로세스 목록에 평문으로 남습니다.')
    console.error('    다음부터는 인자 없이 실행해 프롬프트에 입력하세요. 이번 값은 폐기하는 걸 권합니다.\n')
    return fromArgv
  }
  if (process.stdin.isTTY) return promptHidden('관리자 비밀번호 (입력은 표시되지 않습니다): ')
  // TTY가 아니면(파이프·CI 등) stdin을 그대로 읽는다.
  return readStdin()
}

const password = await readPassword()

if (!password) {
  console.error('비밀번호가 비어 있습니다')
  process.exit(1)
}

const salt = randomBytes(16)
const hash = pbkdf2Sync(password, salt, iterations, 32, 'sha256')

console.log(`pbkdf2$${iterations}$${salt.toString('base64')}$${hash.toString('base64')}`)
