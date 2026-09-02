import { useCallback, useEffect, useState } from 'react'
import { getToken, onMessage } from 'firebase/messaging'
import { getMessagingIfSupported } from '../firebase'
import { supabase } from '../supabase'

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY
const SW_PATH = '/firebase-messaging-sw.js'
// 기존 PWA 서비스워커(sw.js)가 루트 스코프를 쓰고 있어서, 충돌을 피하려고 별도 스코프를 준다.
const SW_SCOPE = '/firebase-cloud-messaging-push-scope'
const TOKEN_STORAGE_KEY = 'gameEventHub.pushToken'

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
          new Notification(title, { body, icon: '/icons/icon-192.png' })
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
