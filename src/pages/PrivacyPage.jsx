import { Link } from 'react-router-dom'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { FOCUS_RING } from '../components/ui/focusRing'

// 개인정보처리방침 · 이용약관.
//
// 왜 필요한가
//   로그인이 없는 사이트라 "개인정보를 안 모은다"고 생각하기 쉬운데, 실제로는 셋을 모은다.
//   제보할 때 적는 연락처, 알림을 켜면 생기는 기기 토큰, 화면이 터졌을 때 함께 오는
//   브라우저 정보. 앞의 둘은 방문자가 직접 준 것이고, 셋째는 자동으로 간다.
//
//   그걸 어디에도 안 적어두면, 방문자는 자기가 무엇을 줬는지 알 방법이 없다.
//
// 이 문서를 쓰는 규칙
//   **코드에서 확인한 것만 적는다.** 보관 기간을 적으려면 실제로 지우는 코드가 있어야
//   한다. 실제로 이 문서를 쓰다가 두 군데에 보관 기간이 없다는 걸 발견해서 먼저
//   만들었다(supabase/data_retention_2026-09-17.sql). 문서가 코드보다 앞서가면
//   그 문서는 거짓말이다.
//
// 한 화면에 둘 다 두는 이유
//   분량이 적다. 두 화면으로 나누면 둘 다 안 읽힌다.

// TODO — 운영자 정보. 이 두 줄만 채우면 문서가 완성된다.
// 개인이 운영해도 이름과 연락받을 주소는 적어야 한다(이메일 하나면 된다).
const OPERATOR = '(운영자명 미기재)'
const CONTACT = '(연락처 미기재)'

const UPDATED = '2026년 9월 17일'

export default function PrivacyPage() {
  useDocumentTitle('개인정보처리방침 · 이용약관')

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 lg:py-12">
      <h1 className="text-2xl font-bold text-ink mb-1">개인정보처리방침 · 이용약관</h1>
      <p className="text-xs text-zinc-500 mb-8">최종 수정 {UPDATED}</p>

      <Section title="한눈에">
        <p>
          게임이벤트허브는 <strong className="text-ink">로그인이 없습니다.</strong> 이름·생년월일·전화번호를
          받지 않고, 누가 무엇을 봤는지 추적하지 않습니다.
        </p>
        <p>
          다만 아래 세 가지는 실제로 저장됩니다. 하나는 직접 적어 주시는 것이고, 하나는 알림을
          켤 때 생기며, 하나는 화면이 잘못됐을 때 자동으로 전송됩니다.
        </p>
      </Section>

      <Section title="무엇을 모으나">
        <Item
          what="제보에 적은 연락처"
          when="‘행사 제보 · 정보 오류 신고’를 보낼 때. 선택 항목이라 비워 두셔도 보내집니다."
          why="제보 내용을 되물어야 할 때 연락하기 위해서입니다."
          keep="처리가 끝나고 1년이 지나면 연락처만 자동으로 지웁니다. 제보 내용 자체는 남습니다."
        />
        <Item
          what="알림 기기 토큰과 브라우저 종류"
          when="설정에서 알림을 켤 때. 기기를 가리키는 임의의 문자열이며, 누구인지는 담겨 있지 않습니다."
          why="예매 오픈·행사 임박 알림을 그 기기로 보내기 위해서입니다."
          keep="마지막 발송으로부터 90일이 지나면 자동으로 지웁니다. 설정에서 알림을 끄면 그 자리에서 지워집니다."
        />
        <Item
          what="오류가 났을 때의 화면 주소와 브라우저 종류"
          when="앱이 방문자 화면에서 오류를 낼 때 자동으로 전송됩니다."
          why="어떤 화면이 어떤 브라우저에서 깨지는지 모르면 고칠 수가 없습니다."
          keep="90일이 지나면 자동으로 지웁니다."
        />
        <p className="text-xs text-zinc-500 leading-relaxed">
          오류 정보에는 <strong className="text-zinc-300">주소의 물음표 뒷부분(검색어 등)을 빼고</strong> 보냅니다.
          쿠키·로컬 저장소의 내용도 보내지 않습니다.
        </p>
      </Section>

      <Section title="모으지 않는 것">
        <ul className="list-disc pl-5 space-y-1">
          <li>이름 · 생년월일 · 전화번호 · 주소 · 결제 정보</li>
          <li>광고·추적 쿠키 (이 사이트는 광고를 싣지 않습니다)</li>
          <li>방문자를 식별하는 값 — 방문 통계는 쿠키 없는 방식(Cloudflare Web Analytics)을 씁니다</li>
        </ul>
        <p className="text-xs text-zinc-500">
          북마크와 설정(테마·목록 보기)은 <strong className="text-zinc-300">기기 안에만</strong> 저장되고
          서버로 오지 않습니다. 브라우저 데이터를 지우면 함께 사라집니다.
        </p>
      </Section>

      <Section title="어디에 맡기나">
        <p>
          서비스를 돌리는 데 필요한 만큼만 아래 업체의 설비를 씁니다. 우리가 이 정보를 팔거나
          광고에 쓰지 않습니다.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong className="text-zinc-300">Supabase</strong> — 행사·제보·알림 토큰 데이터베이스</li>
          <li><strong className="text-zinc-300">Cloudflare</strong> — 사이트 배포, 방문 통계(쿠키 없음)</li>
          <li><strong className="text-zinc-300">Google Firebase</strong> — 푸시 알림 발송</li>
        </ul>
      </Section>

      <Section title="알림 끄기 · 제보 지우기">
        <p>
          알림은 <strong className="text-ink">설정 → 알림</strong>에서 언제든 끌 수 있고, 끄면 저장된 기기
          토큰이 그 자리에서 삭제됩니다.
        </p>
        <p>
          보낸 제보의 연락처를 미리 지우고 싶으시면 아래 주소로 알려주세요. 제보 내용을 알 수
          있는 만큼(대략 언제, 어떤 행사에 대해 보냈는지) 함께 적어주시면 찾을 수 있습니다.
        </p>
      </Section>

      <Section title="이용약관">
        <p>
          행사 정보는 공식 사이트·공공 API·뉴스에서 모아 옮긴 것입니다. 옮기는 과정에서 틀릴 수
          있고, 공식 발표가 바뀔 수도 있습니다.{' '}
          <strong className="text-ink">방문·예매 전에 반드시 공식 사이트에서 다시 확인해 주세요.</strong>{' '}
          이 사이트의 정보를 믿고 움직여 생긴 일에 대해 책임지지 않습니다.
        </p>
        <p>
          포스터·부스 이미지 등은 주최 측이 공개한 홍보물이며 저작권은 각 권리자에게 있습니다.
          권리자께서 내려달라고 하시면 확인 후 지웁니다.
        </p>
        <p>
          거짓 제보, 자동화된 대량 요청, 다른 방문자를 방해하는 행위는 삼가주세요. 그런 요청은
          차단될 수 있습니다.
        </p>
      </Section>

      <Section title="문의">
        <p>
          운영자 <span className="text-zinc-300">{OPERATOR}</span> · 연락처{' '}
          <span className="text-zinc-300">{CONTACT}</span>
        </p>
        <p className="text-xs text-zinc-500">
          이 방침이 바뀌면 이 화면의 ‘최종 수정’ 날짜가 함께 바뀝니다.
        </p>
      </Section>

      <Link to="/" className={`inline-block mt-4 text-sm text-indigo-400 hover:text-indigo-300 rounded ${FOCUS_RING}`}>
        ← 행사 목록으로
      </Link>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <section className="mb-8">
      <h2 className="text-base font-semibold text-ink mb-2.5">{title}</h2>
      <div className="flex flex-col gap-2.5 text-sm text-zinc-400 leading-relaxed">{children}</div>
    </section>
  )
}

// 항목 하나를 "무엇을 · 언제 · 왜 · 얼마나"로 쪼갠다.
//
// 줄글로 쓰면 읽는 사람이 "그래서 내 연락처가 언제까지 남는다는 거지"를 문장에서
// 다시 찾아내야 한다. 표로 만들면 좁은 화면에서 가로로 넘친다.
function Item({ what, when, why, keep }) {
  return (
    <div className="bg-surface-1 border border-line rounded-xl p-4">
      <p className="text-sm font-semibold text-ink mb-2">{what}</p>
      <dl className="grid grid-cols-[3.5rem_1fr] gap-x-3 gap-y-1.5 text-xs">
        <dt className="text-zinc-500">언제</dt><dd className="text-zinc-300">{when}</dd>
        <dt className="text-zinc-500">왜</dt><dd className="text-zinc-300">{why}</dd>
        <dt className="text-zinc-500">얼마나</dt><dd className="text-zinc-300">{keep}</dd>
      </dl>
    </div>
  )
}
