# luwte.amsterdam

The website of the sailing yacht Luwte (Sailing Luwte): Jenny and Rorik's travels on board. It has a home page (the ship, the crew, donations, live position and a list of destinations), an About page, a blog with logbooks and stories, a contact page and a thank-you page for donations. The site is in Dutch.

- **Site:** [Astro](https://astro.build), built as static HTML. It keeps the original Webflow design and CSS (`public/css/`) and the old URLs (`/about.html`, `/contact.html`, `/blog/<post>/`).
- **CMS:** [Sveltia CMS](https://github.com/sveltia/sveltia-cms) at `/admin`. Every save is a commit to this repository.

This replaces the old Webflow export + Contentful setup: `build.js`, `_template.html` and the Contentful API keys are no longer used.

## Editing content

Go to **https://luwte.amsterdam/admin/** and sign in with GitHub.

| In the CMS | What it edits | File(s) |
| --- | --- | --- |
| Blog | Blog posts (title, date, summary, draft, text) | `src/content/posts/*.md` |
| Pagina's › Home | Hero, ship specs, crew, donation block, position, destinations heading | `src/data/home.json` |
| Pagina's › Over ons | Hero and the two profiles with their tiles | `src/data/about.json` |
| Pagina's › Blog-pagina | Heading of /blog/, newsletter texts | `src/data/blog.json` |
| Pagina's › Contact | Heading, intro, the four detail blocks, email | `src/data/contact.json` |
| Pagina's › Bedankt (na donatie) | Hero and the two wallets with their tiles | `src/data/bedankt.json` |
| Pagina's › Bestemmingen | The destinations list on the home page | `src/data/destinations.json` |
| Pagina's › Menu en footer | Navigation links, footer links and copyright | `src/data/site.json` |

Some details:

- **Concept** (draft) posts are hidden from the live site but still show in `npm run dev`.
- **Samenvatting** (summary) is optional. When empty, the start of the post's text is used in the blog list.
- In a post, an image's title becomes its caption: `![description](/images/uploads/photo.jpg "Caption")`.
- Multi-line text fields keep line breaks, and support `**bold**`, `*italic*` and `[links](https://…)`.
- Some lists have a fixed length because the Webflow layout has exactly that many slots: ship specs (5), crew (2), donation checklist (3), profiles (2 × 4 tiles), wallets (2 × 4 tiles) and contact details (4). Destinations, menu and footer links can have any length.
- Uploaded images go to `public/images/uploads/`. Older post images live in `public/wp-content/uploads/`.

### Signing in to the CMS

Pick one of these:

1. **Personal access token (no setup).** On the CMS login screen choose *Sign in with token*. Paste a [fine-grained GitHub token](https://github.com/settings/personal-access-tokens/new) that has **Contents: read & write** on this repository only.
2. **"Sign in with GitHub" button on Netlify.** Create a GitHub OAuth app with callback URL `https://api.netlify.com/auth/done`, then add its Client ID and secret in Netlify under *Site configuration › Access & security › OAuth › Install provider › GitHub*. Only accounts with write access to this repository can save.
3. **"Sign in with GitHub" button elsewhere.** Deploy the free [sveltia-cms-auth](https://github.com/sveltia/sveltia-cms-auth) worker to Cloudflare, which takes about 5 minutes. Then create a GitHub OAuth app and put the worker URL in `public/admin/config.yml` under `backend.base_url`.
4. **Locally.** Run `npm run dev` and open http://localhost:4321/admin/ in Chrome or Edge. Choose *Work with Local Repository* and pick this folder. Changes are saved straight to disk, and you commit them yourself.

## Publishing

Saving in the CMS does **not** put changes live by itself. `netlify.toml` tells Netlify to skip every build that a commit starts (skipped builds cost no credits). It only builds when the **Publiceren** (Publish) page asks, or when a commit message contains `[publish]` (see `scripts/should-build.sh`):

1. **Once:** in Netlify go to *Project configuration › Build & deploy › Continuous deployment › Build hooks*, add a hook (name it "Publiceren-knop", branch `master`) and copy its URL. Open **https://luwte.amsterdam/admin/publish/**, open *Instellingen*, paste the URL and click *Opslaan*. The URL is kept only in that browser.
2. **Every time:** save your changes in the CMS, then open `/admin/publish/` and press **Publiceren**. Each publish is one production deploy, which costs 15 credits.

When you push code yourself, add `[publish]` to the commit message to deploy it straight away. To go back to publishing on every commit, delete the `ignore = …` line in `netlify.toml`.

## Deploying

The site is hosted on Netlify from the `master` branch. `netlify.toml` sets the build (`npm run build` → `dist`, Node 24) and redirects the old `/blog.html` to `/blog/`. Unknown URLs get `dist/404.html` automatically. The contact and newsletter forms are Netlify Forms (`data-netlify="true"`).

## Developing

```sh
npm install
npm run dev      # http://localhost:4321
npm run build    # static site in dist/
```

Requires Node 22.22 or newer (`.nvmrc` pins 24).

## Structure

```
src/
  content.config.ts      the posts collection and its fields
  content/posts/         blog posts (Markdown)
  data/                  fixed pages and menu/footer (JSON)
  layouts/Base.astro     head, navigation, footer
  components/            post cards, destination rows
  lib/utils.ts           rich-text, dates, excerpts, post list
  plugins/               rehype plugin that turns image titles into captions
  pages/                 /, /about.html, /contact.html, /bedankt.html, /blog/, /blog/<post>/, 404
public/
  admin/                 the CMS (index.html + config.yml) and the Publish page
  css/, js/, images/     the original Webflow assets
  wp-content/uploads/    images of the older posts
scripts/should-build.sh  Netlify build filter (Publish button / [publish])
```
