import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import Navbar from './components/Navbar'
import HomePage from './pages/HomePage'
import CalendarPage from './pages/CalendarPage'
import BookmarksPage from './pages/BookmarksPage'
import EventDetailPage from './pages/EventDetailPage'
import CosplayerDirectoryPage from './pages/CosplayerDirectoryPage'
import CosplayerRegisterPage from './pages/CosplayerRegisterPage'

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
    <BrowserRouter>
      <div className="min-h-screen bg-[#0f0f1a]">
        <Navbar />
        <main>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/bookmarks" element={<BookmarksPage />} />
            <Route path="/events/:id" element={<EventDetailPage />} />
            <Route path="/cosplayers" element={<CosplayerDirectoryPage />} />
            <Route path="/cosplayers/register" element={<CosplayerRegisterPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
