# event-map-api-proxy

프론트엔드가 외부 API 키를 노출하지 않고 서드파티 API(교통 경로 등)를 호출하기 위한 Cloudflare Worker.

## 로컬 실행

```bash
npm install
npm run dev
```

`http://localhost:8787/health` 로 확인.

## 새 프록시 엔드포인트 추가하기

1. API 키가 필요하면 시크릿으로 등록 (코드에 직접 쓰지 않음):
   ```bash
   npx wrangler secret put TRANSIT_API_KEY
   ```
2. `src/index.js`의 `routes` 객체에 경로 추가, 핸들러에서 `env.TRANSIT_API_KEY`로 키를 읽어서 외부 API 호출
3. 응답에는 항상 `corsHeaders`가 붙도록 `json()` 헬퍼 사용

## 배포

```bash
npx wrangler deploy
```

Cloudflare 계정 인증이 안 되어 있으면 먼저 `npx wrangler login` (브라우저 OAuth) 또는 `CLOUDFLARE_API_TOKEN` 환경변수로 인증.
