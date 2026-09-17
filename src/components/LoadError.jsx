import Icon from './icons'
import { FOCUS_RING } from './ui/focusRing'

// 데이터를 못 불러왔을 때의 자리.
//
// 답해야 하는 것이 두 가지다 — **무엇 때문인가**와 **내가 뭘 할 수 있나**.
//
// 예전에는 둘 다 없었다. 문구는 "행사 정보를 불러오지 못했습니다" 한 줄이라 인터넷이
// 끊긴 건지 우리 서버가 죽은 건지 알 수 없었고, 그 둘은 방문자가 할 수 있는 일이
// 완전히 다르다. 빠져나갈 길도 새로고침뿐이었는데, 오프라인에서 새로고침하면
// 이미 떠 있는 화면마저 버리게 된다.
//
// 연결이 끊긴 것은 브라우저가 이미 안다(useOnline). 조회가 8초쯤 재시도하다 실패하는
// 것을 기다릴 이유가 없어서, 끊긴 게 확실하면 그 말을 먼저 한다.
export default function LoadError({ offline, onRetry, subject = '행사 정보', className = '' }) {
  return (
    <div className={`text-center py-16 ${className}`} role="alert">
      <Icon
        name={offline ? 'ban' : 'warn'}
        className={`w-9 h-9 mx-auto mb-3 ${offline ? 'text-zinc-500' : 'text-danger'}`}
      />
      <p className={offline ? 'text-zinc-300' : 'text-danger'}>
        {offline ? '인터넷 연결이 끊겼습니다' : `${subject}를 불러오지 못했습니다`}
      </p>
      <p className="text-xs text-zinc-500 mt-1.5">
        {offline
          ? '연결되면 다시 시도를 눌러주세요. 이미 열어둔 화면은 그대로 있습니다.'
          : '잠시 후 다시 시도해주세요.'}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className={`mt-4 text-sm px-4 py-2 bg-surface-2 hover:bg-line text-ink rounded-xl transition-colors ${FOCUS_RING}`}
        >
          다시 시도
        </button>
      )}
    </div>
  )
}
