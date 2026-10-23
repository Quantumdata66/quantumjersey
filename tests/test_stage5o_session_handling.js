// ============================================================
// Quantum Jersey — Stage 5O: Session Handling & Mutation Security Tests
// ============================================================

const assert = require('assert');
const path = require('path');

console.log('================================================================');
console.log('QUANTUM JERSEY : STAGE 5O SESSION HANDLING TEST SUITE');
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

// Ensure mock window is defined for js/supabase.js configuration
if (typeof global.window === 'undefined') {
  global.window = {
    location: { hostname: 'localhost' },
    QJ_ENV: 'development',
    QJ_SUPABASE_URL: 'YOUR_LOCAL_CONFIG_FAILED',
    QJ_SUPABASE_ANON_KEY: 'DISABLED'
  };
}

const supabasePath = path.resolve(__dirname, '../js/supabase.js');

function resetSupabaseModule() {
  Object.keys(require.cache).forEach((key) => {
    if (key.includes('supabase.js')) {
      delete require.cache[key];
    }
  });
}

function createMockSupabaseClient(options = {}) {
  let currentSession = options.session !== undefined ? options.session : null;
  const uploadError = options.uploadError || null;
  const listeners = [];
  let getSessionCallCount = 0;
  let uploadCallCount = 0;
  let removeCallCount = 0;
  let insertCallCount = 0;
  let updateCallCount = 0;
  let deleteCallCount = 0;

  const mockClient = {
    _listeners: listeners,
    get getSessionCalls() { return getSessionCallCount; },
    get uploadCalls() { return uploadCallCount; },
    get removeCalls() { return removeCallCount; },
    get insertCalls() { return insertCallCount; },
    get updateCalls() { return updateCallCount; },
    get deleteCalls() { return deleteCallCount; },
    auth: {
      getSession: async () => {
        getSessionCallCount++;
        return { data: { session: currentSession }, error: null };
      },
      onAuthStateChange: (callback) => {
        listeners.push(callback);
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                const idx = listeners.indexOf(callback);
                if (idx !== -1) listeners.splice(idx, 1);
              }
            }
          }
        };
      },
      signOut: async () => {
        currentSession = null;
        listeners.forEach((cb) => cb('SIGNED_OUT', null));
      }
    },
    storage: {
      from: (bucket) => ({
        upload: async (fileName, file, opts) => {
          uploadCallCount++;
          if (uploadError) {
            return { data: null, error: { message: uploadError } };
          }
          return { data: { path: fileName }, error: null };
        },
        getPublicUrl: (filePath) => ({
          data: { publicUrl: `https://mock.storage.supabase.co/${bucket}/${filePath}` }
        }),
        remove: async (paths) => {
          removeCallCount++;
          return { data: paths, error: null };
        }
      })
    },
    from: (table) => ({
      insert: (rows) => {
        insertCallCount++;
        const row = rows[0] || {};
        return {
          select: () => ({
            single: async () => ({
              data: { id: 'prod-new-123', created_at: new Date().toISOString(), ...row },
              error: null
            })
          })
        };
      },
      update: (payload) => {
        updateCallCount++;
        return {
          eq: (col, val) => ({
            select: () => ({
              single: async () => ({
                data: { id: val, ...payload },
                error: null
              }),
              then: (resolve) => resolve({ data: [{ id: val, ...payload }], error: null })
            }),
            then: (resolve) => resolve({ error: null })
          })
        };
      },
      delete: () => {
        deleteCallCount++;
        return {
          eq: (col, val) => Promise.resolve({ error: null })
        };
      }
    }),
    fireAuthStateChange: (event, session) => {
      currentSession = session;
      listeners.forEach((cb) => cb(event, session));
    }
  };

  return mockClient;
}

function makeFile(name = 'product.jpg', type = 'image/jpeg', size = 1024) {
  return { name, type, size };
}

async function runTests() {
  // ─────────────────────────────────────────────────────────────
  // 1. Fresh session upload succeeds and invokes auth.getSession()
  // ─────────────────────────────────────────────────────────────
  resetSupabaseModule();
  try {
    const mockClient = createMockSupabaseClient({
      session: { access_token: 'token_fresh_1', user: { id: 'admin-1' } }
    });
    global.getSupabaseClient = () => mockClient;

    const { uploadProductImage } = require(supabasePath);
    const url = await uploadProductImage(makeFile('jersey1.jpg'), null);

    assert.ok(typeof url === 'string' && url.includes('mock.storage.supabase.co'), 'Returned URL must be valid');
    assert.strictEqual(mockClient.getSessionCalls, 1, 'auth.getSession() must be called to verify fresh session');
    assert.strictEqual(mockClient.uploadCalls, 1, 'storage.upload() must be called');
    reportPass(1, 'Upload succeeds with fresh session and invokes auth.getSession()');
  } catch (err) {
    reportFail(1, 'Upload with fresh session', err);
  } finally {
    delete global.getSupabaseClient;
  }

  // ─────────────────────────────────────────────────────────────
  // 2. Multiple consecutive uploads succeed across TOKEN_REFRESHED
  // ─────────────────────────────────────────────────────────────
  resetSupabaseModule();
  try {
    const mockClient = createMockSupabaseClient({
      session: { access_token: 'token_v1', user: { id: 'admin-1' } }
    });
    global.getSupabaseClient = () => mockClient;

    const { uploadProductImage } = require(supabasePath);

    const url1 = await uploadProductImage(makeFile('jersey_1.jpg'), null);
    assert.ok(url1, 'Upload 1 must succeed');

    // Simulate SDK token refresh event
    mockClient.fireAuthStateChange('TOKEN_REFRESHED', {
      access_token: 'token_v2_refreshed',
      user: { id: 'admin-1' }
    });

    const url2 = await uploadProductImage(makeFile('jersey_2.jpg'), null);
    const url3 = await uploadProductImage(makeFile('jersey_3.jpg'), null);

    assert.ok(url2 && url3, 'Consecutive uploads after refresh must succeed');
    assert.strictEqual(mockClient.uploadCalls, 3, 'All 3 uploads must be executed');
    assert.strictEqual(mockClient.getSessionCalls, 3, 'auth.getSession() must be checked on every upload');
    reportPass(2, 'Three consecutive uploads succeed across TOKEN_REFRESHED event');
  } catch (err) {
    reportFail(2, 'Consecutive uploads across token refresh', err);
  } finally {
    delete global.getSupabaseClient;
  }

  // ─────────────────────────────────────────────────────────────
  // 3. Upload followed by publishProduct with null or stale caller session
  // ─────────────────────────────────────────────────────────────
  resetSupabaseModule();
  try {
    const liveSession = { access_token: 'live_token_publish', user: { id: 'admin-1' } };
    const mockClient = createMockSupabaseClient({ session: liveSession });
    global.getSupabaseClient = () => mockClient;

    const { uploadProductImage, publishProduct } = require(supabasePath);
    const staleSession = { access_token: 'stale_expired_caller_token', user: { id: 'admin-1' } };

    // 1. Upload with stale caller session
    const imgUrl = await uploadProductImage(makeFile('arsenal.jpg'), staleSession);
    assert.ok(typeof imgUrl === 'string' && imgUrl.includes('mock.storage.supabase.co'), 'Image upload must succeed using live session');

    // 2. Publish with null caller session
    const prodNullSession = await publishProduct({
      product_name: 'Arsenal 2026 Home Jersey',
      category: 'jerseys',
      price: 35000,
      sizes: ['M', 'L'],
      image_url: imgUrl,
      description: 'New season kit'
    }, null);
    assert.strictEqual(prodNullSession.name, 'Arsenal 2026 Home Jersey', 'Publish with null session arg must succeed');

    // 3. Publish with stale caller session
    const prodStaleSession = await publishProduct({
      product_name: 'Chelsea 2026 Away Jersey',
      category: 'jerseys',
      price: 34000,
      sizes: ['S', 'M'],
      image_url: imgUrl,
      description: 'Away edition'
    }, staleSession);
    assert.strictEqual(prodStaleSession.name, 'Chelsea 2026 Away Jersey', 'Publish with stale session arg must succeed');

    assert.strictEqual(mockClient.insertCalls, 2, 'Both publish operations must execute');
    reportPass(3, 'Upload followed by publishProduct succeeds when caller session is null or stale');
  } catch (err) {
    reportFail(3, 'Upload followed by publishProduct', err);
  } finally {
    delete global.getSupabaseClient;
  }

  // ─────────────────────────────────────────────────────────────
  // 4. Image cleanup (deleteStorageImageByUrl) with null or stale caller session
  // ─────────────────────────────────────────────────────────────
  resetSupabaseModule();
  try {
    const liveSession = { access_token: 'live_token_cleanup', user: { id: 'admin-1' } };
    const mockClient = createMockSupabaseClient({ session: liveSession });
    global.getSupabaseClient = () => mockClient;

    const { deleteStorageImageByUrl } = require(supabasePath);
    const targetUrl = 'https://mock.storage.supabase.co/product-images/1792000000-xyz.jpg';

    // Cleanup with null session
    const res1 = await deleteStorageImageByUrl(targetUrl, null);
    assert.strictEqual(res1.success, true, 'Cleanup with null session arg must succeed');

    // Cleanup with stale session
    const staleSession = { access_token: 'stale_cleanup_token' };
    const res2 = await deleteStorageImageByUrl(targetUrl, staleSession);
    assert.strictEqual(res2.success, true, 'Cleanup with stale session arg must succeed');

    assert.strictEqual(mockClient.removeCalls, 2, 'Both cleanup calls must execute');
    reportPass(4, 'deleteStorageImageByUrl succeeds with null or stale caller session');
  } catch (err) {
    reportFail(4, 'deleteStorageImageByUrl with null/stale session', err);
  } finally {
    delete global.getSupabaseClient;
  }

  // ─────────────────────────────────────────────────────────────
  // 5. Missing authenticated session: all mutations fail safely
  // ─────────────────────────────────────────────────────────────
  resetSupabaseModule();
  try {
    // Client has no active session
    const mockClient = createMockSupabaseClient({ session: null });
    global.getSupabaseClient = () => mockClient;

    const {
      uploadProductImage,
      publishProduct,
      deleteStorageImageByUrl,
      updateProduct,
      deleteProductById,
      toggleFeatured
    } = require(supabasePath);

    const staleSession = { access_token: 'stale_unauthenticated_token' };

    // 1. uploadProductImage must throw
    let threwUpload = false;
    try {
      await uploadProductImage(makeFile(), staleSession);
    } catch (e) {
      threwUpload = true;
      assert.ok(e.message.includes('Not authenticated') || e.message.includes('session missing'));
    }
    assert.strictEqual(threwUpload, true, 'uploadProductImage must throw when unauthenticated');

    // 2. publishProduct must throw
    let threwPublish = false;
    try {
      await publishProduct({ product_name: 'Test', price: 1000 }, staleSession);
    } catch (e) {
      threwPublish = true;
      assert.ok(e.message.includes('Not authenticated'));
    }
    assert.strictEqual(threwPublish, true, 'publishProduct must throw when unauthenticated');

    // 3. deleteStorageImageByUrl must return failure
    const cleanupRes = await deleteStorageImageByUrl('https://mock.storage.supabase.co/product-images/test.jpg', staleSession);
    assert.strictEqual(cleanupRes.success, false, 'deleteStorageImageByUrl must return success: false when unauthenticated');

    // 4. updateProduct must throw
    let threwUpdate = false;
    try {
      await updateProduct('prod-1', { price: 2000 }, staleSession);
    } catch (e) {
      threwUpdate = true;
      assert.ok(e.message.includes('Not authenticated'));
    }
    assert.strictEqual(threwUpdate, true, 'updateProduct must throw when unauthenticated');

    // 5. deleteProductById must throw
    let threwDelete = false;
    try {
      await deleteProductById('prod-1', staleSession);
    } catch (e) {
      threwDelete = true;
      assert.ok(e.message.includes('Not authenticated'));
    }
    assert.strictEqual(threwDelete, true, 'deleteProductById must throw when unauthenticated');

    // 6. toggleFeatured must throw
    let threwToggle = false;
    try {
      await toggleFeatured('prod-1', true, staleSession);
    } catch (e) {
      threwToggle = true;
      assert.ok(e.message.includes('Not authenticated'));
    }
    assert.strictEqual(threwToggle, true, 'toggleFeatured must throw when unauthenticated');

    assert.strictEqual(mockClient.uploadCalls, 0, 'No upload executed');
    assert.strictEqual(mockClient.insertCalls, 0, 'No insert executed');
    assert.strictEqual(mockClient.updateCalls, 0, 'No update executed');
    assert.strictEqual(mockClient.deleteCalls, 0, 'No delete executed');

    reportPass(5, 'All mutations fail safely when client has no authenticated session');
  } catch (err) {
    reportFail(5, 'Missing session security rejection', err);
  } finally {
    delete global.getSupabaseClient;
  }

  // ─────────────────────────────────────────────────────────────
  // 6. SIGNED_OUT event stops subsequent mutations
  // ─────────────────────────────────────────────────────────────
  resetSupabaseModule();
  try {
    const mockClient = createMockSupabaseClient({
      session: { access_token: 'token_active', user: { id: 'admin-1' } }
    });
    global.getSupabaseClient = () => mockClient;

    const { uploadProductImage } = require(supabasePath);

    // Initial upload works
    await uploadProductImage(makeFile('jersey_pre_logout.jpg'), null);

    // Sign out event occurs
    mockClient.fireAuthStateChange('SIGNED_OUT', null);

    // Next upload must fail
    let threw = false;
    try {
      await uploadProductImage(makeFile('jersey_post_logout.jpg'), null);
    } catch (e) {
      threw = true;
      assert.ok(e.message.includes('Not authenticated') || e.message.includes('session missing'));
    }

    assert.ok(threw, 'Upload after SIGNED_OUT must throw');
    assert.strictEqual(mockClient.uploadCalls, 1, 'Post-logout upload must not reach storage');
    reportPass(6, 'Upload fails immediately after SIGNED_OUT event');
  } catch (err) {
    reportFail(6, 'SIGNED_OUT event handling', err);
  } finally {
    delete global.getSupabaseClient;
  }

  // ─────────────────────────────────────────────────────────────
  // 7. Storage error (invalid_token) propagates cleanly
  // ─────────────────────────────────────────────────────────────
  resetSupabaseModule();
  try {
    const mockClient = createMockSupabaseClient({
      session: { access_token: 'token_ok', user: { id: 'admin-1' } },
      uploadError: 'invalid_token'
    });
    global.getSupabaseClient = () => mockClient;

    const { uploadProductImage } = require(supabasePath);
    let threw = false;

    try {
      await uploadProductImage(makeFile('jersey.jpg'), null);
    } catch (e) {
      threw = true;
      assert.ok(e.message.includes('invalid_token') || e.message.includes('Image upload failed'),
        `Unexpected error: ${e.message}`);
    }

    assert.ok(threw, 'Storage error must propagate to caller');
    reportPass(7, 'Storage error (e.g. invalid_token) propagates with clear message');
  } catch (err) {
    reportFail(7, 'Storage error propagation', err);
  } finally {
    delete global.getSupabaseClient;
  }

  // ─────────────────────────────────────────────────────────────
  // 8. Invalid MIME types are rejected before storage or session check
  // ─────────────────────────────────────────────────────────────
  resetSupabaseModule();
  try {
    const mockClient = createMockSupabaseClient({
      session: { access_token: 'token_ok', user: { id: 'admin-1' } }
    });
    global.getSupabaseClient = () => mockClient;

    const { uploadProductImage } = require(supabasePath);
    let threw = false;

    try {
      await uploadProductImage(makeFile('malicious.exe', 'application/x-msdownload', 1024), null);
    } catch (e) {
      threw = true;
      assert.ok(e.message.includes('Invalid image format'), `Unexpected error: ${e.message}`);
    }

    assert.ok(threw, 'Invalid MIME type must throw');
    assert.strictEqual(mockClient.uploadCalls, 0, 'Storage upload must not be called for invalid MIME');
    reportPass(8, 'Invalid MIME type rejected before upload');
  } catch (err) {
    reportFail(8, 'Invalid MIME rejection', err);
  } finally {
    delete global.getSupabaseClient;
  }

  // ─────────────────────────────────────────────────────────────
  // 9. Files exceeding 10 MB are rejected before upload
  // ─────────────────────────────────────────────────────────────
  resetSupabaseModule();
  try {
    const mockClient = createMockSupabaseClient({
      session: { access_token: 'token_ok', user: { id: 'admin-1' } }
    });
    global.getSupabaseClient = () => mockClient;

    const { uploadProductImage } = require(supabasePath);
    let threw = false;

    try {
      await uploadProductImage(makeFile('giant.jpg', 'image/jpeg', 11 * 1024 * 1024), null);
    } catch (e) {
      threw = true;
      assert.ok(e.message.includes('10 MB'), `Unexpected error: ${e.message}`);
    }

    assert.ok(threw, 'File exceeding 10 MB must throw');
    assert.strictEqual(mockClient.uploadCalls, 0, 'Storage upload must not be called for oversized file');
    reportPass(9, 'File exceeding 10 MB limit rejected before upload');
  } catch (err) {
    reportFail(9, 'File size limit rejection', err);
  } finally {
    delete global.getSupabaseClient;
  }

  // ─────────────────────────────────────────────────────────────
  // 10. updateProduct & toggleFeatured self-heal with live session
  // ─────────────────────────────────────────────────────────────
  resetSupabaseModule();
  try {
    const liveSession = { access_token: 'live_token_update', user: { id: 'admin-1' } };
    const mockClient = createMockSupabaseClient({ session: liveSession });
    global.getSupabaseClient = () => mockClient;

    const { updateProduct, toggleFeatured } = require(supabasePath);
    const staleSession = { access_token: 'stale_token_update' };

    // Update with null session
    const updated = await updateProduct('prod-100', { price: 29000 }, null);
    assert.strictEqual(updated.price, 29000, 'updateProduct with null session arg must succeed');

    // Update with stale session
    const updatedStale = await updateProduct('prod-100', { price: 31000 }, staleSession);
    assert.strictEqual(updatedStale.price, 31000, 'updateProduct with stale session arg must succeed');

    // Toggle featured with stale session
    await toggleFeatured('prod-100', true, staleSession);

    assert.strictEqual(mockClient.updateCalls, 3, 'All 3 update operations must execute');
    reportPass(10, 'updateProduct and toggleFeatured succeed using live session over null or stale session arg');
  } catch (err) {
    reportFail(10, 'updateProduct and toggleFeatured live session', err);
  } finally {
    delete global.getSupabaseClient;
  }

  // ─────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────
  console.log('\n================================================================');
  console.log(`STAGE 5O TEST RESULTS : ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled runner error:', err);
  process.exit(1);
});
