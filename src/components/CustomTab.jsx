import { httpUrl } from '../lib/url'

// 관리자가 직접 만든 탭의 본문.
//
// 무엇을 담나
//   교통편 안내, 입장 순서, 주의사항처럼 행사마다 다르고 표로 만들 수 없는 글이다.
//   지금은 이런 내용이 description 한 덩어리에 뭉쳐 들어가 "더보기"에 가려져 있었다.
//
// 왜 마크다운을 안 쓰나
//   파서를 하나 더 들이면 그 파서의 HTML 출력이 곧 XSS 표면이 된다. 관리자만 쓰는
//   글이라 신뢰할 수 있다고 말하기 쉽지만, 관리자 코드가 유출되면 그대로 뚫린다.
//   여기서 필요한 건 문단 나눔과 링크 두 가지뿐이라 직접 그린다 —
//   텍스트는 React가 이스케이프하고, 링크는 httpUrl()로 http(s)만 통과시킨다.
//   (javascript: 주소가 링크가 되는 걸 막는 것이 이 함수의 일이다.)
const URL_RE = /(https?:\/\/[^\s<>"']+)/g

export default function CustomTab({ tab }) {
  const body = tab.body?.trim()

  if (!body) {
    return (
      <p className="text-sm text-zinc-400 py-10 text-center">
        아직 작성된 내용이 없습니다.
      </p>
    )
  }

  // 빈 줄로 문단을 나눈다. 한 줄 바꿈은 문단 안에서 그대로 살린다 —
  // 시간표·준비물처럼 줄 단위로 적는 글이 많다.
  const paragraphs = body.split(/\n{2,}/)

  return (
    <div className="flex flex-col gap-3 mb-4">
      {paragraphs.map((para, i) => (
        <p key={i} className="text-sm text-zinc-300 leading-relaxed whitespace-pre-line break-words">
          {linkify(para)}
        </p>
      ))}
    </div>
  )
}

function linkify(text) {
  return text.split(URL_RE).map((part, i) => {
    // split에 캡처 그룹이 있으면 홀수 자리가 매치된 조각이다.
    if (i % 2 === 0) return part
    const safe = httpUrl(part)
    if (!safe) return part
    return (
      <a
        key={i}
        href={safe}
        target="_blank"
        rel="noopener noreferrer"
        className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 break-all"
      >
        {part}
      </a>
    )
  })
}
