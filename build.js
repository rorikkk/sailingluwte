const contentful = require('contentful');
const { documentToHtmlString } = require('@contentful/rich-text-html-renderer');
const { BLOCKS, INLINES } = require('@contentful/rich-text-types');
const fs = require('fs');
const path = require('path');

// --- Config ---
const SPACE_ID = process.env.CONTENTFUL_SPACE_ID;
const ACCESS_TOKEN = process.env.CONTENTFUL_ACCESS_TOKEN;
const BLOG_DIR = path.join(__dirname, 'blog');
const TEMPLATE_PATH = path.join(__dirname, '_template.html');
const BLOG_HTML_PATH = path.join(__dirname, 'blog.html');
const INDEX_HTML_PATH = path.join(__dirname, 'index.html');

// --- Rich text rendering options ---
const renderOptions = {
  renderNode: {
    [BLOCKS.EMBEDDED_ASSET]: (node) => {
      const { title, description, file } = node.data.target.fields;
      const url = file.url.startsWith('//') ? `https:${file.url}` : file.url;
      const alt = description || title || '';
      if (file.contentType && file.contentType.startsWith('image/')) {
        const caption = description ? `<figcaption>${description}</figcaption>` : '';
        return `<figure><img src="${url}" alt="${alt}" loading="lazy" />${caption}</figure>`;
      }
      return `<a href="${url}">${title || 'Download'}</a>`;
    },
    [INLINES.HYPERLINK]: (node) => {
      const content = node.content.map(c => c.value || '').join('');
      return `<a href="${node.data.uri}" target="_blank" rel="noopener">${content}</a>`;
    },
  },
};

// --- Helpers ---
function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function postCard(post) {
  return `          <div role="listitem" class="blog-preview-wrap w-dyn-item">
            <a href="/blog/${post.slug}/" class="link-block w-inline-block">
              <div class="w-layout-blockcontainer container-4 w-container">
                <div class="w-layout-layout quick-stack wf-layout-layout">
                  <div class="w-layout-cell cell">
                    <div class="label cc-blog-date">${post.dateFormatted}</div>
                  </div>
                  <div class="w-layout-cell cell-3">
                    <h1 class="article-heading">${post.title}</h1>
                    <p class="paragraph-light summary">${post.excerpt}</p>
                  </div>
                </div>
              </div>
            </a>
          </div>`;
}

// Scan existing static blog posts to get their metadata
function getExistingPosts() {
  const posts = [];
  if (!fs.existsSync(BLOG_DIR)) return posts;

  const dirs = fs.readdirSync(BLOG_DIR).filter(d =>
    fs.statSync(path.join(BLOG_DIR, d)).isDirectory()
  );

  for (const slug of dirs) {
    const indexPath = path.join(BLOG_DIR, slug, 'index.html');
    if (!fs.existsSync(indexPath)) continue;

    const html = fs.readFileSync(indexPath, 'utf-8');

    // Extract title from <title> tag
    const titleMatch = html.match(/<title>(.+?)\s*-\s*Sailing Luwte<\/title>/);
    const title = titleMatch ? titleMatch[1] : slug;

    // Extract date from cc-blog-date div
    const dateMatch = html.match(/class="label cc-blog-date">([^<]+)</);
    const dateStr = dateMatch ? dateMatch[1] : '';
    const date = dateStr ? new Date(dateStr) : new Date(0);

    // Extract excerpt from first paragraph of rich-text
    const excerptMatch = html.match(/class="rich-text w-richtext"><p>(.+?)<\/p>/);
    let excerpt = excerptMatch ? excerptMatch[1].replace(/<[^>]+>/g, '') : '';
    if (excerpt.length > 200) excerpt = excerpt.substring(0, 200) + '...';

    posts.push({
      slug,
      title,
      date,
      dateFormatted: formatDate(date),
      excerpt,
      source: 'static'
    });
  }

  return posts;
}

async function main() {
  if (!SPACE_ID || !ACCESS_TOKEN) {
    console.log('No Contentful credentials found — skipping CMS build.');
    console.log('Set CONTENTFUL_SPACE_ID and CONTENTFUL_ACCESS_TOKEN to enable.');
    return;
  }

  console.log('Fetching posts from Contentful...');
  const client = contentful.createClient({
    space: SPACE_ID,
    accessToken: ACCESS_TOKEN,
  });

  // Fetch all blog posts from Contentful
  let contentfulPosts = [];
  try {
    const entries = await client.getEntries({
      content_type: 'blogPost',
      order: ['-fields.date'],
      limit: 1000,
      include: 10,
    });

    contentfulPosts = entries.items.map(entry => {
      const { title, slug, date, body, excerpt } = entry.fields;
      const htmlContent = body ? documentToHtmlString(body, renderOptions) : '';
      let excerptText = excerpt || '';
      if (!excerptText && htmlContent) {
        const plainMatch = htmlContent.replace(/<[^>]+>/g, '');
        excerptText = plainMatch.substring(0, 200) + '...';
      }

      return {
        slug,
        title,
        date: new Date(date),
        dateFormatted: formatDate(date),
        excerpt: excerptText,
        content: htmlContent,
        source: 'contentful'
      };
    });

    console.log(`Found ${contentfulPosts.length} posts in Contentful.`);
  } catch (err) {
    console.error('Error fetching from Contentful:', err.message);
    console.log('Continuing with existing posts only.');
  }

  // Generate HTML pages for Contentful posts
  if (contentfulPosts.length > 0) {
    const template = fs.readFileSync(TEMPLATE_PATH, 'utf-8');

    // Get all posts (existing + contentful) for related posts
    const existingPosts = getExistingPosts();
    const allPosts = [...existingPosts, ...contentfulPosts].sort((a, b) => b.date - a.date);

    for (const post of contentfulPosts) {
      const postDir = path.join(BLOG_DIR, post.slug);
      if (!fs.existsSync(postDir)) {
        fs.mkdirSync(postDir, { recursive: true });
      }

      // Pick 4 related posts (neighbors by date, excluding self)
      const otherPosts = allPosts.filter(p => p.slug !== post.slug);
      const relatedPosts = otherPosts.slice(0, 4);
      const relatedHtml = relatedPosts.map(p => postCard(p)).join('\n');

      const html = template
        .replace(/\{\{TITLE\}\}/g, post.title)
        .replace('{{DATE}}', post.dateFormatted)
        .replace('{{CONTENT}}', post.content)
        .replace('{{RELATED_POSTS}}', relatedHtml);

      fs.writeFileSync(path.join(postDir, 'index.html'), html);
      console.log(`  ✓ Generated: blog/${post.slug}/`);
    }

    // Update blog listing page
    console.log('Updating blog listing...');
    updateBlogListing(allPosts);

    // Update home page with latest 4 posts
    console.log('Updating home page...');
    updateHomePage(allPosts.slice(0, 4));
  } else {
    console.log('No new Contentful posts — site unchanged.');
  }

  console.log('✅ Build complete!');
}

function updateBlogListing(allPosts) {
  let blogHtml = fs.readFileSync(BLOG_HTML_PATH, 'utf-8');

  // Generate all post cards
  const allCards = allPosts.map(p => postCard(p)).join('\n');

  // Replace the content between w-dyn-items div
  blogHtml = blogHtml.replace(
    /(<div role="list" class="collection-wrap waves---main-container w-dyn-items">)[\s\S]*?(<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<div class="waves-footer)/,
    `$1\n${allCards}\n        </div>\n      </div>\n    </div>\n  </div>\n  <div class="waves-footer`
  );

  fs.writeFileSync(BLOG_HTML_PATH, blogHtml);
}

function updateHomePage(latestPosts) {
  let indexHtml = fs.readFileSync(INDEX_HTML_PATH, 'utf-8');

  // Find the blog section's w-dyn-items and replace the cards
  const latestCards = latestPosts.map(p => postCard(p)).join('\n');

  // The home page blog section has the same card structure
  const blogSectionRegex = /(<div role="list" class="collection-wrap waves---main-container w-dyn-items">)[\s\S]*?(<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<div class="waves-footer)/;

  if (blogSectionRegex.test(indexHtml)) {
    indexHtml = indexHtml.replace(
      blogSectionRegex,
      `$1\n${latestCards}\n        </div>\n      </div>\n    </div>\n  </div>\n  <div class="waves-footer`
    );
    fs.writeFileSync(INDEX_HTML_PATH, indexHtml);
  }
}

main().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
