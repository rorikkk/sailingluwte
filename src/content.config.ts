import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    // Shown in post lists. When empty, the start of the text is used.
    excerpt: z.string().optional().nullable(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { posts };
