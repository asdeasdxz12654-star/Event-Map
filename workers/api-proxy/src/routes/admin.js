// /admin/* — 관리자만 쓰는 문.
//
// 예전엔 이 전체가 index.js 안의 260줄짜리 if-체인이었다. 그중 90줄은 "목록을 주고
// 상태를 바꾸는" 표 넷(검수·제보·오류·실행기록)이 거의 같은 모양으로 반복된 것이었다.
// 새 표를 하나 더할 때마다 그 90줄을 한 번 더 복사해야 했고, 실제로 client_errors를
// 붙일 때 그렇게 했다. 표를 레지스트리로 옮겨 한 벌만 남긴다.
import { HttpError, corsHeaders, json, pick, readJsonBody, tooMany } from '../lib/http.js'
import { deleteRow, firstRow, supabase, updateRow } from '../lib/db.js'
import { assertOneOf, assertUrlColumns } from '../lib/validate.js'
import {
  LOGIN_FAILURE_DELAY_MS, LOGIN_GLOBAL_THROTTLE_AFTER, LOGIN_GLOBAL_THROTTLE_MS,
  clearLoginFailures, delay, issueSessionToken, loginLockedFor, recordLoginFailure,
  verifyAdmin, verifyPassword,
} from '../lib/auth.js'

// ── 행사 ───────────────────────────────────────────────────────────────────
const EVENT_COLUMNS = [
  'title', 'category', 'start_date', 'end_date',
  'venue', 'venue_address', 'venue_lat', 'venue_lng',
  'organizer', 'description', 'poster_url',
  'ticket_url', 'ticket_open_date', 'ticket_open_time', 'ticket_open_note',
  'ticket_status', 'admission_fee', 'website', 'trust_score',
  'past_events', 'tags', 'crowd_level', 'floor_plan_url',
  'seoul_place_name', 'booth_info_note', 'stage_info_note', 'floor_plan_note',
  'goods_info_note', 'cosplay_info_note',
]

// 행사에 딸린 하위 목록(참가 부스, 출연진)은 구조가 같아서 라우트 패턴을 공유한다 —
// urlSegment(URL에 쓰는 이름) -> 실제 테이블명 + 허용 컬럼만 다르다.
const SUB_RESOURCES = {
  booths: {
    table: 'event_booths',
    columns: ['name', 'booth_no', 'goods', 'image_url', 'sort_order', 'operator', 'hall', 'genre'],
  },
  performers: { table: 'event_performers', columns: ['artist_name', 'songs', 'sort_order'] },
  // 무대는 장소(stages)와 시간표(stage_slots)로 나뉜다 — 한 행사에 무대가 여럿일 수 있고
  // (지스타는 기업 부스마다 자체 무대가 있다), 같은 프로그램이 여러 날 반복되기 때문이다.
  stages: { table: 'event_stages', columns: ['name', 'booth_id', 'location', 'sort_order'] },
  stage_slots: {
    table: 'event_stage_slots',
    columns: ['stage_id', 'day', 'start_time', 'end_time', 'title', 'performer', 'note', 'kind', 'sort_order'],
  },
  cosplayers: {
    table: 'event_cosplayers',
    columns: ['name', 'booth_id', 'character', 'title', 'photo_url', 'sns_url',
      'day', 'start_time', 'end_time', 'note', 'sort_order'],
  },
  // 부스 안의 개별 항목(웰컴 키트·체험·굿즈 등). booth_id를 body로 받는 대신 event_id는
  // 다른 하위 리소스와 똑같이 URL에서 서버가 넣는다 — 클라이언트가 남의 행사 id를
  // 지정할 수 없고, 라우트 코드도 그대로 재사용된다.
  booth_items: {
    table: 'event_booth_items',
    columns: ['booth_id', 'kind', 'name', 'price', 'price_note', 'note', 'image_url',
      'sort_order', 'title', 'status'],
  },
  // 상세페이지 탭의 이름·순서·표시 여부와, 직접 만든 탭의 본문.
  // 행이 없으면 화면은 예전처럼 동작한다 — 이 표의 행은 기본 동작을 덮어쓰는 예외다.
  tabs: {
    table: 'event_tabs',
    columns: ['key', 'builtin', 'label', 'body', 'visible', 'sort_order'],
  },
}

// ── 검수 표 ────────────────────────────────────────────────────────────────
// "목록을 훑고 상태를 바꾸는" 것이 전부인 표들. 넷이 하는 일이 같아서 여기 한 줄씩 적고
// 아래 핸들러 한 벌이 처리한다.
//
//   statuses가 null이면 상태 필터가 없다(읽기만 하는 표).
//   patch가 null이면 PATCH 라우트를 만들지 않는다.
//
// limit: 어느 화면이든 한 번에 훑는 용도라 페이지네이션이 없다. PostgREST 기본 상한과
// 무관하게 여기서 끊어두면, 쌓여도 응답이 무한정 커지지 않는다.
const LIST_LIMIT = 200

const REVIEW_TABLES = {
  // 검수 화면이 바꿀 수 있는 컬럼은 "승인할지 말지"와 그 사유뿐이다.
  // 나머지(extracted·source_*·promoted_event_id)는 크롤러와 트리거가 정한다.
  drafts: {
    table: 'event_drafts',
    statuses: ['pending', 'approved', 'rejected'],
    defaultStatus: 'pending',
    order: 'created_at.desc',
    patch: ['status', 'review_note'],
  },
  // 제보에는 연락처가 들어 있어서 공개 읽기를 열지 않았다 — 이 경로로만 볼 수 있다.
  // 목록에 대상 행사 제목을 함께 가져온다: 제보만 봐서는 어느 행사 얘기인지 id밖에 안 보인다.
  reports: {
    table: 'event_reports',
    statuses: ['open', 'resolved', 'rejected'],
    defaultStatus: 'open',
    select: '*,events(title,start_date)',
    order: 'created_at.desc',
    patch: ['status', 'admin_note'],
    // 처리 시각은 서버가 찍는다 — 클라이언트 시계를 믿을 이유가 없다.
    stampReviewedAt: true,
  },
  // stack에 우리 코드 구조가, user_agent에 방문자 정보가 들어 있어 공개하지 않는다.
  'client-errors': {
    table: 'client_errors',
    statuses: ['open', 'resolved', 'ignored'],
    defaultStatus: 'open',
    order: 'last_seen_at.desc',
    patch: ['status', 'admin_note'],
  },
  // 대시보드가 "크롤러 마지막 실행 3일 전"을 말하기 위해 읽는다.
  // error 컬럼에 외부 API 응답이 그대로 들어올 수 있고, 그 안에 요청 URL이 섞이면 키가
  // 딸려 온다. 쓰는 쪽에서 한 번 지우지만(shared/job-run.mjs redactSecrets) 그 규칙이
  // 완벽하다고 가정하지 않아서 공개 읽기를 안 열었다.
  'job-runs': {
    table: 'job_runs',
    statuses: null,
    order: 'started_at.desc',
    patch: null,
  },
}

// ── 이미지 업로드 ─────────────────────────────────────────────────────────
// 관리자가 공지 캡처 같은 파일을 바로 올릴 수 있게 한다.
//
// 왜 필요한가
//   지금까지 이미지는 "주소를 붙여넣는" 방법뿐이었다. 그런데 실제로 필요한 사진은
//   공식 공지 안에 박혀 있는 경우가 많다 — 호요랜드 굿즈는 1200x42,500px짜리 세로
//   이미지 한 장, 젠레스는 1920x1080 슬라이드 9장이 전부다. 거기서 상품 부분을
//   잘라낸 파일에는 붙여넣을 주소가 없다. 어딘가에 먼저 올려야 했고, 그 단계가
//   사실상 입력을 막고 있었다.
//
// 크기 줄이기는 브라우저가 한다(ImageField의 canvas). Worker에는 이미지 처리
// 라이브러리가 없고, 줄여서 보내면 업로드 자체도 가벼워진다.
const UPLOAD_BUCKET = 'event-images'
// 브라우저가 webp로 줄여 보내므로 보통 1MB를 넘지 않는다. 배치도 원본을 그대로
// 올리는 경우를 감안해 여유를 두되, 버킷 상한(15MB)보다는 낮게 잡는다.
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024
const UPLOAD_TYPES = ['image/webp', 'image/jpeg', 'image/png', 'image/gif']
// 저장 경로의 앞칸. 임의의 문자열을 받으면 ../로 버킷 밖을 가리킬 수 있다.
const UPLOAD_PREFIXES = ['items', 'booths', 'cosplayers', 'floor-plans', 'posters-manual']

async function uploadImage(request, env, url) {
  const prefix = url.searchParams.get('prefix') ?? 'items'
  if (!UPLOAD_PREFIXES.includes(prefix)) throw new HttpError(400, 'invalid_upload')

  const contentType = (request.headers.get('content-type') ?? '').split(';')[0].trim()
  if (!UPLOAD_TYPES.includes(contentType)) throw new HttpError(400, 'invalid_upload')

  // 크기는 본문을 읽기 "전에" 먼저 본다. arrayBuffer()는 통째로 메모리에 올리므로,
  // 읽고 나서 재면 이미 늦다 — 100MB짜리가 들어오면 그걸 다 담은 뒤에 413을 주게 되고
  // 그 전에 아이솔레이트 메모리 한도(128MB)에 먼저 부딪힌다.
  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > MAX_UPLOAD_BYTES) throw new HttpError(413, 'file_too_large')

  const bytes = new Uint8Array(await request.arrayBuffer())
  if (bytes.byteLength === 0) throw new HttpError(400, 'invalid_upload')
  // Content-Length를 안 보내는 요청(청크 전송)도 있으므로 실제 크기로 한 번 더 막는다.
  if (bytes.byteLength > MAX_UPLOAD_BYTES) throw new HttpError(413, 'file_too_large')

  // 파일 이름은 서버가 정한다. 클라이언트가 준 이름을 쓰면 경로 조작과 덮어쓰기를
  // 둘 다 열어주게 된다 — 같은 이름으로 올려 남의 이미지를 갈아치울 수 있다.
  const ext = contentType === 'image/jpeg' ? 'jpg' : contentType.slice('image/'.length)
  const name = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}.${ext}`
  const path = `${prefix}/${name}`
  // 시크릿에 끝 슬래시가 붙어 있으면 ".../storage//..." 같은 주소가 만들어진다.
  // Storage는 그걸 다른 경로로 보기 때문에 올린 파일을 못 찾게 된다.
  const base = (env.SUPABASE_URL ?? '').replace(/\/+$/, '')

  const res = await fetch(`${base}/storage/v1/object/${UPLOAD_BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'cache-control': 'max-age=31536000',
    },
    body: bytes,
  })
  if (!res.ok) {
    console.error('[upload]', res.status, await res.text().catch(() => ''))
    throw new HttpError(502, 'upload_failed')
  }

  return `${base}/storage/v1/object/public/${UPLOAD_BUCKET}/${path}`
}

// ── 라우트 ────────────────────────────────────────────────────────────────
// 정규식을 전부 모듈 스코프에 모은다. 예전엔 일부는 여기, 일부는 핸들러 안에 인라인으로
// 있어서 새 라우트를 더할 때마다 어디에 둘지 매번 정해야 했다.
const subResourcePattern = Object.keys(SUB_RESOURCES).join('|')
const reviewPattern = Object.keys(REVIEW_TABLES).join('|')

const RE = {
  event: /^\/admin\/events\/([^/]+)$/,
  unlock: /^\/admin\/events\/([^/]+)\/unlock$/,
  watchAck: /^\/admin\/watches\/([^/]+)\/ack$/,
  subOfEvent: new RegExp(`^/admin/events/([^/]+)/(${subResourcePattern})$`),
  subById: new RegExp(`^/admin/(${subResourcePattern})/([^/]+)$`),
  reviewList: new RegExp(`^/admin/(${reviewPattern})$`),
  reviewById: new RegExp(`^/admin/(${reviewPattern})/([^/]+)$`),
}

async function handleLogin(request, env) {
  // 시크릿이 안 붙은 배포는 로그인을 아예 막는다. 예전엔 SESSION_SECRET이 없어도 로그인이
  // "성공"하면서 토큰을 내줬는데(서명 키가 문자열 "undefined"가 된다) verifySessionToken은
  // 그 상태에서 무조건 false를 돌려주니, 관리자는 "로그인은 되는데 이후 요청이 전부 401"인
  // 원인 모를 상태에 빠졌다. 설정 누락은 설정 누락이라고 말해주는 편이 낫다.
  if (!env.ADMIN_PASSWORD_HASH || !env.SESSION_SECRET) {
    console.error('[admin] ADMIN_PASSWORD_HASH 또는 SESSION_SECRET 시크릿이 등록되지 않았습니다')
    return json({ error: 'not_configured' }, env, { status: 501 })
  }

  const retryAfter = await loginLockedFor(request, env)
  if (retryAfter > 0) return tooMany('too_many_attempts', retryAfter, env)

  const body = await readJsonBody(request).catch(() => ({}))
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!await verifyPassword(password, env.ADMIN_PASSWORD_HASH)) {
    const globalFailures = await recordLoginFailure(request, env)
    await delay(
      globalFailures > LOGIN_GLOBAL_THROTTLE_AFTER
        ? LOGIN_GLOBAL_THROTTLE_MS
        : LOGIN_FAILURE_DELAY_MS
    )
    return json({ error: 'invalid_credentials' }, env, { status: 401 })
  }
  await clearLoginFailures(request, env)
  return json({ token: await issueSessionToken(env) }, env)
}

// 검수 표 목록. status는 화이트리스트를 지난 값만 쿼리에 들어간다.
async function listReviewTable(request, env, spec) {
  const params = [`order=${spec.order}`, `limit=${LIST_LIMIT}`]
  if (spec.select) params.push(`select=${spec.select}`)
  if (spec.statuses) {
    const status = new URL(request.url).searchParams.get('status') ?? spec.defaultStatus
    assertOneOf(status, spec.statuses)
    params.push(`status=eq.${status}`)
  }
  const rows = await supabase(env, 'GET', `${spec.table}?${params.join('&')}`)
  return json(rows ?? [], env)
}

// 검수 표의 행 하나를 고친다. 바뀐 행을 통째로 돌려준다 —
// 검수(drafts)는 승인이 실패하면 트리거가 그 행만 rejected로 돌리고 사유를 적으므로,
// 요청이 성공해도 status가 rejected일 수 있다. {ok:true}만 주면 호출부가
// "승인했는데 왜 반려됨?"을 알 길이 없다. 나머지 표도 같은 모양으로 맞춘다.
async function patchReviewRow(request, env, spec, id) {
  const body = await readJsonBody(request)
  const patch = pick(body, spec.patch)
  if (patch.status != null) assertOneOf(patch.status, spec.statuses)
  if (spec.stampReviewedAt && patch.status && patch.status !== spec.defaultStatus) {
    patch.reviewed_at = new Date().toISOString()
  }
  return json(await updateRow(env, spec.table, id, patch), env)
}

export async function handleAdmin(request, env, pathname) {
  // 로그인은 인증의 시작점이라 verifyAdmin 검사 이전에 처리한다.
  // 비밀번호 해시는 서버(env.ADMIN_PASSWORD_HASH)에만 있고 응답엔 절대 포함하지 않는다.
  if (pathname === '/admin/login' && request.method === 'POST') {
    return handleLogin(request, env)
  }

  if (!await verifyAdmin(request, env)) {
    return json({ error: 'unauthorized' }, env, { status: 401 })
  }

  const { method } = request

  // POST /admin/uploads?prefix=items — 이미지 파일 업로드 (본문이 JSON이 아니라 바이트다)
  if (pathname === '/admin/uploads' && method === 'POST') {
    return json({ url: await uploadImage(request, env, new URL(request.url)) }, env, { status: 201 })
  }

  // POST /admin/watches/:key/ack — 감지 알림을 확인 처리한다.
  // 값을 바꾸는 게 아니라 "봤다"를 기록하는 것이라 body가 없다.
  const ack = RE.watchAck.exec(pathname)
  if (ack && method === 'POST') {
    await updateRow(env, 'source_watches', decodeURIComponent(ack[1]), {
      acknowledged_at: new Date().toISOString(),
    })
    return json({ ok: true }, env)
  }

  // GET  /admin/drafts|reports|client-errors|job-runs?status=…
  // PATCH /admin/drafts|reports|client-errors/:id
  const reviewList = RE.reviewList.exec(pathname)
  if (reviewList && method === 'GET') {
    return listReviewTable(request, env, REVIEW_TABLES[reviewList[1]])
  }
  const reviewById = RE.reviewById.exec(pathname)
  if (reviewById && method === 'PATCH') {
    const spec = REVIEW_TABLES[reviewById[1]]
    if (!spec.patch) throw new HttpError(405, 'method_not_allowed')
    return patchReviewRow(request, env, spec, decodeURIComponent(reviewById[2]))
  }

  // POST /admin/events/:eventId/booths|performers|… — 하위 항목 추가
  const subOfEvent = RE.subOfEvent.exec(pathname)
  if (subOfEvent && method === 'POST') {
    const { table, columns } = SUB_RESOURCES[subOfEvent[2]]
    const body = await readJsonBody(request)
    const data = await supabase(env, 'POST', table, {
      ...assertUrlColumns(pick(body, columns)),
      event_id: decodeURIComponent(subOfEvent[1]),
    })
    return json(firstRow(data), env, { status: 201 })
  }

  const subById = RE.subById.exec(pathname)
  if (subById) {
    const { table, columns } = SUB_RESOURCES[subById[1]]
    const id = decodeURIComponent(subById[2])
    // PATCH /admin/booths|performers/:id — 하위 항목 수정
    if (method === 'PATCH') {
      const body = await readJsonBody(request)
      await updateRow(env, table, id, assertUrlColumns(pick(body, columns)))
      return json({ ok: true }, env)
    }
    // DELETE /admin/booths|performers/:id — 하위 항목 삭제
    if (method === 'DELETE') {
      await deleteRow(env, table, id)
      return new Response(null, { status: 204, headers: corsHeaders(env) })
    }
  }

  // POST /admin/events — 행사 추가
  if (pathname === '/admin/events' && method === 'POST') {
    const body = await readJsonBody(request)
    const data = await supabase(env, 'POST', 'events', {
      ...assertUrlColumns(pick(body, EVENT_COLUMNS)),
      id: crypto.randomUUID(),
    })
    return json(firstRow(data), env, { status: 201 })
  }

  // POST /admin/events/:id/unlock — 크롤러 자동 갱신을 다시 켠다.
  //
  // 아래 PATCH가 admin_edited_at을 찍고 나면 크롤러 13곳이 그 행을 건너뛴다
  // (known-events.mjs 등에서 .is('admin_edited_at', null)). 제목 오타 하나를 고쳐도
  // 그 행사는 이후 공식 포스터·예매 링크가 발표돼도 영영 자동으로 안 채워진다.
  //
  // PATCH의 한 필드로 두지 않는 이유: PATCH는 무조건 admin_edited_at을 찍으므로
  // 같은 요청 안에서 켜고 끄는 게 서로 어긋난다. 별도 동작으로 두는 편이 분명하다.
  const unlock = RE.unlock.exec(pathname)
  if (unlock && method === 'POST') {
    await updateRow(env, 'events', decodeURIComponent(unlock[1]), { admin_edited_at: null })
    return json({ ok: true }, env)
  }

  const event = RE.event.exec(pathname)
  if (event) {
    const id = decodeURIComponent(event[1])
    // PATCH /admin/events/:id — 행사 수정
    // admin_edited_at을 항상 서버에서 찍는다 — 관리자가 고친 값이 크롤러 값으로
    // 덮어써지지 않게 막는다(위 unlock 참고).
    if (method === 'PATCH') {
      const body = await readJsonBody(request)
      await updateRow(env, 'events', id, {
        ...assertUrlColumns(pick(body, EVENT_COLUMNS)),
        admin_edited_at: new Date().toISOString(),
      })
      return json({ ok: true }, env)
    }
    // DELETE /admin/events/:id — 행사 삭제
    // event_drafts.promoted_event_id는 on delete set null이라 따로 정리할 필요가 없다
    // (supabase/hardening_2026-09-09.sql에서 FK 제약을 그렇게 바꿨다).
    if (method === 'DELETE') {
      await deleteRow(env, 'events', id)
      return new Response(null, { status: 204, headers: corsHeaders(env) })
    }
  }

  return json({ error: 'not_found' }, env, { status: 404 })
}

// 표·컬럼 목록은 검사에서 읽는다 — 라우트 패턴과 실제 표가 어긋나지 않는지 본다.
export { EVENT_COLUMNS, REVIEW_TABLES, RE, SUB_RESOURCES, UPLOAD_PREFIXES, UPLOAD_TYPES }
