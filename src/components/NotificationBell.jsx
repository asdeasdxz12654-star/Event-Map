import { usePushNotifications } from '../hooks/usePushNotifications'

export default function NotificationBell() {
  const { supported, permission, subscribed, loading, error, subscribe } = usePushNotifications()

  // 지원 여부 확인 중이거나, 애초에 미지원 브라우저/미설정 상태면 표시하지 않는다.
  if (supported === null || supported === false) return null

  if (permission === 'denied') {
    return (
      <span
        className="w-9 h-9 flex items-center justify-center rounded-lg text-zinc-600 text-sm"
        title="브라우저 설정에서 알림 권한이 차단되어 있어요"
      >
        🔕
      </span>
    )
  }

  if (subscribed) {
    return (
      <span
        className="w-9 h-9 flex items-center justify-center rounded-lg text-indigo-400 text-sm"
        title="행사 알림을 받고 있어요"
      >
        🔔
      </span>
    )
  }

  return (
    <button
      onClick={subscribe}
      disabled={loading}
      title={error ? `알림 설정 실패: ${error.message}` : '새 행사·예매 오픈 알림 받기'}
      className={`relative w-9 h-9 flex items-center justify-center rounded-lg hover:text-white hover:bg-white/10 text-sm transition-colors disabled:opacity-50 ${
        error ? 'text-red-400' : 'text-zinc-400'
      }`}
    >
      {loading ? '⏳' : '🔔'}
      {error && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-red-500" />}
    </button>
  )
}
