import { categoryMeta } from '../data/events'

export default function CategoryBadge({ category }) {
  const { emoji, badgeClass } = categoryMeta(category)
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badgeClass}`}>
      {emoji} {category}
    </span>
  )
}
