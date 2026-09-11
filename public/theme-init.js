// 저장해 둔 화면 테마를 React가 뜨기 전에 미리 적용한다.
//
// 없으면 라이트를 쓰는 사람이 들어올 때마다 다크 화면이 한 번 번쩍인 뒤 라이트로 바뀐다
// (CSS 기본값이 다크라서 그렇다). <head>에서 동기로 실행돼 첫 그리기 전에 끝난다.
//
// 인라인 스크립트가 아니라 파일로 둔 이유: public/_headers의 CSP가 script-src 'self'라
// 인라인 <script>는 실행이 막힌다.
//
// 저장 키·기본값은 src/hooks/useTheme.js와 같아야 한다.
(function () {
  try {
    var raw = localStorage.getItem('gameEventHub.theme')
    if (raw && JSON.parse(raw) === 'light') {
      document.documentElement.dataset.theme = 'light'
    }
  } catch {
    // 시크릿 모드 등에서 localStorage 접근이 막히면 기본(다크)으로 둔다
  }
})()
