import { describe, expect, it } from 'vitest'
import { hiddenBuiltinKeys, mergeTabs } from './tabConfig'

// 상세페이지 탭 병합 규칙.
//
// 이 규칙이 틀리면 화면에서 탭이 사라지거나 순서가 뒤바뀌는데, 둘 다 "화면이 좀 다르네"로
// 넘어가기 쉬워서 눈으로는 잘 안 잡힌다. 실제로 이 파일을 훅에서 떼어낼 때 남은
// hiddenKeys 참조(ReferenceError)를 oxlint는 못 잡았고 이 케이스들이 잡았다.

const BASE = [
  { id: 'overview', label: '개요' },
  { id: 'booths', label: '부스', count: 8 },
  { id: 'stage', label: '무대', count: 22 },
  { id: 'goods', label: '굿즈', count: 76 },
]

const labels = result => result.tabs.map(t => t.label)

describe('mergeTabs', () => {
  it('설정이 없으면 코드가 만든 탭 그대로다', () => {
    expect(labels(mergeTabs(BASE, [], () => null)))
      .toEqual(['개요', '부스', '무대', '굿즈'])
  })

  it('label을 주면 이름만 바뀐다', () => {
    const config = [{ key: 'booths', builtin: true, label: '참가 작가', visible: true, sortOrder: 1 }]
    expect(labels(mergeTabs(BASE, config, () => null)))
      .toEqual(['개요', '참가 작가', '무대', '굿즈'])
  })

  it('빈 문자열 label은 무시하고 기본 이름을 쓴다', () => {
    const config = [{ key: 'booths', builtin: true, label: '   ', visible: true, sortOrder: 1 }]
    expect(labels(mergeTabs(BASE, config, () => null))).toContain('부스')
  })

  it('sort_order로 순서를 바꾼다', () => {
    const config = [
      { key: 'goods', builtin: true, label: null, visible: true, sortOrder: 0 },
      { key: 'booths', builtin: true, label: null, visible: true, sortOrder: 9 },
    ]
    expect(labels(mergeTabs(BASE, config, () => null)))
      .toEqual(['개요', '굿즈', '무대', '부스'])
  })

  it('개요는 sort_order를 음수로 줘도 맨 앞에 남는다', () => {
    // 행사마다 첫 탭이 다르면 자주 오는 사람이 매번 다시 찾는다.
    const config = [{ key: 'booths', builtin: true, label: null, visible: true, sortOrder: -99 }]
    expect(labels(mergeTabs(BASE, config, () => null))[0]).toBe('개요')
  })

  it('visible=false면 탭에서 빠진다', () => {
    const config = [{ key: 'stage', builtin: true, label: null, visible: false, sortOrder: 2 }]
    expect(labels(mergeTabs(BASE, config, () => null))).toEqual(['개요', '부스', '굿즈'])
  })

  it('직접 만든 탭이 순서대로 끼어든다', () => {
    const config = [{ key: 'traffic', builtin: false, label: '교통 안내', body: '셔틀', visible: true, sortOrder: 1 }]
    expect(labels(mergeTabs(BASE, config, t => t.body)))
      .toEqual(['개요', '부스', '교통 안내', '무대', '굿즈'])
  })

  it('직접 만든 탭도 visible=false면 안 나온다', () => {
    const config = [{ key: 'x', builtin: false, label: '숨김탭', body: 'a', visible: false, sortOrder: 0 }]
    expect(labels(mergeTabs(BASE, config, t => t.body))).not.toContain('숨김탭')
  })

  it('이번 행사에 없는 기본 탭 설정은 조용히 무시한다', () => {
    // 부스가 0이라 부스 탭이 안 생겼는데 설정만 남아 있는 경우. 빈 탭을 억지로 만들지 않는다.
    const config = [{ key: 'cosplay', builtin: true, label: '코스어', visible: true, sortOrder: 0 }]
    expect(labels(mergeTabs(BASE, config, () => null)))
      .toEqual(['개요', '부스', '무대', '굿즈'])
  })

  it('커스텀 탭의 render가 body를 받는다', () => {
    const config = [{ key: 'notice', builtin: false, label: '안내', body: '본문입니다', visible: true, sortOrder: 5 }]
    const tab = mergeTabs(BASE, config, t => t.body).tabs.find(t => t.label === '안내')
    expect(tab.render()).toBe('본문입니다')
  })
})

describe('hiddenBuiltinKeys', () => {
  it('명시적으로 끈 기본 탭만 담는다', () => {
    const config = [
      { key: 'stage', builtin: true, visible: false },
      { key: 'goods', builtin: true, visible: true },
      { key: 'x', builtin: false, visible: false },  // 커스텀은 대상 아님
    ]
    expect([...hiddenBuiltinKeys(config)]).toEqual(['stage'])
  })

  it('설정이 없으면 빈 집합이다', () => {
    // 이 구분이 중요하다 — "데이터가 없어서 탭이 안 생긴 것"은 개요 아래로 내려가야 하고,
    // "관리자가 끈 것"은 개요에도 안 나와야 한다.
    expect(hiddenBuiltinKeys([]).size).toBe(0)
  })
})
