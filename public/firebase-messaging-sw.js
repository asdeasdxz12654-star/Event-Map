// FCM 백그라운드 푸시 수신용 서비스워커.
// 이미 vite-plugin-pwa가 만드는 sw.js(오프라인 캐싱)가 루트 스코프를 쓰고 있어서,
// 충돌을 피하려고 이 서비스워커는 등록할 때 별도 스코프(/firebase-cloud-messaging-push-scope)를 준다.
// (등록 코드: src/hooks/usePushNotifications.js)
//
// 서비스워커 안에서는 ES 모듈 import 없이 importScripts로 compat SDK를 불러오는 게
// Firebase 공식 문서가 안내하는 방식이다. 버전은 package.json의 firebase 버전과 맞춰둔다.
importScripts('https://www.gstatic.com/firebasejs/12.18.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/12.18.0/firebase-messaging-compat.js')

// Firebase 웹 API 키는 비밀값이 아니라(도메인/보안규칙으로 보호) 정적 파일에 그대로 둬도 된다.
firebase.initializeApp({
  apiKey: 'AIzaSyDlLB2aHL_X5rn5a1U9GhssTVcT6s2G7mo',
  authDomain: 'eventmap-1cadd.firebaseapp.com',
  projectId: 'eventmap-1cadd',
  storageBucket: 'eventmap-1cadd.firebasestorage.app',
  messagingSenderId: '488521288524',
  appId: '1:488521288524:web:daa6a7250941de6dcadde9',
})

const messaging = firebase.messaging()

// 앱이 백그라운드(다른 탭/최소화)일 때 도착한 메시지를 알림으로 띄운다.
messaging.onBackgroundMessage(payload => {
  const { title, body, icon } = payload.notification ?? {}
  self.registration.showNotification(title ?? '게임이벤트허브', {
    body,
    // 절대 경로(/icons/...)가 아니라 상대 경로를 쓴다 — 이 파일 자체가 (루트든 GitHub Pages
    // 서브패스든) usePushNotifications.js가 등록한 위치에서 서빙되므로, 상대 경로가 그 위치
    // 기준으로 풀려서 배포 경로에 관계없이 항상 올바르게 가리킨다.
    icon: icon ?? 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    data: payload.data,
  })
})

// 알림 클릭 시 앱으로 포커스 이동(없으면 새 탭 열기)
self.addEventListener('notificationclick', event => {
  event.notification.close()
  // 반드시 상대 경로(/)만 허용 — 외부 URL 오픈 리다이렉트 방지
  const raw = event.notification.data?.url
  const targetUrl = (typeof raw === 'string' && raw.startsWith('/')) ? raw : '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (const client of windowClients) {
        if (client.url.includes(targetUrl) && 'focus' in client) return client.focus()
      }
      if (clients.openWindow) return clients.openWindow(targetUrl)
    })
  )
})
