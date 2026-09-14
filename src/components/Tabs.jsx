import { useRef, useState } from 'react'

// 상세 화면의 탭.
//
// 탭 목록은 데이터가 정한다 — 호출부가 "내용이 있는 탭"만 넣어서 부른다.
// 그래서 부스도 굿즈도 없는 대부분의 행사에서는 탭이 하나만 남고, 그때는 탭바를 아예
// 그리지 않아 지금까지의 한 장짜리 화면과 똑같이 보인다. 탭이 생겼다 사라졌다 하는 걸
// 관리자가 따로 켜고 끌 필요가 없다.
//
//   tabs: [{ id, label, count?, render: () => ReactNode }]
//
// 패널은 선택된 것만 그린다. 전부 그려놓고 숨기면 지도·이미지처럼 무거운 것이 처음부터
// 전부 로드되고, 부스가 많은 행사에서 첫 렌더가 눈에 띄게 느려진다.
export default function Tabs({ tabs, idPrefix = 'tab' }) {
  const list = tabs.filter(Boolean)
  const [activeId, setActiveId] = useState(list[0]?.id)
  const refs = useRef({})

  if (list.length === 0) return null

  const active = list.find(t => t.id === activeId) ?? list[0]

  if (list.length === 1) return <>{active.render()}</>

  // ←/→ 로 탭 사이를 이동한다(WAI-ARIA 탭 패턴). 탭바가 가로 스크롤될 수 있어서
  // 키보드만 쓰는 사용자에게는 이 이동이 유일하게 확실한 접근 수단이다.
  const onKeyDown = (e) => {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!dir) return
    e.preventDefault()
    const i = list.findIndex(t => t.id === active.id)
    const next = list[(i + dir + list.length) % list.length]
    setActiveId(next.id)
    refs.current[next.id]?.focus()
  }

  return (
    <div className="mb-4">
      <div
        role="tablist"
        aria-label="행사 정보"
        onKeyDown={onKeyDown}
        className="flex gap-1 overflow-x-auto border-b border-ink/10 mb-4 -mx-1 px-1"
      >
        {list.map(tab => {
          const selected = tab.id === active.id
          return (
            <button
              key={tab.id}
              ref={el => { refs.current[tab.id] = el }}
              role="tab"
              id={`${idPrefix}-${tab.id}`}
              aria-controls={`${idPrefix}-panel-${tab.id}`}
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveId(tab.id)}
              className={`shrink-0 px-3 py-2.5 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${
                selected
                  ? 'border-indigo-500 text-ink font-semibold'
                  : 'border-transparent text-zinc-400 hover:text-ink'
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className="ml-1.5 text-xs text-zinc-500 tabular-nums">{tab.count}</span>
              )}
            </button>
          )
        })}
      </div>
      <div
        role="tabpanel"
        id={`${idPrefix}-panel-${active.id}`}
        aria-labelledby={`${idPrefix}-${active.id}`}
        tabIndex={0}
        className="focus:outline-none"
      >
        {active.render()}
      </div>
    </div>
  )
}
