// 코드가 만든 기본 탭 목록에 event_tabs의 설정을 얹는다.
//
// 규칙
//   · 행이 없는 기본 탭은 지금까지와 똑같다(데이터가 있으면 보이고, 없으면 개요로 내려감)
//   · 행이 있으면 label / visible / sort_order를 덮어쓴다
//   · builtin=false 행은 새 탭이 된다 — 본문은 body
//   · visible=false는 "숨겨라"는 뜻이라 개요로도 내리지 않는다.
//     지금 화면은 탭 조건이 false면 개요 아래에 그 섹션을 붙이는데(EventDetailPage:298),
//     그건 "데이터가 적어서"지 "숨기려고"가 아니다. 둘은 다른 의도다.
//
// hiddenBuiltinKeys는 따로 뺀다 — 개요 화면이 "이 섹션을 개요 아래에 붙일지"를
// 판단할 때 쓰는데, 그 판단이 baseTabs를 만드는 도중에 필요해서 mergeTabs보다 먼저 돈다.
export function hiddenBuiltinKeys(config) {
  return new Set(config.filter(t => t.builtin && !t.visible).map(t => t.key))
}

export function mergeTabs(baseTabs, config, renderCustom) {
  const byKey = new Map(config.filter(t => t.builtin).map(t => [t.key, t]))
  const hidden = hiddenBuiltinKeys(config)

  const merged = baseTabs.map((tab, i) => {
    const row = byKey.get(tab.id)
    if (!row) return { ...tab, sortOrder: i }
    if (hidden.has(tab.id)) return null
    return { ...tab, label: row.label?.trim() || tab.label, sortOrder: row.sortOrder }
  })

  // 설정 행은 있는데 그 기본 탭이 이번 행사에 없을 수도 있다(부스가 0인데 부스 탭 설정이
  // 남아 있는 경우). 그때는 조용히 무시한다 — 빈 탭을 억지로 만들지 않는다.
  const custom = config
    .filter(t => !t.builtin && t.visible)
    .map(t => ({
      id: `custom-${t.key}`,
      label: t.label ?? t.key,
      sortOrder: t.sortOrder,
      render: () => renderCustom(t),
    }))

  const tabs = [...merged.filter(Boolean), ...custom].sort((a, b) => {
    // 개요는 항상 맨 앞이다. 순서를 바꿀 수 있게 하면 "무엇을 먼저 읽어야 하는가"가
    // 행사마다 달라져서, 자주 오는 사람이 매번 다시 찾게 된다.
    if (a.id === 'overview') return -1
    if (b.id === 'overview') return 1
    return a.sortOrder - b.sortOrder
  })

  return { tabs }
}
