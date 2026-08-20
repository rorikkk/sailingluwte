const contentful = require('contentful');
const { documentToHtmlString } = require('@contentful/rich-text-html-renderer');
const { BLOCKS, INLINES } = require('@contentful/rich-text-types');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// --- Config ---
const SPACE_ID = process.env.CONTENTFUL_SPACE_ID;
const ACCESS_TOKEN = process.env.CONTENTFUL_ACCESS_TOKEN;
const BLOG_DIR = path.join(__dirname, 'blog');
const TEMPLATE_PATH = path.join(__dirname, '_template.html');

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

function accordionItem(dest) {
  return `      <div data-w-id="dest-${dest.order || 0}" style="-webkit-transform:translate3d(0, 50px, 0) scale3d(1, 1, 1) rotateX(0) rotateY(0) rotateZ(0) skew(0, 0);-moz-transform:translate3d(0, 50px, 0) scale3d(1, 1, 1) rotateX(0) rotateY(0) rotateZ(0) skew(0, 0);-ms-transform:translate3d(0, 50px, 0) scale3d(1, 1, 1) rotateX(0) rotateY(0) rotateZ(0) skew(0, 0);transform:translate3d(0, 50px, 0) scale3d(1, 1, 1) rotateX(0) rotateY(0) rotateZ(0) skew(0, 0);opacity:0" class="accordian-item">
        <div data-w-id="dest-q-${dest.order || 0}" class="faq-q">
          <div class="plus-icon">
            <div class="plus-horiz"></div>
            <div class="plus-vert"></div>
          </div>
          <div class="w-layout-blockcontainer container-6 w-container">
            <div class="head-regular">${dest.name}</div>
            <div class="head-regular right done">${dest.date}</div>
          </div>
        </div>
        <div style="height:0PX" class="faq-ans">
          <div class="faq-answer">${dest.description}</div>
        </div>
      </div>`;
}

// Scan existing static blog posts for their metadata
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
    const titleMatch = html.match(/<title>(.+?)\s*-\s*Sailing Luwte<\/title>/);
    const title = titleMatch ? titleMatch[1] : slug;
    const dateMatch = html.match(/class="label cc-blog-date">([^<]+)</);
    const dateStr = dateMatch ? dateMatch[1] : '';
    const date = dateStr ? new Date(dateStr) : new Date(0);
    const excerptMatch = html.match(/class="rich-text w-richtext"><p>(.+?)<\/p>/);
    let excerpt = excerptMatch ? excerptMatch[1].replace(/<[^>]+>/g, '') : '';
    if (excerpt.length > 200) excerpt = excerpt.substring(0, 200) + '...';
    posts.push({ slug, title, date, dateFormatted: formatDate(date), excerpt, source: 'static' });
  }
  return posts;
}

// Safely fetch a single entry by content type (singleton pattern)
async function fetchSingleton(client, contentType) {
  try {
    const entries = await client.getEntries({ content_type: contentType, limit: 1, include: 10 });
    return entries.items.length > 0 ? entries.items[0].fields : null;
  } catch (e) {
    console.log(`  ⚠ Content type '${contentType}' not found or error: ${e.message}`);
    return null;
  }
}

// Fetch all entries of a collection content type
async function fetchCollection(client, contentType, orderField) {
  try {
    const query = { content_type: contentType, limit: 1000, include: 10 };
    if (orderField) query.order = [orderField];
    const entries = await client.getEntries(query);
    return entries.items.map(e => e.fields);
  } catch (e) {
    console.log(`  ⚠ Content type '${contentType}' not found or error: ${e.message}`);
    return [];
  }
}

// =========================================
// PAGE UPDATE FUNCTIONS
// =========================================

function updateNavAndFooter($, siteSettings) {
  if (!siteSettings) return;

  // Update nav links
  if (siteSettings.navLinks) {
    const navLinks = typeof siteSettings.navLinks === 'string'
      ? JSON.parse(siteSettings.navLinks) : siteSettings.navLinks;
    const $nav = $('nav.navigation-items');
    if ($nav.length && Array.isArray(navLinks)) {
      $nav.empty();
      navLinks.forEach(link => {
        const target = link.external ? ' target="_blank"' : '';
        $nav.append(`<a href="${link.url}" class="navigation-item w-nav-link"${target}>${link.label}</a>\n`);
      });
    }
  }

  // Update footer brand
  if (siteSettings.footerBrand) {
    $('h4.heading-2.no-link').text(siteSettings.footerBrand);
  }

  // Update footer copyright
  if (siteSettings.footerCopyright) {
    $('.waves---paragraph-small').text(siteSettings.footerCopyright);
  }

  // Update footer links
  if (siteSettings.footerLinks) {
    const footerLinks = typeof siteSettings.footerLinks === 'string'
      ? JSON.parse(siteSettings.footerLinks) : siteSettings.footerLinks;
    const $footerNav = $('.waves-top-right-footer-1');
    if ($footerNav.length && Array.isArray(footerLinks)) {
      $footerNav.empty();
      footerLinks.forEach(link => {
        $footerNav.append(`<a href="${link.url}" class="waves-link-footer-1">${link.label}</a>\n`);
      });
    }
  }
}

function updateHomePage($, homePage, allPosts) {
  if (!homePage) return;

  // Hero
  if (homePage.heroHeading) $('.heading.h1').html(homePage.heroHeading.replace(/\n/g, '<br>'));
  if (homePage.heroSubtitle) $('.subtitle-luwte').html(homePage.heroSubtitle.replace(/\n/g, '<br>'));
  if (homePage.heroCta) $('a.waves---cta-white.wide-cta').text(homePage.heroCta);

  // Ship specs heading
  if (homePage.shipSpecsHeading) $('.waves---heading-2-no-margins-2').text(homePage.shipSpecsHeading);

  // Ship specs tiles
  if (homePage.shipSpecs) {
    const specs = typeof homePage.shipSpecs === 'string'
      ? JSON.parse(homePage.shipSpecs) : homePage.shipSpecs;
    if (Array.isArray(specs)) {
      const $tiles = $('.waves---grid-features-7');
      const $h3s = $tiles.find('.h3-luwte');
      const $texts = $tiles.find('.text-normal, .text-block');
      specs.forEach((spec, i) => {
        if ($h3s.eq(i).length) $h3s.eq(i).text(spec.title);
        if ($texts.eq(i).length) $texts.eq(i).html(spec.body.replace(/\n/g, '<br>'));
      });
    }
  }

  // Crew section
  if (homePage.crewHeading) {
    // The crew heading is inside .waves---center-heading
    const $crewSection = $('.motto-wrap');
    $crewSection.find('.h2-luwte').first().text(homePage.crewHeading);
  }
  if (homePage.crewSubtitle) {
    $('.motto-wrap .sub-h-luwte').first().text(homePage.crewSubtitle);
  }
  if (homePage.crewMembers) {
    const members = typeof homePage.crewMembers === 'string'
      ? JSON.parse(homePage.crewMembers) : homePage.crewMembers;
    if (Array.isArray(members)) {
      const $names = $('.waves-name-wrap-team-1 .h3-luwte');
      const $roles = $('.waves-name-wrap-team-1 .sub-h-luwte');
      members.forEach((m, i) => {
        if ($names.eq(i).length) $names.eq(i).text(m.name);
        if ($roles.eq(i).length) $roles.eq(i).text(m.role);
      });
    }
  }

  // Donation section
  if (homePage.donationHeading) {
    $('.waves---content-image-halves .waves---heading-2-no-margins').text(homePage.donationHeading);
  }
  if (homePage.donationText) {
    $('.waves---content-image-halves .text-normal').html(homePage.donationText.replace(/\n/g, '<br>'));
  }
  if (homePage.donationChecklist) {
    const items = typeof homePage.donationChecklist === 'string'
      ? JSON.parse(homePage.donationChecklist) : homePage.donationChecklist;
    if (Array.isArray(items)) {
      const $checks = $('.waves---single-check-item .sub-h-luwte.left');
      items.forEach((item, i) => {
        if ($checks.eq(i).length) $checks.eq(i).text(item);
      });
    }
  }

  // Position section
  if (homePage.positionHeading) {
    // Find the position section's h2
    const $posSection = $('div.waves---section-medium-3').has('.html-embed.position');
    $posSection.find('.h2-luwte').text(homePage.positionHeading);
  }
  if (homePage.positionText) {
    const posText = typeof homePage.positionText === 'object'
      ? documentToHtmlString(homePage.positionText, renderOptions)
      : homePage.positionText;
    const $posSection = $('div.waves---section-medium-3').has('.html-embed.position');
    $posSection.find('.sub-h-luwte').html(posText);
  }

  // Destinations heading
  if (homePage.destinationsHeading) {
    $('section#todo .h2-luwte').text(homePage.destinationsHeading);
  }
  if (homePage.destinationsSubtitle) {
    $('section#todo > .sub-h-luwte').text(homePage.destinationsSubtitle);
  }

  // Blog section — update with latest posts
  if (allPosts && allPosts.length > 0) {
    const latest4 = allPosts.slice(0, 4);
    const $blogList = $('.section.cc-home-wrap .collection-wrap');
    if ($blogList.length) {
      $blogList.empty();
      latest4.forEach(p => $blogList.append(postCard(p) + '\n'));
    }
  }
}

function updateDestinations($, destinations) {
  if (!destinations || destinations.length === 0) return;

  const $block = $('.accordian-block');
  if (!$block.length) return;

  $block.empty();
  destinations.forEach(dest => {
    $block.append(accordionItem(dest) + '\n');
  });
}

function updateAboutPage($, aboutPage) {
  if (!aboutPage) return;

  // Hero
  if (aboutPage.heroHeading) $('.waves---mega-heading-1').text(aboutPage.heroHeading);
  if (aboutPage.heroSubtitle) $('.waves---subtitle-2').text(aboutPage.heroSubtitle);
  if (aboutPage.heroCta) $('a.waves---cta-dark.wide-cta').text(aboutPage.heroCta);

  // Profiles
  if (aboutPage.profiles) {
    const profiles = typeof aboutPage.profiles === 'string'
      ? JSON.parse(aboutPage.profiles) : aboutPage.profiles;
    if (Array.isArray(profiles)) {
      const $sections = $('.waves---grid-halves-sticky');
      profiles.forEach((profile, i) => {
        const $section = $sections.eq(i);
        if (!$section.length) return;

        if (profile.name) $section.find('.waves---heading-2-no-margins').first().text(profile.name);
        if (profile.bio) $section.find('.subtitle-luwte-h2').first().html(profile.bio.replace(/\n/g, '<br>'));

        if (profile.tiles && Array.isArray(profile.tiles)) {
          const $tiles = $section.find('.waves-tile-features-2');
          profile.tiles.forEach((tile, j) => {
            const $tile = $tiles.eq(j);
            if (!$tile.length) return;
            if (tile.title) $tile.find('.h3-luwte').text(tile.title);
            if (tile.body) $tile.find('.text-normal, div:not(.waves---mg-bottom-16):not(.h3-luwte)').last().html(tile.body.replace(/\n/g, '<br>'));
          });
        }
      });
    }
  }
}

function updateContactPage($, contactPage) {
  if (!contactPage) return;

  if (contactPage.heading) $('.contact-heading').text(contactPage.heading);
  if (contactPage.intro) $('.contact-form-heading-wrap .paragraph-light').text(contactPage.intro);

  // Contact details — update each .details-wrap
  const $details = $('.details-wrap');
  if (contactPage.officeLabel) $details.eq(0).find('.label').text(contactPage.officeLabel);
  if (contactPage.officeText) $details.eq(0).find('.paragraph-light').text(contactPage.officeText);
  if (contactPage.hoursLabel) $details.eq(2).find('.label').text(contactPage.hoursLabel);
  if (contactPage.hoursText) $details.eq(2).find('.paragraph-light').text(contactPage.hoursText);
  if (contactPage.email) {
    const $emailLink = $details.find('.contact-email-link');
    $emailLink.text(contactPage.email);
    $emailLink.attr('href', `mailto:${contactPage.email}`);
  }
  if (contactPage.phone) $details.eq(3).find('.paragraph-light').text(contactPage.phone);
}

function updateBlogListingPage($, blogListingPage, allPosts) {
  if (blogListingPage) {
    if (blogListingPage.heroHeading) {
      // The blog listing hero h1
      $('h1').filter(function() {
        return $(this).text().trim() === 'Verhalen van de Luwte' || $(this).hasClass('waves---mega-heading-1');
      }).first().text(blogListingPage.heroHeading);
    }
    if (blogListingPage.heroSubtitle) {
      // Subtitle near the hero
      $('.waves---subtitle-2, .sub-h-luwte').first().text(blogListingPage.heroSubtitle);
    }
    if (blogListingPage.newsletterLabel) {
      $('.waves---heading-2-no-margins').filter(function() {
        return $(this).text().includes('hoogte');
      }).text(blogListingPage.newsletterLabel);
    }
    if (blogListingPage.newsletterButtonText) {
      $('input[value="Aanmelden voor blogs"]').attr('value', blogListingPage.newsletterButtonText);
    }
  }

  // Update blog listing with all posts
  if (allPosts && allPosts.length > 0) {
    const $list = $('[role="list"].collection-wrap');
    if ($list.length) {
      $list.empty();
      allPosts.forEach(p => $list.append(postCard(p) + '\n'));
    }
  }
}

function updateBedanktPage($, bedanktPage) {
  if (!bedanktPage) return;

  if (bedanktPage.heroHeading) $('h1').first().text(bedanktPage.heroHeading);
  if (bedanktPage.heroSubtitle) {
    const $subtitle = $('.waves---subtitle-2, .sub-h-luwte').first();
    $subtitle.html(bedanktPage.heroSubtitle.replace(/\n/g, '<br>'));
  }
  if (bedanktPage.heroCta) $('a.waves---cta-dark.wide-cta').first().text(bedanktPage.heroCta);

  // Wallets
  if (bedanktPage.wallets) {
    const wallets = typeof bedanktPage.wallets === 'string'
      ? JSON.parse(bedanktPage.wallets) : bedanktPage.wallets;
    if (Array.isArray(wallets)) {
      const $walletSections = $('.waves---grid-halves-sticky');
      wallets.forEach((wallet, i) => {
        const $section = $walletSections.eq(i);
        if (!$section.length) return;

        if (wallet.name) $section.find('h2').first().text(wallet.name);
        if (wallet.subtitle) $section.find('.subtitle-luwte-h2, .waves---subtitle-2').first().text(wallet.subtitle);

        if (wallet.tiles && Array.isArray(wallet.tiles)) {
          const $tiles = $section.find('.waves-tile-features-2');
          wallet.tiles.forEach((tile, j) => {
            const $tile = $tiles.eq(j);
            if (!$tile.length) return;
            if (tile.title) $tile.find('.h3-luwte, h1, h3').first().text(tile.title);
            if (tile.body) $tile.find('.text-normal, p, div:last-child').last().html(tile.body.replace(/\n/g, '<br>'));
          });
        }
      });
    }
  }
}

// =========================================
// BLOG POST GENERATION (from Contentful)
// =========================================

async function generateBlogPosts(client, allPosts) {
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
        excerptText = htmlContent.replace(/<[^>]+>/g, '').substring(0, 200) + '...';
      }
      return {
        slug, title,
        date: new Date(date),
        dateFormatted: formatDate(date),
        excerpt: excerptText,
        content: htmlContent,
        source: 'contentful'
      };
    });
    console.log(`  Found ${contentfulPosts.length} blog posts in Contentful.`);
  } catch (e) {
    console.log(`  ⚠ Blog posts: ${e.message}`);
  }

  // Generate HTML pages for Contentful blog posts
  if (contentfulPosts.length > 0 && fs.existsSync(TEMPLATE_PATH)) {
    const template = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
    for (const post of contentfulPosts) {
      const postDir = path.join(BLOG_DIR, post.slug);
      if (!fs.existsSync(postDir)) fs.mkdirSync(postDir, { recursive: true });

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
  }

  return contentfulPosts;
}

// =========================================
// MAIN
// =========================================

async function main() {
  if (!SPACE_ID || !ACCESS_TOKEN) {
    console.log('No Contentful credentials found — skipping CMS build.');
    console.log('Set CONTENTFUL_SPACE_ID and CONTENTFUL_ACCESS_TOKEN to enable.');
    return;
  }

  console.log('🔄 Fetching content from Contentful...');
  const client = contentful.createClient({ space: SPACE_ID, accessToken: ACCESS_TOKEN });

  // Fetch all content in parallel
  const [siteSettings, homePage, aboutPage, contactPage, blogListingPage, bedanktPage, destinations] =
    await Promise.all([
      fetchSingleton(client, 'siteSettings'),
      fetchSingleton(client, 'homePage'),
      fetchSingleton(client, 'aboutPage'),
      fetchSingleton(client, 'contactPage'),
      fetchSingleton(client, 'blogListingPage'),
      fetchSingleton(client, 'bedanktPage'),
      fetchCollection(client, 'destination', 'fields.order'),
    ]);

  // Get existing static posts + generate new Contentful posts
  const existingPosts = getExistingPosts();
  const contentfulPosts = await generateBlogPosts(client, existingPosts);

  // Merge all posts sorted by date
  const allPosts = [...existingPosts, ...contentfulPosts].sort((a, b) => b.date - a.date);
  // Deduplicate by slug (Contentful takes priority)
  const seen = new Set();
  const uniquePosts = allPosts.filter(p => {
    if (seen.has(p.slug)) return false;
    seen.add(p.slug);
    return true;
  });

  console.log(`  Total posts: ${uniquePosts.length} (${existingPosts.length} static + ${contentfulPosts.length} from Contentful)`);

  // --- Update index.html ---
  console.log('\n📄 Updating index.html...');
  const indexPath = path.join(__dirname, 'index.html');
  const index$ = cheerio.load(fs.readFileSync(indexPath, 'utf-8'), { decodeEntities: false });
  updateNavAndFooter(index$, siteSettings);
  updateHomePage(index$, homePage, uniquePosts);
  updateDestinations(index$, destinations);
  fs.writeFileSync(indexPath, index$.html());
  console.log('  ✓ index.html updated');

  // --- Update about.html ---
  console.log('📄 Updating about.html...');
  const aboutPath = path.join(__dirname, 'about.html');
  const about$ = cheerio.load(fs.readFileSync(aboutPath, 'utf-8'), { decodeEntities: false });
  updateNavAndFooter(about$, siteSettings);
  updateAboutPage(about$, aboutPage);
  fs.writeFileSync(aboutPath, about$.html());
  console.log('  ✓ about.html updated');

  // --- Update contact.html ---
  console.log('📄 Updating contact.html...');
  const contactPath = path.join(__dirname, 'contact.html');
  const contact$ = cheerio.load(fs.readFileSync(contactPath, 'utf-8'), { decodeEntities: false });
  updateNavAndFooter(contact$, siteSettings);
  updateContactPage(contact$, contactPage);
  fs.writeFileSync(contactPath, contact$.html());
  console.log('  ✓ contact.html updated');

  // --- Update blog.html ---
  console.log('📄 Updating blog.html...');
  const blogPath = path.join(__dirname, 'blog.html');
  const blog$ = cheerio.load(fs.readFileSync(blogPath, 'utf-8'), { decodeEntities: false });
  updateNavAndFooter(blog$, siteSettings);
  updateBlogListingPage(blog$, blogListingPage, uniquePosts);
  fs.writeFileSync(blogPath, blog$.html());
  console.log('  ✓ blog.html updated');

  // --- Update bedankt.html ---
  console.log('📄 Updating bedankt.html...');
  const bedanktPath = path.join(__dirname, 'bedankt.html');
  const bedankt$ = cheerio.load(fs.readFileSync(bedanktPath, 'utf-8'), { decodeEntities: false });
  updateNavAndFooter(bedankt$, siteSettings);
  updateBedanktPage(bedankt$, bedanktPage);
  fs.writeFileSync(bedanktPath, bedankt$.html());
  console.log('  ✓ bedankt.html updated');

  console.log('\n✅ Build complete!');
}

main().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
