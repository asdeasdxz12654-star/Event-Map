import { useState } from 'react'
import { useAdmin } from '../contexts/AdminContext'
import { formatPrice, splitBoothName } from '../lib/boothKinds'
import BoothChips from './BoothChips'
import BoothThumb from './BoothThumb'
import BoothItemRow from './BoothItemRow'

// 굿즈를 파는 부스가 이 수를 넘으면 칩으로 하나씩 고르게 한다. 호요랜드는 공용 + 게임별로
// 네 묶음 22종이라, 쭉 늘어놓으면 자기 게임 굿즈를 찾으려고 화면 세 개를 넘겨야 한다.
const CHIP_THRESHOLD = 2

// 판매 굿즈(kind='goods') 전용 화면.
//
// 체험과 굿즈는 찾는 이유가 다르다 — 체험은 "무엇을 하는가", 굿즈는 "얼마인가"다.
// 그래서 가격이 세로로 줄 맞는 목록으로 보여주고, 부스가 여럿이면 부스 탭과 똑같은
// 칩으로 고른다(같은 화면에서 조작법이 두 개가 되지 않게).
export default function GoodsList({ booths, items }) {
  const { isAdmin } = useAdmin()
  const [selectedId, setSelectedId] = useState(null)

  const goods = items.filter(item => item.kind === 'goods')
  if (goods.length === 0) return null

  // 실제로 살 수 있는 목록이 먼저, "아직 미공개"뿐인 부스는 뒤로 — 목록을 보러 온
  // 사람이 미공개 안내부터 읽게 되지 않도록. 칩 순서도 이 순서를 따른다.
  const byBooth = booths
    .map(booth => ({ booth, list: goods.filter(item => item.boothId === booth.id) }))
    .filter(group => group.list.length > 0)
    .sort((a, b) => Number(b.list.some(i => i.price != null)) - Number(a.list.some(i => i.price != null)))

  const useChips = byBooth.length > CHIP_THRESHOLD
  const selected = byBooth.find(g => g.booth.id === selectedId) ?? byBooth[0]
  const shown = useChips ? [selected] : byBooth

  // 가격대는 지금 보이는 목록 기준으로 낸다 — 칩으로 하나만 보고 있는데 전체 가격대가
  // 떠 있으면 그 숫자가 무엇의 범위인지 알 수 없다.
  const priced = shown.flatMap(g => g.list).filter(item => item.price != null)
  const prices = priced.map(item => item.price)

  return (
    <div className="flex flex-col gap-3 mb-4">
      {useChips && (
        <BoothChips
          booths={byBooth.map(g => g.booth)}
          selectedId={selected.booth.id}
          onSelect={setSelectedId}
          label="굿즈 판매처 선택"
        />
      )}

      {shown.map(({ booth, list }) => (
        <div key={booth.id} className="border border-line rounded-2xl overflow-hidden bg-ink/[0.03]">
          {/* 칩으로 고를 때는 칩이 이미 무엇을 보고 있는지 말해주므로 머리글을 생략하지
              않는다 — 스크롤을 내리면 칩이 화면 밖으로 나가기 때문이다. */}
          {(useChips || byBooth.length > 1) && (
            <div className="flex items-center gap-2.5 p-3 border-b border-line">
              <BoothThumb name={booth.name} src={booth.imageUrl} size="sm" />
              <p className="text-sm font-semibold text-ink">{splitBoothName(booth.name).main}</p>
            </div>
          )}
          <div className="px-3 py-1.5 divide-y divide-ink/5">
            {list.map(item => (
              <BoothItemRow key={item.id} item={item} isAdmin={isAdmin} hueFrom={booth.name} />
            ))}
          </div>
        </div>
      ))}

      {priced.length > 1 && (
        <p className="text-xs text-zinc-500 text-right tabular-nums">
          가격 공개 {priced.length}종 · {formatPrice(Math.min(...prices))} ~ {formatPrice(Math.max(...prices))}
        </p>
      )}
    </div>
  )
}
