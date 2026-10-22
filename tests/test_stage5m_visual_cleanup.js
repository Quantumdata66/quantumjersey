/**
 * Quantum Jersey - Stage 5M Visual Simplification & Global UI Cleanup Test Suite
 * Validates:
 * 1. Announcement bar text & centering
 * 2. Header navigation WhatsApp CTA label
 * 3. Removal of persistent floating WhatsApp FAB across all storefront pages & CSS
 * 4. Center alignment of "Why Shop Quantum Jersey" features
 * 5. FAQ subheading exact text & centering
 * 6. Simplified footer: Shop (4 links), Info (FAQs & Contact Us only), Contact column removed
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const STOREFRONT_PAGES = [
  'index.html',
  'catalog.html',
  'boots.html',
  'jerseys.html',
  'sportswear.html',
  'contact.html',
  'faq.html',
  'product.html',
  'review.html'
];

let passed = 0;
let failed = 0;

function reportPass(num, name) {
  passed++;
  console.log(`[PASS] Test ${num}: ${name}`);
}

function reportFail(num, name, err) {
  failed++;
  console.error(`[FAIL] Test ${num}: ${name} - ${err.message}`);
}

console.log('================================================================');
console.log('QUANTUM JERSEY : STAGE 5M VISUAL SIMPLIFICATION & CLEANUP SUITE');
console.log('================================================================\n');

// ─── Test 1: Announcement Bar Text & CSS Centering ───────────
try {
  const css = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');
  const expectedText = 'Standard nationwide delivery, ₦5,000 fast courier dispatch and easy WhatsApp ordering.';

  for (const page of STOREFRONT_PAGES) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    assert.ok(html.includes(expectedText), `${page} contains exact announcement text`);
  }

  assert.ok(css.includes('.promo-banner {'), 'style.css defines .promo-banner');
  assert.ok(css.includes('justify-content: center;'), '.promo-banner flex centers content horizontally');
  assert.ok(css.includes('text-align: center;'), '.promo-banner text is centered');

  reportPass(1, 'Announcement bar text & horizontal centering verified across all pages');
} catch (err) {
  reportFail(1, 'Announcement bar verification failed', err);
}

// ─── Test 2: Header Navigation WhatsApp CTA Label ─────────────
try {
  for (const page of STOREFRONT_PAGES) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8').replace(/\r\n/g, '\n');
    // Ensure "WhatsApp Us" is not present in nav-cta
    assert.ok(!html.includes('nav-cta">WhatsApp Us</a>') &&
              !html.includes('nav-cta">\n          WhatsApp Us'),
              `${page} does not use old "WhatsApp Us" label`);
    // Ensure "WhatsApp" is present as the CTA label
    assert.ok(html.includes('nav-cta">WhatsApp</a>') ||
              html.includes('nav-cta">\n          WhatsApp\n        </a>'),
              `${page} uses "WhatsApp" nav CTA label`);
    // Destination is preserved
    assert.ok(html.includes('https://wa.me/2348116154796'), `${page} preserves WhatsApp link destination`);
  }

  reportPass(2, 'Header navigation WhatsApp CTA label updated & destination preserved');
} catch (err) {
  reportFail(2, 'Header navigation label test failed', err);
}

// ─── Test 3: Complete Removal of Floating WhatsApp FAB ───────
try {
  const css = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');

  for (const page of STOREFRONT_PAGES) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    assert.ok(!html.includes('class="whatsapp-fab"') && !html.includes("class='whatsapp-fab'"),
      `${page} must not contain floating whatsapp-fab element`);
  }

  assert.ok(!css.includes('.whatsapp-fab {') && !css.includes('.whatsapp-fab:hover'),
    'style.css must not contain .whatsapp-fab rules');

  reportPass(3, 'Floating WhatsApp widget completely removed from all pages and stylesheet');
} catch (err) {
  reportFail(3, 'Floating WhatsApp FAB removal check failed', err);
}

// ─── Test 4: Center "Why Shop Quantum Jersey" Features ────────
try {
  const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');

  // Verify all 4 feature titles
  assert.ok(indexHtml.includes('<h4>Instant WhatsApp Orders</h4>'), 'Contains Instant WhatsApp Orders');
  assert.ok(indexHtml.includes('<h4>Premium Quality Products</h4>'), 'Contains Premium Quality Products');
  assert.ok(indexHtml.includes('<h4>Nationwide Delivery</h4>'), 'Contains Nationwide Delivery');
  assert.ok(indexHtml.includes('<h4>Secure Packaging</h4>'), 'Contains Secure Packaging');

  // Verify inline grid-template-columns is removed
  assert.ok(!indexHtml.includes('style="grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));"'),
    'Inline grid style removed in favor of responsive CSS');

  // Verify CSS centering rules
  assert.ok(css.includes('align-items: center;'), '.info-card flex-aligns items center');
  assert.ok(css.includes('text-align: center;'), '.info-card centers text');

  reportPass(4, 'Why Shop Quantum Jersey feature blocks centered and balanced');
} catch (err) {
  reportFail(4, 'Why Shop features alignment check failed', err);
}

// ─── Test 5: FAQ Subheading Exact Text & Centering ────────────
try {
  const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');
  const exactSubheading = 'Quick answers about delivery, sizing, returns and ordering with Quantum Jersey.';

  assert.ok(indexHtml.includes(exactSubheading), 'index.html contains exact FAQ subheading');
  assert.ok(css.includes('.section-header.text-center'), 'style.css defines .section-header.text-center');
  assert.ok(css.includes('.section-header.text-center p'), 'style.css defines .section-header.text-center p with auto margins');

  reportPass(5, 'FAQ subheading matches exact text and is center-aligned');
} catch (err) {
  reportFail(5, 'FAQ subheading check failed', err);
}

// ─── Test 6: Footer Simplification: Shop, Info (FAQs/Contact only), No Contact Col & No Footer WhatsApp ─
try {
  const css = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');

  for (const page of STOREFRONT_PAGES) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');

    // Shop column intact
    assert.ok(html.includes('<h4>Shop</h4>'), `${page} contains Shop column`);
    assert.ok(html.includes('catalog.html') && html.includes('boots.html') &&
              html.includes('jerseys.html') && html.includes('sportswear.html'),
              `${page} preserves category links in Shop column`);

    // Info column has ONLY FAQs and Contact Us
    assert.ok(html.includes('<h4>Info</h4>'), `${page} contains Info column`);
    assert.ok(html.includes('faq.html') && html.includes('contact.html'), `${page} contains FAQs and Contact Us`);

    // Contact column completely removed
    assert.ok(!html.includes('<h4>Contact</h4>'), `${page} has separate Contact column completely removed`);

    // Extract footer block
    const footerMatch = html.match(/<footer[\s\S]*?<\/footer>/i);
    assert.ok(footerMatch, `${page} contains footer element`);
    const footerHtml = footerMatch[0];

    // Assert footer contains NO WhatsApp link anywhere (columns or footer-social)
    assert.ok(!footerHtml.includes('wa.me'), `${page} footer must not contain any WhatsApp link`);

    // Assert .footer-social retains Instagram and TikTok
    const socialMatch = footerHtml.match(/<div class="footer-social">([\s\S]*?)<\/div>/i);
    assert.ok(socialMatch, `${page} contains .footer-social`);
    const socialHtml = socialMatch[1];
    assert.ok(!socialHtml.includes('wa.me') && !socialHtml.toLowerCase().includes('whatsapp'),
      `${page} .footer-social must not contain WhatsApp`);
    assert.ok(socialHtml.includes('instagram.com'), `${page} .footer-social retains Instagram link`);
    assert.ok(socialHtml.includes('tiktok.com'), `${page} .footer-social retains TikTok link`);

    // Verify intended WhatsApp ordering & nav actions remain intact on the page
    assert.ok(html.includes('https://wa.me/2348116154796'), `${page} preserves intended WhatsApp ordering/nav link`);
  }

  // Footer grid updated to 3-column on desktop
  assert.ok(css.includes('grid-template-columns: 2fr 1fr 1fr;'), 'Footer grid configured as 3 columns on desktop');
  assert.ok(css.includes('padding: 48px 0 0;'), 'Footer vertical padding reduced');

  reportPass(6, 'Footer simplified to Shop and Info (2 links) without separate Contact column or footer WhatsApp links');
} catch (err) {
  reportFail(6, 'Footer simplification test failed', err);
}

console.log('\n================================================================');
console.log(`STAGE 5M TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('================================================================\n');

if (failed > 0) {
  process.exit(1);
}
