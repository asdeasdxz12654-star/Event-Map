import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import Navbar from './components/Navbar'
import ScrollToTopButton from './components/ScrollToTopButton'
import ScrollRestoration from './components/ScrollRestoration'
import CanonicalLink from './components/CanonicalLink'
import ErrorBoundary from './components/ErrorBoundary'
import Icon from './components/icons'
import { AdminProvider } from './contexts/AdminContext'
import { UIFeedbackProvider } from './contexts/UIFeedbackContext'
import { useTheme } from './hooks/useTheme'

// 라우트 단위 코드 스플리팅 — 첫 방문(HomePage)에 다른 페이지 코드까지
// 전부 딸려오지 않게 한다. 특히 AdminDraftsPage(관리자 전용, 뉴스 검수)는
// 방문자 대부분이 절대 안 들어가는 페이지라 스플리팅 효과가 크다.
const HomePage = lazy(() => import('./pages/HomePage'))
const CalendarPage = lazy(() => import('./pages/CalendarPage'))
const BookmarksPage = lazy(() => import('./pages/BookmarksPage'))
const EventDetailPage = lazy(() => import('./pages/EventDetailPage'))
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'))
const AdminDashboardPage = lazy(() => import('./pages/admin/DashboardPage'))
const AdminEventsPage = lazy(() => import('./pages/admin/EventsPage'))
const AdminEventEditPage = lazy(() => import('./pages/admin/EventEditPage'))
const AdminDraftsPage = lazy(() => import('./pages/admin/DraftsPage'))
const AdminSourcesPage = lazy(() => import('./pages/admin/SourcesPage'))
const AdminReportsPage = lazy(() => import('./pages/admin/ReportsPage'))

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
      <Icon name="search" className="w-12 h-12 mx-auto mb-4 text-zinc-500" />
      <h1 className="text-xl font-bold text-ink mb-2">페이지를 찾을 수 없습니다</h1>
      <p className="text-zinc-400 text-sm mb-8">요청하신 페이지가 존재하지 않습니다.</p>
      <Link to="/" className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-colors">
        홈으로 돌아가기
      </Link>
    </div>
  )
}

export default function App() {
  // 저장된 테마를 앱이 살아 있는 동안 <html>에 붙여 둔다. 첫 그리기 전 적용은
  // public/theme-init.js가 맡고, 여기서는 설정에서 바꾼 값이 바로 반영되게 한다.
  useTheme()

  return (
    <UIFeedbackProvider>
    <AdminProvider>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <ScrollRestoration />
      {/* 같은 사이트가 두 도메인에 올라가 있어서, 어느 쪽이 정식인지 경로마다 알려준다 */}
      <CanonicalLink />
      <div className="min-h-screen bg-surface">
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
              {/* 관리자 화면은 AdminLayout 아래로 모은다 — 로그인 문과 메뉴를
                  화면 수만큼 복제하지 않기 위해서다. /admin/drafts 주소는 그대로
                  유지한다(북마크해 둔 곳이 있다). */}
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<AdminDashboardPage />} />
                <Route path="events" element={<AdminEventsPage />} />
                <Route path="events/new" element={<AdminEventEditPage />} />
                <Route path="events/:id" element={<AdminEventEditPage />} />
                <Route path="drafts" element={<AdminDraftsPage />} />
                <Route path="reports" element={<AdminReportsPage />} />
                <Route path="sources" element={<AdminSourcesPage />} />
              </Route>
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
