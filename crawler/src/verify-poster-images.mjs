// 이미 저장된 poster_url을 검증한다. 이미지 검색 결과를 검증 없이 저장하던 시절에
// 들어온 "행사와 무관한 이미지 / 이미 죽은 링크"를 걸러내는 용도.
//
// 실행:
//   node src/verify-poster-images.mjs           # 검사만 (깨진 링크는 정리, 의심 건은 보고만)
//   node src/verify-poster-images.mjs --repick  # 의심 건도 관련 있는 이미지로 교체
//   node src/verify-poster-images.mjs --dry-run # 아무것도 안 쓰고 결과만 출력
//
// 판정 기준
//   깨짐   : URL이 안 열리거나 이미지가 아님 -> poster_url을 비운다(카테고리 기본 이미지로 표시)
//   의심   : 열리긴 하는데, 지금 기준으로 다시 검색했을 때 관련 후보 목록에 없음
//            -> 기본은 보고만, --repick이면 관련 있는 이미지로 교체
//
// 관리자가 직접 손댄 행사(admin_edited_at)는 건드리지 않고 보고만 한다.
// 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NAVER_CLIENT_ID, NAVER_CLIENT_SECRET
import { createClient } from '@supabase/supabase-js'
import { findPosterCandidates, isUsableImageUrl, isExcludedDomain, isNewsPhotoUrl } from './naver-image.mjs'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const REPICK = process.argv.includes('--repick')
const DRY_RUN = process.argv.includes('--dry-run')

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function setPoster(eventId, posterUrl) {
  if (DRY_RUN) return true
  const { error } = await supabase
    .from('events')
    .update({ poster_url: posterUrl })
    .eq('id', eventId)
    .is('admin_edited_at', null) // 관리자가 고친 행은 절대 덮어쓰지 않는다
  if (error) {
    console.error(`  -> 저장 실패: ${error.message}`)
    return false
  }
  return true
}

async function main() {
  const { data: events, error } = await supabase
    .from('events')
    .select('id, title, poster_url, admin_edited_at, website, ticket_url')
    .not('poster_url', 'is', null)
    .order('start_date', { ascending: false })

  if (error) { console.error('조회 실패:', error.message); process.exit(1) }

  console.log(`포스터가 있는 행사 ${events.length}건 검증${DRY_RUN ? ' (dry-run)' : ''}${REPICK ? ' + 의심 건 교체' : ''}\n`)

  // 여러 행사가 똑같은 이미지를 쓰고 있으면 그건 그 행사의 포스터가 아니라
  // 관광공사 대표 이미지 같은 범용 사진이다 (코믹월드 335·336·337·338이 전부 같은
  // 이미지를 쓰고 있었다). 관련성 재검색과 별개로 이 조건만으로도 교체 대상이다.
  const urlCount = new Map()
  for (const e of events) urlCount.set(e.poster_url, (urlCount.get(e.poster_url) ?? 0) + 1)
  const sharedUrls = new Set([...urlCount].filter(([, n]) => n > 1).map(([u]) => u))
  if (sharedUrls.size > 0) {
    console.log(`여러 행사가 공유 중인 이미지 ${sharedUrls.size}종 발견 — 개별 포스터로 보지 않는다\n`)
  }

  const stats = { ok: 0, cleared: 0, repicked: 0, suspicious: 0, adminSkipped: 0 }
  const report = []

  for (const event of events) {
    // 언론사 기사 사진·스톡 이미지는 열리더라도 쓸 수 없다 (공식 홍보물이 아니고,
    // 식별 가능한 개인이 찍혀 있으며, 언론사 서버 핫링크다).
    const newsPhoto = isNewsPhotoUrl(event.poster_url)
    const reachable = !newsPhoto &&
      !isExcludedDomain(event.poster_url) &&
      await isUsableImageUrl(event.poster_url)

    if (!reachable) {
      console.log(`[${newsPhoto ? '부적합(기사·스톡 사진)' : '깨짐'}] ${event.title}`)
      console.log(`  ${event.poster_url}`)
      if (event.admin_edited_at) {
        console.log('  -> 관리자 수정 행사라 건드리지 않음')
        stats.adminSkipped++
        report.push({ state: '깨짐(관리자 확인 필요)', title: event.title, url: event.poster_url })
        continue
      }
      // 깨진 링크는 우선 비운다. 그 다음 관련 있는 이미지가 있으면 채운다.
      const candidates = REPICK ? await findPosterCandidates(event.title, [event.website, event.ticket_url]) : []
      let replacement = null
      for (const c of candidates.slice(0, 5)) {
        if (await isUsableImageUrl(c.link)) { replacement = c; break }
      }
      if (await setPoster(event.id, replacement?.link ?? null)) {
        if (replacement) {
          console.log(`  -> 교체: ${replacement.title} (일치도 ${replacement.score.toFixed(2)})`)
          stats.repicked++
        } else {
          console.log('  -> 비움 (기본 이미지로 표시됨)')
          stats.cleared++
        }
      }
      await sleep(200)
      continue
    }

    // 열리는 이미지 — 지금 기준으로 다시 검색해서 관련 후보에 들어 있는지 본다.
    const candidates = await findPosterCandidates(event.title, [event.website, event.ticket_url])
    // 다른 행사와 같은 이미지를 쓰고 있으면 관련성 결과와 무관하게 의심으로 본다.
    const stillRelevant = !sharedUrls.has(event.poster_url) &&
      candidates.some(c => c.link === event.poster_url)

    if (candidates.length === 0 && !sharedUrls.has(event.poster_url)) {
      // 비교할 근거가 없으면(검색 결과 없음·API 키 없음) 그대로 둔다.
      // 단, 다른 행사와 공유 중인 이미지는 근거가 없어도 그 행사의 포스터가 아니다.
      stats.ok++
      await sleep(200)
      continue
    }

    if (stillRelevant) {
      stats.ok++
      await sleep(200)
      continue
    }

    console.log(`[의심] ${event.title}`)
    console.log(`  현재: ${event.poster_url}`)
    stats.suspicious++
    report.push({ state: '의심', title: event.title, url: event.poster_url })

    if (event.admin_edited_at) {
      console.log('  -> 관리자 수정 행사라 건드리지 않음')
      stats.adminSkipped++
      await sleep(200)
      continue
    }

    if (!REPICK) {
      console.log(`  -> 후보 ${candidates.length}건 있음 (--repick으로 교체)`)
      await sleep(200)
      continue
    }

    let replacement = null
    for (const c of candidates.slice(0, 5)) {
      if (await isUsableImageUrl(c.link)) { replacement = c; break }
    }
    if (!replacement) {
      // 지금 기준으로 "이 행사의 포스터"라고 확인되지 않았고 대신할 이미지도 없다면
      // 비운다. 그대로 두면 검증에 실패한 이미지가 계속 그 행사의 얼굴로 남는다
      // (코믹월드 337의 관광공사 공용 사진, 지스타 2027의 CAD 제품 이미지 같은 것들).
      // 관리자가 직접 넣은 포스터는 위에서 이미 걸러져서 여기까지 오지 않는다.
      if (await setPoster(event.id, null)) {
        console.log('  -> 확인되지 않은 이미지라 비움 (기본 이미지로 표시됨)')
        stats.cleared++
      }
      await sleep(200)
      continue
    }
    if (await setPoster(event.id, replacement.link)) {
      console.log(`  -> 교체: ${replacement.title} (일치도 ${replacement.score.toFixed(2)})`)
      stats.repicked++
    }
    await sleep(200)
  }

  console.log('\n--- 결과 ---')
  console.log(`정상 ${stats.ok} / 비움 ${stats.cleared} / 교체 ${stats.repicked} / 의심 ${stats.suspicious} / 관리자 행사 보류 ${stats.adminSkipped}`)
  if (report.length > 0) {
    console.log('\n확인이 필요한 행사:')
    for (const r of report) console.log(`  [${r.state}] ${r.title}\n    ${r.url}`)
  }
}

main().catch(err => { console.error(err); process.exit(1) })
