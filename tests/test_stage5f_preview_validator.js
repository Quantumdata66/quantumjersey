// ============================================================
// Quantum Jersey — Stage 5F Preview Origin Validator Regression Suite
// ============================================================

const validator = require('../api/_lib/validator');

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

// Helper to cleanly run tests under temporary environment state
function withEnv(tempEnv, fn) {
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
    return fn();
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

console.log('\n=== Quantum Jersey Stage 5F: Preview Origin Validator Suite ===\n');

// ─────────────────────────────────────────────────────────────
// Group 1: Canonical Production Origin
// ─────────────────────────────────────────────────────────────
console.log('Group 1: Canonical Production Origin Validation');

withEnv({ VERCEL_ENV: 'production' }, () => {
  const res = validator.validateAppOrigin('https://quantumjersey.vercel.app');
  assert(1, 'Production mode accepts canonical production origin https://quantumjersey.vercel.app',
    res.valid === true && res.origin === 'https://quantumjersey.vercel.app',
    JSON.stringify(res)
  );
});

withEnv({ VERCEL_ENV: undefined }, () => {
  const res = validator.validateAppOrigin('https://quantumjersey.vercel.app');
  assert(2, 'Default/unset VERCEL_ENV accepts canonical production origin',
    res.valid === true && res.origin === 'https://quantumjersey.vercel.app',
    JSON.stringify(res)
  );
});

withEnv({ VERCEL_ENV: 'preview', PAYSTACK_SECRET_KEY: 'sk_test_mock123' }, () => {
  const res = validator.validateAppOrigin('https://quantumjersey.vercel.app');
  assert(3, 'Preview mode accepts canonical production origin as approved merchant origin',
    res.valid === true && res.origin === 'https://quantumjersey.vercel.app',
    JSON.stringify(res)
  );
});

withEnv({ VERCEL_ENV: 'production' }, () => {
  const res443 = validator.validateAppOrigin('https://quantumjersey.vercel.app:443');
  const resBadPort = validator.validateAppOrigin('https://quantumjersey.vercel.app:8443');
  assert(4, 'Canonical production origin accepts default port 443 and rejects non-standard port 8443',
    res443.valid === true && resBadPort.valid === false,
    `res443=${res443.valid}, resBadPort=${resBadPort.valid}`
  );
});

// ─────────────────────────────────────────────────────────────
// Group 2: Valid HTTPS Quantum Jersey Preview Deployment
// ─────────────────────────────────────────────────────────────
console.log('\nGroup 2: Valid HTTPS Quantum Jersey Preview Deployment');

withEnv({
  VERCEL_ENV: 'preview',
  PAYSTACK_SECRET_KEY: 'sk_test_preview_secret_key_12345',
  VERCEL_URL: 'quantumjersey-git-stage5-quantumdata66.vercel.app'
}, () => {
  const res = validator.validateAppOrigin('https://quantumjersey-git-stage5-quantumdata66.vercel.app');
  assert(5, 'Valid HTTPS preview deployment matching VERCEL_URL is approved',
    res.valid === true && res.origin === 'https://quantumjersey-git-stage5-quantumdata66.vercel.app',
    JSON.stringify(res)
  );

  const cb = validator.resolveTrustedCallbackUrl('/cart.html');
  assert(6, 'resolveTrustedCallbackUrl in preview uses verified VERCEL_URL base and normalizes path',
    cb.valid === true && cb.callbackUrl === 'https://quantumjersey-git-stage5-quantumdata66.vercel.app/cart',
    JSON.stringify(cb)
  );
});

withEnv({
  VERCEL_ENV: 'preview',
  PAYSTACK_SECRET_KEY: 'sk_test_preview_secret_key_12345',
  VERCEL_URL: 'https://quantumjersey-hash123.vercel.app/'
}, () => {
  const res = validator.validateAppOrigin('https://quantumjersey-hash123.vercel.app');
  assert(7, 'VERCEL_URL with leading protocol and trailing slash is sanitized and approved',
    res.valid === true && res.origin === 'https://quantumjersey-hash123.vercel.app',
    JSON.stringify(res)
  );
});

withEnv({
  VERCEL_ENV: 'preview',
  PAYSTACK_SECRET_KEY: 'sk_test_preview_secret_key_12345',
  VERCEL_URL: undefined,
  APP_BASE_URL: undefined
}, () => {
  const res = validator.validateAppOrigin('https://quantumjersey-pr-42.vercel.app');
  assert(8, 'When both VERCEL_URL and APP_BASE_URL are unset, arbitrary preview hostname fails closed',
    res.valid === false && res.error?.includes('requires a valid trusted VERCEL_URL or an explicitly configured APP_BASE_URL'),
    JSON.stringify(res)
  );
});

withEnv({
  VERCEL_ENV: 'preview',
  PAYSTACK_SECRET_KEY: 'sk_test_preview_secret_key_12345',
  VERCEL_URL: undefined,
  APP_BASE_URL: 'https://quantumjersey-pr-42.vercel.app'
}, () => {
  const res = validator.validateAppOrigin('https://quantumjersey-pr-42.vercel.app');
  assert(8.1, 'When VERCEL_URL is unset but APP_BASE_URL is validly configured, preview origin is approved',
    res.valid === true && res.origin === 'https://quantumjersey-pr-42.vercel.app',
    JSON.stringify(res)
  );
});

// ─────────────────────────────────────────────────────────────
// Group 3: Unrelated Vercel Hostnames
// ─────────────────────────────────────────────────────────────
console.log('\nGroup 3: Unrelated Vercel Hostnames Rejected');

withEnv({
  VERCEL_ENV: 'preview',
  PAYSTACK_SECRET_KEY: 'sk_test_preview_key'
}, () => {
  const res1 = validator.validateAppOrigin('https://another-project.vercel.app');
  const res2 = validator.validateAppOrigin('https://malicious-store.vercel.app');
  const res3 = validator.validateAppOrigin('https://vercel.app');
  assert(9, 'Arbitrary *.vercel.app projects without quantumjersey prefix are rejected',
    res1.valid === false && res2.valid === false && res3.valid === false,
    `res1=${res1.valid}, res2=${res2.valid}, res3=${res3.valid}`
  );
});

// ─────────────────────────────────────────────────────────────
// Group 4: Lookalike or Deceptive Hostnames
// ─────────────────────────────────────────────────────────────
console.log('\nGroup 4: Lookalike or Deceptive Hostnames Rejected');

withEnv({
  VERCEL_ENV: 'preview',
  PAYSTACK_SECRET_KEY: 'sk_test_preview_key'
}, () => {
  const lookalike1 = validator.validateAppOrigin('https://quantumjersey.vercel.app.attacker.com');
  const lookalike2 = validator.validateAppOrigin('https://notquantumjersey.vercel.app');
  const lookalike3 = validator.validateAppOrigin('https://attacker-quantumjersey.vercel.app');
  const lookalike4 = validator.validateAppOrigin('https://quantumjersey-preview.evil.com');
  const lookalike5 = validator.validateAppOrigin('https://sub.quantumjersey-preview.vercel.app');
  const lookalike6 = validator.validateAppOrigin('https://quantumjerseyvercel.app');

  assert(10, 'Subdomain hijack (quantumjersey.vercel.app.attacker.com) is rejected',
    lookalike1.valid === false, JSON.stringify(lookalike1)
  );
  assert(11, 'Prefix lookalike without hyphen (notquantumjersey.vercel.app) is rejected',
    lookalike2.valid === false, JSON.stringify(lookalike2)
  );
  assert(12, 'Prefix lookalike with prefix attacker-quantumjersey is rejected',
    lookalike3.valid === false, JSON.stringify(lookalike3)
  );
  assert(13, 'TLD substitution (evil.com) is rejected',
    lookalike4.valid === false, JSON.stringify(lookalike4)
  );
  assert(14, 'Nested subdomain injection (sub.quantumjersey-preview.vercel.app) is rejected',
    lookalike5.valid === false, JSON.stringify(lookalike5)
  );
  assert(15, 'Missing dot separator (quantumjerseyvercel.app) is rejected',
    lookalike6.valid === false, JSON.stringify(lookalike6)
  );
});

// ─────────────────────────────────────────────────────────────
// Group 5: HTTP Preview Origins
// ─────────────────────────────────────────────────────────────
console.log('\nGroup 5: HTTP Preview Origins Rejected');

withEnv({
  VERCEL_ENV: 'preview',
  PAYSTACK_SECRET_KEY: 'sk_test_preview_key',
  VERCEL_URL: 'quantumjersey-preview.vercel.app'
}, () => {
  const httpRes = validator.validateAppOrigin('http://quantumjersey-preview.vercel.app');
  assert(16, 'HTTP preview origin is rejected (HTTPS strictly required)',
    httpRes.valid === false && httpRes.error?.includes('HTTPS'),
    JSON.stringify(httpRes)
  );

  const httpPortRes = validator.validateAppOrigin('http://quantumjersey-preview.vercel.app:80');
  assert(17, 'HTTP preview origin with explicit port 80 is rejected',
    httpPortRes.valid === false && httpPortRes.error?.includes('HTTPS'),
    JSON.stringify(httpPortRes)
  );
});

// ─────────────────────────────────────────────────────────────
// Group 6: Production Mode with Preview Origin
// ─────────────────────────────────────────────────────────────
console.log('\nGroup 6: Production Mode with Preview Origin Rejected');

withEnv({
  VERCEL_ENV: 'production',
  PAYSTACK_SECRET_KEY: 'sk_test_preview_key',
  VERCEL_URL: 'quantumjersey-preview.vercel.app'
}, () => {
  const res = validator.validateAppOrigin('https://quantumjersey-preview.vercel.app');
  assert(18, 'In production mode, a preview origin is rejected even if VERCEL_URL matches',
    res.valid === false && res.error?.includes('not an approved merchant origin'),
    JSON.stringify(res)
  );
});

withEnv({
  VERCEL_ENV: undefined,
  PAYSTACK_SECRET_KEY: 'sk_test_preview_key'
}, () => {
  const res = validator.validateAppOrigin('https://quantumjersey-preview.vercel.app');
  assert(19, 'In default (non-preview) mode, a preview origin is rejected',
    res.valid === false && res.error?.includes('not an approved merchant origin'),
    JSON.stringify(res)
  );
});

// ─────────────────────────────────────────────────────────────
// Group 7: Preview Mode with Live Paystack Key
// ─────────────────────────────────────────────────────────────
console.log('\nGroup 7: Preview Mode with Live Paystack Key Rejected (Fail-Closed)');

withEnv({
  VERCEL_ENV: 'preview',
  PAYSTACK_SECRET_KEY: 'sk_live_dangerous_production_secret_key_99999',
  VERCEL_URL: 'quantumjersey-preview.vercel.app'
}, () => {
  const res = validator.validateAppOrigin('https://quantumjersey-preview.vercel.app');
  assert(20, 'Preview origin fails closed when PAYSTACK_SECRET_KEY is a live key (sk_live_)',
    res.valid === false && res.error?.includes('sk_test_'),
    JSON.stringify(res)
  );

  const cb = validator.resolveTrustedCallbackUrl('/checkout');
  assert(21, 'resolveTrustedCallbackUrl fails closed in preview when live Paystack key is present',
    cb.valid === false,
    JSON.stringify(cb)
  );
});

// ─────────────────────────────────────────────────────────────
// Group 8: Missing or Malformed Deployment Environment Values
// ─────────────────────────────────────────────────────────────
console.log('\nGroup 8: Missing or Malformed Deployment Environment Values');

withEnv({
  VERCEL_ENV: 'preview',
  PAYSTACK_SECRET_KEY: undefined,
  VERCEL_URL: 'quantumjersey-preview.vercel.app'
}, () => {
  const res = validator.validateAppOrigin('https://quantumjersey-preview.vercel.app');
  assert(22, 'Preview mode fails closed when PAYSTACK_SECRET_KEY is missing/undefined',
    res.valid === false && res.error?.includes('sk_test_'),
    JSON.stringify(res)
  );
});

withEnv({
  VERCEL_ENV: 'preview',
  PAYSTACK_SECRET_KEY: 'invalid_prefix_key_123',
  VERCEL_URL: 'quantumjersey-preview.vercel.app'
}, () => {
  const res = validator.validateAppOrigin('https://quantumjersey-preview.vercel.app');
  assert(23, 'Preview mode fails closed when PAYSTACK_SECRET_KEY has invalid prefix',
    res.valid === false && res.error?.includes('sk_test_'),
    JSON.stringify(res)
  );
});

withEnv({
  VERCEL_ENV: 'preview',
  PAYSTACK_SECRET_KEY: 'sk_test_valid_key',
  VERCEL_URL: 'malicious-domain.com'
}, () => {
  const res = validator.validateAppOrigin('https://quantumjersey-preview.vercel.app');
  assert(24, 'Preview mode fails closed when VERCEL_URL is malformed/untrusted',
    res.valid === false && res.error?.includes('VERCEL_URL is malformed or untrusted'),
    JSON.stringify(res)
  );
});

withEnv({
  VERCEL_ENV: 'preview',
  PAYSTACK_SECRET_KEY: 'sk_test_valid_key',
  VERCEL_URL: 'quantumjersey-preview-deploy-a.vercel.app'
}, () => {
  const res = validator.validateAppOrigin('https://quantumjersey-preview-deploy-b.vercel.app');
  assert(25, 'Preview mode rejects origin that does not match trusted VERCEL_URL deployment hostname',
    res.valid === false && res.error?.includes('does not match trusted deployment hostname'),
    JSON.stringify(res)
  );
});

withEnv({
  VERCEL_ENV: 'preview',
  PAYSTACK_SECRET_KEY: 'sk_test_valid_key',
  APP_BASE_URL: undefined,
  VERCEL_URL: undefined
}, () => {
  const cb = validator.resolveTrustedCallbackUrl('/cart');
  assert(26, 'resolveTrustedCallbackUrl in preview fails closed when both APP_BASE_URL and VERCEL_URL are missing',
    cb.valid === false && cb.error?.includes('requires a valid trusted VERCEL_URL or an explicitly configured APP_BASE_URL'),
    JSON.stringify(cb)
  );
});

withEnv({
  VERCEL_ENV: 'preview',
  PAYSTACK_SECRET_KEY: 'sk_test_valid_key',
  APP_BASE_URL: undefined,
  VERCEL_URL: 'attacker.evil.com'
}, () => {
  const cb = validator.resolveTrustedCallbackUrl('/cart');
  assert(27, 'resolveTrustedCallbackUrl in preview fails closed when VERCEL_URL is malformed',
    cb.valid === false && cb.error?.includes('VERCEL_URL is malformed or untrusted'),
    JSON.stringify(cb)
  );
});

// ─────────────────────────────────────────────────────────────
// Group 9: Localhost Behavior (Local Dev vs Preview vs Production)
// ─────────────────────────────────────────────────────────────
console.log('\nGroup 9: Localhost Behavior in Local Development vs Preview and Production');

withEnv({ VERCEL_ENV: undefined }, () => {
  const res1 = validator.validateAppOrigin('http://localhost:3000');
  const res2 = validator.validateAppOrigin('http://127.0.0.1:8080');
  const res3 = validator.validateAppOrigin('https://localhost:3000');
  assert(28, 'Local development (VERCEL_ENV unset) permits localhost and 127.0.0.1',
    res1.valid === true && res2.valid === true && res3.valid === true,
    `res1=${res1.valid}, res2=${res2.valid}, res3=${res3.valid}`
  );
});

withEnv({ VERCEL_ENV: 'development' }, () => {
  const res1 = validator.validateAppOrigin('http://localhost:3000');
  assert(29, 'Local development (VERCEL_ENV=development) permits localhost',
    res1.valid === true && res1.origin === 'http://localhost:3000',
    JSON.stringify(res1)
  );
});

withEnv({ VERCEL_ENV: 'production' }, () => {
  const res1 = validator.validateAppOrigin('http://localhost:3000');
  const res2 = validator.validateAppOrigin('http://127.0.0.1:8080');
  const res3 = validator.validateAppOrigin('https://localhost:3000');
  assert(30, 'Production mode strictly rejects localhost origins',
    res1.valid === false && res2.valid === false && res3.valid === false,
    `res1=${res1.valid}, res2=${res2.valid}, res3=${res3.valid}`
  );
});

withEnv({
  VERCEL_ENV: 'preview',
  PAYSTACK_SECRET_KEY: 'sk_test_mock'
}, () => {
  const res1 = validator.validateAppOrigin('http://localhost:3000');
  const res2 = validator.validateAppOrigin('http://127.0.0.1:8080');
  const res3 = validator.validateAppOrigin('https://localhost:3000');
  assert(31, 'Preview mode strictly rejects localhost origins',
    res1.valid === false && res2.valid === false && res3.valid === false,
    `res1=${res1.valid}, res2=${res2.valid}, res3=${res3.valid}`
  );
});

// ─────────────────────────────────────────────────────────────
// Final Summary
// ─────────────────────────────────────────────────────────────
console.log('\n─────────────────────────────────────────────────────────────');
console.log(`Stage 5F Preview Origin Validator Suite: ${passedTests} / ${totalTests} PASSED`);
if (failedTests > 0) {
  console.error(`FAILED: ${failedTests} test(s) failed.`);
  process.exit(1);
} else {
  console.log('All 31 targeted regression assertions passed successfully.');
}
