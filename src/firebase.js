import { initializeApp } from 'firebase/app'
import { getMessaging, isSupported } from 'firebase/messaging'

// FCM(웹 푸시) 전용. Firestore/Hosting 등 다른 Firebase 제품은 안 씀 — 데이터는 Supabase.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

// projectId 등 필수 값이 빠진 환경(로컬 개발, 시크릿 미설정)에서는 초기화하지 않는다.
const isConfigured = !!(firebaseConfig.projectId && firebaseConfig.apiKey && firebaseConfig.appId)
export const app = isConfigured ? initializeApp(firebaseConfig) : null

// 브라우저가 지원할 때만(사파리 구버전, 인앱 브라우저 등은 미지원) messaging 인스턴스를 만든다.
export async function getMessagingIfSupported() {
  if (!app) return null
  if (!(await isSupported())) return null
  return getMessaging(app)
}
