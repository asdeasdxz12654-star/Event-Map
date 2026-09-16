import Icon from './icons'

// 행사 신뢰도 — 점수와 과거 개최 이력.
//
// 점수가 없을 때 점 다섯 개를 회색으로 그리면 "0점"으로 읽힌다. 실제로 지금 DB의 행사
// 51건이 전부 trust_score가 null이라, 모든 행사 상세에 회색 점 다섯 개가 떠 있었다 —
// 아직 매기지 않은 것과 나쁜 평가를 화면이 구분하지 못했다.
export default function TrustScore({ score, pastEvents }) {
  const hasScore = typeof score === 'number'
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-zinc-400">신뢰도</span>
        {hasScore ? (
          <div className="flex gap-0.5" role="img" aria-label={`5점 만점에 ${score}점`}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full ${i < score ? 'bg-indigo-400' : 'bg-zinc-700'}`}
              />
            ))}
          </div>
        ) : (
          <span className="text-xs text-zinc-500">아직 평가 전</span>
        )}
      </div>
      {pastEvents?.length > 0 && (
        <ul className="text-xs text-zinc-400 space-y-0.5">
          {pastEvents.map((e, i) => {
            const troubled = e.includes('취소') || e.includes('연기')
            return (
              <li key={i} className="flex items-start gap-1.5">
                <Icon
                  name={troubled ? 'warn' : 'check'}
                  className={`w-3.5 h-3.5 mt-0.5 ${troubled ? 'text-danger' : 'text-live'}`}
                />
                {e}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
