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

  // 실제로 살 수 있는 목록이 먼저, "아직 미공개"뿐인 부스는 뒤로 보낸다 — 부스 순서를
  // 그대로 따르면 목록을 보러 온 사람이 미공개 안내부터 읽게 된다.
  const byBooth = booths
    .map(booth => ({ booth, list: goods.filter(item => item.boothId === booth.id) }))
    .filter(group => group.list.length > 0)
    .sort((a, b) => Number(b.list.some(i => i.price != null)) - Number(a.list.some(i => i.price != null)))

  // 예전엔 "전부 사면 얼마"를 보여줬는데, 굿즈가 공용 상품과 타이틀 전용으로 나뉘고
  // 44만원짜리 피규어가 섞이면서 합계가 사실상 그 한 상품 값이 됐다 — 예산을 가늠하는 데
  // 도움이 안 된다. 가격대(최저~최고)가 "이 정도 들고 가면 되는가"에 더 맞다.
  const priced = goods.filter(item => item.price != null)
  const prices = priced.map(item => item.price)

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
          가격 공개 {priced.length}종 · {formatPrice(Math.min(...prices))} ~ {formatPrice(Math.max(...prices))}
        </p>
      )}
    </div>
  )
}
