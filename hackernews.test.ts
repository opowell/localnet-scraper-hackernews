import { afterEach, describe, expect, it } from 'vitest'
import { parserLoader, resetPage, visit } from '#scraper-test'

// The parser, evaluated with the helpers it is injected with, as a scrape runs it.
const load = parserLoader(__dirname)

afterEach(resetPage)

describe('listings', () => {
  it('marks a Hacker News listing, not a discussion', () => {
    const { parseHackerNews } = load('hackernews.js', ['parseHackerNews'])
    visit('https://news.ycombinator.com/news', '<table><tr class="athing submission" id="1"></tr></table>')
    expect(parseHackerNews().listing).toBe(true)
    visit('https://news.ycombinator.com/item?id=1', '<table class="fatitem"><tr class="athing submission" id="1"><td class="titleline"><a href="https://a.example/">A</a></td></tr></table>')
    expect(parseHackerNews().listing).toBeUndefined()
  })
})

describe('hacker News', () => {
  const { parseHackerNews } = load('hackernews.js', ['parseHackerNews'])

  it('links a listing to each story\'s discussion, the top ranked most strongly', () => {
    visit('https://news.ycombinator.com/', `<table>
      <tr class="athing submission" id="1"><td><span class="titleline"><a href="https://a.example/">First</a></span></td></tr>
      <tr class="athing submission" id="2"><td><span class="titleline"><a href="item?id=2">Ask HN: Second</a></span></td></tr>
    </table>`)
    const { links } = parseHackerNews()
    expect(links.map((l: any) => [l.url, l.title])).toEqual([
      ['https://news.ycombinator.com/item?id=1', 'First'],
      ['https://news.ycombinator.com/item?id=2', 'Ask HN: Second'],
    ])
    expect(links[0].score).toBe(1)
    expect(links[1].score).toBeLessThan(1)
  })

  it('gives each listed story its points, author, age and comments, as its subtext says them', () => {
    visit('https://news.ycombinator.com/', `<table>
      <tr class="athing submission" id="1"><td><span class="titleline"><a href="https://a.example/">First</a></span></td></tr>
      <tr><td class="subtext"><span class="subline"><span class="score">138 points</span> by <a href="user?id=ann" class="hnuser">ann</a>
        <span class="age" title="2026-11-06T19:48:51 1793994531"><a href="item?id=1">1 hour ago</a></span> | <a href="hide?id=1">hide</a> | <a href="item?id=1">38&nbsp;comments</a></span></td></tr>
      <tr class="athing submission" id="2"><td><span class="titleline"><a href="https://b.example/">Second</a></span></td></tr>
      <tr><td class="subtext"><span class="subline"><span class="score">1 point</span> by <a href="user?id=bo" class="hnuser">bo</a>
        <span class="age" title="2026-11-06T20:00:00"><a href="item?id=2">2 minutes ago</a></span> | <a href="item?id=2">discuss</a></span></td></tr>
      <tr class="athing submission" id="3"><td><span class="titleline"><a href="https://c.example/">Job</a></span></td></tr>
      <tr><td class="subtext"><span class="age" title="2026-11-06T18:00:00"><a href="item?id=3">3 hours ago</a></span></td></tr>
    </table>`)
    expect(parseHackerNews().links.map((l: any) => l.details)).toEqual([
      [['points', 138], ['author', { text: 'ann', url: 'https://news.ycombinator.com/user?id=ann' }], ['time', '2026-11-06T19:48:51.000Z'], ['comments', 38]],
      [['points', 1], ['author', { text: 'bo', url: 'https://news.ycombinator.com/user?id=bo' }], ['time', '2026-11-06T20:00:00.000Z']],
      [['time', '2026-11-06T18:00:00.000Z']],
    ])
  })

  it('weights a later page\'s stories by their rank across pages', () => {
    visit('https://news.ycombinator.com/?p=2', `<table>
      <tr class="athing submission" id="31"><td><span class="rank">31.</span></td><td><span class="titleline"><a href="https://a.example/">Thirty-first</a></span></td></tr>
      <tr class="athing submission" id="32"><td><span class="rank">32.</span></td><td><span class="titleline"><a href="https://b.example/">Thirty-second</a></span></td></tr>
    </table>`)
    expect(parseHackerNews().links.map((l: any) => l.score)).toEqual([1 / 4, 1 / (1 + 31 / 10)])
  })

  it('links a discussion to its story', () => {
    visit('https://news.ycombinator.com/item?id=1', `<table class="fatitem">
      <tr class="athing submission" id="1"><td><span class="titleline"><a href="https://a.example/post">First</a></span></td></tr>
    </table>`)
    const { links, discussionOf } = parseHackerNews()
    expect(links).toEqual([{ url: 'https://a.example/post', title: 'First', score: 1 }])
    expect(discussionOf).toBe('https://a.example/post')
  })

  it('heads a discussion with its story\'s title, link, points, author and time', () => {
    visit('https://news.ycombinator.com/item?id=1', `<table class="fatitem">
      <tr class="athing submission" id="1"><td class="title"><span class="titleline"><a href="https://a.example/post">First &amp; "best"</a><span class="sitebit comhead"> (<a href="from?site=a.example"><span class="sitestr">a.example</span></a>)</span></span></td></tr>
      <tr><td class="subtext"><span class="subline">
        <span class="score" id="score_1">123 points</span> by <a href="user?id=ann" class="hnuser">ann</a>
        <span class="age" title="2026-11-01T21:06:00 1793567160"><a href="item?id=1">2 hours ago</a></span> |
        <a href="hide?id=1&amp;goto=item%3Fid%3D1">hide</a> | <a href="https://hn.algolia.com/?query=First">past</a> |
        <a href="item?id=1">38&nbsp;comments</a>
      </span></td></tr>
    </table>`)
    expect(parseHackerNews().content).toEqual([
      '<post title="First &amp; &quot;best&quot;" url="https://a.example/post" author="ann" author-url="https://news.ycombinator.com/user?id=ann" score="123" time="2026-11-01T21:06:00.000Z">',
    ])
  })

  it('gives an Ask HN discussion no link of its own', () => {
    visit('https://news.ycombinator.com/item?id=2', `<table class="fatitem">
      <tr class="athing submission" id="2"><td><span class="titleline"><a href="item?id=2">Ask HN: Second</a></span></td></tr>
    </table>`)
    const { links, discussionOf } = parseHackerNews()
    expect(links).toBeUndefined()
    expect(discussionOf).toBeUndefined()
  })

  it('reads a discussion as its post, then each comment\'s head and text, in the thread\'s order', () => {
    visit('https://news.ycombinator.com/item?id=2', `<table class="fatitem">
      <tr class="athing submission" id="2"><td><span class="titleline"><a href="item?id=2">Ask HN: Second</a></span></td></tr>
      <tr><td class="subtext"><a href="user?id=cat" class="hnuser">cat</a></td></tr>
      <tr><td><div class="toptext">Why?<p>Asking for a friend.</p></div></td></tr>
    </table>
    <table class="comment-tree">
      <tr class="athing comtr" id="3"><td><table><tr><td class="ind" indent="0"><img width="0"></td><td>
        <a href="user?id=ann" class="hnuser">ann</a> <span class="age" title="2026-11-01T21:06:00 1793567160"><a href="item?id=3">1 day ago</a></span>
        <div class="comment"><div class="commtext c00">Because.<p>Truly.</p></div><div class="reply"><p>reply</p></div></div>
      </td></tr></table></td></tr>
      <tr class="athing comtr" id="4"><td><table><tr><td class="ind" indent="1"><img width="40"></td><td>
        <span class="comhead">[deleted]</span><div class="comment"></div>
      </td></tr></table></td></tr>
      <tr class="athing comtr" id="5"><td><table><tr><td class="ind" indent="2"><img width="80"></td><td>
        <a href="user?id=bob" class="hnuser">bob</a> <span class="age" title="2026-11-01T22:00:00"><a href="item?id=5">1 day ago</a></span>
        <div class="comment"><div class="commtext c00">Agreed.</div></div>
      </td></tr></table></td></tr>
      <tr class="athing comtr" id="6"><td><table><tr><td class="ind" indent="0"><img width="0"></td><td>
        <a href="user?id=cat" class="hnuser">cat</a><div class="comment"><div class="commtext c00">No.</div></div>
      </td></tr></table></td></tr>
    </table>`)
    const { title, content } = parseHackerNews()
    expect(title).toBe('Ask HN: Second')
    expect(content).toEqual([
      '<post title="Ask HN: Second" author="cat" author-url="https://news.ycombinator.com/user?id=cat">',
      'Why?',
      'Asking for a friend.',
      '<comment depth="0" author="ann" author-url="https://news.ycombinator.com/user?id=ann" time="2026-11-01T21:06:00.000Z" url="https://news.ycombinator.com/item?id=3">',
      'Because.',
      'Truly.',
      '<comment depth="1" author="[deleted]" url="https://news.ycombinator.com/item?id=4">',
      '<comment depth="2" author="bob" author-url="https://news.ycombinator.com/user?id=bob" time="2026-11-01T22:00:00.000Z" url="https://news.ycombinator.com/item?id=5">',
      'Agreed.',
      '<comment depth="0" author="cat" author-url="https://news.ycombinator.com/user?id=cat" url="https://news.ycombinator.com/item?id=6" op>',
      'No.',
    ])
  })
})

describe('authors', () => {
  const head = (name: string, url: string) => `<post author="${name}" author-url="${url}">`

  it('writes each of several authors into a post\'s head, and keeps a single author\'s form', () => {
    const { postBlock } = load('hackernews.js', ['postBlock'])
    expect(postBlock({ authors: [{ name: 'ann', url: 'https://a.example/ann' }, { name: 'PA Media' }, { name: 'cat', url: 'https://a.example/cat' }] }))
      .toBe('<post author="ann" author-url="https://a.example/ann" author-2="PA Media" author-3="cat" author-url-3="https://a.example/cat">')
    expect(postBlock({ author: 'ann', authorUrl: 'https://a.example/ann' })).toBe(head('ann', 'https://a.example/ann'))
  })

  it('names an author by their link, not the fallback photo beside the name', () => {
    const { linkedAuthors } = load('hackernews.js', ['linkedAuthors'])
    visit('https://a.example/post', '<a class="by" href="/ann"><noscript>&lt;img src="/ann.jpg"&gt;</noscript> Ann Lee</a>')
    expect(linkedAuthors('.by')).toEqual([{ name: 'Ann Lee', url: 'https://a.example/ann' }])
  })

  it('names each linked author once, and leaves a page without authors as it is', () => {
    const { linkedAuthors, withAuthors } = load('hackernews.js', ['linkedAuthors', 'withAuthors'])
    visit('https://a.example/post', '<a class="by" href="/ann"><img></a><a class="by" href="/ann"> Ann\n Lee </a><a class="by" href="/bob">Bob</a>')
    expect(linkedAuthors('.by')).toEqual([{ name: 'Ann Lee', url: 'https://a.example/ann' }, { name: 'Bob', url: 'https://a.example/bob' }])
    expect(withAuthors({ content: ['Text.'] }, [])).toEqual({ content: ['Text.'] })
  })

  it('links a Hacker News discussion to its submitter', () => {
    const { parseHackerNews } = load('hackernews.js', ['parseHackerNews'])
    visit('https://news.ycombinator.com/item?id=1', `<table class="fatitem">
      <tr class="athing submission" id="1"><td><span class="titleline"><a href="https://a.example/post">First</a></span></td></tr>
      <tr><td class="subtext"><a href="user?id=ann" class="hnuser">ann</a></td></tr></table>`)
    expect(parseHackerNews().links).toEqual([
      { url: 'https://a.example/post', title: 'First', score: 1 },
      { url: 'https://news.ycombinator.com/user?id=ann', score: 1 },
    ])
  })
})

describe('author pages', () => {
  const ranked = (...urls: string[]) => ({ listing: true, links: urls.map((url, rank) => ({ url, score: 1 / (1 + rank / 10) })) })

  it('lists each page once, without its fragment, and nothing as nothing', () => {
    const { listingOf } = load('hackernews.js', ['listingOf'])
    expect(listingOf(['https://a.example/1#top', undefined, 'https://a.example/2', 'https://a.example/1'])).toEqual(ranked('https://a.example/1', 'https://a.example/2'))
    expect(listingOf([])).toBeNull()
  })

  it('links a Hacker News user to their submissions, which are a listing', () => {
    const { parseHackerNews } = load('hackernews.js', ['parseHackerNews'])
    visit('https://news.ycombinator.com/user?id=ann', '<a href="user?id=ann">ann</a><a href="submitted?id=ann">submissions</a><a href="threads?id=ann">comments</a>')
    expect(parseHackerNews()).toEqual(ranked('https://news.ycombinator.com/submitted?id=ann'))
    visit('https://news.ycombinator.com/submitted?id=ann', '<table><tr class="athing submission" id="1"></tr></table>')
    expect(parseHackerNews().links[0].url).toBe('https://news.ycombinator.com/item?id=1')
  })
})
