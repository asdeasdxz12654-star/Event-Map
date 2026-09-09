import { useSeoulCongestion } from '../hooks/useSeoulCongestion'

const LEVEL_STYLE = {
  '여유':     'bg-green-500/20 text-green-300 border-green-500/30',
  '보통':     'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  '약간 붐빔': 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  '붐빔':     'bg-red-500/20 text-red-300 border-red-500/30',
}

function formatTime(t) {
  // "2026-09-09 14:55" -> "14:55"
  return t?.split(' ')[1] ?? t
}

// 서울시 실시간 도시데이터 기반 — placeName이 "서울시 주요 120장소"에 없으면
// 아무것도 렌더링하지 않는다(호출한 쪽이 crowd_level 추정치 배지로 대체).
export default function LiveCongestion({ placeName }) {
  const { data, error, loading } = useSeoulCongestion(placeName)

  if (!placeName) return null
  if (loading && !data) {
    return <div className="text-xs text-zinc-400 animate-pulse">실시간 혼잡도 불러오는 중...</div>
  }
  if (error || !data) return null

  const style = LEVEL_STYLE[data.level] ?? 'bg-zinc-700/50 text-zinc-300 border-zinc-600/30'

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-4">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
        <h2 className="text-sm font-semibold text-white">실시간 인구 혼잡도</h2>
        <span className="text-[11px] text-zinc-400">· {data.place}</span>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border whitespace-nowrap ${style}`}>
          {data.level}
        </span>
        <span className="text-xs text-zinc-400">
          약 {data.populationMin.toLocaleString()}~{data.populationMax.toLocaleString()}명
        </span>
      </div>

      <p className="text-xs text-zinc-400 mb-2">{data.message}</p>

      {data.forecast?.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {data.forecast.map(f => (
            <div key={f.time} className="shrink-0 text-center bg-white/5 rounded-lg px-2 py-1">
              <div className="text-[10px] text-zinc-400">{formatTime(f.time)}</div>
              <div className="text-[11px] text-zinc-300 whitespace-nowrap">{f.level}</div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-zinc-400 mt-2">
        {formatTime(data.updatedAt)} 기준 · 서울시 실시간 도시데이터 제공
      </p>
    </div>
  )
}
