// ============================================================
// Quantum Jersey — Stage 5L: Mobile UX, Catalog Pagination & Admin Usability Suite
// ============================================================

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const styleCssPath = path.join(ROOT, 'css', 'style.css');
const indexHtmlPath = path.join(ROOT, 'index.html');
const catalogHtmlPath = path.join(ROOT, 'catalog.html');
const adminHtmlPath = path.join(ROOT, 'admin.html');
const renderJsPath = path.join(ROOT, 'js', 'render.js');
const productsJsPath = path.join(ROOT, 'js', 'products.js');
const supabaseJsPath = path.join(ROOT, 'js', 'supabase.js');

let passCount = 0;
let failCount = 0;

function reportPass(testNum, desc) {
  console.log(`[PASS] Test ${testNum}: ${desc}`);
  passCount++;
}

function reportFail(testNum, desc, err) {
  console.error(`[FAIL] Test ${testNum}: ${desc}`);
  console.error(err);
  failCount++;
}

console.log('================================================================');
console.log('QUANTUM JERSEY : STAGE 5L MOBILE UX, CATALOG & ADMIN SUITE');
console.log('================================================================\n');

// ─── Test 1: Pagination boundaries & page calculations ───────
try {
  const { DEFAULT_PRODUCTS } = require(productsJsPath);
  const totalItems = DEFAULT_PRODUCTS.length; // 14
  assert.ok(totalItems >= 12, `DEFAULT_PRODUCTS should have at least 12 items for testing, got ${totalItems}`);

  // Test with default pageSize = 12
  const pageSize12 = 12;
  const totalPages12 = Math.ceil(totalItems / pageSize12);
  assert.strictEqual(totalPages12, 2, 'Total pages should be 2 for 14 items with pageSize 12');

  const page0_items = DEFAULT_PRODUCTS.slice(0, 12);
  assert.strictEqual(page0_items.length, 12, 'Page 0 should have 12 items');

  const page1_items = DEFAULT_PRODUCTS.slice(12, 24);
  assert.strictEqual(page1_items.length, totalItems - 12, 'Page 1 should have remaining items');

  // Test with pageSize = 24
  const pageSize24 = 24;
  const totalPages24 = Math.ceil(totalItems / pageSize24);
  assert.strictEqual(totalPages24, 1, 'Total pages should be 1 for 14 items with pageSize 24');

  // Boundary clamping simulation
  function clampPage(page, totalPages) {
    if (page < 0) return 0;
    if (page >= totalPages && totalPages > 0) return totalPages - 1;
    return page;
  }
  assert.strictEqual(clampPage(-1, totalPages12), 0, 'Negative page should clamp to 0');
  assert.strictEqual(clampPage(99, totalPages12), 1, 'Excessive page should clamp to last page');

  reportPass(1, 'Pagination boundaries, page counts, and page size calculation (12 vs 24)');
} catch (err) {
  reportFail(1, 'Pagination calculations failed', err);
}

// ─── Test 2: Category filtering combined with pagination ─────
try {
  const { DEFAULT_PRODUCTS } = require(productsJsPath);

  const boots = DEFAULT_PRODUCTS.filter(p => p.category === 'boots');
  assert.strictEqual(boots.length, 4, 'Should have 4 boots in fallback');
  const bootsPages = Math.ceil(boots.length / 12);
  assert.strictEqual(bootsPages, 1, 'Boots should have 1 page of 12');

  const jerseys = DEFAULT_PRODUCTS.filter(p => p.category === 'jerseys');
  assert.strictEqual(jerseys.length, 6, 'Should have 6 jerseys in fallback');
  const jerseysPages = Math.ceil(jerseys.length / 12);
  assert.strictEqual(jerseysPages, 1, 'Jerseys should have 1 page of 12');

  const sportswear = DEFAULT_PRODUCTS.filter(p => p.category === 'sportswear');
  assert.strictEqual(sportswear.length, 4, 'Should have 4 sportswear in fallback');
  const sportswearPages = Math.ceil(sportswear.length / 12);
  assert.strictEqual(sportswearPages, 1, 'Sportswear should have 1 page of 12');

  reportPass(2, 'Category filtering correctly subsets catalog and calculates page counts');
} catch (err) {
  reportFail(2, 'Category filter pagination failed', err);
}

// ─── Test 3: Search queries with pagination and empty states ─
try {
  const { DEFAULT_PRODUCTS } = require(productsJsPath);

  const query1 = 'mercurial';
  const matches1 = DEFAULT_PRODUCTS.filter(p =>
    (p.name || '').toLowerCase().includes(query1) || (p.description || '').toLowerCase().includes(query1)
  );
  assert.ok(matches1.length >= 1, 'Search for "mercurial" should return matches');
  assert.strictEqual(Math.ceil(matches1.length / 12), 1, 'Search results should have 1 page');

  const queryEmpty = 'nonexistent_super_item_xyz_999';
  const matchesEmpty = DEFAULT_PRODUCTS.filter(p =>
    (p.name || '').toLowerCase().includes(queryEmpty) || (p.description || '').toLowerCase().includes(queryEmpty)
  );
  assert.strictEqual(matchesEmpty.length, 0, 'Nonexistent search must return 0 results');
  const emptyPages = Math.ceil(matchesEmpty.length / 12);
  assert.strictEqual(emptyPages, 0, 'Empty results should have 0 pages');

  reportPass(3, 'Search filtering with pagination counts and empty results handling');
} catch (err) {
  reportFail(3, 'Search pagination failed', err);
}

// ─── Test 4: renderProducts DOM replacement & card integrity ─
try {
  const { createProductCard, renderProducts } = require(renderJsPath);
  const { DEFAULT_PRODUCTS, formatPrice } = require(productsJsPath);
  global.formatPrice = formatPrice;

  const testProduct = DEFAULT_PRODUCTS[0];
  const cardHtml = createProductCard(testProduct);

  assert.ok(cardHtml.includes(`data-id="${testProduct.id}"`), 'Product card should contain product id attribute');
  assert.ok(cardHtml.includes(`data-category="${testProduct.category}"`), 'Product card should contain category');
  assert.ok(cardHtml.includes('card-img-wrap'), 'Product card should have .card-img-wrap container');
  assert.ok(cardHtml.includes('loading="lazy"'), 'Images should have lazy loading attribute');
  assert.ok(cardHtml.includes('btn-card-cart'), 'Product card must retain "+ Cart" button');
  assert.ok(cardHtml.includes('btn-whatsapp'), 'Product card must retain WhatsApp order link');

  // Verify DOM replacement logic
  const mockChildren = [];
  const mockContainer = {
    id: 'test-grid',
    innerHTML: '',
    children: mockChildren,
    querySelectorAll: () => []
  };

  global.document = {
    getElementById: (id) => (id === 'test-grid' ? mockContainer : null)
  };

  renderProducts(DEFAULT_PRODUCTS.slice(0, 12), 'test-grid', false);
  assert.ok(mockContainer.innerHTML.includes(DEFAULT_PRODUCTS[0].name), 'Rendered HTML contains first product');
  assert.ok(mockContainer.innerHTML.includes(DEFAULT_PRODUCTS[11].name), 'Rendered HTML contains 12th product');

  // Second page render replaces innerHTML completely (does not append)
  renderProducts(DEFAULT_PRODUCTS.slice(12, 14), 'test-grid', false);
  assert.ok(!mockContainer.innerHTML.includes(DEFAULT_PRODUCTS[0].name), 'Page 2 does not contain Page 1 first product');
  assert.ok(mockContainer.innerHTML.includes(DEFAULT_PRODUCTS[12].name), 'Page 2 contains 13th product');

  reportPass(4, 'Product card rendering replaces DOM cleanly without duplicate cards');
} catch (err) {
  reportFail(4, 'DOM card rendering test failed', err);
}

// ─── Test 5: CSS Product Card aspect ratio & image containment 
try {
  const css = fs.readFileSync(styleCssPath, 'utf8');

  assert.ok(css.includes('aspect-ratio: 1 / 1'), 'style.css must enforce aspect-ratio: 1 / 1 on .card-img-wrap');
  assert.ok(css.includes('object-fit: contain'), 'style.css must enforce object-fit: contain on product images');
  assert.ok(css.includes('--bg-surface-2'), 'style.css uses neutral background token on image containers');
  assert.ok(css.includes('.pagination-bar'), 'style.css contains .pagination-bar styles');
  assert.ok(css.includes('.pagination-btn'), 'style.css contains .pagination-btn styles');
  assert.ok(css.includes('.page-size-select'), 'style.css contains .page-size-select styles');

  reportPass(5, 'CSS verifies 1:1 image container ratio, object-fit contain, and pagination styling');
} catch (err) {
  reportFail(5, 'CSS product card verification failed', err);
}

// ─── Test 6: Mobile Category Bar & Hero Spacing in index.html ─
try {
  const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
  const css = fs.readFileSync(styleCssPath, 'utf8').replace(/\r\n/g, '\n');

  assert.ok(indexHtml.includes('class="mobile-cat-bar"'), 'index.html contains .mobile-cat-bar element');
  assert.ok(indexHtml.includes('boots.html'), 'mobile-cat-bar links to boots.html');
  assert.ok(indexHtml.includes('jerseys.html'), 'mobile-cat-bar links to jerseys.html');
  assert.ok(indexHtml.includes('sportswear.html'), 'mobile-cat-bar links to sportswear.html');
  assert.ok(indexHtml.includes('catalog.html'), 'mobile-cat-bar links to catalog.html');

  // CSS rules
  assert.ok(css.includes('.mobile-cat-bar {\n  display: none;\n}'), 'mobile-cat-bar is hidden on desktop');
  assert.ok(css.includes('.mobile-cat-bar {\n    display: block;'), 'mobile-cat-bar is displayed on mobile (<= 768px)');
  assert.ok(css.includes('.mobile-cat-scroll'), 'mobile-cat-scroll handles horizontal scrolling');
  assert.ok(css.includes('overflow-x: auto'), 'mobile-cat-scroll enables touch scrolling');

  reportPass(6, 'Mobile category navigation bar structure, links, and responsive visibility');
} catch (err) {
  reportFail(6, 'Mobile category bar test failed', err);
}

// ─── Test 7: Admin Dashboard mobile card responsiveness ──────
try {
  const adminHtml = fs.readFileSync(adminHtmlPath, 'utf8');
  const css = fs.readFileSync(styleCssPath, 'utf8');
  const adminJs = fs.readFileSync(path.join(ROOT, 'js', 'admin.js'), 'utf8');

  // Product row wrapping and touch targets
  assert.ok(adminHtml.includes('.admin-product-row-top'), 'admin.html includes .admin-product-row-top container');
  assert.ok(adminHtml.includes('min-height: 44px;'), 'admin.html provides 44px touch targets on mobile action buttons');
  assert.ok(adminJs.includes('admin-product-row-top'), 'admin.js renders .admin-product-row-top wrapper');
  assert.ok(adminJs.includes('admin-modal-table-wrap'), 'admin.js wraps orders item table in scrollable wrapper');

  // Orders and edit modal responsive rules
  assert.ok(css.includes('.admin-modal-table-wrap'), 'style.css styles .admin-modal-table-wrap for horizontal scrolling');
  assert.ok(css.includes('.admin-order-card-header'), 'style.css contains responsive adjustments for order cards');
  assert.ok(css.includes('word-break: break-all'), 'style.css protects against order ref horizontal overflow');
  assert.ok(adminHtml.includes('max-width:min(640px, 95vw)'), 'admin edit modal stays within viewport on mobile');

  reportPass(7, 'Admin product & orders mobile usability: touch targets >= 44px, table scroll, and modal safety');
} catch (err) {
  reportFail(7, 'Admin mobile responsiveness test failed', err);
}

// ─── Test 8: Supabase range queries & fallback isolation ─────
try {
  const supabaseJs = fs.readFileSync(supabaseJsPath, 'utf8');

  assert.ok(supabaseJs.includes('.range(page * pageSize, (page + 1) * pageSize - 1)'), 'Supabase query uses .range() for paginated offsets');
  assert.ok(supabaseJs.includes('count: "exact"'), 'Supabase query requests exact count for total page calculation');
  assert.ok(supabaseJs.includes('let filteredFallback'), 'Supabase catch block applies category/search filters to fallback');

  reportPass(8, 'Supabase paginated range queries and resilient fallback handling');
} catch (err) {
  reportFail(8, 'Supabase range queries check failed', err);
}

console.log('\n================================================================');
console.log(`STAGE 5L TEST RESULTS : ${passCount} PASSED, ${failCount} FAILED`);
console.log('================================================================\n');

if (failCount > 0) {
  process.exit(1);
}
