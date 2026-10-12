// ============================================================
// Quantum Jersey — Stage 5H Origin Validation Hardening Regression Suite
// ============================================================

const crypto = require('crypto');
const validator = require('../api/_lib/validator');
const initHandler = require('../api/paystack/initialize');
const verifyHandler = require('../api/paystack/verify');
const webhookHandler = require('../api/paystack/webhook');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(num, description, condition, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ [Test ${num}] ${description}`);
  } else {
    failedTests++;
    console.error(`  ✗ [Test ${num}] FAILED: ${description}`);
    if (details) console.error(`    Details: ${details}`);
  }
}

// Clean async helper to manage scoped environment variables
async function withEnv(tempEnv, fn) {
  const originalEnv = {};
  for (const key of Object.keys(tempEnv)) {
    originalEnv[key] = process.env[key];
    if (tempEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = tempEnv[key];
    }
  }
  try {
    return await fn();
  } finally {
    for (const key of Object.keys(tempEnv)) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
  }
}

function createMockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(k, v) {
      this.headers[k] = v;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    }
  };
}

// Global fetch mock to prevent unmocked external requests during unit tests
const originalFetch = global.fetch;
global.fetch = async (url, options = {}) => {
  const urlStr = String(url);
  // Mock Supabase payment_attempts lookup
  if (urlStr.includes('/rest/v1/payment_attempts')) {
    return {
      ok: true,
      status: 200,
      json: async () => []
    };
  }
  // Default mock response
  return {
    ok: true,
    status: 200,
    json: async () => ({})
  };
};

async function runTests() {
  console.log('\n=== Quantum Jersey Stage 5H: Origin Validation Hardening Suite ===\n');

  // ─────────────────────────────────────────────────────────────
  // Scenario 1: Canonical production origin accepted
  // ─────────────────────────────────────────────────────────────
  console.log('Scenario 1: Canonical production origin accepted');

  await withEnv({ VERCEL_ENV: 'production' }, async () => {
    const res = validator.validateAppOrigin('https://quantumjersey.vercel.app');
    assert(1.1, 'validateAppOrigin accepts canonical production origin in production',
      res.valid === true && res.origin === 'https://quantumjersey.vercel.app'
    );

    const reqCheck = validator.validateRequestOrigin({
      headers: { origin: 'https://quantumjersey.vercel.app' }
    });
    assert(1.2, 'validateRequestOrigin accepts canonical production origin in production',
      reqCheck.valid === true && reqCheck.origin === 'https://quantumjersey.vercel.app' && reqCheck.isPresent === true
    );
  });

  // ─────────────────────────────────────────────────────────────
  // Scenario 2: Valid Preview origin accepted with valid config and test key
  // ─────────────────────────────────────────────────────────────
  console.log('\nScenario 2: Valid Preview origin accepted with valid configuration');

  await withEnv({
    VERCEL_ENV: 'preview',
    PAYSTACK_SECRET_KEY: 'sk_test_preview_key_123',
    VERCEL_URL: 'quantumjersey-git-stage5h-quantumdata66.vercel.app'
  }, async () => {
    const res = validator.validateAppOrigin('https://quantumjersey-git-stage5h-quantumdata66.vercel.app');
    assert(2.1, 'validateAppOrigin accepts matching preview origin when VERCEL_URL is set',
      res.valid === true && res.origin === 'https://quantumjersey-git-stage5h-quantumdata66.vercel.app'
    );

    const reqCheck = validator.validateRequestOrigin({
      headers: { origin: 'https://quantumjersey-git-stage5h-quantumdata66.vercel.app' }
    });
    assert(2.2, 'validateRequestOrigin accepts matching preview origin with VERCEL_URL and sk_test_',
      reqCheck.valid === true && reqCheck.origin === 'https://quantumjersey-git-stage5h-quantumdata66.vercel.app'
    );
  });

  await withEnv({
    VERCEL_ENV: 'preview',
    PAYSTACK_SECRET_KEY: 'sk_test_preview_key_123',
    VERCEL_URL: undefined,
    APP_BASE_URL: 'https://quantumjersey-configured-branch.vercel.app'
  }, async () => {
    const res = validator.validateAppOrigin('https://quantumjersey-configured-branch.vercel.app');
    assert(2.3, 'validateAppOrigin accepts preview origin when APP_BASE_URL is explicitly configured',
      res.valid === true && res.origin === 'https://quantumjersey-configured-branch.vercel.app'
    );

    const reqCheck = validator.validateRequestOrigin({
      headers: { origin: 'https://quantumjersey-configured-branch.vercel.app' }
    });
    assert(2.4, 'validateRequestOrigin accepts preview origin when APP_BASE_URL is configured',
      reqCheck.valid === true && reqCheck.origin === 'https://quantumjersey-configured-branch.vercel.app'
    );
  });

  // ─────────────────────────────────────────────────────────────
  // Scenario 3: Unapproved browser Origin rejected by initialize and verify before side effects
  // ─────────────────────────────────────────────────────────────
  console.log('\nScenario 3: Unapproved browser Origin rejected with HTTP 403 before side effects');

  await withEnv({
    VERCEL_ENV: 'production',
    PAYSTACK_SECRET_KEY: 'sk_test_mock'
  }, async () => {
    // Test POST /api/paystack/initialize with unapproved Origin
    const initReq = {
      method: 'POST',
      headers: {
        origin: 'https://evil-cross-site-attacker.com'
      },
      body: {
        customer: { name: 'Test', email: 'test@example.com', phone: '08012345678', delivery_state: 'Lagos', delivery_city: 'Ikeja', delivery_address: '123 Test St' },
        items: [{ id: 'b1111111-1111-4111-8111-111111111111', quantity: 1, size: 'M' }]
      }
    };
    const initRes = createMockRes();
    await initHandler(initReq, initRes);

    assert(3.1, 'POST /api/paystack/initialize rejects unapproved Origin with HTTP 403 Forbidden',
      initRes.statusCode === 403 && initRes.body?.error?.includes('Forbidden: Request Origin rejected'),
      JSON.stringify(initRes.body)
    );

    // Test POST /api/paystack/verify with unapproved Origin
    const verifyReq = {
      method: 'POST',
      headers: {
        origin: 'https://evil-cross-site-attacker.com'
      },
      body: {
        reference: 'QJ-PAY-1234567890-TEST'
      }
    };
    const verifyRes = createMockRes();
    await verifyHandler(verifyReq, verifyRes);

    assert(3.2, 'POST /api/paystack/verify rejects unapproved Origin with HTTP 403 Forbidden',
      verifyRes.statusCode === 403 && verifyRes.body?.error?.includes('Forbidden: Request Origin rejected'),
      JSON.stringify(verifyRes.body)
    );
  });

  // ─────────────────────────────────────────────────────────────
  // Scenario 4: Malformed Origin rejected with HTTP 403
  // ─────────────────────────────────────────────────────────────
  console.log('\nScenario 4: Malformed Origin rejected with HTTP 403');

  await withEnv({ VERCEL_ENV: 'production' }, async () => {
    const malformedValues = ['not-a-url', '://invalid', 'null', 'ftp://quantumjersey.vercel.app', 'https://quantumjersey.vercel.app:8443'];

    for (let i = 0; i < malformedValues.length; i++) {
      const val = malformedValues[i];
      const initReq = {
        method: 'POST',
        headers: { origin: val },
        body: {}
      };
      const initRes = createMockRes();
      await initHandler(initReq, initRes);

      assert(4 + (i + 1) * 0.1, `Malformed Origin "${val}" rejected with HTTP 403 Forbidden by initialize`,
        initRes.statusCode === 403 && initRes.body?.error?.includes('Forbidden'),
        JSON.stringify(initRes.body)
      );

      const verifyReq = {
        method: 'POST',
        headers: { origin: val },
        body: { reference: 'QJ-PAY-123' }
      };
      const verifyRes = createMockRes();
      await verifyHandler(verifyReq, verifyRes);

      assert(4.5 + (i + 1) * 0.05, `Malformed Origin "${val}" rejected with HTTP 403 Forbidden by verify`,
        verifyRes.statusCode === 403 && verifyRes.body?.error?.includes('Forbidden'),
        JSON.stringify(verifyRes.body)
      );
    }
  });

  // ─────────────────────────────────────────────────────────────
  // Scenario 5: Missing Origin handled according to explicitly documented policy
  // ─────────────────────────────────────────────────────────────
  console.log('\nScenario 5: Missing Origin handled according to explicitly documented policy');

  await withEnv({ VERCEL_ENV: 'production' }, async () => {
    const check = validator.validateRequestOrigin({ headers: {} });
    assert(5.1, 'validateRequestOrigin with absent Origin returns valid: true with isPresent: false',
      check.valid === true && check.origin === null && check.isPresent === false
    );

    // Endpoint does not reject with 403 when Origin is absent (proceeds to standard parameter validation)
    const reqWithoutOrigin = {
      method: 'POST',
      headers: {},
      body: {} // empty body will fail at customer validation (400), NOT 403
    };
    const res = createMockRes();
    await initHandler(reqWithoutOrigin, res);

    assert(5.2, 'Initialize endpoint does not block absent Origin with 403; proceeds to request validation (400)',
      res.statusCode === 400 && res.body?.error?.includes('Customer object is required'),
      JSON.stringify(res.body)
    );

    // Verify endpoint also does not block absent Origin with 403 (proceeds to reference validation)
    const verifyWithoutOrigin = {
      method: 'POST',
      headers: {},
      body: {}
    };
    const verifyRes = createMockRes();
    await verifyHandler(verifyWithoutOrigin, verifyRes);

    assert(5.3, 'Verify endpoint does not block absent Origin with 403; proceeds to reference validation (400)',
      verifyRes.statusCode === 400 && verifyRes.body?.error?.includes('A valid payment reference is required'),
      JSON.stringify(verifyRes.body)
    );
  });

  // ─────────────────────────────────────────────────────────────
  // Scenario 6: Unrelated Vercel and deceptive hostnames rejected
  // ─────────────────────────────────────────────────────────────
  console.log('\nScenario 6: Unrelated Vercel and deceptive hostnames rejected');

  await withEnv({
    VERCEL_ENV: 'preview',
    PAYSTACK_SECRET_KEY: 'sk_test_preview_key',
    VERCEL_URL: 'quantumjersey-preview-branch.vercel.app'
  }, async () => {
    const deceptiveOrigins = [
      'https://another-app.vercel.app',
      'https://notquantumjersey.vercel.app',
      'https://quantumjersey.vercel.app.attacker.com',
      'https://attacker-quantumjersey.vercel.app',
      'https://quantumjersey-preview-branch.evil.com',
      'https://sub.quantumjersey-preview-branch.vercel.app',
      'http://quantumjersey-preview-branch.vercel.app'
    ];

    for (let i = 0; i < deceptiveOrigins.length; i++) {
      const o = deceptiveOrigins[i];
      const res = validator.validateAppOrigin(o);
      assert(6 + (i + 1) * 0.1, `Deceptive / unrelated origin "${o}" rejected`,
        res.valid === false,
        JSON.stringify(res)
      );

      const reqRes = validator.validateRequestOrigin({ headers: { origin: o } });
      assert(6.5 + (i + 1) * 0.05, `validateRequestOrigin rejects "${o}"`,
        reqRes.valid === false,
        JSON.stringify(reqRes)
      );
    }
  });

  // ─────────────────────────────────────────────────────────────
  // Scenario 7: Missing, malformed, or conflicting Preview environment values fail closed
  // ─────────────────────────────────────────────────────────────
  console.log('\nScenario 7: Missing, malformed, or conflicting Preview environment values fail closed');

  // 7a. Missing both VERCEL_URL and APP_BASE_URL
  await withEnv({
    VERCEL_ENV: 'preview',
    PAYSTACK_SECRET_KEY: 'sk_test_preview_key',
    VERCEL_URL: undefined,
    APP_BASE_URL: undefined
  }, async () => {
    const res = validator.validateAppOrigin('https://quantumjersey-preview.vercel.app');
    assert(7.1, 'When both VERCEL_URL and APP_BASE_URL are absent, preview origin fails closed',
      res.valid === false && res.error?.includes('requires a valid trusted VERCEL_URL or an explicitly configured APP_BASE_URL'),
      JSON.stringify(res)
    );

    const cb = validator.resolveTrustedCallbackUrl('/cart');
    assert(7.2, 'resolveTrustedCallbackUrl fails closed when both VERCEL_URL and APP_BASE_URL are absent',
      cb.valid === false && cb.error?.includes('requires a valid trusted VERCEL_URL or an explicitly configured APP_BASE_URL'),
      JSON.stringify(cb)
    );
  });

  // 7b. Malformed VERCEL_URL
  await withEnv({
    VERCEL_ENV: 'preview',
    PAYSTACK_SECRET_KEY: 'sk_test_preview_key',
    VERCEL_URL: 'untrusted-domain.com'
  }, async () => {
    const res = validator.validateAppOrigin('https://quantumjersey-preview.vercel.app');
    assert(7.3, 'Malformed VERCEL_URL fails closed',
      res.valid === false && res.error?.includes('VERCEL_URL is malformed or untrusted'),
      JSON.stringify(res)
    );
  });

  // 7c. Malformed APP_BASE_URL
  await withEnv({
    VERCEL_ENV: 'preview',
    PAYSTACK_SECRET_KEY: 'sk_test_preview_key',
    VERCEL_URL: undefined,
    APP_BASE_URL: 'http://quantumjersey-preview.vercel.app' // HTTP protocol in preview
  }, async () => {
    const res = validator.validateAppOrigin('https://quantumjersey-preview.vercel.app');
    assert(7.4, 'Non-HTTPS APP_BASE_URL in preview fails closed',
      res.valid === false && res.error?.includes('must use HTTPS protocol'),
      JSON.stringify(res)
    );
  });

  // 7d. Conflicting settings: VERCEL_URL !== APP_BASE_URL
  await withEnv({
    VERCEL_ENV: 'preview',
    PAYSTACK_SECRET_KEY: 'sk_test_preview_key',
    VERCEL_URL: 'quantumjersey-branch-a.vercel.app',
    APP_BASE_URL: 'https://quantumjersey-branch-b.vercel.app'
  }, async () => {
    const res = validator.validateAppOrigin('https://quantumjersey-branch-a.vercel.app');
    assert(7.5, 'Conflicting VERCEL_URL and APP_BASE_URL hostnames fail closed',
      res.valid === false && res.error?.includes('Configuration conflict'),
      JSON.stringify(res)
    );

    const cb = validator.resolveTrustedCallbackUrl('/cart');
    assert(7.6, 'resolveTrustedCallbackUrl fails closed on configuration conflict',
      cb.valid === false && cb.error?.includes('Configuration conflict'),
      JSON.stringify(cb)
    );
  });

  // ─────────────────────────────────────────────────────────────
  // Scenario 8: Live Paystack key in Preview rejected
  // ─────────────────────────────────────────────────────────────
  console.log('\nScenario 8: Live Paystack key in Preview rejected (fail-closed)');

  await withEnv({
    VERCEL_ENV: 'preview',
    PAYSTACK_SECRET_KEY: 'sk_live_production_key_forbidden_in_preview',
    VERCEL_URL: 'quantumjersey-preview.vercel.app'
  }, async () => {
    const res = validator.validateAppOrigin('https://quantumjersey-preview.vercel.app');
    assert(8.1, 'validateAppOrigin fails closed in preview when live key (sk_live_) is present',
      res.valid === false && res.error?.includes('sk_test_'),
      JSON.stringify(res)
    );

    // Initialize endpoint fails closed before creating records
    const initReq = {
      method: 'POST',
      headers: { origin: 'https://quantumjersey-preview.vercel.app' },
      body: {
        customer: { name: 'Live Key Test', email: 'test@example.com', phone: '08012345678', delivery_state: 'Lagos', delivery_city: 'Ikeja', delivery_address: '123 Fake St' },
        items: [{ id: 'b1111111-1111-4111-8111-111111111111', quantity: 1, size: 'M' }]
      }
    };
    const initRes = createMockRes();
    await initHandler(initReq, initRes);

    assert(8.2, 'POST /api/paystack/initialize fails with HTTP 403 when live key is in preview',
      initRes.statusCode === 403,
      JSON.stringify(initRes.body)
    );
  });

  // ─────────────────────────────────────────────────────────────
  // Scenario 9: Webhook signature verification independent of browser Origin
  // ─────────────────────────────────────────────────────────────
  console.log('\nScenario 9: Webhook signature verification operates independently of browser Origin');

  await withEnv({
    PAYSTACK_SECRET_KEY: 'sk_test_mock_webhook_secret',
    SUPABASE_URL: 'https://mock-project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'mock_service_key'
  }, async () => {
    const secret = 'sk_test_mock_webhook_secret';
    const payload = JSON.stringify({
      event: 'charge.success',
      data: { reference: 'QJ-PAY-NONEXISTENT', amount: 500000, currency: 'NGN' }
    });
    const validSignature = crypto.createHmac('sha512', secret).update(payload).digest('hex');

    // Webhook request without Origin header
    const reqNoOrigin = {
      method: 'POST',
      headers: {
        'x-paystack-signature': validSignature
      },
      rawBody: payload,
      body: JSON.parse(payload)
    };
    const resNoOrigin = createMockRes();
    await webhookHandler(reqNoOrigin, resNoOrigin);

    assert(9.1, 'Webhook with valid HMAC signature and no Origin header processed (HTTP 200 acknowledged)',
      resNoOrigin.statusCode === 200,
      JSON.stringify(resNoOrigin.body)
    );

    // Webhook request with arbitrary Origin header (e.g. from network proxy) still succeeds via HMAC
    const reqWithOrigin = {
      method: 'POST',
      headers: {
        'origin': 'https://some-proxy-or-arbitrary-source.com',
        'x-paystack-signature': validSignature
      },
      rawBody: payload,
      body: JSON.parse(payload)
    };
    const resWithOrigin = createMockRes();
    await webhookHandler(reqWithOrigin, resWithOrigin);

    assert(9.2, 'Webhook authentication relies strictly on HMAC signature, unaffected by Origin header',
      resWithOrigin.statusCode === 200,
      JSON.stringify(resWithOrigin.body)
    );

    // Webhook with invalid HMAC signature rejected with 401 regardless of Origin
    const reqBadSig = {
      method: 'POST',
      headers: {
        'origin': 'https://quantumjersey.vercel.app',
        'x-paystack-signature': 'invalid_signature_hex'
      },
      rawBody: payload,
      body: JSON.parse(payload)
    };
    const resBadSig = createMockRes();
    await webhookHandler(reqBadSig, resBadSig);

    assert(9.3, 'Webhook with invalid HMAC rejected with 401 Unauthorized even if Origin is production',
      resBadSig.statusCode === 401,
      JSON.stringify(resBadSig.body)
    );
  });

  // ─────────────────────────────────────────────────────────────
  // Scenario 10: WhatsApp and bank-transfer checkout remain intact
  // ─────────────────────────────────────────────────────────────
  console.log('\nScenario 10: WhatsApp and bank-transfer checkout remain intact');

  const cartUi = require('../js/cart-ui');

  assert(10.1, 'Storefront cart-ui module exports NIGERIA_STATES, handlers, and reconciliation intact',
    Array.isArray(cartUi.NIGERIA_STATES) && cartUi.NIGERIA_STATES.length === 37 &&
    typeof cartUi.handlePaymentMethodChange === 'function' &&
    typeof cartUi.reconcilePaidCartItems === 'function'
  );

  assert(10.2, 'Public order constraints and bank-transfer schema definitions unchanged',
    typeof validator.validateCustomer === 'function' &&
    typeof validator.validateItems === 'function'
  );

  // ─────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────
  console.log('\n─────────────────────────────────────────────────────────────');
  console.log(`Stage 5H Origin Validation Hardening Suite: ${passedTests} / ${totalTests} PASSED`);
  if (failedTests > 0) {
    console.error(`FAILED: ${failedTests} test(s) failed.`);
    process.exit(1);
  } else {
    console.log('All Stage 5H hardening assertions passed successfully.');
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
