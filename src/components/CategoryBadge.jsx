import { categoryMeta } from '../data/events'

// 카테고리 표시.
//
// 예전엔 카테고리마다 채도 높은 배경색(violet/pink/amber/sky)에 이모지까지 붙은
// 알약이었다. 카드 한 장에 그런 알약이 서너 개씩 얹히니 색은 많은데 어느 것도
// 우선순위를 뜻하지 않았고, 정작 강조해야 할 "예매하기" 버튼이 묻혔다.
// 분류는 "구분"이지 "강조"가 아니므로 중립 면 + 6px 색점으로 낮춘다.
// (색점 색은 달력 화면이 쓰는 dotClass와 같은 값이라 두 화면의 색이 저절로 맞는다.)
export default function CategoryBadge({ category }) {
  const { dotClass } = categoryMeta(category)
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-surface-2 text-zinc-300 whitespace-nowrap">
      <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} aria-hidden="true" />
      {category}
    </span>
  )
}
