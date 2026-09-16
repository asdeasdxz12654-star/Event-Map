import { useEffect, useMemo, useState } from 'react'
import Icon from './icons'
import Chip from './ui/Chip'
import Sheet from './ui/Sheet'
import Segmented from './ui/Segmented'
import DisclosureNote from './DisclosureNote'
import GoodsLightbox from './GoodsLightbox'
import { FOCUS_RING } from './ui/focusRing'
import {
  boothHue, boothInitial, formatPrice, itemTitle, matchesBucket,
  priceBuckets, priceRangeLabel, splitBoothName,
} from '../lib/boothKinds'

const PAGE = 24
const STATUS_LABEL = { soldout: '품절', limited: '한정', preorder: '예약' }

// 굿즈 탭.
//
// 부스 탭과 같은 데이터(event_booth_items)를 다른 축으로 본다. 부스 탭이 "어디에 가면
// 뭐가 있나"라면 여기는 "이거 얼마고 어디서 파나"다. 도서관에 책이 한 권이어도 저자
// 색인과 주제 색인이 따로 있는 것과 같다 — 중복이 아니라 다른 색인이다.
//
// 그래서 공식 굿즈든 참가 업체 굿즈든 예외 없이 한 격자에 담고, 출처는 배지로 밝힌다.
// 예전 GoodsList는 부스별로 묶어 세로 목록으로 보여줬는데, 그러면 "3만원 이하 뭐 있나"
// 같은 질문에 답할 수 없고 사진도 못 쓴다.
export default function GoodsGrid({ items, booths, note, focusBoothId, onJump }) {
  const goods = useMemo(() => items.filter(i => i.kind === 'goods'), [items])
  const boothById = useMemo(() => new Map(booths.map(b => [b.id, b])), [booths])

  const [boothId, setBoothId] = useState(focusBoothId ?? null)
  const [title, setTitle] = useState(null)
  const [bucketId, setBucketId] = useState(null)
  const [sort, setSort] = useState('default')
  const [openAxis, setOpenAxis] = useState(null)
  const [shown, setShown] = useState(PAGE)
  const [lightbox, setLightbox] = useState(null)

  // 부스 탭에서 "굿즈 탭 →"으로 넘어오면 그 부스로 걸린 상태에서 열린다.
  useEffect(() => { setBoothId(focusBoothId ?? null) }, [focusBoothId])

  // 필터 축 셋. 전부 "고를 게 둘 이상일 때만" 나타난다.
  const boothOptions = useMemo(() => (
    booths
      .map(b => ({ id: b.id, label: splitBoothName(b.name).main, count: goods.filter(g => g.boothId === b.id).length }))
      .filter(o => o.count > 0)
  ), [booths, goods])

  const titleOptions = useMemo(() => {
    const counts = new Map()
    for (const g of goods) {
      const t = itemTitle(g, boothById.get(g.boothId))
      if (!t) continue
      counts.set(t, (counts.get(t) ?? 0) + 1)
    }
    return [...counts].map(([label, count]) => ({ id: label, label, count }))
  }, [goods, boothById])

  // 타이틀 축이 부스 축과 똑같은 묶음이면 필터를 두 번 보여줄 이유가 없다.
  //
  // itemTitle()은 item.title이 비어 있으면 부스 이름을 타이틀로 쓴다. 호요랜드처럼
  // 부스가 곧 게임 타이틀인 행사에서는 그 대체 덕분에 게임 필터가 그냥 동작하지만,
  // 그러면 "부스"와 "타이틀"이 글자 그대로 같은 목록이 된다 — 실제로 굿즈 38건이
  // 전부 title이 비어 있어서 두 버튼이 같은 것을 보여주고 있었다.
  //
  // 두 축이 정말 다른 건 한 부스가 여러 타이틀을 다룰 때뿐이다(넥슨 부스의 메이플·던파).
  // 타이틀 하나가 부스 하나에만 걸리고 개수도 같으면 같은 묶음이므로 감춘다.
  const titleIsRedundant = useMemo(() => {
    if (titleOptions.length !== boothOptions.length) return false
    const boothsOfTitle = new Map()
    for (const g of goods) {
      const t = itemTitle(g, boothById.get(g.boothId))
      if (!t) continue
      if (!boothsOfTitle.has(t)) boothsOfTitle.set(t, new Set())
      boothsOfTitle.get(t).add(g.boothId)
    }
    return [...boothsOfTitle.values()].every(set => set.size === 1)
  }, [goods, titleOptions, boothOptions, boothById])

  const buckets = useMemo(() => priceBuckets(goods), [goods])
  const bucket = buckets.find(b => b.id === bucketId) ?? null

  const filtered = useMemo(() => {
    const list = goods.filter(g => {
      if (boothId && g.boothId !== boothId) return false
      if (title && itemTitle(g, boothById.get(g.boothId)) !== title) return false
      if (bucket && !matchesBucket(g, bucket)) return false
      return true
    })
    if (sort === 'default') return list
    // 가격 미공개는 어느 방향으로 정렬하든 맨 뒤로 보낸다 — 0원으로 취급해 맨 앞에
    // 세우면 "제일 싼 것"을 찾는 사람에게 거짓말이 된다.
    const dir = sort === 'asc' ? 1 : -1
    return [...list].sort((a, b) => {
      if (a.price == null && b.price == null) return 0
      if (a.price == null) return 1
      if (b.price == null) return -1
      return (a.price - b.price) * dir
    })
  }, [goods, boothId, title, bucket, sort, boothById])

  useEffect(() => { setShown(PAGE) }, [boothId, title, bucketId, sort])

  if (goods.length === 0) {
    return (
      <div className="mb-4">
        <DisclosureNote note={note} subject="굿즈" emptyText="아직 등록된 굿즈 정보가 없습니다." />
      </div>
    )
  }

  const activeChips = [
    boothId && { key: 'booth', label: boothOptions.find(o => o.id === boothId)?.label ?? '부스', clear: () => setBoothId(null) },
    title && { key: 'title', label: title, clear: () => setTitle(null) },
    bucket && { key: 'price', label: bucket.label, clear: () => setBucketId(null) },
  ].filter(Boolean)

  const axes = [
    boothOptions.length > 1 && { id: 'booth', label: '부스', on: !!boothId },
    !titleIsRedundant && titleOptions.length > 1 && { id: 'title', label: '타이틀', on: !!title },
    buckets.length > 1 && { id: 'price', label: '가격', on: !!bucket },
  ].filter(Boolean)

  const range = priceRangeLabel(filtered)
  const visible = filtered.slice(0, shown)

  return (
    <div className="flex flex-col gap-3 mb-4">
      {axes.length > 0 && (
        <div className="flex gap-1.5">
          {axes.map(axis => (
            <button
              key={axis.id}
              type="button"
              onClick={() => setOpenAxis(axis.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-colors ${FOCUS_RING} ${
                axis.on
                  ? 'border-indigo-500/50 bg-indigo-600/15 text-indigo-300'
                  : 'border-line-strong text-zinc-400 hover:text-ink'
              }`}
            >
              {axis.label}
              <Icon name="chevronDown" className="w-3 h-3 opacity-60" />
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {activeChips.map(c => (
          <Chip key={c.key} removable onClick={c.clear} aria-label={`${c.label} 조건 해제`}>{c.label}</Chip>
        ))}
        {activeChips.length > 0 && (
          <button
            type="button"
            onClick={() => { setBoothId(null); setTitle(null); setBucketId(null) }}
            className={`text-xs text-zinc-400 hover:text-ink underline underline-offset-2 px-1 py-1 rounded ${FOCUS_RING}`}
          >
            전체 해제
          </button>
        )}
        <p className="ml-auto text-xs text-zinc-400 tabular-nums" aria-live="polite">
          {filtered.length}종{range && ` · ${range}`}
        </p>
      </div>

      {filtered.length === 0 ? (
        <p className="text-xs text-zinc-400 py-8 text-center">해당하는 굿즈가 없습니다</p>
      ) : (
        <>
          <ul className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {visible.map((item, i) => (
              <li key={item.id}>
                <GoodsCard
                  item={item}
                  booth={boothById.get(item.boothId)}
                  onOpen={() => setLightbox(i)}
                />
              </li>
            ))}
          </ul>

          {shown < filtered.length && (
            <button
              type="button"
              onClick={() => setShown(n => n + PAGE)}
              className={`w-full py-2.5 text-sm text-zinc-400 hover:text-ink border border-line rounded-xl transition-colors ${FOCUS_RING}`}
            >
              {filtered.length - shown}종 더 보기
            </button>
          )}
        </>
      )}

      {note && <p className="text-xs text-zinc-500 leading-relaxed">{note}</p>}

      {openAxis && (
        <Sheet title={axes.find(a => a.id === openAxis)?.label ?? '필터'} onClose={() => setOpenAxis(null)}>
          {openAxis === 'booth' && (
            <OptionList
              options={boothOptions}
              value={boothId}
              onChange={v => { setBoothId(v); setOpenAxis(null) }}
              allLabel="모든 부스"
              allCount={goods.length}
            />
          )}
          {openAxis === 'title' && (
            <OptionList
              options={titleOptions}
              value={title}
              onChange={v => { setTitle(v); setOpenAxis(null) }}
              allLabel="모든 타이틀"
              allCount={goods.length}
            />
          )}
          {openAxis === 'price' && (
            <>
              <OptionList
                options={buckets}
                value={bucketId}
                onChange={v => { setBucketId(v); setOpenAxis(null) }}
                allLabel="모든 가격"
                allCount={goods.length}
              />
              <div className="border-t border-line pt-3 mt-1">
                <p className="text-xs text-zinc-400 mb-2">정렬</p>
                <Segmented
                  ariaLabel="굿즈 정렬"
                  value={sort}
                  onChange={setSort}
                  options={[
                    { value: 'default', label: '기본' },
                    { value: 'asc', label: '낮은 가격' },
                    { value: 'desc', label: '높은 가격' },
                  ]}
                />
              </div>
            </>
          )}
        </Sheet>
      )}

      {lightbox != null && (
        <GoodsLightbox
          items={filtered}
          index={lightbox}
          booths={booths}
          onIndexChange={setLightbox}
          onClose={() => setLightbox(null)}
          onJump={onJump}
        />
      )}
    </div>
  )
}

function OptionList({ options, value, onChange, allLabel, allCount }) {
  const rows = [{ id: null, label: allLabel, count: allCount }, ...options]
  return (
    <ul className="flex flex-col">
      {rows.map(opt => {
        const on = opt.id === value
        return (
          <li key={String(opt.id)}>
            <button
              type="button"
              onClick={() => onChange(opt.id)}
              aria-pressed={on}
              className={`w-full flex items-center gap-2 px-1 py-2.5 text-left text-sm transition-colors ${FOCUS_RING} ${
                on ? 'text-ink font-semibold' : 'text-zinc-300 hover:text-ink'
              }`}
            >
              <span className="flex-1 min-w-0 truncate">{opt.label}</span>
              <span className="text-xs text-zinc-500 tabular-nums">{opt.count}</span>
              {on && <Icon name="check" className="w-4 h-4 text-indigo-400" />}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function GoodsCard({ item, booth, onOpen }) {
  const [imgFailed, setImgFailed] = useState(false)
  const hue = boothHue(booth?.name ?? item.name)
  const price = formatPrice(item.price, item.priceNote)
  const showImage = !!item.imageUrl && !imgFailed

  return (
    <button type="button" onClick={onOpen} className={`group w-full text-left rounded-xl ${FOCUS_RING}`}>
      <div className="relative w-full aspect-square rounded-xl overflow-hidden border border-line mb-2">
        {showImage ? (
          <img
            src={item.imageUrl}
            alt={item.name}
            loading="lazy"
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          // 사진이 없을 때도 빈칸이 아니라 부스와 같은 색 타일이 나온다 — 격자에서
          // 어느 부스 굿즈인지가 색으로도 읽힌다.
          <div
            aria-hidden="true"
            className="w-full h-full grid place-items-center text-xl font-bold text-white/90"
            style={{ background: `linear-gradient(140deg, hsl(${hue} 45% 42%), hsl(${(hue + 28) % 360} 40% 26%))` }}
          >
            {boothInitial(item.name)}
          </div>
        )}
        {/* 품절·한정은 카드를 지우지 않고 덮는다 — "원래 없는 것"과 "다 팔린 것"은 다르다 */}
        {item.status && (
          <div className="absolute inset-0 bg-black/55 flex items-end justify-center pb-3">
            <span className="px-2 py-1 rounded-md bg-danger text-white text-[11px] font-bold">
              {STATUS_LABEL[item.status]}
            </span>
          </div>
        )}
      </div>

      <p className="text-xs font-semibold text-ink leading-snug line-clamp-2 mb-1 group-hover:text-indigo-300 transition-colors">
        {item.name}
      </p>
      <p className={`text-xs tabular-nums ${price ? 'font-semibold text-ink' : 'text-zinc-500'}`}>
        {price ?? '가격 미공개'}
      </p>
      {booth && (
        <span className="mt-1.5 inline-flex items-center gap-1.5 max-w-full text-[11px] text-zinc-400 bg-surface-2 px-2 py-0.5 rounded-md">
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: `hsl(${hue} 45% 55%)` }} aria-hidden="true" />
          <span className="truncate">{splitBoothName(booth.name).main}</span>
        </span>
      )}
    </button>
  )
}
