import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const schema = z.object({
  title: z.string(),
  date: z.coerce.date(),
  // Shown on the blog cards (max 40 words). When empty, the first 40 words of the text.
  excerpt: z.string().optional().nullable(),
  // Photo on the blog cards. When empty, the first photo in the post is used.
  cover: z.string().optional().nullable(),
  coverAlt: z.string().optional().nullable(),
  draft: z.boolean().default(false),
});

// New adventures: /blog/ and /blog/<slug>/
const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema,
});

// The 2024/2025 voyage (closed): /reis-24-25/blog/ and /reis-24-25/<slug>/
const trip = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/reis-24-25' }),
  schema,
});

export const collections = { posts, trip };
