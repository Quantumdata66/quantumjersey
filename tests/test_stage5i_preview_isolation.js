// ============================================================
// Quantum Jersey — Stage 5I: Preview Supabase Isolation Test Suite
// ============================================================

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const configHandler = require('../api/config');
const { generateConfigScript, APPROVED_SANDBOX_SUPABASE_URL, APPROVED_PRODUCTION_SUPABASE_URL } = configHandler;

console.log('================================================================');
console.log('QUANTUM JERSEY : STAGE 5I PREVIEW SUPABASE ISOLATION SUITE');
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

async function runStage5iTestSuite() {
  const mockSandboxUrl = 'https://lsembtxswybbzxvjinmp.supabase.co';
  const mockSandboxAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock_sandbox_anon_key_preview';
  const mockServiceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.SECRET_SERVICE_ROLE_KEY_DO_NOT_EXPOSE';
  const mockPaystackSecret = 'sk_test_99887766554433221100mocksecret';

  // ─────────────────────────────────────────────────────────────
  // 1. Preview configuration returns sandbox URL and public anonymous key
  // ─────────────────────────────────────────────────────────────
  try {
    const previewEnv = {
      VERCEL_ENV: 'preview',
      SUPABASE_URL: mockSandboxUrl,
      SUPABASE_ANON_KEY: mockSandboxAnonKey,
      SUPABASE_SERVICE_ROLE_KEY: mockServiceRoleKey,
      PAYSTACK_SECRET_KEY: mockPaystackSecret
    };

    const res = generateConfigScript(previewEnv);
    assert.strictEqual(res.statusCode, 200, 'Preview config should return HTTP 200');
    assert.ok(res.content.includes('window.QJ_ENV = "preview"'), 'Emits preview environment marker');
    assert.ok(res.content.includes(`window.QJ_SUPABASE_URL = "${mockSandboxUrl}"`), 'Emits sandbox Supabase URL');
    assert.ok(res.content.includes(`window.QJ_SUPABASE_ANON_KEY = "${mockSandboxAnonKey}"`), 'Emits public sandbox anon key');
    assert.ok(!res.content.includes(mockServiceRoleKey), 'Must not emit service role key');
    assert.ok(!res.content.includes(mockPaystackSecret), 'Must not emit Paystack secret key');

    reportPass(1, 'Preview configuration returns sandbox URL and public anonymous key with HTTP 200');
  } catch (err) {
    reportFail(1, 'Preview configuration failed', err);
  }

  // ─────────────────────────────────────────────────────────────
  // 2. Missing Preview configuration fails closed (HTTP 500 & error token)
  // ─────────────────────────────────────────────────────────────
  try {
    // Missing anon key
    const missingAnon = generateConfigScript({
      VERCEL_ENV: 'preview',
      SUPABASE_URL: mockSandboxUrl
    });
    assert.strictEqual(missingAnon.statusCode, 500, 'Missing anon key should fail with HTTP 500');
    assert.ok(missingAnon.content.includes('window.QJ_CONFIG_ERROR'), 'Emits config error token');
    assert.ok(missingAnon.content.includes('YOUR_PREVIEW_CONFIG_FAILED'), 'Disables fallback to production URL');

    // Missing URL
    const missingUrl = generateConfigScript({
      VERCEL_ENV: 'preview',
      SUPABASE_ANON_KEY: mockSandboxAnonKey
    });
    assert.strictEqual(missingUrl.statusCode, 500, 'Missing URL should fail with HTTP 500');
    assert.ok(missingUrl.content.includes('window.QJ_CONFIG_ERROR'), 'Emits config error token');
    assert.ok(missingUrl.content.includes('YOUR_PREVIEW_CONFIG_FAILED'), 'Disables fallback to production URL');

    // Completely empty env
    const emptyPreview = generateConfigScript({
      VERCEL_ENV: 'preview'
    });
    assert.strictEqual(emptyPreview.statusCode, 500, 'Empty preview env should fail with HTTP 500');
    assert.ok(emptyPreview.content.includes('window.QJ_CONFIG_ERROR'), 'Emits config error token');

    reportPass(2, 'Missing Preview configuration fails closed with HTTP 500 and prevents silent fallback');
  } catch (err) {
    reportFail(2, 'Missing preview config test failed', err);
  }

  // ─────────────────────────────────────────────────────────────
  // 3. An unexpected or untrusted Supabase URL is rejected (HTTP 500)
  // ─────────────────────────────────────────────────────────────
  try {
    // Attacker-controlled Supabase URL
    const hostileUrl = generateConfigScript({
      VERCEL_ENV: 'preview',
      SUPABASE_URL: 'https://attacker-project.supabase.co',
      SUPABASE_ANON_KEY: mockSandboxAnonKey
    });
    assert.strictEqual(hostileUrl.statusCode, 500, 'Hostile Supabase URL rejected with HTTP 500');
    assert.ok(hostileUrl.content.includes('Untrusted or invalid Preview Supabase URL'), 'Specific error message');
    assert.ok(hostileUrl.content.includes('YOUR_PREVIEW_CONFIG_FAILED'), 'Disables fallback to production URL');

    // Accidental production URL in preview
    const productionUrlInPreview = generateConfigScript({
      VERCEL_ENV: 'preview',
      SUPABASE_URL: 'https://pbuntpobwsaddoexpmej.supabase.co',
      SUPABASE_ANON_KEY: mockSandboxAnonKey
    });
    assert.strictEqual(productionUrlInPreview.statusCode, 500, 'Production URL rejected in preview mode');
    assert.ok(productionUrlInPreview.content.includes('YOUR_PREVIEW_CONFIG_FAILED'), 'Disables fallback');

    reportPass(3, 'Unexpected or untrusted Supabase URL in Preview is rejected with HTTP 500');
  } catch (err) {
    reportFail(3, 'Untrusted Supabase URL test failed', err);
  }

  // ─────────────────────────────────────────────────────────────
  // 4. Production does not receive sandbox configuration
  // ─────────────────────────────────────────────────────────────
  try {
    const prodEnv = {
      VERCEL_ENV: 'production',
      SUPABASE_URL: mockSandboxUrl,
      SUPABASE_ANON_KEY: mockSandboxAnonKey,
      SUPABASE_SERVICE_ROLE_KEY: mockServiceRoleKey
    };

    const res = generateConfigScript(prodEnv);
    assert.strictEqual(res.statusCode, 200, 'Production config returns HTTP 200');
    assert.ok(res.content.includes('window.QJ_ENV = "production"'), 'Emits production environment marker');
    assert.ok(!res.content.includes(mockSandboxUrl), 'Production must not contain sandbox URL');
    assert.ok(!res.content.includes(mockSandboxAnonKey), 'Production must not contain sandbox anon key');
    assert.ok(!res.content.includes('window.QJ_SUPABASE_URL'), 'Production leaves QJ_SUPABASE_URL unset to use existing defaults');

    reportPass(4, 'Production environment does not receive sandbox configuration and leaves defaults intact');
  } catch (err) {
    reportFail(4, 'Production configuration test failed', err);
  }

  // ─────────────────────────────────────────────────────────────
  // 5. No service-role or Paystack secret is emitted in any response
  // ─────────────────────────────────────────────────────────────
  try {
    const testEnvironments = [
      { VERCEL_ENV: 'preview', SUPABASE_URL: mockSandboxUrl, SUPABASE_ANON_KEY: mockSandboxAnonKey },
      { VERCEL_ENV: 'preview' }, // broken preview
      { VERCEL_ENV: 'production' },
      { VERCEL_ENV: 'development' },
      { VERCEL_ENV: 'unknown-env' }
    ];

    testEnvironments.forEach(env => {
      const fullEnv = {
        ...env,
        SUPABASE_SERVICE_ROLE_KEY: mockServiceRoleKey,
        PAYSTACK_SECRET_KEY: mockPaystackSecret
      };
      const res = generateConfigScript(fullEnv);
      assert.ok(!res.content.includes(mockServiceRoleKey), `Service role key leaked in VERCEL_ENV=${env.VERCEL_ENV}`);
      assert.ok(!res.content.includes(mockPaystackSecret), `Paystack secret leaked in VERCEL_ENV=${env.VERCEL_ENV}`);
      assert.ok(!res.content.toLowerCase().includes('service_role'), `Service role string found in VERCEL_ENV=${env.VERCEL_ENV}`);
    });

    reportPass(5, 'Zero server-side secrets (service-role or Paystack) emitted across any environment');
  } catch (err) {
    reportFail(5, 'Secret leakage test failed', err);
  }

  // ─────────────────────────────────────────────────────────────
  // 6. Unknown environment values fail safely
  // ─────────────────────────────────────────────────────────────
  try {
    const unknownEnvs = ['staging', 'test-cluster', 'qa', 'malicious_input'];

    unknownEnvs.forEach(envName => {
      const res = generateConfigScript({ VERCEL_ENV: envName, SUPABASE_URL: mockSandboxUrl, SUPABASE_ANON_KEY: mockSandboxAnonKey });
      assert.strictEqual(res.statusCode, 500, `Unknown env "${envName}" should return HTTP 500`);
      assert.ok(res.content.includes('window.QJ_CONFIG_ERROR = "Unrecognized environment"'), `Emits error token for "${envName}"`);
      assert.ok(res.content.includes('YOUR_PREVIEW_CONFIG_FAILED'), 'Disables fallback on unknown env');
      assert.ok(!res.content.includes(mockSandboxUrl), `Sandbox URL not emitted for unknown env "${envName}"`);
    });

    reportPass(6, 'Unknown environment values fail safely with HTTP 500 without guessing');
  } catch (err) {
    reportFail(6, 'Unknown environment test failed', err);
  }

  // ─────────────────────────────────────────────────────────────
  // 7. All nine HTML entry points load config script before js/supabase.js
  // ─────────────────────────────────────────────────────────────
  try {
    const entryPoints = [
      'index.html',
      'catalog.html',
      'product.html',
      'boots.html',
      'jerseys.html',
      'sportswear.html',
      'review.html',
      'contact.html',
      'admin.html'
    ];

    entryPoints.forEach(file => {
      const filePath = path.resolve(__dirname, '..', file);
      assert.ok(fs.existsSync(filePath), `HTML entry point ${file} must exist`);
      const content = fs.readFileSync(filePath, 'utf8');

      const configIdx = content.indexOf('<script src="/api/config.js"></script>');
      const supabaseIdx = content.indexOf('<script src="js/supabase.js"></script>');

      assert.ok(configIdx !== -1, `${file} must include <script src="/api/config.js"></script>`);
      assert.ok(supabaseIdx !== -1, `${file} must include <script src="js/supabase.js"></script>`);
      assert.ok(configIdx < supabaseIdx, `${file}: config script (pos ${configIdx}) must appear before supabase.js (pos ${supabaseIdx})`);
    });

    reportPass(7, 'All 9 HTML entry points correctly load /api/config.js immediately before js/supabase.js');
  } catch (err) {
    reportFail(7, 'HTML entry points verification failed', err);
  }

  // ─────────────────────────────────────────────────────────────
  // 8. Preview configuration failure cannot fall back to hardcoded Production URL
  // ─────────────────────────────────────────────────────────────
  try {
    // Simulate browser global scope evaluation of failed preview config
    const failedPreview = generateConfigScript({ VERCEL_ENV: 'preview' });
    assert.strictEqual(failedPreview.statusCode, 500);

    const mockWindow = {};
    // Evaluate generated script content within mock context
    const scriptFn = new Function('window', failedPreview.content);
    scriptFn(mockWindow);

    assert.strictEqual(mockWindow.QJ_ENV, 'preview');
    assert.strictEqual(mockWindow.QJ_CONFIG_ERROR, 'Missing Preview Supabase configuration');
    assert.strictEqual(mockWindow.QJ_SUPABASE_URL, 'YOUR_PREVIEW_CONFIG_FAILED');

    // Test js/supabase.js fallback logic with this mockWindow
    const testSupabaseUrl = mockWindow.QJ_SUPABASE_URL || 'https://pbuntpobwsaddoexpmej.supabase.co';
    assert.notStrictEqual(testSupabaseUrl, 'https://pbuntpobwsaddoexpmej.supabase.co', 'Must not fall back to production URL');
    assert.ok(testSupabaseUrl.startsWith('YOUR_'), 'Triggers built-in Supabase unconfigured guard');

    reportPass(8, 'Preview configuration failure safely disables fallback and prevents connecting to Production');
  } catch (err) {
    reportFail(8, 'Fallback suppression test failed', err);
  }

  // ─────────────────────────────────────────────────────────────
  // 9. Serverless HTTP Handler headers, cache policy, and methods
  // ─────────────────────────────────────────────────────────────
  try {
    let capturedStatus = 0;
    let capturedHeaders = {};
    let capturedBody = '';

    const mockRes = {
      setHeader: (k, v) => { capturedHeaders[k.toLowerCase()] = v; },
      status: (s) => {
        capturedStatus = s;
        return {
          send: (body) => { capturedBody = body; }
        };
      }
    };

    // Test GET request
    configHandler({ method: 'GET' }, mockRes);
    assert.ok(capturedHeaders['content-type'].includes('application/javascript'), 'Content-Type must be JavaScript');
    assert.ok(capturedHeaders['cache-control'].includes('no-store'), 'Cache-Control must contain no-store');
    assert.strictEqual(capturedHeaders['x-content-type-options'], 'nosniff', 'Must include nosniff');

    // Test POST request (should be 405 Method Not Allowed)
    configHandler({ method: 'POST' }, mockRes);
    assert.strictEqual(capturedStatus, 405, 'POST must be rejected with 405 Method Not Allowed');

    reportPass(9, 'Serverless handler enforces GET/HEAD, JavaScript content-type, nosniff, and no-store cache policy');
  } catch (err) {
    reportFail(9, 'Serverless HTTP handler test failed', err);
  }

  // ─────────────────────────────────────────────────────────────
  // 10. Preview network failure: js/supabase.js refuses Production fallback on Preview host
  // ─────────────────────────────────────────────────────────────
  try {
    const supabaseCode = fs.readFileSync(path.resolve(__dirname, '../js/supabase.js'), 'utf8');

    function createBrowserContext(hostname, preconfiguredWindow = {}) {
      let createdClient = null;
      const mockSupabaseSdk = {
        createClient: (url, key) => {
          createdClient = { url, key };
          return createdClient;
        }
      };

      const mockWindow = {
        location: { hostname },
        ...preconfiguredWindow
      };

      const runScript = new Function(
        'window',
        'supabase',
        'console',
        `${supabaseCode}\nreturn { getSupabaseClient, getSUPABASE_URL: () => SUPABASE_URL, getSUPABASE_ANON_KEY: () => SUPABASE_ANON_KEY };`
      );

      const exports = runScript(mockWindow, mockSupabaseSdk, { warn: () => {}, error: () => {}, log: () => {} });
      return { mockWindow, exports, getCreatedClient: () => createdClient };
    }

    // A Preview host where /api/config.js failed to load entirely (network drop / timeout)
    const previewCtx = createBrowserContext('quantumjersey-preview-branch.vercel.app', {});
    assert.strictEqual(previewCtx.exports.getSUPABASE_URL(), 'YOUR_PREVIEW_CONFIG_FAILED', 'Must set fallback error token on preview host');
    assert.strictEqual(previewCtx.exports.getSUPABASE_ANON_KEY(), 'DISABLED', 'Must disable anon key on preview host');
    const client = previewCtx.exports.getSupabaseClient();
    assert.strictEqual(client, null, 'Supabase client must not initialize on failed preview config');
    assert.strictEqual(previewCtx.getCreatedClient(), null, 'Must never initialize Production Supabase client');

    reportPass(10, 'Preview network failure: js/supabase.js refuses Production fallback and fails closed on preview host');
  } catch (err) {
    reportFail(10, 'Preview network failure simulation test failed', err);
  }

  // ─────────────────────────────────────────────────────────────
  // 11. Non-executable /api/config.js response (e.g. 502 HTML) fails closed in Preview
  // ─────────────────────────────────────────────────────────────
  try {
    const supabaseCode = fs.readFileSync(path.resolve(__dirname, '../js/supabase.js'), 'utf8');

    function createBrowserContext(hostname, preconfiguredWindow = {}) {
      let createdClient = null;
      const mockSupabaseSdk = {
        createClient: (url, key) => {
          createdClient = { url, key };
          return createdClient;
        }
      };

      const mockWindow = {
        location: { hostname },
        ...preconfiguredWindow
      };

      const runScript = new Function(
        'window',
        'supabase',
        'console',
        `${supabaseCode}\nreturn { getSupabaseClient, getSUPABASE_URL: () => SUPABASE_URL, getSUPABASE_ANON_KEY: () => SUPABASE_ANON_KEY };`
      );

      const exports = runScript(mockWindow, mockSupabaseSdk, { warn: () => {}, error: () => {}, log: () => {} });
      return { mockWindow, exports, getCreatedClient: () => createdClient };
    }

    // Simulate Vercel edge returning an HTML error page (502/504)
    const htmlResponse = '<!DOCTYPE html><html><body>502 Bad Gateway</body></html>';
    let scriptExecuted = false;
    try {
      // In browser, <script src="/api/config.js"> evaluating HTML throws SyntaxError
      new Function('window', htmlResponse)({});
      scriptExecuted = true;
    } catch (syntaxErr) {
      // Expected syntax error — script did not execute, leaving window unconfigured
    }
    assert.strictEqual(scriptExecuted, false, 'HTML error payload must fail script parsing');

    // Browser proceeds to load js/supabase.js on preview host with unconfigured window
    const preview502Ctx = createBrowserContext('quantumjersey-stage3-verify.vercel.app', {});
    assert.strictEqual(preview502Ctx.exports.getSUPABASE_URL(), 'YOUR_PREVIEW_CONFIG_FAILED');
    assert.strictEqual(preview502Ctx.exports.getSupabaseClient(), null);
    assert.strictEqual(preview502Ctx.getCreatedClient(), null, 'Production client must never be initialized on 502 HTML response');

    reportPass(11, 'Non-executable /api/config.js response (502 HTML) fails closed without initializing Production client');
  } catch (err) {
    reportFail(11, 'Non-executable /api/config.js test failed', err);
  }

  // ─────────────────────────────────────────────────────────────
  // 12. Host-based environment preservation: Production and Localhost behave normally
  // ─────────────────────────────────────────────────────────────
  try {
    const supabaseCode = fs.readFileSync(path.resolve(__dirname, '../js/supabase.js'), 'utf8');

    function createBrowserContext(hostname, preconfiguredWindow = {}) {
      let createdClient = null;
      const mockSupabaseSdk = {
        createClient: (url, key) => {
          createdClient = { url, key };
          return createdClient;
        }
      };

      const mockWindow = {
        location: { hostname },
        ...preconfiguredWindow
      };

      const runScript = new Function(
        'window',
        'supabase',
        'console',
        `${supabaseCode}\nreturn { getSupabaseClient, getSUPABASE_URL: () => SUPABASE_URL, getSUPABASE_ANON_KEY: () => SUPABASE_ANON_KEY };`
      );

      const exports = runScript(mockWindow, mockSupabaseSdk, { warn: () => {}, error: () => {}, log: () => {} });
      return { mockWindow, exports, getCreatedClient: () => createdClient };
    }

    // 1. Production host: retains hardcoded Production Supabase credentials
    const prodCtx = createBrowserContext('quantumjersey.vercel.app', { QJ_ENV: 'production' });
    assert.strictEqual(prodCtx.exports.getSUPABASE_URL(), APPROVED_PRODUCTION_SUPABASE_URL);
    const prodClient = prodCtx.exports.getSupabaseClient();
    assert.ok(prodClient !== null, 'Production client should initialize on production host');
    assert.strictEqual(prodCtx.getCreatedClient().url, APPROVED_PRODUCTION_SUPABASE_URL);

    // 2. Local development host (localhost): retains normal development defaults
    const localCtx = createBrowserContext('localhost', {});
    assert.strictEqual(localCtx.exports.getSUPABASE_URL(), APPROVED_PRODUCTION_SUPABASE_URL);
    const localClient = localCtx.exports.getSupabaseClient();
    assert.ok(localClient !== null, 'Localhost should initialize normal default client');

    // 3. Successful Preview config: correctly overrides with sandbox URL
    const previewSuccessCtx = createBrowserContext('quantumjersey-preview.vercel.app', {
      QJ_ENV: 'preview',
      QJ_SUPABASE_URL: mockSandboxUrl,
      QJ_SUPABASE_ANON_KEY: mockSandboxAnonKey
    });
    assert.strictEqual(previewSuccessCtx.exports.getSUPABASE_URL(), mockSandboxUrl);
    const previewClient = previewSuccessCtx.exports.getSupabaseClient();
    assert.ok(previewClient !== null, 'Preview client initializes with sandbox config');
    assert.strictEqual(previewSuccessCtx.getCreatedClient().url, mockSandboxUrl);

    reportPass(12, 'Host-based preservation: Production and Localhost initialize normally while Preview is strictly isolated');
  } catch (err) {
    reportFail(12, 'Host-based preservation test failed', err);
  }

  // ─────────────────────────────────────────────────────────────
  // 13. Regression: Static DEFAULT_PRODUCTS fallback processes without ReferenceError
  // ─────────────────────────────────────────────────────────────
  try {
    // 1. Loading js/products.js executes top-level registerProducts(DEFAULT_PRODUCTS) without ReferenceError
    let productsModule;
    assert.doesNotThrow(() => {
      delete require.cache[require.resolve('../js/products.js')];
      productsModule = require('../js/products.js');
    }, 'Loading js/products.js must not throw ReferenceError during DEFAULT_PRODUCTS registration');

    assert.ok(productsModule, 'products.js module loaded successfully');
    assert.ok(Array.isArray(productsModule.DEFAULT_PRODUCTS), 'DEFAULT_PRODUCTS is exported array');
    assert.strictEqual(productsModule.DEFAULT_PRODUCTS.length, 14, 'All 14 default products are loaded');

    // 2. Verify getProductById retrieves registered static fallback products
    const sampleBoot = productsModule.getProductById('boots-001');
    assert.ok(sampleBoot, 'Sample boots product retrieved from static registry');
    assert.strictEqual(sampleBoot.name, 'Phantom Strike Pro');

    const sampleJersey = productsModule.getProductById('jersey-001');
    assert.ok(sampleJersey, 'Sample jersey product retrieved from static registry');
    assert.strictEqual(sampleJersey.name, 'Nigeria Home Jersey 2024');

    // 3. Verify browser-environment script evaluation executes cleanly
    const productsSource = fs.readFileSync(path.resolve(__dirname, '../js/products.js'), 'utf8');
    assert.doesNotThrow(() => {
      const runBrowserScript = new Function('window', productsSource);
      runBrowserScript({});
    }, 'Browser script evaluation must not throw ReferenceError');

    // 4. Verify parseProductVersions operates correctly on versioned and unversioned content
    const verResult = productsModule.parseProductVersions('Test Jersey\n\n<!--QJ_VERSIONS:{"fan":{"price":28000,"sizes":["M","L"]}}-->');
    assert.strictEqual(verResult.isVersioned, true, 'parseProductVersions parses version metadata');
    assert.strictEqual(verResult.versions.fan.price, 28000);

    const nonVerResult = productsModule.parseProductVersions('Plain item without versions');
    assert.strictEqual(nonVerResult.isVersioned, false);
    assert.strictEqual(nonVerResult.isCorrupt, false);

    reportPass(13, 'Static DEFAULT_PRODUCTS fallback processes without ReferenceError (VERSION_METADATA_REGEX TDZ resolved)');
  } catch (err) {
    reportFail(13, 'Static DEFAULT_PRODUCTS fallback regression test failed', err);
  }

  // ─────────────────────────────────────────────────────────────
  // Final Results
  // ─────────────────────────────────────────────────────────────
  console.log('\n================================================================');
  console.log(`STAGE 5I TEST RESULTS: ${passed} / ${passed + failed} PASSED (${Math.round((passed / (passed + failed)) * 100)}%)`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runStage5iTestSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
