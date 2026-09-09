import { Component } from 'react'

// 렌더링 중 예외가 나면 React는 트리 전체를 언마운트한다 — 지금까지는 그 결과가
// "완전한 백지 화면"이었다(데이터 한 건이 예상과 다른 모양이어도 사이트 전체가 죽는다).
// 에러 바운더리로 감싸서 최소한 무슨 일이 일어났는지 알리고 빠져나갈 길을 준다.
// 에러 바운더리는 아직 클래스 컴포넌트로만 만들 수 있다.
export default class ErrorBoundary extends Component {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    // 개발 중엔 콘솔에 남겨서 원인을 찾을 수 있게 한다.
    console.error('[ErrorBoundary]', error, info?.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <div className="text-5xl mb-4">😵</div>
        <h1 className="text-xl font-bold text-white mb-2">화면을 표시하지 못했습니다</h1>
        <p className="text-zinc-400 text-sm mb-8">
          일시적인 오류일 수 있습니다. 새로고침해도 같은 화면이 나오면 잠시 후 다시 시도해 주세요.
        </p>
        <div className="flex gap-2 justify-center">
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-colors"
          >
            새로고침
          </button>
          <a
            href={import.meta.env.BASE_URL}
            className="px-5 py-3 bg-white/10 hover:bg-white/15 text-white rounded-xl transition-colors"
          >
            홈으로
          </a>
        </div>
      </div>
    )
  }
}
