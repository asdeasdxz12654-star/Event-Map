import { Link } from 'react-router-dom'
import { useCosplayers } from '../hooks/useCosplayers'
import CosplayerCard from '../components/CosplayerCard'

export default function CosplayerDirectoryPage() {
  const { cosplayers, loading, error } = useCosplayers()

  return (
    <div className="max-w-2xl lg:max-w-5xl mx-auto px-4 lg:px-8 py-6 lg:py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">코스어 디렉토리</h1>
          <p className="text-sm text-zinc-400 mt-0.5">행사에 참가하는 코스어를 소개합니다</p>
        </div>
        <Link
          to="/cosplayers/register"
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-colors"
        >
          🎭 나도 등록
        </Link>
      </div>

      {loading && (
        <div className="text-center py-16 text-zinc-500 animate-pulse">불러오는 중...</div>
      )}

      {error && (
        <div className="text-center py-16 text-red-400">
          <div className="text-4xl mb-3">⚠️</div>
          <p>목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>
        </div>
      )}

      {!loading && !error && cosplayers.length === 0 && (
        <div className="text-center py-20">
          <div className="text-5xl mb-4">🎭</div>
          <p className="text-zinc-400 mb-2">아직 등록된 코스어가 없습니다</p>
          <p className="text-zinc-500 text-sm mb-6">첫 번째로 등록해 보세요!</p>
          <Link
            to="/cosplayers/register"
            className="inline-block px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-colors"
          >
            코스어 등록하기
          </Link>
        </div>
      )}

      {!loading && cosplayers.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {cosplayers.map(c => (
            <CosplayerCard
              key={c.id}
              cosplayer={c}
            />
          ))}
        </div>
      )}
    </div>
  )
}
