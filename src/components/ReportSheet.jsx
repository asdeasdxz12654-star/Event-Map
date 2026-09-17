import { useState } from 'react'
import Sheet from './ui/Sheet'
import Icon from './icons'
import { sendReport } from '../lib/reportApi'
import { FOCUS_RING } from './ui/focusRing'
import { ADMIN_FIELD as field } from './ui/formStyles'

// 방문자가 "이 정보 틀렸어요" 또는 "이런 행사가 있어요"를 보내는 자리.
//
// 왜 필요한가
//   지금 방문자가 할 수 있는 일은 보기·북마크·공유뿐이다. 틀린 정보를 발견해도 알려줄
//   곳이 없었다. 운영 쪽에서도 같은 구멍이다 — 행사 51건 중 포스터 31 · 예매링크 17건만
//   채워져 있는데, 크롤러가 못 찾는 값을 실제로 그 행사에 가는 사람은 알고 있다.
//
// 로그인을 붙이지 않는다
//   제보 하나 보내려고 가입하라고 하면 아무도 안 보낸다. 대신 연락처를 선택으로 받는다 —
//   답이 필요 없는 제보(오타 하나)가 대부분이고, 필요한 사람만 적으면 된다.
//
// 보낸 뒤에 폼을 닫지 않고 "고맙습니다"로 바꾼다. 바로 닫으면 보내진 건지 알 수 없어
// 같은 내용을 한 번 더 보내게 된다.
const MAX = 2000

export default function ReportSheet({ kind, event = null, onClose }) {
  const [message, setMessage] = useState('')
  const [contact, setContact] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)

  const isCorrection = kind === 'correction'
  const title = isCorrection ? '정보가 틀렸나요?' : '행사 제보하기'

  const submit = async (e) => {
    e.preventDefault()
    if (message.trim().length < 5) {
      setError('내용을 5자 이상 적어주세요.')
      return
    }
    setSending(true)
    setError(null)
    try {
      await sendReport({ kind, eventId: event?.id ?? null, message, contact })
      setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  if (done) {
    return (
      <Sheet title={title} onClose={onClose}>
        <div className="py-6 text-center">
          <Icon name="check" className="w-10 h-10 mx-auto mb-3 text-live" />
          <p className="text-sm text-ink mb-1">보내주셔서 고맙습니다.</p>
          <p className="text-xs text-zinc-400 leading-relaxed">
            확인하고 반영하겠습니다.
            {contact.trim() && ' 필요하면 남겨주신 연락처로 답을 드릴게요.'}
          </p>
          <button
            type="button"
            onClick={onClose}
            className={`mt-5 px-4 py-2 text-sm bg-surface-2 hover:bg-line text-ink rounded-xl transition-colors ${FOCUS_RING}`}
          >
            닫기
          </button>
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet title={title} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        {isCorrection && event && (
          <p className="text-xs text-zinc-400 bg-surface-2 rounded-lg px-3 py-2">
            <span className="text-zinc-500">대상 행사</span>{' '}
            <span className="text-ink">{event.title}</span>
          </p>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-zinc-400">
            {isCorrection
              ? '어떤 정보가 어떻게 다른지 알려주세요'
              : '행사 이름 · 날짜 · 장소를 아는 만큼 적어주세요'}
          </span>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value.slice(0, MAX))}
            rows={5}
            required
            autoFocus
            placeholder={isCorrection
              ? 'ex) 예매 링크가 지난 회차 주소입니다. 공식 공지에는 티켓링크로 올라와 있어요.'
              : 'ex) 11월 8일 부산 벡스코에서 OO 페스티벌이 열립니다. 공식 인스타에 공지 올라왔어요.'}
            className={`${field} resize-none leading-relaxed`}
          />
          <span className="text-[11px] text-zinc-600 text-right tabular-nums">
            {message.length} / {MAX}
          </span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-zinc-400">
            연락처 <span className="text-zinc-600">(선택 — 답이 필요할 때만)</span>
          </span>
          <input
            type="text"
            value={contact}
            onChange={e => setContact(e.target.value.slice(0, 200))}
            placeholder="이메일 · SNS 아이디 등"
            className={field}
          />
        </label>

        {error && (
          <p className="text-xs text-danger bg-danger/10 rounded-lg px-3 py-2" role="alert">{error}</p>
        )}

        <button
          type="submit"
          disabled={sending || message.trim().length < 5}
          className={`w-full py-3 text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl transition-colors ${FOCUS_RING}`}
        >
          {sending ? '보내는 중...' : '보내기'}
        </button>

        <p className="text-[11px] text-zinc-500 leading-relaxed">
          보내주신 내용은 관리자만 봅니다. 로그인은 필요 없고, 남기신 연락처는 답장 외에는
          쓰지 않습니다.
        </p>
      </form>
    </Sheet>
  )
}
