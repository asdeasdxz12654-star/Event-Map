import { describe, expect, it } from 'vitest'
import { EVENT_COLUMNS, RE, REVIEW_TABLES, SUB_RESOURCES, UPLOAD_PREFIXES, UPLOAD_TYPES } from './admin.js'

// 관리자 라우트의 "표"들.
//
// 라우트 패턴이 SUB_RESOURCES·REVIEW_TABLES의 키에서 만들어진다. 표에 항목을 더하면서
// 패턴을 안 고치는 실수는 이제 구조적으로 불가능하지만, 그 관계가 실제로 성립하는지는
// 여기서 본다 — 나중에 누군가 패턴을 손으로 다시 적으면 조용히 어긋난다.

describe('하위 리소스 라우트', () => {
  it('표에 있는 이름이 전부 패턴에 잡힌다', () => {
    for (const name of Object.keys(SUB_RESOURCES)) {
      expect(RE.subOfEvent.exec(`/admin/events/e1/${name}`)?.[2]).toBe(name)
      expect(RE.subById.exec(`/admin/${name}/abc`)?.[1]).toBe(name)
    }
  })

  it('표에 없는 이름은 안 잡힌다', () => {
    expect(RE.subOfEvent.exec('/admin/events/e1/events')).toBeNull()
    expect(RE.subById.exec('/admin/secrets/abc')).toBeNull()
  })

  it('경로를 더 파고들 수 없다', () => {
    // ([^/]+)라 슬래시가 더 있으면 안 잡혀야 한다.
    expect(RE.subById.exec('/admin/booths/a/b')).toBeNull()
    expect(RE.subOfEvent.exec('/admin/events/e1/booths/extra')).toBeNull()
  })

  it('모든 하위 리소스에 테이블명과 허용 컬럼이 있다', () => {
    for (const [name, spec] of Object.entries(SUB_RESOURCES)) {
      expect(spec.table, name).toMatch(/^event_/)
      expect(spec.columns.length, name).toBeGreaterThan(0)
      // event_id는 URL에서 서버가 넣는다. 허용 컬럼에 있으면 클라이언트가 남의
      // 행사 id를 지정할 수 있게 된다.
      expect(spec.columns, name).not.toContain('event_id')
      expect(spec.columns, name).not.toContain('id')
    }
  })
})

describe('검수 표 라우트', () => {
  it('표에 있는 이름이 전부 패턴에 잡힌다', () => {
    for (const name of Object.keys(REVIEW_TABLES)) {
      expect(RE.reviewList.exec(`/admin/${name}`)?.[1]).toBe(name)
      expect(RE.reviewById.exec(`/admin/${name}/abc`)?.[1]).toBe(name)
    }
  })

  it('상태 목록이 있으면 기본 상태도 그 안에 있다', () => {
    for (const [name, spec] of Object.entries(REVIEW_TABLES)) {
      if (!spec.statuses) continue
      expect(spec.statuses, name).toContain(spec.defaultStatus)
    }
  })

  it('고칠 수 있는 컬럼은 상태와 메모뿐이다', () => {
    // 나머지(extracted·source_*·promoted_event_id·stack 등)는 크롤러·트리거·수집기가
    // 정한다. 관리자가 고칠 것은 "어떻게 처리했나"뿐이다.
    for (const [name, spec] of Object.entries(REVIEW_TABLES)) {
      if (!spec.patch) continue
      for (const column of spec.patch) {
        expect(['status', 'review_note', 'admin_note'], `${name}.${column}`).toContain(column)
      }
    }
  })

  it('읽기 전용 표는 PATCH가 없다', () => {
    // job_runs는 자동 작업이 남기는 기록이라 사람이 고칠 것이 없다.
    expect(REVIEW_TABLES['job-runs'].patch).toBeNull()
    expect(REVIEW_TABLES['job-runs'].statuses).toBeNull()
  })

  it('정렬 기준이 전부 정해져 있다', () => {
    // 없으면 PostgREST가 순서를 보장하지 않아 목록이 매번 달라진다.
    for (const [name, spec] of Object.entries(REVIEW_TABLES)) {
      expect(spec.order, name).toMatch(/\.(asc|desc)$/)
    }
  })
})

describe('행사 라우트', () => {
  it('행사와 하위 리소스 경로가 서로 안 겹친다', () => {
    // /admin/events/:id 와 /admin/events/:id/booths 가 같은 정규식에 걸리면
    // 부스를 추가하려다 행사가 수정된다.
    expect(RE.event.exec('/admin/events/e1')?.[1]).toBe('e1')
    expect(RE.event.exec('/admin/events/e1/booths')).toBeNull()
    expect(RE.event.exec('/admin/events/e1/unlock')).toBeNull()
    expect(RE.unlock.exec('/admin/events/e1/unlock')?.[1]).toBe('e1')
  })

  it('서버가 정하는 값은 허용 컬럼에 없다', () => {
    for (const forbidden of ['id', 'created_at', 'admin_edited_at']) {
      expect(EVENT_COLUMNS).not.toContain(forbidden)
    }
  })

  it('URL 컬럼이 허용 목록에 들어 있다 (검사를 지나가야 한다)', () => {
    for (const column of ['poster_url', 'ticket_url', 'website', 'floor_plan_url']) {
      expect(EVENT_COLUMNS).toContain(column)
    }
  })
})

describe('업로드', () => {
  it('경로 앞칸은 정해진 것만', () => {
    // 임의의 문자열을 받으면 ../로 버킷 밖을 가리킬 수 있다.
    for (const prefix of UPLOAD_PREFIXES) expect(prefix).toMatch(/^[a-z-]+$/)
  })

  it('이미지 형식만 받는다', () => {
    for (const type of UPLOAD_TYPES) expect(type).toMatch(/^image\//)
    expect(UPLOAD_TYPES).not.toContain('image/svg+xml') // SVG는 스크립트를 담을 수 있다
  })
})
