import { useState } from 'react'
import { boothHue, boothInitial } from '../lib/boothKinds'

// 부스·항목의 썸네일.
//
// 이미지 데이터는 사람이 넣어야 하고 지금은 거의 없다. 그래서 "이미지 없음"이 예외가
// 아니라 기본 상태가 되도록, 없을 때도 빈 회색칸이 아니라 이름에서 뽑은 색 타일이
// 나오게 한다 — 목록이 비어 보이지 않고, 같은 부스는 어디서 그려도 같은 색이라
// 게임 선택 칩과 카드가 색으로 이어진다.
//
// 주소가 있어도 깨질 수 있으므로(외부 호스트) onError로 같은 타일로 되돌린다.
//
// hueFrom: 색을 뽑을 기준 문자열. 부스 안의 항목들은 자기 이름 대신 부스 이름을 넘겨서
// 한 카드 안의 타일이 같은 색 계열로 묶이게 한다 — 항목마다 자기 이름으로 색을 뽑으면
// 카드 하나가 무지개가 되고, 색이 "어느 부스인가"라는 의미를 잃는다.
export default function BoothThumb({ name, src, size = 'md', hueFrom, className = '' }) {
  const [failed, setFailed] = useState(false)
  const hue = boothHue(hueFrom ?? name)
  const box = size === 'sm' ? 'w-9 h-9 text-xs rounded-lg' : 'w-11 h-11 text-base rounded-xl'

  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className={`${box} shrink-0 object-cover bg-ink/10 ${className}`}
      />
    )
  }

  return (
    <div
      aria-hidden="true"
      className={`${box} shrink-0 grid place-items-center font-bold text-white/90 select-none ${className}`}
      style={{
        background: `linear-gradient(140deg, hsl(${hue} 45% 42%), hsl(${(hue + 28) % 360} 40% 26%))`,
      }}
    >
      {boothInitial(name)}
    </div>
  )
}
