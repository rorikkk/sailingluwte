// @ts-check
import { defineConfig } from 'astro/config';
import rehypeFigure from './src/plugins/rehype-figure.mjs';

export default defineConfig({
  site: 'https://luwte.amsterdam',
  // Keep the URLs the site always had: /about.html, /contact.html, /blog/<post>/ …
  build: { format: 'preserve' },
  compressHTML: false,
  markdown: {
    // keep quotes exactly as typed (no automatic curly quotes)
    smartypants: false,
    // plain-text web addresses (www.knrm.nl) stay plain text, as before
    gfm: false,
    rehypePlugins: [rehypeFigure],
  },
});
