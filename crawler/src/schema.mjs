// 크롤러의 모든 수집 소스(RSS, KOPIS 등)가 공유하는 행사 추출 스키마.
// event_drafts.extracted에 저장되는 jsonb 구조와 1:1로 대응한다 (promote_event_draft() 트리거가
// 이 필드명을 그대로 읽어 events 테이블에 반영하므로, 필드를 바꿀 땐 트리거도 같이 확인할 것).
import { z } from 'zod'

export const EventExtractionSchema = z.object({
  is_event: z.boolean(),
  title: z.string().nullable(),
  category: z.enum(['게임전시', '코스프레', '게임음악']).nullable(),
  start_date: z.string().nullable().describe('YYYY-MM-DD'),
  end_date: z.string().nullable().describe('YYYY-MM-DD, 하루짜리 행사면 start_date와 동일하게'),
  venue: z.string().nullable(),
  venue_address: z.string().nullable(),
  organizer: z.string().nullable(),
  description: z.string().nullable().describe('한두 문장 요약'),
  ticket_url: z.string().nullable(),
  ticket_open_date: z.string().nullable().describe('YYYY-MM-DD'),
  admission_fee: z.string().nullable(),
  website: z.string().nullable(),
  tags: z.array(z.string()).nullable(),
  confidence: z.enum(['high', 'medium', 'low']),
})
