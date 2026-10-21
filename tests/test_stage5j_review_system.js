// ============================================================
// Quantum Jersey — Stage 5J: Free-Text Review System Test Suite
// ============================================================

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('================================================================');
console.log('QUANTUM JERSEY : STAGE 5J FREE-TEXT REVIEW SYSTEM SUITE');
console.log('================================================================\n');

let passed = 0;
let failed = 0;

function reportPass(num, description) {
  console.log(`[PASS] Test ${num}: ${description}`);
  passed++;
}

function reportFail(num, description, error) {
  console.error(`[FAIL] Test ${num}: ${description}`);
  console.error(`       Error: ${error.message}\n`);
  failed++;
}

async function runStage5jTestSuite() {
  const ROOT_DIR = path.join(__dirname, '..');
  const reviewHtmlPath = path.join(ROOT_DIR, 'review.html');
  // Set up mock browser environment
  if (typeof global.window === 'undefined') {
    global.window = {
      location: { hostname: 'localhost' },
      QJ_ENV: 'development',
      localStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {}
      }
    };
  }

  const supabaseJsPath = path.join(ROOT_DIR, 'js', 'supabase.js');
  const adminJsPath = path.join(ROOT_DIR, 'js', 'admin.js');
  const migrationPath = path.join(ROOT_DIR, 'supabase', 'migrations', '20261021_freetext_product_reviews.sql');

  // Load modules
  const supabaseModule = require(supabaseJsPath);
  const { submitReview, fetchProductReviews } = supabaseModule;

  // Mock catalog products
  const mockCatalogue = [
    { id: 'boot-001', name: 'Nike Phantom GX 2 Elite', product_name: 'Nike Phantom GX 2 Elite', slug: 'nike-phantom-gx-2-elite' },
    { id: 'jrz-002', name: 'Real Madrid 2024/25 Home Jersey', product_name: 'Real Madrid 2024/25 Home Jersey', slug: 'real-madrid-2024-25-home-jersey' },
    { id: 'spt-003', name: 'Arsenal Pre-Match Training Shirt', product_name: 'Arsenal Pre-Match Training Shirt', slug: 'arsenal-pre-match-training-shirt' }
  ];

  function matchCatalogue(typedName, catalogue) {
    const clean = s => (s || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
    const target = clean(typedName);
    if (!target) return null;
    return catalogue.find(p => {
      const pName = clean(p.name);
      const pProd = clean(p.product_name);
      const pSlug = clean(p.slug);
      const pId = clean(p.id);
      return pName === target || pProd === target || pSlug === target || pId === target;
    }) || null;
  }

  // ─────────────────────────────────────────────────────────────
  // 1. Submission with a valid free-text product name
  // ─────────────────────────────────────────────────────────────
  try {
    const res = await submitReview({
      productId: null,
      productName: 'Retro Chelsea 2012 Champions League Final Jersey',
      rating: 5,
      reviewText: 'Incredible quality and fit, looks identical to the original!',
      customerName: 'Didier D.',
      reviewSource: 'previous_customer',
      purchaseDetails: 'Bought on WhatsApp in May 2023'
    });

    assert.strictEqual(res.success, true, 'Must return success');
    assert.strictEqual(res.data.product_name, 'Retro Chelsea 2012 Champions League Final Jersey');
    assert.strictEqual(res.data.customer_name, 'Didier D.');
    assert.strictEqual(res.data.rating, 5);
    reportPass(1, 'Submission with a valid free-text product name succeeds with correct payload');
  } catch (err) {
    reportFail(1, 'Submission with free-text product name failed', err);
  }

  // ─────────────────────────────────────────────────────────────
  // 2. Submission for a product not in the current catalogue (null productId)
  // ─────────────────────────────────────────────────────────────
  try {
    const unlistedName = 'Vintage Super Eagles 1994 World Cup Jersey';
    const match = matchCatalogue(unlistedName, mockCatalogue);
    assert.strictEqual(match, null, 'Unlisted product must not match catalogue');

    const res = await submitReview({
      productId: match ? match.id : null,
      productName: unlistedName,
      rating: 5,
      reviewText: 'Classic green pattern, true to size and fast delivery to Abuja.',
      customerName: 'Sunday O.',
      reviewSource: 'previous_customer'
    });

    assert.strictEqual(res.data.product_id, null, 'Unlisted product must have product_id: null');
    assert.strictEqual(res.data.product_name, unlistedName, 'Unlisted product preserves exact typed name');
    reportPass(2, 'Submission for an unlisted product stores product_id = null and keeps typed product name');
  } catch (err) {
    reportFail(2, 'Unlisted product submission failed', err);
  }

  // ─────────────────────────────────────────────────────────────
  // 3. Submission for an existing product with a confident association
  // ─────────────────────────────────────────────────────────────
  try {
    const typedName = 'Real Madrid 2024/25 Home Jersey';
    const match = matchCatalogue(typedName, mockCatalogue);
    assert.ok(match, 'Must confidently match catalogue item');
    assert.strictEqual(match.id, 'jrz-002');

    const res = await submitReview({
      productId: match.id,
      productName: typedName,
      rating: 4,
      reviewText: 'Clean gold detailing and comfortable breathable fabric.',
      customerName: 'Karim B.',
      reviewSource: 'previous_customer'
    });

    assert.strictEqual(res.data.product_id, 'jrz-002', 'Must attach confident catalogue product ID');
    assert.strictEqual(res.data.product_name, typedName, 'Retains exact entered product name');
    reportPass(3, 'Submission for catalogue product attaches confident product_id and retains entered name');
  } catch (err) {
    reportFail(3, 'Catalogue product association failed', err);
  }

  // ─────────────────────────────────────────────────────────────
  // 4. Rejection of an empty or whitespace-only product name
  // ─────────────────────────────────────────────────────────────
  try {
    let threwForEmpty = false;
    try {
      await submitReview({
        productId: null,
        productName: '   ',
        rating: 5,
        reviewText: 'Great jersey',
        customerName: 'Test'
      });
    } catch (e) {
      threwForEmpty = true;
      assert.ok(e.message.includes('enter the name') || e.message.includes('specify the product'));
    }
    assert.strictEqual(threwForEmpty, true, 'Whitespace product name must throw validation error');

    let threwForNull = false;
    try {
      await submitReview({
        productId: null,
        productName: null,
        rating: 5,
        reviewText: 'Great jersey',
        customerName: 'Test'
      });
    } catch (e) {
      threwForNull = true;
    }
    assert.strictEqual(threwForNull, true, 'Null product name with null product ID must throw validation error');

    reportPass(4, 'Rejection of empty, whitespace-only, or missing product name enforced');
  } catch (err) {
    reportFail(4, 'Product name empty validation failed', err);
  }

  // ─────────────────────────────────────────────────────────────
  // 5. Product-name maximum length validation (> 150 characters)
  // ─────────────────────────────────────────────────────────────
  try {
    const overlyLongName = 'A'.repeat(151);
    let threwForLong = false;
    try {
      await submitReview({
        productId: null,
        productName: overlyLongName,
        rating: 5,
        reviewText: 'Product review text goes here',
        customerName: 'Test Customer'
      });
    } catch (e) {
      threwForLong = true;
      assert.ok(e.message.includes('150 characters or less'), 'Specific error message for length');
    }
    assert.strictEqual(threwForLong, true, 'Must reject product name > 150 chars');

    // Exactly 150 characters must be accepted
    const exactly150 = 'B'.repeat(150);
    const validRes = await submitReview({
      productId: null,
      productName: exactly150,
      rating: 5,
      reviewText: 'Valid length review description',
      customerName: 'Test Customer'
    });
    assert.strictEqual(validRes.data.product_name.length, 150, 'Accepts 150 character product name');

    reportPass(5, 'Product name maximum length (150 chars) strictly validated');
  } catch (err) {
    reportFail(5, 'Product name length validation failed', err);
  }

  // ─────────────────────────────────────────────────────────────
  // 6. Review submissions remain pending and unverified by default
  // ─────────────────────────────────────────────────────────────
  try {
    const res = await submitReview({
      productId: null,
      productName: 'Puma Future 7 Ultimate',
      rating: 5,
      reviewText: 'Best grip on firm ground pitches.',
      customerName: 'Neymar Jr.',
      reviewSource: 'previous_customer'
    });

    assert.strictEqual(res.data.status, 'pending', 'Must always be pending upon submission');
    assert.strictEqual(res.data.is_verified_purchase, false, 'Must always be false upon submission');
    reportPass(6, 'Public submissions strictly set status = pending and is_verified_purchase = false');
  } catch (err) {
    reportFail(6, 'Pending/unverified submission check failed', err);
  }

  // ─────────────────────────────────────────────────────────────
  // 7. Public users being unable to approve or verify reviews (RLS & client guarantees)
  // ─────────────────────────────────────────────────────────────
  try {
    const migrationContent = fs.readFileSync(migrationPath, 'utf8');
    assert.ok(/ALTER\s+TABLE\s+public\.reviews\s+ALTER\s+COLUMN\s+product_id\s+DROP\s+NOT\s+NULL;/i.test(migrationContent), 'Migration allows null product_id');
    assert.ok(migrationContent.includes('ADD COLUMN IF NOT EXISTS product_name TEXT;'), 'Migration adds product_name column');
    assert.ok(migrationContent.includes("status = 'pending'"), 'RLS policy enforces pending status on insert');
    assert.ok(migrationContent.includes('is_verified_purchase = false'), 'RLS policy enforces unverified purchase on insert');
    assert.ok(migrationContent.includes('CREATE POLICY "Public insert pending reviews"'), 'Hardened insert policy defined');
    assert.ok(migrationContent.includes('CREATE POLICY "Admin update reviews"'), 'Admin update policy defined');
    assert.ok(migrationContent.includes('CREATE POLICY "Admin delete reviews"'), 'Admin delete policy defined');
    reportPass(7, 'Security & RLS constraints guarantee public users cannot self-approve or self-verify');
  } catch (err) {
    reportFail(7, 'RLS policy validation failed', err);
  }

  // ─────────────────────────────────────────────────────────────
  // 8. Existing product-specific reviews & ratings unaffected
  // ─────────────────────────────────────────────────────────────
  try {
    // In unconfigured mock environment, fetchProductReviews returns default empty state without error
    const res = await fetchProductReviews('jrz-002');
    assert.strictEqual(typeof res.averageRating, 'number');
    assert.strictEqual(typeof res.totalCount, 'number');
    assert.ok(Array.isArray(res.reviews));

    // Supabase query filters strictly on product_id = productId, so reviews with product_id: null are excluded
    const supabaseJsContent = fs.readFileSync(supabaseJsPath, 'utf8');
    assert.ok(supabaseJsContent.includes('.eq("product_id", productId)'), 'Filters strictly on matching product_id');
    assert.ok(supabaseJsContent.includes('.eq("status", "approved")'), 'Filters strictly on approved reviews');
    reportPass(8, 'Product detail queries filter strictly on product_id and approved status');
  } catch (err) {
    reportFail(8, 'Product reviews query validation failed', err);
  }

  // ─────────────────────────────────────────────────────────────
  // 9. Admin display of reviews without a product_id handles product_name gracefully
  // ─────────────────────────────────────────────────────────────
  try {
    const adminJsContent = fs.readFileSync(adminJsPath, 'utf8');
    assert.ok(adminJsContent.includes('rev.product_name'), 'Admin displays stored product_name');
    assert.ok(adminJsContent.includes('Custom / Offline Item'), 'Admin tags offline items');
    assert.ok(adminJsContent.includes('escapeHtml'), 'Admin escapes customer inputs against XSS');
    assert.ok(adminJsContent.includes('Unspecified Product'), 'Admin has fallback for unspecified product');
    reportPass(9, 'Admin dashboard displays stored product_name safely without undefined or blank fields');
  } catch (err) {
    reportFail(9, 'Admin display test failed', err);
  }

  // ─────────────────────────────────────────────────────────────
  // 10. Admin moderation separates approval from purchase verification
  // ─────────────────────────────────────────────────────────────
  try {
    const adminJsContent = fs.readFileSync(adminJsPath, 'utf8');
    // Verify approval does NOT set is_verified_purchase: true
    assert.ok(!adminJsContent.includes('is_verified_purchase: newStatus === "approved"'), 'Must NOT conflate approval with verification');
    assert.ok(adminJsContent.includes('handleToggleReviewVerification'), 'Dedicated verification toggle exists');
    assert.ok(adminJsContent.includes('handleDeleteReview'), 'Dedicated delete review handler exists');
    reportPass(10, 'Admin moderation preserves strict separation between approval and purchase verification');
  } catch (err) {
    reportFail(10, 'Admin moderation verification separation check failed', err);
  }

  // ─────────────────────────────────────────────────────────────
  // 11. review.html UI structure, required fields, and mobile responsiveness
  // ─────────────────────────────────────────────────────────────
  try {
    const reviewHtmlContent = fs.readFileSync(reviewHtmlPath, 'utf8');
    assert.ok(reviewHtmlContent.includes('Which product did you buy?'), 'Contains exact label: Which product did you buy?');
    assert.ok(reviewHtmlContent.includes('e.g. Real Madrid 2025/26 Home Jersey, Barcelona Away Jersey, Nike Mercurial Boots'), 'Contains exact placeholder');
    assert.ok(reviewHtmlContent.includes('Enter the product name as you remember it. It does not have to be listed on our website.'), 'Contains supporting text');
    assert.ok(reviewHtmlContent.includes('id="cust-product-name"'), 'Contains cust-product-name input');
    assert.ok(reviewHtmlContent.includes('maxlength="150"'), 'Enforces maxlength="150" on product name');
    assert.ok(!reviewHtmlContent.includes('id="manual-product-select"'), 'Catalogue dropdown successfully removed');
    assert.ok(!reviewHtmlContent.includes('renderProductNotFoundState'), 'Product not found blocking state removed');
    assert.ok(reviewHtmlContent.includes('@media (max-width: 600px)'), 'Preserves mobile responsiveness');
    reportPass(11, 'review.html renders free-text input with required copy, hints, and mobile responsiveness');
  } catch (err) {
    reportFail(11, 'review.html UI structure validation failed', err);
  }

  // ─────────────────────────────────────────────────────────────
  // 12. Minimal insert enforcement: no .select(), no return=representation, and revised 42501 error guidance
  // ─────────────────────────────────────────────────────────────
  try {
    let insertCalls = [];
    let selectChained = false;
    let lastBuilder = null;

    // Factory for instrumented PostgREST builder simulating PostgREST protocol behavior
    function createMockPostgrestBuilder(payloads, options) {
      const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      };
      if (options && options.defaultToNull === false) {
        headers['Prefer'] = 'missing=default';
      }

      const searchParams = new Map();

      const builder = {
        headers,
        searchParams,
        method: 'POST',
        payloads,
        options,
        select: (columns = '*') => {
          selectChained = true;
          searchParams.set('select', columns);
          if (headers['Prefer']) {
            headers['Prefer'] += ',return=representation';
          } else {
            headers['Prefer'] = 'return=representation';
          }
          return builder;
        },
        then: (resolve) => {
          // If return=representation is requested on an unapproved review,
          // simulate PostgreSQL RLS SELECT check failure (code 42501)
          if (headers['Prefer'] && headers['Prefer'].includes('return=representation')) {
            resolve({
              data: null,
              error: {
                code: '42501',
                message: 'new row violates row-level security policy for table "reviews"'
              }
            });
            return;
          }

          // In minimal return mode (PostgREST default when return=representation is absent),
          // PostgREST returns 201 Created with empty representation (data: null)
          resolve({ data: null, error: null });
        }
      };

      lastBuilder = builder;
      return builder;
    }

    const mockSupabaseClient = {
      from: (tableName) => {
        assert.strictEqual(tableName, 'reviews', 'Must target reviews table');
        return {
          insert: (payloads, options) => {
            insertCalls.push({ payloads, options });
            return createMockPostgrestBuilder(payloads, options);
          }
        };
      }
    };

    // Temporarily attach mock client to global getter
    const originalGetSupabaseClient = global.getSupabaseClient;
    global.getSupabaseClient = () => mockSupabaseClient;

    // A. Catalogue product submission
    insertCalls = [];
    selectChained = false;
    lastBuilder = null;
    const catRes = await submitReview({
      productId: 'jrz-002',
      productName: 'Real Madrid 2024/25 Home Jersey',
      rating: 5,
      reviewText: 'Great jersey, looks fantastic on pitch.',
      customerName: 'Tunde A.',
      reviewSource: 'previous_customer'
    });

    assert.strictEqual(insertCalls.length, 1, 'Exactly one insert called for catalogue product');
    assert.strictEqual(selectChained, false, 'Catalogue insert must NEVER chain .select() (minimal return required by RLS)');
    assert.ok(lastBuilder, 'PostgREST builder must be created');
    assert.strictEqual(lastBuilder.searchParams.has('select'), false, 'URL query must NOT contain select parameter');
    assert.strictEqual(
      (lastBuilder.headers['Prefer'] || '').includes('return=representation'),
      false,
      'Headers must NOT request return=representation (which triggers RLS SELECT policy check)'
    );

    const catPayload = insertCalls[0].payloads[0];
    assert.strictEqual(catPayload.product_id, 'jrz-002', 'Catalogue product_id preserved');
    assert.strictEqual(catPayload.product_name, 'Real Madrid 2024/25 Home Jersey', 'Catalogue product_name preserved');
    assert.strictEqual(catPayload.status, 'pending', 'Submitted status must strictly be pending');
    assert.strictEqual(catPayload.is_verified_purchase, false, 'Submitted is_verified_purchase must strictly be false');
    assert.strictEqual(catRes.success, true);
    assert.strictEqual(catRes.data.status, 'pending');
    assert.strictEqual(catRes.data.is_verified_purchase, false);

    // B. Free-text unlisted product submission
    insertCalls = [];
    selectChained = false;
    lastBuilder = null;
    const unlistedRes = await submitReview({
      productId: null,
      productName: 'Custom Nigeria 1996 Olympic Gold Retro Jersey',
      rating: 5,
      reviewText: 'Historic jersey quality is superb and authentic.',
      customerName: 'Kanu N.',
      reviewSource: 'previous_customer'
    });

    assert.strictEqual(insertCalls.length, 1, 'Exactly one insert called for unlisted product');
    assert.strictEqual(selectChained, false, 'Unlisted insert must NEVER chain .select() (minimal return required by RLS)');
    assert.ok(lastBuilder, 'PostgREST builder must be created');
    assert.strictEqual(lastBuilder.searchParams.has('select'), false, 'URL query must NOT contain select parameter');
    assert.strictEqual(
      (lastBuilder.headers['Prefer'] || '').includes('return=representation'),
      false,
      'Headers must NOT request return=representation (which triggers RLS SELECT policy check)'
    );

    const unlistedPayload = insertCalls[0].payloads[0];
    assert.strictEqual(unlistedPayload.product_id, null, 'Unlisted product_id must be null');
    assert.strictEqual(unlistedPayload.product_name, 'Custom Nigeria 1996 Olympic Gold Retro Jersey', 'Unlisted product_name preserved');
    assert.strictEqual(unlistedPayload.status, 'pending', 'Submitted status must strictly be pending');
    assert.strictEqual(unlistedPayload.is_verified_purchase, false, 'Submitted is_verified_purchase must strictly be false');
    assert.strictEqual(unlistedRes.success, true);
    assert.strictEqual(unlistedRes.data.status, 'pending');
    assert.strictEqual(unlistedRes.data.is_verified_purchase, false);

    // C. Error guidance verification for 42501 (insufficient privilege / RLS rejection)
    const errorSimulatingClient = {
      from: () => ({
        insert: () => ({
          then: (resolve) => {
            resolve({
              data: null,
              error: {
                code: '42501',
                message: 'new row violates row-level security policy for table "reviews"'
              }
            });
          }
        })
      })
    };
    global.getSupabaseClient = () => errorSimulatingClient;

    let caughtError = null;
    try {
      await submitReview({
        productId: null,
        productName: 'Test Error Handling Jersey',
        rating: 5,
        reviewText: 'Testing 42501 user-facing message guidance.',
        customerName: 'Tester',
        reviewSource: 'previous_customer'
      });
    } catch (err) {
      caughtError = err;
    }

    assert.ok(caughtError, 'Expected submitReview to reject on 42501 error');
    assert.strictEqual(
      caughtError.message,
      'Review submission could not be accepted due to security policy restrictions. Please try again or contact support if the issue persists.',
      '42501 error must give helpful guidance without incorrectly blaming customer form fields'
    );

    // Restore original getter
    global.getSupabaseClient = originalGetSupabaseClient;

    reportPass(12, 'Minimal insert verified: return=representation absent, no .select(), pending/unverified state preserved, and accurate 42501 guidance');
  } catch (err) {
    reportFail(12, 'Minimal insert enforcement test failed', err);
  }

  // ─────────────────────────────────────────────────────────────
  // 13. Cache-busting version parameter on review script tags
  // ─────────────────────────────────────────────────────────────
  try {
    const reviewHtmlContent = fs.readFileSync(reviewHtmlPath, 'utf8');
    const productHtmlPath = path.join(ROOT_DIR, 'product.html');
    const productHtmlContent = fs.readFileSync(productHtmlPath, 'utf8');

    const reviewScriptMatch = reviewHtmlContent.match(/<script src="js\/supabase\.js\?v=([a-zA-Z0-9_-]+)"><\/script>/);
    assert.ok(reviewScriptMatch, 'review.html must include cache-busted js/supabase.js?v=...');

    const productScriptMatch = productHtmlContent.match(/<script src="js\/supabase\.js\?v=([a-zA-Z0-9_-]+)"><\/script>/);
    assert.ok(productScriptMatch, 'product.html must include cache-busted js/supabase.js?v=...');

    reportPass(13, 'review.html and product.html include cache-busted js/supabase.js script tags');
  } catch (err) {
    reportFail(13, 'Cache-busting script tag verification failed', err);
  }

  console.log('\n================================================================');
  console.log(`STAGE 5J TEST RESULTS: ${passed} / ${passed + failed} PASSED (${Math.round((passed / (passed + failed)) * 100)}%)`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runStage5jTestSuite();
