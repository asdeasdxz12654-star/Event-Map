// Supabase(PostgREST) 호출.
//
// service_role 키를 쓰는 곳은 여기뿐이다. RLS를 통째로 우회하는 키라, 어디서 무엇을
// 부르는지 한 파일에서 보이는 편이 낫다.
import { HttpError } from './http.js'

export async function supabase(env, method, path, body) {
  const url = `${env.SUPABASE_URL}/rest/v1/${path}`
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      // POST뿐 아니라 PATCH도 바뀐 행을 돌려받는다 — return=minimal이면 PostgREST가
      // "0행 수정"도 성공으로 주기 때문에, 없는 id로 PATCH해도 200 {ok:true}가 나갔다.
      // 반환된 배열이 비었는지로 404를 판별하려면 representation이 필요하다.
      'Prefer': method === 'DELETE' ? 'return=minimal' : 'return=representation',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw dbError(text, res.status)
  return text ? JSON.parse(text) : null
}

// PostgREST 오류 본문에서 SQLSTATE를 꺼내 에러에 붙여 둔다.
//
// 본문은 {"code":"23514","details":…,"hint":…,"message":…} 모양이다. 던지는 쪽에서
// 미리 꺼내 두면 부르는 쪽마다 문자열을 다시 뒤지지 않아도 된다 — 예전엔
// handleReportCreate 한 곳만 `text.includes('23503')`으로 훑고 있었고, 나머지는
// 전부 500으로 나갔다.
function dbError(text, status) {
  let code = null
  try {
    code = JSON.parse(text)?.code ?? null
  } catch {
    // PostgREST가 아닌 응답(게이트웨이 오류 등)일 수 있다. 그건 코드가 없는 게 맞다.
  }
  const err = new Error(text || `Supabase error ${status}`)
  err.dbCode = code
  err.httpStatus = status
  return err
}

// DB가 거절한 것 중 "요청이 잘못된 것"을 400으로 바꾼다.
//
// 왜 필요한가
//   지금까지 제약 위반이 전부 500 internal_error로 나갔다. 관리자 화면에서 날짜를
//   잘못 넣거나 없는 행사에 부스를 붙이면 "서버 오류로 저장하지 못했습니다"가 뜬다 —
//   자기 입력 실수인데 서버 탓으로 읽히고, 고칠 실마리가 하나도 없다. 그리고 진짜
//   서버 오류가 같은 코드에 묻혀서 로그에서 구분이 안 된다.
//
//   제보 쪽(handleReportCreate)에서 23503·23514를 400으로 바꾸는 일을 이미 했는데,
//   그걸 관리자 쪽으로 옮기지 않아서 같은 문제가 그대로 남아 있었다. 한 곳으로 모은다.
const DB_CODE_TO_HTTP = {
  '23502': [400, 'missing_required'],   // not_null_violation — 필수 값이 비었다
  '23503': [400, 'invalid_reference'],  // foreign_key_violation — 가리키는 대상이 없다
  '23505': [409, 'duplicate'],          // unique_violation — 이미 같은 값이 있다
  '23514': [400, 'invalid_value'],      // check_violation — 허용 범위를 벗어났다
  '22P02': [400, 'invalid_value'],      // invalid_text_representation — 숫자/uuid 형식
  '22007': [400, 'invalid_value'],      // invalid_datetime_format
  '22008': [400, 'invalid_value'],      // datetime_field_overflow
  '22001': [400, 'invalid_value'],      // string_data_right_truncation — 너무 길다
}

// 우리가 아는 제약 위반이면 HttpError로 바꿔 돌려주고, 아니면 null.
// null이면 부르는 쪽이 500으로 처리한다 — 모르는 실패를 400이라고 우기지 않는다.
export function asRequestError(err) {
  const mapped = DB_CODE_TO_HTTP[err?.dbCode]
  if (!mapped) return null
  return new HttpError(mapped[0], mapped[1])
}

// PATCH 결과가 빈 배열이면 그 id를 가진 행이 없다는 뜻 -> 404.
// source_watches는 기본키가 id가 아니라 key다. 테이블마다 기본키 이름을 따로 두는 것보다
// 예외 하나를 여기 적어두는 편이 읽기 쉽다.
const PK = { source_watches: 'key' }

export async function updateRow(env, table, id, body) {
  const pk = PK[table] ?? 'id'
  const rows = await supabase(env, 'PATCH', `${table}?${pk}=eq.${encodeURIComponent(id)}`, body)
  if (!Array.isArray(rows) || rows.length === 0) throw new HttpError(404, 'not_found')
  return rows[0]
}

// PostgREST의 insert는 배열을 준다(return=representation). 한 건을 넣었으면 한 건을
// 돌려주는 게 부르는 쪽에 자연스럽다.
export function firstRow(data) {
  return Array.isArray(data) ? data[0] : data
}

export async function deleteRow(env, table, id) {
  await supabase(env, 'DELETE', `${table}?id=eq.${encodeURIComponent(id)}`)
}
