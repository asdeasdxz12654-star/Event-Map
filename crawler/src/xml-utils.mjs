// KOPIS/KINTEX/KMRB 세 곳에서 공통으로 쓰는 XML 파싱 유틸.
// (셋 다 fast-xml-parser로 공공 API의 XML 응답을 받는 구조가 같아서 여기로 모았다.)
import { XMLParser } from 'fast-xml-parser'

// parseTagValue: false — 숫자처럼 보이는 텍스트를 숫자로 바꾸지 않는다.
//
// 기본값(true)일 때 실제로 겪은 두 가지 고장:
//   1) KOPIS 가격안내(pcseguidance)가 "50000"처럼 숫자만 있으면 number가 돼서,
//      EventExtractionSchema의 admission_fee(z.string())에 걸려 그 행사 전체가
//      "매핑 실패"로 버려졌다. 공연명(prfnm)이 연도만인 경우도 같다.
//   2) 영등위 응답 헤더 resultCode "00"이 숫자 0이 되면서 falsy가 됐고,
//      `if (code && code !== '00')` 에러 검사가 통째로 죽어 있었다 —
//      API가 에러를 줘도 "빈 목록"으로 조용히 넘어간다.
// 이 API들의 값은 전부 문자열로 다루고, 숫자가 필요한 곳(totalCount 등)에서는
// 호출부가 이미 Number()로 감싸고 있다.
export const xmlParser = new XMLParser({ ignoreAttributes: false, parseTagValue: false })

// fast-xml-parser는 항목이 1개면 객체, 여러 개면 배열로 반환한다 -> 항상 배열로 정규화.
export function asArray(value) {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

// "YYYYMMDD" 포맷은 date-kst.mjs의 compactKST()로 옮겼다 — 여기 있던 구현은 실행 환경의
// 지역 시간(GitHub Actions에서는 UTC)을 써서 KST 기준 날짜와 하루씩 어긋났다.
