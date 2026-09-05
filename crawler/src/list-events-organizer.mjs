import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const { data, error } = await sb.from('events').select('id, title, organizer, start_date, venue').order('start_date')
if (error) { console.error(error.message); process.exit(1) }
console.log(`전체: ${data.length}건`)
console.log(`주최측 없음: ${data.filter(e => !e.organizer).length}건\n`)
for (const e of data) {
  const org = e.organizer ?? '없음'
  console.log(`[${org}] ${e.title} (${e.start_date}) / venue: ${e.venue ?? '-'}`)
}
