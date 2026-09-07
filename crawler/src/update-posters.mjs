// 코믹월드·코스앤코믹 포스터 URL 강제 업데이트 스크립트
// 실행: node src/update-posters.mjs
// 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from '@supabase/supabase-js'

const COMICWORLD_POSTER = 'https://tong.visitkorea.or.kr/cms/resource/38/4076738_image2_1.png'
const COSANDCOMIC_POSTER = 'https://pbs.twimg.com/media/HOo8nV4bUAAdTNo?format=webp&name=medium'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function updatePoster(titlePattern, posterUrl) {
  const { data, error } = await supabase
    .from('events')
    .update({ poster_url: posterUrl })
    .ilike('title', titlePattern)
    .select('id, title, poster_url')

  if (error) {
    console.error(`[update-posters] ${titlePattern} 업데이트 실패:`, error.message)
    return
  }
  console.log(`[update-posters] ${titlePattern} → ${data.length}건 업데이트`)
  for (const row of data) console.log(`  - [${row.id}] ${row.title}`)
}

await updatePoster('%코믹월드%', COMICWORLD_POSTER)
await updatePoster('%코스앤코믹%', COSANDCOMIC_POSTER)
console.log('완료')
