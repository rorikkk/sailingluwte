import { getCollection, type CollectionEntry } from 'astro:content';
import { marked } from 'marked';

export type Post = CollectionEntry<'posts'>;

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

/** Summary for lists: the post's own summary, or the start of the text. */
export function excerpt(post: Post): string {
  if (post.data.excerpt) return post.data.excerpt;
  const plain = (post.body ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#*_>`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > 200 ? plain.slice(0, 200) + '...' : plain;
}

/** Published posts, newest first (same-day posts: by slug, Z to A, as before). */
export async function getPosts(): Promise<Post[]> {
  const posts = await getCollection('posts', (p) => import.meta.env.DEV || !p.data.draft);
  return posts.sort((a, b) => b.data.date.getTime() - a.data.date.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}
