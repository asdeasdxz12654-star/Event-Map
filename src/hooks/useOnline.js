import { useEffect, useState } from 'react'

// 브라우저가 "지금 연결이 끊겼다"고 말해주는가.
//
// 왜 필요한가
//   이 앱은 설치를 권한다(PWA). 설치한 앱은 지하철·엘리베이터에서도 열리고, 앱 셸은
//   캐시에서 멀쩡히 뜬다 — 하지만 행사 목록은 서버에서 와야 한다.
//
//   그때 화면이 어떤지 실제로 재어 봤다(2026-09-17, Playwright 오프라인).
//     0~8초   스켈레톤만 돈다
//     8초~    "행사 정보를 불러오지 못했습니다"
//
//   supabase-js가 네 번 재시도하느라 8초가 걸린다. 그 8초 동안 화면은 "느린가 보다"로
//   보이고, 8초 뒤에 뜨는 문구는 원인을 말해주지 않는다 — 인터넷이 끊긴 건지 우리
//   서버가 죽은 건지 알 수 없어서, 방문자가 할 수 있는 일이 다르다는 걸 모른다.
//
//   연결이 끊긴 것은 브라우저가 이미 알고 있다. 8초를 기다릴 이유가 없다.
//
// 이것만 믿지는 않는다
//   navigator.onLine은 "랜선이 꽂혀 있다"만 안다. 카페 와이파이에 접속만 되고 로그인
//   페이지에 갇혀 있으면 onLine은 true다. 그래서 이 값은 "끊겼다고 말할 때만" 쓰고,
//   실제 실패 판정은 여전히 조회 결과(error)로 한다.
export function useOnline() {
  const [online, setOnline] = useState(() =>
    // 서버 렌더나 오래된 브라우저를 위한 기본값 — 모르면 연결됐다고 본다.
    // 반대로 잡으면 멀쩡한 사람에게 "연결이 끊겼습니다"를 띄우게 된다.
    typeof navigator === 'undefined' || navigator.onLine !== false
  )

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    // 이벤트를 붙이는 사이에 상태가 바뀌었을 수 있다.
    setOnline(navigator.onLine !== false)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return online
}
