import { useAdmin } from '../contexts/AdminContext'
import { formatPrice, splitBoothName } from '../lib/boothKinds'
import BoothThumb from './BoothThumb'
import BoothItemRow from './BoothItemRow'

// 판매 굿즈(kind='goods') 전용 화면.
//
// 체험과 굿즈는 찾는 이유가 다르다 — 체험은 "무엇을 하는가", 굿즈는 "얼마인가"다.
// 그래서 굿즈는 부스별 카드 대신 가격이 세로로 줄 맞는 한 장짜리 목록으로 보여준다.
// 부스가 여러 곳에서 팔면 그때만 부스 이름으로 나눈다.
export default function GoodsList({ booths, items }) {
  const { isAdmin } = useAdmin()
  const goods = items.filter(item => item.kind === 'goods')
  if (goods.length === 0) return null

  const byBooth = booths
    .map(booth => ({ booth, list: goods.filter(item => item.boothId === booth.id) }))
    .filter(group => group.list.length > 0)

  const total = goods.reduce((sum, item) => sum + (item.price ?? 0), 0)
  const priced = goods.filter(item => item.price != null)

  return (
    <div className="flex flex-col gap-3 mb-4">
      {byBooth.map(({ booth, list }) => (
        <div key={booth.id} className="border border-ink/10 rounded-2xl overflow-hidden bg-ink/[0.03]">
          {byBooth.length > 1 && (
            <div className="flex items-center gap-2.5 p-3 border-b border-ink/10">
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
          가격이 공개된 {priced.length}종 전부 사면 {formatPrice(total)}
        </p>
      )}
    </div>
  )
}
