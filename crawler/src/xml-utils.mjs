// KOPIS/KINTEX/KMRB 세 곳에서 공통으로 쓰는 XML 파싱 유틸.
// (셋 다 fast-xml-parser로 공공 API의 XML 응답을 받는 구조가 같아서 여기로 모았다.)
import { XMLParser } from 'fast-xml-parser'

export const xmlParser = new XMLParser({ ignoreAttributes: false })

// fast-xml-parser는 항목이 1개면 객체, 여러 개면 배열로 반환한다 -> 항상 배열로 정규화.
export function asArray(value) {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

// "YYYYMMDD" 포맷은 date-kst.mjs의 compactKST()로 옮겼다 — 여기 있던 구현은 실행 환경의
// 지역 시간(GitHub Actions에서는 UTC)을 써서 KST 기준 날짜와 하루씩 어긋났다.
