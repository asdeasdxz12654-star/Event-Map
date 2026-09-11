// 상세페이지의 섹션 카드(신뢰도·부스 배치도·참가 부스·무대 일정 등)가 모두 같은
// 껍데기를 쓰고 있어서 하나로 모았다 — 여백/테두리/제목 크기가 조금씩 어긋나는 걸
// 막고, 새 섹션을 추가할 때도 자동으로 같은 모양이 되게 한다.
export default function SectionCard({ title, action, children }) {
  return (
    <div className="bg-ink/5 border border-ink/10 rounded-2xl p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  )
}
