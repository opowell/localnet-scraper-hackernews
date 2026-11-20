// What a listing's subtext says of a story, as details: its points, author, when it was posted and how many comments it
// has, as [name, value] pairs so that they keep their order. A job ad has its age alone; "discuss" is no comments.
function storyDetails(row) {
  const subtext = row.nextElementSibling?.querySelector('.subtext')
  if (!subtext) {
    return undefined
  }
  const points = Number.parseInt(subtext.querySelector('.score')?.textContent, 10)
  const user = subtext.querySelector('.hnuser')
  const comments = Array.from(subtext.querySelectorAll('a'), a => /^(\d+)\s+comments?$/.exec(a.textContent.replace(/\u00A0/g, ' ').trim()))
    .find(Boolean)
  return [
    ['points', Number.isNaN(points) ? null : points],
    ['author', user ? { text: user.textContent.trim(), url: user.href } : null],
    ['time', postedTime(subtext)],
    ['comments', comments ? Number(comments[1]) : null],
  ].filter(([, value]) => value !== null)
}

// A listing page (the front page, newest, ask, show…) links to each story's discussion, the higher ranked more strongly,
// with its title and what its subtext says of it (see storyDetails).
function parseHackerNewsListing() {
  const rows = Array.from(document.querySelectorAll('tr.athing.submission'))
  return {
    listing: true,
    links: rows.map((row, index) => {
      // The rank Hacker News shows ("31."), which carries on across pages, or else the place on this page.
      const shown = Number.parseInt(row.querySelector('.rank')?.textContent, 10)
      const rank = Number.isNaN(shown) ? index : shown - 1
      return {
        url: `https://news.ycombinator.com/item?id=${row.id}`,
        title: row.querySelector('.titleline > a')?.textContent,
        details: storyDetails(row),
        score: 1 / (1 + rank / 10),
      }
    }),
  }
}

// When a comment or story was posted: its age's title, "2026-11-01T21:06:00 1762031160", the time in UTC and in Unix
// seconds (older pages give the first alone).
function postedTime(row) {
  const [utc, unix] = (row.querySelector('.age')?.getAttribute('title') || '').split(' ')
  return unix ? isoTime(Number(unix) * 1000) : utc ? isoTime(`${utc}Z`) : null
}

// A story's head (see postBlock): its title and the page it links to, then its subtext's points ("123 points"), author
// and age. A job ad has no points or author.
function storyHead(story) {
  const fatitem = document.querySelector('.fatitem')
  const user = fatitem.querySelector('.subtext .hnuser')
  return postBlock({
    title: story.textContent,
    url: story.getAttribute('href').startsWith('item?') ? null : story.href,
    author: user?.textContent.trim(),
    authorUrl: user?.href,
    score: Number.parseInt(fatitem.querySelector('.subtext .score')?.textContent, 10),
    time: postedTime(fatitem.querySelector('.subtext') || fatitem),
  })
}

// A discussion's content: the story's head (see storyHead, put first by parseHackerNews) and its own text, then each
// comment, its head (see commentBlock) and its paragraphs, in page order, which is the thread's, each reply after the
// comment it replies to. A deleted comment keeps its place, as its replies are under it.
function discussionContent() {
  const content = extractParagraphs(document.querySelector('.fatitem .toptext'))
  const op = document.querySelector('.fatitem .hnuser')?.textContent.trim()
  for (const row of document.querySelectorAll('.comment-tree tr.athing.comtr')) {
    const user = row.querySelector('.hnuser')
    const author = user?.textContent.trim()
    content.push(commentBlock({
      depth: Number(row.querySelector('td.ind')?.getAttribute('indent')) || 0,
      author: author || '[deleted]',
      authorUrl: user?.href,
      time: postedTime(row),
      url: row.querySelector('.age a')?.href || (row.id && `https://news.ycombinator.com/item?id=${row.id}`),
      op: Boolean(author) && author === op,
    }), ...extractParagraphs(row.querySelector('.commtext')))
  }
  return content
}

function parseHackerNews() {
  if (location.hostname !== 'news.ycombinator.com') {
    return null
  }
  // A user's page lists nothing, but links to their submissions, which are a listing.
  if (location.pathname === '/user') {
    return listingOf(linkUrls('a[href^="submitted?id="]'))
  }
  if (location.pathname !== '/item') {
    return document.querySelector('tr.athing.submission') ? parseHackerNewsListing() : null
  }
  const result = { content: discussionContent() }
  const story = document.querySelector('.fatitem .titleline > a')
  if (story) {
    result.title = story.textContent
    result.content.unshift(storyHead(story))
    // The story's own page, unless it is an Ask HN or the like, whose title links back here.
    if (!story.getAttribute('href').startsWith('item?')) {
      result.links = [{ url: story.href, title: story.textContent, score: 1 }]
      result.discussionOf = story.href
    }
    // Its submitter's page. A job ad names none.
    const user = document.querySelector('.fatitem .subtext .hnuser')
    if (user) {
      result.links = [...(result.links || []), { url: user.href, score: 1 }]
    }
  }
  return result
}

// The parser a scrape calls.
registerParser(parseHackerNews)
