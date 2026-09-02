import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import HomePage from './pages/HomePage'
import CalendarPage from './pages/CalendarPage'
import BookmarksPage from './pages/BookmarksPage'
import EventDetailPage from './pages/EventDetailPage'

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
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
