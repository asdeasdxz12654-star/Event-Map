import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// 시크릿이 안 붙은 빌드(로컬에서 .env 없이 실행, 배포 환경변수 누락)에서는
// createClient()가 "supabaseUrl is required."를 던진다. 이 파일은 앱이 시작되기 전에
// 평가되므로 그 예외를 ErrorBoundary가 잡지 못하고, 화면에는 아무 설명 없는 백지만 남는다
// (콘솔을 열어봐야만 원인을 알 수 있다).
// 여기서는 자리표시자로 클라이언트를 만들어 두고(=import는 성공), 설정이 없다는 사실만
// 알린다. 실제 안내 화면은 main.jsx가 이 값을 보고 그린다.
export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey)

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
)
