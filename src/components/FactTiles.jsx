import Icon from './icons'

// 상세 화면의 핵심 정보 네 칸.
//
// 예전엔 InfoRow가 이 일을 했다 — [이모지 20px][라벨 80px 고정][값]이 한 줄씩.
// 라벨 폭이 고정이라 360px 화면에서 값에 남는 폭이 230px뿐이었고,
// "2026년 12월 5일 (금) ~ 12월 7일 (일)"이 두 줄로, 주소는 세 줄로 접혔다.
// 페이지에서 가장 중요한 정보가 가장 좁은 자리를 쓰고 있었던 셈이다.
//
// 라벨을 값 위로 올리면 값이 칸 전체 폭을 쓴다. 네 칸이라 2열(모바일)·4열(PC)
// 어느 쪽으로 놓아도 빈자리가 생기지 않는다.
export default function FactTiles({ tiles }) {
  return (
    <dl className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-line border border-line rounded-2xl overflow-hidden mb-4">
      {tiles.map(tile => (
        <div key={tile.label} className="bg-surface-1 p-3 lg:p-3.5 min-w-0">
          <dt className="flex items-center gap-1.5 text-[11px] text-zinc-400 mb-1.5">
            <Icon name={tile.icon} className="w-3.5 h-3.5" />
            {tile.label}
          </dt>
          <dd className="text-sm font-semibold text-ink leading-snug tabular-nums break-keep">
            {tile.value}
            {tile.hint && (
              <span className="block text-[11px] font-normal text-zinc-400 mt-1 tabular-nums">{tile.hint}</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}
