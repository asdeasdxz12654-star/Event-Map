import { CATEGORIES } from '../data/events'

const config = {
  [CATEGORIES.GAME]:    { emoji: '🎮', className: 'bg-violet-500/20 text-violet-300' },
  [CATEGORIES.COSPLAY]: { emoji: '✨', className: 'bg-pink-500/20 text-pink-300' },
  [CATEGORIES.CONCERT]: { emoji: '🎵', className: 'bg-amber-500/20 text-amber-300' },
}

export default function CategoryBadge({ category }) {
  const { emoji, className } = config[category] ?? { emoji: '📅', className: 'bg-zinc-700/50 text-zinc-300' }
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${className}`}>
      {emoji} {category}
    </span>
  )
}
