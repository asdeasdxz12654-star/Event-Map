export default function TrustScore({ score, pastEvents }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-zinc-400">신뢰도</span>
        <div className="flex gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full ${i < score ? 'bg-indigo-400' : 'bg-zinc-700'}`}
            />
          ))}
        </div>
      </div>
      {pastEvents?.length > 0 && (
        <ul className="text-xs text-zinc-500 space-y-0.5">
          {pastEvents.map((e, i) => (
            <li key={i} className="flex items-start gap-1">
              <span className={e.includes('취소') || e.includes('연기') ? 'text-red-400' : 'text-green-400'}>
                {e.includes('취소') || e.includes('연기') ? '⚠' : '✓'}
              </span>
              {e}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
