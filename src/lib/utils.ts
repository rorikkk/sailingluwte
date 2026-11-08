import { getCollection, type CollectionEntry } from 'astro:content';
import { marked } from 'marked';

export type Post = CollectionEntry<'posts'> | CollectionEntry<'trip'>;
export type Blog = 'posts' | 'trip';

/** URL of a post: new adventures under /blog/, the 2024/2025 voyage under /reis-24-25/. */
export function postUrl(post: Post): string {
  return post.collection === 'trip' ? `/reis-24-25/${post.id}/` : `/blog/${post.id}/`;
}

/** URL of the list page of a blog. */
export function blogUrl(blog: Blog): string {
  return blog === 'trip' ? '/reis-24-25/blog/' : '/blog/';
}

/**
 * Text from the CMS to HTML: line breaks become <br>, and **bold**, *italic* and
 * [links](https://…) work. Used for every multi-line text field on the fixed pages.
 */
export function rich(text: string | undefined | null): string {
  if (!text) return '';
  // Every line break becomes a <br>, like on the old site, including leading/trailing ones
  // (which marked drops) and one directly inside **…** ("**\nLet op!**" ->
  // <strong><br>Let op!</strong>, which marked would leave as literal asterisks). For the
  // latter, the break is swapped for a placeholder punctuation character while parsing.
  const BR = '⸻';
  let t = text.replace(/\r\n?/g, '\n');
  const lead = t.match(/^\n*/)![0].length;
  const trail = t.slice(lead).match(/\n*$/)![0].length;
  t = t
    .slice(lead, t.length - trail)
    .replace(/(^|[\s\p{P}\p{S}])(\*{1,3}|_{1,3})\n/gu, `$1$2${BR}`)
    .replace(/\n(\*{1,3}|_{1,3})(?=$|[\s\p{P}\p{S}])/gu, `${BR}$1`);
  const html = marked.parseInline(t, { breaks: true, gfm: true }) as string;
  return '<br>'.repeat(lead) + html.split(BR).join('<br>') + '<br>'.repeat(trail);
}

/** "Jul 27, 2024", the date style the site has always used. */
export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/** "July 27, 2024", used at the top of a post. */
export function formatDateLong(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/** Summary for lists (older name, kept for existing imports): same as cardExcerpt. */
export function excerpt(post: Post): string {
  return cardExcerpt(post);
}

// ---------------------------------------------------------------------------------------
// Blog preview cards: photo + first ~40 words. Both work from the post's rendered HTML
// (the content layer stores it in post.rendered.html for Markdown entries), so Markdown
// images and raw HTML <img>/<figure> blocks are handled the same way, in document order.
// ---------------------------------------------------------------------------------------

const CARD_WORDS = 40;

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—',
};

/** &amp; &nbsp; &#39; &#x27; … to plain characters. */
function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** The post as HTML: the rendered version when available, otherwise rendered here. */
function postHtml(post: Post): string {
  const rendered = post.rendered?.html;
  if (rendered) return rendered;
  return marked.parse(post.body ?? '', { gfm: false, async: false }) as string;
}

/** Remove whole elements (with everything inside) such as <video>…</video>. */
function stripElements(html: string, tags: string[]): string {
  let out = html;
  for (const tag of tags) {
    const re = new RegExp(`<${tag}\\b[^>]*>(?:(?!<${tag}\\b)[\\s\\S])*?</${tag}\\s*>`, 'gi');
    // repeat so nested elements of the same kind are removed from the inside out
    let prev;
    do {
      prev = out;
      out = out.replace(re, ' ');
    } while (out !== prev);
  }
  return out;
}

/** Value of an attribute in a single tag, entities decoded; null when absent. */
function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  if (!m) return null;
  return decodeEntities(m[1] ?? m[2] ?? m[3] ?? '').trim();
}

/**
 * Photo for the post's card: the cover chosen in the CMS, otherwise the first image in
 * the post (Markdown or HTML, video posters ignored). null when the post has no image.
 */
export function cardImage(post: Post): { src: string; alt: string } | null {
  if (post.data.cover) return { src: post.data.cover, alt: post.data.coverAlt ?? '' };
  const html = stripElements(postHtml(post), ['video']);
  for (const [tag] of html.matchAll(/<img\b[^>]*>/gi)) {
    let src = attr(tag, 'src');
    if (!src) {
      // srcset only: take the first candidate URL
      src = attr(tag, 'srcset')?.split(',')[0]?.trim().split(/\s+/)[0] ?? null;
    }
    if (src) return { src, alt: attr(tag, 'alt') ?? '' };
  }
  return null;
}

/** Plain text of the post's own paragraphs (no headings, captions, quotes, embeds). */
function paragraphText(post: Post): string {
  const html = stripElements(postHtml(post), [
    'figure', 'figcaption', 'blockquote', 'video', 'iframe', 'script', 'style', 'div', 'table',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  ]);
  const parts: string[] = [];
  for (const [, inner] of html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p\s*>/gi)) {
    parts.push(inner.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ''));
  }
  return decodeEntities(parts.join(' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Remove Markdown markup from a hand-written summary: links become their text, no ** or _. */
function stripMarkdown(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/(\*{1,3}|_{1,3})(?=\S)([\s\S]*?\S)\1/g, '$2')
    .replace(/`([^`]*)`/g, '$1');
}

/** At most CARD_WORDS words; when cut, "..." follows the last word (without , ; : etc.). */
function truncateWords(text: string, max = CARD_WORDS): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= max) return words.join(' ');
  const kept = words.slice(0, max).join(' ').replace(/[\s,;:.!?…\-–—(\[{"'‘“]+$/u, '');
  return kept + '...';
}

/** Text for the post's card: the summary from the CMS, or the start of the text. Max 40 words. */
export function cardExcerpt(post: Post): string {
  const own = post.data.excerpt?.trim();
  const text = own ? decodeEntities(stripMarkdown(own)).replace(/\s+/g, ' ').trim() : paragraphText(post);
  return truncateWords(text);
}

/** Published posts of one blog, newest first (same-day posts: by slug, Z to A, as before). */
export async function getPosts(blog: Blog = 'posts'): Promise<Post[]> {
  const posts: Post[] = await getCollection(blog, (p: Post) => import.meta.env.DEV || !p.data.draft);
  return posts.sort((a, b) => b.data.date.getTime() - a.data.date.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}
