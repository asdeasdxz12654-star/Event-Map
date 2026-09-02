import { useState } from 'react'

const SNS_LINKS = [
  { key: 'twitter_url',   label: '𝕏',  title: 'Twitter/X'   },
  { key: 'instagram_url', label: 'IG', title: 'Instagram'    },
  { key: 'other_url',     label: '🔗', title: '포트폴리오'   },
]

export default function CosplayerCard({ cosplayer }) {
  const [imgError, setImgError] = useState(false)
  const showAvatar = !!cosplayer.profile_url && !imgError

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex gap-3">
      {/* 아바타 */}
      <div className="shrink-0">
        {showAvatar ? (
          <img
            src={cosplayer.profile_url}
            alt={cosplayer.nickname}
            onError={() => setImgError(true)}
            className="w-14 h-14 rounded-full object-cover"
          />
        ) : (
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-700 to-violet-700 flex items-center justify-center text-2xl select-none">
            🎭
          </div>
        )}
      </div>

      {/* 정보 */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2 mb-0.5">
          <p className="font-semibold text-white text-sm truncate">{cosplayer.nickname}</p>
        </div>

        {cosplayer.bio && (
          <p className="text-xs text-zinc-400 mt-0.5 line-clamp-2">{cosplayer.bio}</p>
        )}

        {/* 참가 행사 수 */}
        {cosplayer.cosplayer_events?.length > 0 && (
          <p className="text-xs text-indigo-400 mt-1">
            📅 {cosplayer.cosplayer_events.length}개 행사 참가 예정
          </p>
        )}

        {/* SNS 링크 */}
        <div className="flex gap-2 mt-2">
          {SNS_LINKS.map(({ key, label, title }) =>
            cosplayer[key] ? (
              <a
                key={key}
                href={cosplayer[key]}
                target="_blank"
                rel="noopener noreferrer"
                title={title}
                className="text-xs px-2 py-0.5 bg-white/10 hover:bg-white/20 text-zinc-300 rounded-full transition-colors"
              >
                {label}
              </a>
            ) : null
          )}
        </div>
      </div>
    </div>
  )
}
