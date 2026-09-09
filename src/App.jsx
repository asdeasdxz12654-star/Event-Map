import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import Navbar from './components/Navbar'
import ScrollToTopButton from './components/ScrollToTopButton'
import ScrollRestoration from './components/ScrollRestoration'
import ErrorBoundary from './components/ErrorBoundary'
import { AdminProvider } from './contexts/AdminContext'
import { UIFeedbackProvider } from './contexts/UIFeedbackContext'

// 라우트 단위 코드 스플리팅 — 첫 방문(HomePage)에 다른 페이지 코드까지
// 전부 딸려오지 않게 한다. 특히 AdminDraftsPage(관리자 전용, 뉴스 검수)는
// 방문자 대부분이 절대 안 들어가는 페이지라 스플리팅 효과가 크다.
const HomePage = lazy(() => import('./pages/HomePage'))
const CalendarPage = lazy(() => import('./pages/CalendarPage'))
const BookmarksPage = lazy(() => import('./pages/BookmarksPage'))
const EventDetailPage = lazy(() => import('./pages/EventDetailPage'))
const AdminDraftsPage = lazy(() => import('./pages/AdminDraftsPage'))

function PageFallback() {
  return (
    <div className="flex items-center justify-center py-24">
      <span className="text-zinc-400 text-sm animate-pulse">불러오는 중...</span>
    </div>
  )
}

function NotFoundPage() {
  return (
    <div className="max-w-md mx-auto px-4 py-20 text-center">
      <div className="text-5xl mb-4">🔍</div>
      <h1 className="text-xl font-bold text-white mb-2">페이지를 찾을 수 없습니다</h1>
      <p className="text-zinc-400 text-sm mb-8">요청하신 페이지가 존재하지 않습니다.</p>
      <Link to="/" className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-colors">
        홈으로 돌아가기
      </Link>
    </div>
  )
}

export default function App() {
  return (
    <UIFeedbackProvider>
    <AdminProvider>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <ScrollRestoration />
      <div className="min-h-screen bg-[#0f0f1a]">
        <Navbar />
        <main>
          {/* 라우트 안에서 예외가 나도 네비게이션은 남기고 본문만 오류 화면으로 바꾼다 */}
          <ErrorBoundary>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/bookmarks" element={<BookmarksPage />} />
              <Route path="/events/:id" element={<EventDetailPage />} />
              <Route path="/admin/drafts" element={<AdminDraftsPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
          </ErrorBoundary>
        </main>
      </div>
      <ScrollToTopButton />
    </BrowserRouter>
    </AdminProvider>
    </UIFeedbackProvider>
  )
}
