import Skeleton from './ui/Skeleton'

// 상세 화면이 채워질 자리.
//
// 예전엔 이 자리가 "⏳ 행사 정보를 불러오는 중..."이었다. 목록은 스켈레톤을 쓰는데
// 상세만 문구라서, 카드를 누르면 화면이 통째로 비었다가 한 번에 채워져 이동이
// 끊겨 보였다. 실루엣을 실제 화면과 맞춘다.
export default function DetailSkeleton() {
  return (
    <div className="max-w-2xl lg:max-w-6xl mx-auto px-4 lg:px-8 py-6 lg:py-10">
      <div className="lg:grid lg:grid-cols-[300px_1fr] lg:gap-x-8 lg:items-start">
        <div className="flex flex-col gap-3 mb-4 lg:mb-0">
          <Skeleton className="w-full aspect-[3/4] max-h-[38svh] lg:max-h-none rounded-2xl" />
        </div>

        <div className="min-w-0">
          <Skeleton className="h-5 w-24 rounded-full mb-3" />
          <Skeleton className="h-7 w-4/5 mb-2" />
          <Skeleton className="h-7 w-1/2 mb-4" />

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-line border border-line rounded-2xl overflow-hidden mb-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-surface-1 p-3.5">
                <Skeleton className="h-3 w-12 mb-2" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>

          <Skeleton className="h-12 w-full rounded-2xl mb-2" />
          <div className="grid grid-cols-3 gap-2 mb-6">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[60px] rounded-xl" />)}
          </div>

          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      </div>
      <span className="sr-only" role="status">행사 정보를 불러오는 중입니다</span>
    </div>
  )
}
