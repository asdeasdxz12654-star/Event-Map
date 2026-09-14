import Skeleton from './ui/Skeleton'

// 목록이 채워질 자리. 실루엣이 EventCard와 같아야 카드가 들어올 때 화면이 튀지 않는다
// (포스터 3:4 → 제목 두 줄 → 메타 두 줄).
export default function EventCardSkeleton() {
  return (
    <div className="flex flex-col">
      <Skeleton className="w-full aspect-[3/4] rounded-xl mb-2.5" />
      <Skeleton className="h-3.5 w-full mb-1.5" />
      <Skeleton className="h-3.5 w-2/3 mb-2.5" />
      <Skeleton className="h-3 w-4/5 mb-1.5" />
      <Skeleton className="h-3 w-3/5" />
    </div>
  )
}
