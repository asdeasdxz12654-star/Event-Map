import { useSearchParams } from 'react-router-dom'
import { createLocalStorageHook } from './useLocalStorage'
import { STATUS } from '../data/events'

const DEFAULTS = {
  status: STATUS.UPCOMING,
  category: null,
  hideSoldout: false,
  sort: 'date', // 'date' | 'newest'
  month: null,  // null = 전체, 'YYYY-MM' = 해당 월
  search: '',
}

const useHomeFiltersStore = createLocalStorageHook('gameEventHub.homeFilters', {
  status: DEFAULTS.status,
  category: DEFAULTS.category,
  hideSoldout: DEFAULTS.hideSoldout,
  sort: DEFAULTS.sort,
  month: DEFAULTS.month,
})

// 검색어만 sessionStorage에 둔다. 예전엔 다른 필터와 함께 localStorage에 저장돼서,
// "지스타"를 검색해둔 채로 닫으면 며칠 뒤 다시 들어와도 걸러진 목록이 첫 화면이었다.
// 탭 안에서는 유지되므로 상세페이지를 보고 뒤로 와도 검색어는 그대로 남는다.
const useSearchStore = createLocalStorageHook('gameEventHub.homeSearch', '', 'session')

// "전체 해제"를 눌렀을 때 돌아갈 자리. 상태(예정/진행중/종료)는 필터가 아니라
// 지금 보고 있는 묶음이므로 건드리지 않는다 — 해제했더니 보던 탭까지 바뀌면
// 무엇이 풀린 건지 알 수 없다.
const CLEARED = { category: null, month: null, hideSoldout: false, search: '' }

// 주소에 실을 이름. 짧게 두되 뜻이 보이게.
const PARAM = {
  status: 'status',
  category: 'category',
  search: 'q',
  sort: 'sort',
  month: 'month',
  hideSoldout: 'soldout',
}
const PARAM_KEYS = Object.values(PARAM)

const VALID_STATUS = new Set(Object.values(STATUS))

// 주소 -> 필터 값. 모르는 값은 기본값으로 떨군다 — 주소는 누구나 손으로 고칠 수 있으므로
// 거기서 온 값을 그대로 믿으면 안 된다(빈 목록이 뜨는데 왜 빈지 알 수 없는 상태가 된다).
function fromParams(params) {
  const status = params.get(PARAM.status)
  const month = params.get(PARAM.month)
  return {
    status: VALID_STATUS.has(status) ? status : DEFAULTS.status,
    category: params.get(PARAM.category) || null,
    search: params.get(PARAM.search) ?? '',
    sort: params.get(PARAM.sort) === 'newest' ? 'newest' : 'date',
    month: /^\d{4}-\d{2}$/.test(month ?? '') ? month : null,
    hideSoldout: params.get(PARAM.hideSoldout) === 'hide',
  }
}

// 필터 값 -> 주소. 기본값은 싣지 않는다 — 아무것도 안 고른 홈이 물음표로 시작하면
// 공유했을 때 "뭔가 걸러진 목록"처럼 보인다.
function toParams(f) {
  const out = new URLSearchParams()
  if (f.status !== DEFAULTS.status) out.set(PARAM.status, f.status)
  if (f.category) out.set(PARAM.category, f.category)
  if (f.search?.trim()) out.set(PARAM.search, f.search)
  if (f.sort !== DEFAULTS.sort) out.set(PARAM.sort, f.sort)
  if (f.month) out.set(PARAM.month, f.month)
  if (f.hideSoldout) out.set(PARAM.hideSoldout, 'hide')
  return out
}

// 홈 목록의 필터.
//
// 주소에도 싣는 이유
//   예전엔 필터가 이 기기에만 남았다. "코스프레 · 11월"로 걸러놓고 그 화면을 누구에게
//   보여줄 방법이 없었고, 뒤로 가기로도 되돌릴 수 없었다. 검색엔진 입장에서도 홈 하나
//   말고는 긁을 주소가 없었다.
//
// 어느 쪽이 이기나
//   주소에 값이 하나라도 있으면 주소가 이긴다(공유받은 링크를 열었는데 내 저장값이
//   덮어쓰면 링크가 링크 구실을 못 한다). 주소가 비어 있으면 저장된 값을 쓴다.
//
// pushState가 아니라 replaceState를 쓴다
//   칩 하나 누를 때마다 방문 기록이 쌓이면 뒤로 가기가 "필터 되돌리기"가 돼서, 목록에서
//   상세로 갔다가 돌아오려면 눌렀던 횟수만큼 뒤로 가야 한다.
export function useHomeFilters() {
  const [stored, setStored] = useHomeFiltersStore()
  const [storedSearch, setStoredSearch] = useSearchStore()
  const [params, setParams] = useSearchParams()

  const hasUrlFilters = PARAM_KEYS.some(k => params.has(k))

  const current = hasUrlFilters
    ? fromParams(params)
    : {
        status: stored.status ?? DEFAULTS.status,
        category: stored.category ?? null,
        hideSoldout: stored.hideSoldout ?? false,
        sort: stored.sort ?? DEFAULTS.sort,
        // 월 필터는 'YYYY-MM' 문자열로 바뀌었다 — 예전 버전에서 저장된 숫자(9 등)가
        // 남아 있으면 무시하고 "전체"로 시작한다.
        month: typeof stored.month === 'string' ? stored.month : null,
        search: typeof storedSearch === 'string' ? storedSearch : '',
      }

  const update = (patch) => {
    const next = { ...current, ...patch }
    const { search, ...rest } = next
    setStored(rest)
    setStoredSearch(search)
    setParams(toParams(next), { replace: true })
  }

  return {
    ...current,
    // 상태를 바꾸면 월 선택은 푼다 — 그 상태에 그 달 행사가 없으면 빈 목록만 남는다.
    setStatus: status => update({ status, month: null }),
    setCategory: category => update({ category }),
    setHideSoldout: hideSoldout => update({ hideSoldout }),
    setSort: sort => update({ sort }),
    setMonth: month => update({ month }),
    setSearch: search => update({ search }),
    resetAll: () => update(CLEARED),
  }
}
