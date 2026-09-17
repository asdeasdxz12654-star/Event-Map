import { describe, expect, it } from 'vitest'
import { buildXml } from './sitemap.xml.js'

// 사이트맵 XML.
//
// 깨진 XML은 검색엔진이 조용히 무시한다 — 우리 쪽에는 아무 신호도 안 온다.
// 특히 _redirects의 `/* /index.html 200` 때문에, 이 함수가 없거나 깨지면
// /sitemap.xml 요청에 HTML이 200으로 나간다(있는 것처럼 보이면서 파싱 실패).
describe('buildXml', () => {
  it('XML 선언과 urlset으로 감싼다', () => {
    const xml = buildXml([{ loc: 'https://x/' }])
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    expect(xml.trimEnd().endsWith('</urlset>')).toBe(true)
  })

  it('XML에서 뜻을 갖는 글자를 이스케이프한다', () => {
    const xml = buildXml([{ loc: 'https://x/events/a&b<c>"d\'e' }])
    expect(xml).toContain('a&amp;b&lt;c&gt;&quot;d&apos;e')

    // loc 안에 날것의 < > 가 남아 있으면 파서가 거기서 태그를 연 것으로 읽는다.
    // 태그 바깥까지 검사하면 </loc> 자체를 잡으므로, 값만 꺼내서 본다.
    const value = /<loc>([\s\S]*?)<\/loc>/.exec(xml)[1]
    expect(value).not.toMatch(/[<>]/)
    expect(value).not.toMatch(/&(?!(amp|lt|gt|quot|apos);)/)
  })

  it('없는 항목은 빈 태그로 넣지 않는다', () => {
    const xml = buildXml([{ loc: 'https://x/' }])
    expect(xml).not.toContain('<lastmod>')
    expect(xml).not.toContain('<changefreq>')
    expect(xml).not.toContain('<priority>')
  })

  it('주어진 항목은 전부 담는다', () => {
    const xml = buildXml([{ loc: 'https://x/e', lastmod: '2026-09-15', changefreq: 'daily', priority: '0.7' }])
    expect(xml).toContain('<lastmod>2026-09-15</lastmod>')
    expect(xml).toContain('<changefreq>daily</changefreq>')
    expect(xml).toContain('<priority>0.7</priority>')
  })

  it('여러 개를 나열한다', () => {
    const xml = buildXml([{ loc: 'https://x/a' }, { loc: 'https://x/b' }, { loc: 'https://x/c' }])
    expect(xml.match(/<url>/g)).toHaveLength(3)
  })

  it('빈 목록에서도 깨지지 않는다', () => {
    expect(buildXml([])).toContain('</urlset>')
  })
})
