import Icon from '../../components/icons'
import SourceWatchPanel from '../../components/SourceWatchPanel'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'

// 공식 사이트 감시.
//
// 부스·무대·굿즈·배치도는 전부 사람이 넣어야 하는데, "언제 올라오는지"를 아무도
// 알려주지 않는 것이 유일하게 비어 있던 고리였다. 매일 도는 워크플로(watch-sources.mjs)가
// 정해진 주소를 열어 달라진 것을 쌓아두고, 여기서 확인한다.
//
// 값을 자동으로 채우지는 않는다. 이미지 속 가격표·시간표를 모델로 읽는 건 이 저장소가
// 한 번 틀린 값을 만들어 본 방법이라, 읽는 일은 사람이 한다. 여기서는 "가서 보세요"까지만.
//
// 감시 대상을 이 화면에서 추가할 수는 없다. 목록이 crawler/src/source-watches.mjs에
// 코드로 적혀 있고, 주소마다 "무엇을 신호로 볼지"(어떤 링크·이미지를 셀지)가 다르기
// 때문이다. 대상을 늘리려면 그 파일을 고쳐야 한다.
export default function SourcesPage() {
  useDocumentTitle('소스 감시')

  return (
    <div>
      <h2 className="text-lg font-semibold text-ink mb-1">소스 감시</h2>
      <p className="text-xs text-zinc-500 mb-4 leading-relaxed">
        매일 한 번 공식 사이트를 열어 달라진 곳을 표시합니다. 값은 자동으로 채우지 않습니다 —
        확인하고 직접 넣으세요.
      </p>

      <SourceWatchPanel />

      {/* SourceWatchPanel은 감시 항목이 없으면 아무것도 그리지 않는다(행사 상세에
          얹혀 있던 시절의 동작이다). 전용 화면에서는 빈 화면이 고장처럼 보이므로
          이유를 적어둔다. */}
      <EmptyHint />
    </div>
  )
}

function EmptyHint() {
  return (
    <p className="flex items-start gap-2 text-xs text-zinc-500 leading-relaxed mt-4 peer-empty:mt-0">
      <Icon name="info" className="w-3.5 h-3.5 shrink-0 mt-px" />
      <span>
        감시 항목이 보이지 않으면 <code className="text-zinc-400">supabase/source_watches_2026-09-15.sql</code>을
        실행했는지, 그리고 <code className="text-zinc-400">watch-sources</code> 워크플로가 한 번이라도
        돌았는지 확인하세요.
      </span>
    </p>
  )
}
