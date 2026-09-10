// 행사 포스터를 "잘리지 않게" 보여준다.
//
// 공식 포스터는 대부분 A4 비율(1:1.41)의 세로형인데 카드·상세의 이미지 영역은 가로형이다.
// object-cover로 채우면 가운데 띠만 남는다 — 실제로 AGF 2026 포스터가 카드에서는 치마·다리
// 부분만, 상세페이지에서는 제목(AGF 2026)과 하단 날짜가 잘린 채로 보였다. 행사 포스터는
// 제목·날짜·장소가 그림 안에 인쇄돼 있어서 그게 잘리면 정보도 같이 사라진다.
//
// 그래서 포스터는 object-contain으로 전체를 보여주고, 남는 좌우 여백은 같은 이미지를
// 흐리게 깔아 채운다(여백이 빈 검정으로 남으면 잘라낸 것처럼 어색해 보인다).
export default function PosterImage({ src, alt, className = '', onError }) {
  return (
    <div className={`relative overflow-hidden bg-zinc-900/60 ${className}`}>
      {/* 배경: 같은 포스터를 크게 흐리게 — 장식이므로 스크린리더에서 감춘다 */}
      <img
        src={src}
        alt=""
        aria-hidden="true"
        loading="lazy"
        className="absolute inset-0 w-full h-full object-cover scale-125 blur-2xl opacity-50"
      />
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onError={onError}
        className="relative w-full h-full object-contain"
      />
    </div>
  )
}
