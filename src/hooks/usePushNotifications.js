import { useCallback, useEffect, useState } from 'react'
import { getToken, onMessage } from 'firebase/messaging'
import { getMessagingIfSupported } from '../firebase'
import { supabase } from '../supabase'

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY
// GitHub Pages 등 서브패스(예: /Event-Map/) 배포 시 절대 경로 '/firebase-messaging-sw.js'는
// 실제 파일 위치(서브패스 아래)와 어긋나 등록이 실패한다 — BASE_URL(vite.config의 base와 동일)로
// 접두어를 붙여야 로컬(루트 배포)과 서브패스 배포 둘 다에서 올바른 경로가 나온다.
const SW_PATH = `${import.meta.env.BASE_URL}firebase-messaging-sw.js`
// 기존 PWA 서비스워커(sw.js)가 루트 스코프를 쓰고 있어서, 충돌을 피하려고 별도 스코프를 준다.
// 스코프도 스크립트와 마찬가지로 서브패스 접두어가 필요하다 — 서비스워커는 기본적으로 자기
// 스크립트 경로보다 상위 스코프를 가질 수 없어서, 접두어 없이 등록하면 서브패스 배포에서
// SecurityError(스코프가 허용 범위 밖)로 실패한다.
const SW_SCOPE = `${import.meta.env.BASE_URL}firebase-cloud-messaging-push-scope`
const TOKEN_STORAGE_KEY = 'gameEventHub.pushToken'

// navigator.serviceWorker.ready는 "현재 페이지(스코프 '/')를 담당하는" 등록을 기다리는 API라
// 여기서 쓰면 안 된다 — PWA 워커(sw.js, 스코프 '/')를 기다리게 되어 우리가 방금 등록한
// 별도 스코프의 워커와는 무관하게 멈춰버린다. 이 등록 자체가 활성화될 때까지 직접 기다린다.
function waitForActivation(registration) {
  if (registration.active) return Promise.resolve(registration)
  const worker = registration.installing ?? registration.waiting
  if (!worker) return Promise.resolve(registration)
  return new Promise(resolve => {
    worker.addEventListener('statechange', function onStateChange() {
      if (worker.state === 'activated') {
        worker.removeEventListener('statechange', onStateChange)
        resolve(registration)
      }
    })
  })
}

// 알림 권한 요청 -> FCM 토큰 발급 -> Supabase에 저장까지 담당하는 훅.
export function usePushNotifications() {
  const [supported, setSupported] = useState(null) // null = 확인 중
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  )
  const [subscribed, setSubscribed] = useState(() => {
    try {
      return !!localStorage.getItem(TOKEN_STORAGE_KEY)
    } catch {
      return false
    }
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // 앱이 열려있는 동안(포그라운드) 온 메시지는 서비스워커가 아니라 여기로 온다.
  useEffect(() => {
    let cancelled = false
    let unsubscribeOnMessage = () => {}

    getMessagingIfSupported().then(messaging => {
      if (cancelled) return
      setSupported(!!messaging && 'Notification' in window && !!VAPID_KEY)
      if (!messaging) return

      unsubscribeOnMessage = onMessage(messaging, payload => {
        const { title, body } = payload.notification ?? {}
        if (title && Notification.permission === 'granted') {
          new Notification(title, { body, icon: `${import.meta.env.BASE_URL}icons/icon-192.png` })
        }
      })
    })

    return () => {
      cancelled = true
      unsubscribeOnMessage()
    }
  }, [])

  const subscribe = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const messaging = await getMessagingIfSupported()
      if (!messaging) throw new Error('이 브라우저는 웹 푸시를 지원하지 않습니다')
      if (!VAPID_KEY) throw new Error('VAPID 키가 설정되지 않았습니다')

      const result = await Notification.requestPermission()
      setPermission(result)
      if (result !== 'granted') throw new Error('알림 권한이 거부되었습니다')

      const registration = await navigator.serviceWorker.register(SW_PATH, { scope: SW_SCOPE })
      await waitForActivation(registration)
      const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration })

      // 이미 등록된 토큰이면 unique 제약 위반(23505)이 나는데, 그건 실패가 아니라 정상 케이스로 취급한다.
      const { error: dbError } = await supabase
        .from('push_subscriptions')
        .insert({ token, user_agent: navigator.userAgent })
      if (dbError && dbError.code !== '23505') throw dbError

      localStorage.setItem(TOKEN_STORAGE_KEY, token)
      setSubscribed(true)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [])

  return { supported, permission, subscribed, loading, error, subscribe }
}
