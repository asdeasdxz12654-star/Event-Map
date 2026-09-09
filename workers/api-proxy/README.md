# event-map-api-proxy

프론트엔드가 외부 API 키를 노출하지 않고 서드파티 API(서울시 실시간 도시데이터 등)를 호출하고,
관리자 CRUD를 서버 사이드에서 처리하기 위한 Cloudflare Worker.

## 로컬 실행

```bash
npm install
npm run dev
```

`http://localhost:8787/health` 로 확인.

## 새 프록시 엔드포인트 추가하기

1. API 키가 필요하면 시크릿으로 등록 (코드에 직접 쓰지 않음):
   ```bash
   npx wrangler secret put SEOUL_OPENDATA_KEY
   ```
2. `src/index.js`의 `routes` 객체에 경로 추가, 핸들러에서 `env.<키>`로 키를 읽어서 외부 API 호출
3. 응답에는 항상 `corsHeaders`가 붙도록 `json()` 헬퍼 사용
4. 응답에 `Cache-Control`을 걸 거라면 `corsHeaders()`의 `Vary: Origin`을 지우지 말 것 —
   ACAO 값이 요청 Origin에 따라 달라지므로, 이게 없으면 다른 오리진용 캐시본이 잘못 서빙된다

## 관리자 비밀번호

`ADMIN_PASSWORD_HASH`는 PBKDF2-SHA256(무작위 salt) 형식을 쓴다. 값은 이렇게 만든다:

```bash
node scripts/hash-password.mjs '관리자 비밀번호'
# pbkdf2$100000$....$....  <- 이 한 줄을 그대로 시크릿에 넣는다
npx wrangler secret put ADMIN_PASSWORD_HASH
```

예전 형식(64자리 SHA-256 hex)도 그대로 동작하므로 당장 바꾸지 않아도 서비스는 멈추지 않는다.
다만 그 형식은 시크릿이 유출되면 오프라인 크랙이 사실상 즉시 끝나므로, 시간이 될 때 위
명령으로 다시 만들어 교체할 것. 무료 플랜에서 로그인 시 CPU 한도 초과가 나면 반복 횟수를
낮춰서(`node scripts/hash-password.mjs '비밀번호' 25000`) 다시 만들면 된다.

## 로그인 시도 제한

`/admin/login`은 같은 IP에서 10분에 5번 틀리면 잠긴다(429 + `Retry-After`). 잠금 시간은 실패가
이어질수록 배로 늘어나고(10분 → 20분 → … 최대 24시간), 로그인에 성공하면 카운터가 지워진다.
IP를 바꿔가며 시도하는 경우에 대비해 전체 실패 횟수도 따로 세서, 일정 횟수를 넘으면 모든
로그인 응답을 2초씩 늦춘다(전체를 잠그면 공격자가 관리자 로그인까지 막을 수 있어 지연만 준다).

카운터는 KV 네임스페이스 `LOGIN_RATE_LIMIT`가 있으면 거기에, 없으면 아이솔레이트 메모리에
저장된다. 메모리 폴백은 콜로마다 따로 세기 때문에 운영에서는 KV를 붙인다:

```bash
npx wrangler kv namespace create LOGIN_RATE_LIMIT
# 출력된 id를 wrangler.toml의 [[kv_namespaces]] 블록(주석 처리돼 있음)에 채우고 주석 해제
npx wrangler deploy
```

KV는 최종 일관성이라 여러 지역에서 동시에 때리면 카운트가 조금 샐 수 있다. 더 확실한 차단이
필요하면 Cloudflare 대시보드 > Security > Rate limiting rules로 `/admin/login` 앞단에 룰을
하나 더 건다.

## 배포

```bash
npx wrangler deploy
```

Cloudflare 계정 인증이 안 되어 있으면 먼저 `npx wrangler login` (브라우저 OAuth) 또는 `CLOUDFLARE_API_TOKEN` 환경변수로 인증.
