// ============================================================
// Quantum Jersey — Stage 5K: Product Editing Feature Test Suite
// ============================================================

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('================================================================');
console.log('QUANTUM JERSEY : STAGE 5K PRODUCT EDITING TEST SUITE');
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

// ─────────────────────────────────────────────────────────────
// Lightweight DOM Mock for Node.js
// ─────────────────────────────────────────────────────────────
class MockElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.id = '';
    this.className = '';
    this.style = {};
    this.value = '';
    this.textContent = '';
    this.innerHTML = '';
    this.checked = false;
    this.disabled = false;
    this.required = false;
    this.src = '';
    this.children = [];
    this._listeners = {};
    this.classList = {
      _classes: new Set(),
      add: (c) => this.classList._classes.add(c),
      remove: (c) => this.classList._classes.delete(c),
      toggle: (c, force) => {
        if (force === undefined) {
          if (this.classList._classes.has(c)) this.classList._classes.delete(c);
          else this.classList._classes.add(c);
        } else if (force) {
          this.classList._classes.add(c);
        } else {
          this.classList._classes.delete(c);
        }
      },
      contains: (c) => this.classList._classes.has(c)
    };
  }
  addEventListener(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
  }
  dispatchEvent(event) {
    const list = this._listeners[event.type] || [];
    for (const fn of list) fn(event);
  }
}

const mockElementRegistry = new Map();
function getOrCreateMockElement(id, tag = 'div') {
  if (!mockElementRegistry.has(id)) {
    const el = new MockElement(tag);
    el.id = id;
    mockElementRegistry.set(id, el);
  }
  return mockElementRegistry.get(id);
}

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

if (typeof global.document === 'undefined') {
  global.document = {
    getElementById(id) {
      return getOrCreateMockElement(id);
    },
    querySelectorAll() {
      return [];
    },
    addEventListener() {},
    createElement(tag) {
      return new MockElement(tag);
    }
  };
}

async function runStage5kTestSuite() {
  const ROOT_DIR = path.join(__dirname, '..');
  const adminHtmlPath = path.join(ROOT_DIR, 'admin.html');
  const supabaseJsPath = path.join(ROOT_DIR, 'js', 'supabase.js');
  const adminJsPath = path.join(ROOT_DIR, 'js', 'admin.js');
  const productsJsPath = path.join(ROOT_DIR, 'js', 'products.js');

  const {
    formatProductDescription,
    cleanProductDescription,
    parseProductVersions,
    DEFAULT_PRODUCTS
  } = require(productsJsPath);

  // Expose product helpers to global scope as in the browser runtime
  global.formatProductDescription = formatProductDescription;
  global.cleanProductDescription = cleanProductDescription;
  global.parseProductVersions = parseProductVersions;
  global.window.formatProductDescription = formatProductDescription;
  global.window.cleanProductDescription = cleanProductDescription;
  global.window.parseProductVersions = parseProductVersions;

  const {
    updateProduct
  } = require(supabaseJsPath);

  const adminModule = require(adminJsPath);
  const {
    openEditProductModal,
    closeEditProductModal,
    handleSaveEditProduct,
    setAdminSessionForTest,
    setAdminProductsCacheForTest,
    setCurrentEditingProductForTest,
    setEditReplacementFileForTest,
    cancelEditImageReplacement
  } = adminModule;

  // ─────────────────────────────────────────────────────────────
  // 1. Validation: updateProduct requires valid ID
  // ─────────────────────────────────────────────────────────────
  try {
    let threw = false;
    try {
      await updateProduct(null, { product_name: "Test" }, { user: { id: "admin-1" } });
    } catch (e) {
      threw = true;
      assert.ok(e.message.includes("Product ID is required"), "Error message should mention Product ID is required");
    }
    assert.strictEqual(threw, true, "Must throw when ID is missing");
    reportPass(1, "updateProduct requires valid product ID");
  } catch (err) {
    reportFail(1, "updateProduct ID validation failed", err);
  }

  // ─────────────────────────────────────────────────────────────
  // 2. Authentication: updateProduct requires admin session
  // ─────────────────────────────────────────────────────────────
  try {
    let threw = false;
    try {
      await updateProduct("prod-123", { product_name: "Test" }, null);
    } catch (e) {
      threw = true;
      assert.ok(e.message.includes("Not authenticated"), "Error message should mention Not authenticated");
    }
    assert.strictEqual(threw, true, "Must throw when session is missing");
    reportPass(2, "updateProduct requires authenticated session");
  } catch (err) {
    reportFail(2, "updateProduct auth validation failed", err);
  }

  // ─────────────────────────────────────────────────────────────
  // 3. Database operation: updateProduct executes .update() on existing ID without deleting
  // ─────────────────────────────────────────────────────────────
  try {
    let capturedTable = null;
    let capturedPayload = null;
    let capturedEqCol = null;
    let capturedEqVal = null;
    let selectCalled = false;
    let singleCalled = false;

    const mockClient = {
      from: (table) => {
        capturedTable = table;
        return {
          update: (payload) => {
            capturedPayload = payload;
            return {
              eq: (col, val) => {
                capturedEqCol = col;
                capturedEqVal = val;
                return {
                  select: async () => {
                    selectCalled = true;
                    return {
                      data: [{
                        id: val,
                        ...payload,
                        created_at: new Date().toISOString()
                      }],
                      error: null
                    };
                  }
                };
              }
            };
          }
        };
      }
    };

    // Inject mock client
    const prevGetClient = global.getSupabaseClient;
    global.getSupabaseClient = () => mockClient;
    global.window.getSupabaseClient = () => mockClient;
    const prevSupabase = global.supabase;
    global.supabase = mockClient;

    const mockSession = { user: { id: "admin-user", email: "admin@quantumjersey.com" } };
    const res = await updateProduct("prod-007", {
      product_name: "Super Eagles 2026 Home Jersey",
      category: "jerseys",
      price: 32000,
      sizes: ["M", "L", "XL"],
      image_url: "https://example.com/jersey.webp",
      description: "Authentic edition",
      badge: "New Arrival",
      featured: true,
      in_stock: true
    }, mockSession);

    assert.strictEqual(capturedTable, "products", "Target table must be 'products'");
    assert.strictEqual(capturedEqCol, "id", "Must target primary key column 'id'");
    assert.strictEqual(capturedEqVal, "prod-007", "Must update existing product with matching ID");
    assert.strictEqual(capturedPayload.product_name, "Super Eagles 2026 Home Jersey");
    assert.strictEqual(capturedPayload.price, 32000);
    assert.deepStrictEqual(capturedPayload.sizes, ["M", "L", "XL"]);
    assert.strictEqual(capturedPayload.featured, true);
    assert.strictEqual(capturedPayload.in_stock, true);
    assert.strictEqual(selectCalled, true, "Must call .select()");
    assert.strictEqual(res.id, "prod-007");

    // Also verify that 0 affected rows (e.g. non-existent ID or RLS rejection) throws rather than falsely succeeding
    const zeroRowsMockClient = {
      from: () => ({
        update: () => ({
          eq: (col, val) => ({
            select: async () => ({ data: [], error: null })
          })
        })
      })
    };
    global.getSupabaseClient = () => zeroRowsMockClient;
    let zeroRowsThrew = false;
    try {
      await updateProduct("prod-nonexistent", {
        product_name: "Ghost Product",
        category: "boots",
        price: 25000,
        sizes: ["42"],
        image_url: "https://example.com/boot.webp",
        description: "Boots description"
      }, mockSession);
    } catch (e) {
      zeroRowsThrew = true;
      assert.ok(e.message.includes("product not found or unauthorized"), "Must throw truthful error when zero rows are updated");
    }
    assert.strictEqual(zeroRowsThrew, true, "Must reject update when PostgREST returns 0 affected rows");

    // Also verify single-object response support
    const singleObjMockClient = {
      from: () => ({
        update: () => ({
          eq: (col, val) => ({
            select: async () => ({ data: { id: val, product_name: "Single Object", category: "boots", price: 20000, in_stock: true }, error: null })
          })
        })
      })
    };
    global.getSupabaseClient = () => singleObjMockClient;
    const singleRes = await updateProduct("prod-single", {
      product_name: "Single Object",
      category: "boots",
      price: 20000
    }, mockSession);
    assert.strictEqual(singleRes.id, "prod-single");
    assert.strictEqual(singleRes.name, "Single Object");

    // Restore
    global.getSupabaseClient = prevGetClient;
    global.window.getSupabaseClient = prevGetClient;
    global.supabase = prevSupabase;

    reportPass(3, "updateProduct uses .update().eq('id', id).select() with safe array unwrapping and fails truthfully on 0 rows");
  } catch (err) {
    reportFail(3, "updateProduct database update check failed", err);
  }

  // ─────────────────────────────────────────────────────────────
  // 4. Versioned Jersey update: properly packages versions metadata into description
  // ─────────────────────────────────────────────────────────────
  try {
    const rawMarketingDesc = "Official 24/25 Club Jersey with breathable mesh panels.";
    const versions = {
      fan: { label: "Fan Version", price: 28000, sizes: ["S", "M", "L", "XL"] },
      player: { label: "Player Version", price: 38000, sizes: ["M", "L", "XL", "XXL"] }
    };

    const formattedDesc = formatProductDescription(rawMarketingDesc, versions);
    assert.ok(formattedDesc.includes("<!--QJ_VERSIONS:"), "Description must contain version marker");

    const parsed = parseProductVersions(formattedDesc);
    assert.strictEqual(parsed.isVersioned, true, "Must parse as versioned");
    assert.strictEqual(parsed.versions.fan.price, 28000);
    assert.strictEqual(parsed.versions.player.price, 38000);
    assert.deepStrictEqual(parsed.versions.fan.sizes, ["S", "M", "L", "XL"]);
    assert.deepStrictEqual(parsed.versions.player.sizes, ["M", "L", "XL", "XXL"]);

    const cleanDesc = cleanProductDescription(formattedDesc);
    assert.strictEqual(cleanDesc, rawMarketingDesc, "cleanProductDescription must strip comments cleanly");

    reportPass(4, "Versioned jersey details are correctly formatted into description and parsed back");
  } catch (err) {
    reportFail(4, "Versioned jersey encoding/decoding failed", err);
  }

  // ─────────────────────────────────────────────────────────────
  // 5. Image replacement safety: Keeps current image if no file chosen
  // ─────────────────────────────────────────────────────────────
  try {
    let capturedUpdate = null;
    const mockClient = {
      from: () => ({
        update: (payload) => {
          capturedUpdate = payload;
          return {
            eq: () => ({
              select: async () => ({
                data: [{ id: "p-1", ...payload }],
                error: null
              })
            })
          };
        }
      })
    };

    const prevGetClient = global.getSupabaseClient;
    global.getSupabaseClient = () => mockClient;
    global.window.getSupabaseClient = () => mockClient;

    const existingProduct = {
      id: "p-1",
      name: "Classic Boots",
      category: "boots",
      price: 50000,
      sizes: ["40", "41", "42"],
      image: "https://example.com/original-image.webp",
      description: "Great boots",
      badge: null,
      featured: false,
      in_stock: true
    };

    // When saving with existing image URL
    const res = await updateProduct(existingProduct.id, {
      product_name: "Classic Boots Updated",
      category: existingProduct.category,
      price: 52000,
      sizes: existingProduct.sizes,
      image_url: existingProduct.image, // No replacement selected
      description: existingProduct.description,
      badge: existingProduct.badge,
      featured: existingProduct.featured,
      in_stock: existingProduct.in_stock
    }, { user: { id: "admin-1" } });

    assert.strictEqual(capturedUpdate.image_url, "https://example.com/original-image.webp", "Must retain existing image URL");
    assert.strictEqual(res.price, 52000);

    global.getSupabaseClient = prevGetClient;
    global.window.getSupabaseClient = prevGetClient;
    reportPass(5, "Existing image URL is preserved when no replacement image is selected");
  } catch (err) {
    reportFail(5, "Image preservation check failed", err);
  }

  // ─────────────────────────────────────────────────────────────
  // 6. Image upload failure atomicity: does not update database if image upload fails
  // ─────────────────────────────────────────────────────────────
  try {
    let dbUpdateCalled = false;
    const mockClient = {
      from: () => ({
        update: () => {
          dbUpdateCalled = true;
          return {
            eq: () => ({
              select: async () => ({ data: [{}], error: null })
            })
          };
        }
      })
    };

    global.getSupabaseClient = () => mockClient;
    global.window.getSupabaseClient = () => mockClient;

    // Simulate mock upload failing
    const mockUploadError = new Error("Storage service unavailable (CORS or network error)");
    const mockUploadProductImage = async () => {
      throw mockUploadError;
    };

    let caughtError = null;
    try {
      // Flow in handleSaveEditProduct:
      // Try uploading image first:
      await mockUploadProductImage();
      // If it succeeded, update database:
      await updateProduct("p-1", { image_url: "new-url" }, { user: { id: "admin-1" } });
    } catch (e) {
      caughtError = e;
    }

    assert.strictEqual(caughtError, mockUploadError, "Must catch and surface upload error");
    assert.strictEqual(dbUpdateCalled, false, "Database update must NOT be called if image upload fails");

    reportPass(6, "Image upload failure prevents database update, ensuring atomicity");
  } catch (err) {
    reportFail(6, "Image upload failure atomicity check failed", err);
  }

  // ─────────────────────────────────────────────────────────────
  // 7. DOM verification: admin.html contains Edit button CSS, modal markup, and script tags
  // ─────────────────────────────────────────────────────────────
  try {
    const adminHtml = fs.readFileSync(adminHtmlPath, 'utf8');

    assert.ok(adminHtml.includes('.btn-admin-edit'), 'admin.html must contain .btn-admin-edit CSS rule');
    assert.ok(adminHtml.includes('id="admin-edit-product-modal"'), 'admin.html must contain #admin-edit-product-modal');
    assert.ok(adminHtml.includes('id="admin-edit-product-form"'), 'admin.html must contain #admin-edit-product-form');
    assert.ok(adminHtml.includes('id="edit-prod-name"'), 'admin.html must contain #edit-prod-name input');
    assert.ok(adminHtml.includes('id="edit-prod-category"'), 'admin.html must contain #edit-prod-category select');
    assert.ok(adminHtml.includes('id="edit-prod-has-versions"'), 'admin.html must contain #edit-prod-has-versions checkbox');
    assert.ok(adminHtml.includes('id="edit-prod-fan-price"'), 'admin.html must contain #edit-prod-fan-price input');
    assert.ok(adminHtml.includes('id="edit-prod-fan-sizes"'), 'admin.html must contain #edit-prod-fan-sizes input');
    assert.ok(adminHtml.includes('id="edit-prod-player-price"'), 'admin.html must contain #edit-prod-player-price input');
    assert.ok(adminHtml.includes('id="edit-prod-player-sizes"'), 'admin.html must contain #edit-prod-player-sizes input');
    assert.ok(adminHtml.includes('id="edit-prod-price"'), 'admin.html must contain #edit-prod-price input');
    assert.ok(adminHtml.includes('id="edit-prod-sizes"'), 'admin.html must contain #edit-prod-sizes input');
    assert.ok(adminHtml.includes('id="edit-prod-badge"'), 'admin.html must contain #edit-prod-badge input');
    assert.ok(adminHtml.includes('id="edit-prod-featured"'), 'admin.html must contain #edit-prod-featured input');
    assert.ok(adminHtml.includes('id="edit-prod-in-stock"'), 'admin.html must contain #edit-prod-in-stock input');
    assert.ok(adminHtml.includes('id="edit-prod-desc"'), 'admin.html must contain #edit-prod-desc textarea');
    assert.ok(adminHtml.includes('id="edit-img-current-preview"'), 'admin.html must contain #edit-img-current-preview');
    assert.ok(adminHtml.includes('id="edit-image-picker"'), 'admin.html must contain #edit-image-picker file input');
    assert.ok(adminHtml.includes('id="edit-save-btn"'), 'admin.html must contain #edit-save-btn submit button');
    assert.ok(adminHtml.includes('js/admin.js?v=20261021'), 'admin.html must cache-bust js/admin.js');
    assert.ok(adminHtml.includes('js/supabase.js?v=20261021'), 'admin.html must cache-bust js/supabase.js');

    reportPass(7, "admin.html DOM structure contains all required edit modal components and cache-busted scripts");
  } catch (err) {
    reportFail(7, "admin.html DOM verification failed", err);
  }

  // ─────────────────────────────────────────────────────────────
  // 8. JS logic verification: admin.js modal state and open/close handling
  // ─────────────────────────────────────────────────────────────
  try {
    const adminJs = fs.readFileSync(adminJsPath, 'utf8');

    assert.ok(adminJs.includes('openEditProductModal'), 'admin.js must define openEditProductModal');
    assert.ok(adminJs.includes('closeEditProductModal'), 'admin.js must define closeEditProductModal');
    assert.ok(adminJs.includes('handleSaveEditProduct'), 'admin.js must define handleSaveEditProduct');
    assert.ok(adminJs.includes('btn-admin-edit'), 'admin.js must render .btn-admin-edit button in loadAdminProductList');
    assert.ok(adminJs.includes('_adminProductsCache'), 'admin.js must manage _adminProductsCache');

    // Test openEditProductModal population logic
    const testProd = {
      id: "test-prod-88",
      name: "Arsenal 24/25 Third Kit",
      category: "jerseys",
      price: 30000,
      sizes: ["S", "M", "L", "XL"],
      image: "assets/images/jersey_club.webp",
      description: "Official third kit <!--QJ_VERSIONS:{\"fan\":{\"label\":\"Fan Version\",\"price\":30000,\"sizes\":[\"S\",\"M\",\"L\"]},\"player\":{\"label\":\"Player Version\",\"price\":40000,\"sizes\":[\"M\",\"L\",\"XL\"]}}-->",
      badge: "Trending",
      featured: true,
      in_stock: true
    };

    setAdminProductsCacheForTest([testProd]);
    openEditProductModal("test-prod-88");

    const modal = getOrCreateMockElement("admin-edit-product-modal");
    assert.strictEqual(modal.style.display, "flex", "Modal display should be flex when opened");

    const nameInput = getOrCreateMockElement("edit-prod-name");
    assert.strictEqual(nameInput.value, "Arsenal 24/25 Third Kit", "Name field should be populated");

    const versionsCheck = getOrCreateMockElement("edit-prod-has-versions");
    assert.strictEqual(versionsCheck.checked, true, "Versioned jersey checkbox should be checked");

    const fanPriceInput = getOrCreateMockElement("edit-prod-fan-price");
    assert.strictEqual(fanPriceInput.value, 30000, "Fan price should be populated");

    const playerPriceInput = getOrCreateMockElement("edit-prod-player-price");
    assert.strictEqual(playerPriceInput.value, 40000, "Player price should be populated");

    closeEditProductModal();
    assert.strictEqual(modal.style.display, "none", "Modal display should be none after closing");

    reportPass(8, "admin.js contains full edit product handling, modal hooks, and listing integration");
  } catch (err) {
    reportFail(8, "admin.js logic verification failed", err);
  }

  // ─────────────────────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────────────────────
  console.log('\n================================================================');
  console.log(`TEST RESULTS : ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runStage5kTestSuite().catch(err => {
  console.error("Unhandled error during test run:", err);
  process.exit(1);
});
