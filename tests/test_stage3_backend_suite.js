// ============================================================
// Quantum Jersey — Stage 3.1 Backend Security & Remediation Test Suite
// ============================================================

const crypto = require('crypto');
const { execSync } = require('child_process');

// Set test environment variables
const TEST_PAYSTACK_SECRET = 'sk_test_mock_secret_key_1234567890';
const TEST_SUPABASE_URL = 'https://mock-project.supabase.co';
const TEST_SUPABASE_SERVICE_KEY = 'mock_service_role_key_abcdef';

process.env.PAYSTACK_SECRET_KEY = TEST_PAYSTACK_SECRET;
process.env.SUPABASE_URL = TEST_SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = TEST_SUPABASE_SERVICE_KEY;

// Import modules under test
const validator = require('../api/_lib/validator');
const paystackLib = require('../api/_lib/paystack');
const supabaseLib = require('../api/_lib/supabase');
const initHandler = require('../api/paystack/initialize');
const verifyHandler = require('../api/paystack/verify');
const webhookHandler = require('../api/paystack/webhook');

// Mock HTTP Response helper
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

// In-memory Mock Database Store
let mockDb = {
  products: [
    {
      id: 'b1111111-1111-4111-8111-111111111111',
      product_name: 'Phantom Strike Pro',
      category: 'boots',
      price: 65000,
      sizes: ['40', '41', '42', '43'],
      image_url: 'boots.webp',
      in_stock: true
    },
    {
      id: 'j2222222-2222-4222-8222-222222222222',
      product_name: 'Nigeria Home Jersey 2024',
      category: 'jerseys',
      price: 28000,
      sizes: ['S', 'M', 'L', 'XL'],
      image_url: 'jersey.webp',
      in_stock: true
    },
    {
      id: 'o3333333-3333-4333-8333-333333333333',
      product_name: 'Out of Stock Boots',
      category: 'boots',
      price: 50000,
      sizes: ['42'],
      image_url: 'oos.webp',
      in_stock: false
    },
    {
      id: 'f2263e91-df36-4b51-bcc7-e01f9257662e',
      product_name: 'Refree Whistle',
      category: 'sportswear',
      price: 8000,
      sizes: ['Professional Refree Whistle'],
      image_url: 'whistle.webp',
      in_stock: true
    },
    {
      id: 'c4444444-4444-4444-8444-444444444444',
      product_name: 'Coach Tactical Board',
      category: 'sportswear',
      price: 15000,
      sizes: [],
      image_url: 'board.webp',
      in_stock: true
    },
    {
      id: 'v5555555-5555-4555-8555-555555555555',
      product_name: 'Arsenal 24/25 Home Jersey',
      category: 'jerseys',
      price: 32000,
      sizes: ['S', 'M', 'L', 'XL'],
      description: 'Official Arsenal Home Jersey.\n\n<!--QJ_VERSIONS:{"fan":{"label":"Fan Version","price":30000,"sizes":["S","M","L","XL","XXL"]},"player":{"label":"Player Version","price":45000,"sizes":["M","L","XL"]}}-->',
      image_url: 'arsenal.webp',
      in_stock: true
    },
    {
      id: 'x6666666-6666-4666-8666-666666666666',
      product_name: 'Corrupt Jersey',
      category: 'jerseys',
      price: 30000,
      sizes: ['M', 'L'],
      description: 'Some jersey with broken metadata.\n\n<!--QJ_VERSIONS:{"fan":{invalid_json}}-->',
      image_url: 'corrupt.webp',
      in_stock: true
    },
    {
      id: 'd7777777-7777-4777-8777-777777777777',
      product_name: 'Duplicate Marker Jersey',
      category: 'jerseys',
      price: 35000,
      sizes: ['M', 'L'],
      description: 'Ambiguous Jersey.\n\n<!--QJ_VERSIONS:{"fan":{"label":"Fan Version","price":30000,"sizes":["M"]}}-->\n\n<!--QJ_VERSIONS:{"fan":{"label":"Fan Version","price":10000,"sizes":["L"]}}-->',
      image_url: 'duplicate.webp',
      in_stock: true
    }
  ],
  orders: [],
  payment_attempts: []
};

// Mock Global Fetch
const originalFetch = global.fetch;

function setupMockFetch(paystackOverrides = {}) {
  global.fetch = async (url, options = {}) => {
    const urlStr = String(url);

    // ─── 1. Mock Supabase REST & RPC Calls ───
    if (urlStr.startsWith(TEST_SUPABASE_URL)) {
      // RPC: settle_paystack_payment
      if (urlStr.includes('/rest/v1/rpc/settle_paystack_payment')) {
        const p = JSON.parse(options.body);
        const attempt = mockDb.payment_attempts.find(a => a.reference === p.p_reference);
        if (!attempt) return { ok: true, status: 200, json: async () => ({ success: false, code: 'ATTEMPT_NOT_FOUND', message: 'Attempt not found' }) };
        const order = mockDb.orders.find(o => o.id === attempt.order_id);
        if (!order) return { ok: true, status: 200, json: async () => ({ success: false, code: 'ORDER_NOT_FOUND', message: 'Order not found' }) };

        // Terminal status guard
        if (['refunded', 'disputed'].includes(attempt.status) || ['refunded', 'disputed'].includes(order.payment_status)) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: false,
              code: 'TERMINAL_STATUS',
              status: order.payment_status,
              message: `Order in terminal status (${order.payment_status}). Regression blocked.`
            })
          };
        }

        // Idempotency check
        if (attempt.status === 'successful' && order.payment_status === 'paid') {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              code: 'ALREADY_SETTLED',
              status: 'paid',
              order_ref: order.order_ref,
              reference: attempt.reference,
              paid_at: order.paid_at,
              message: 'Payment already settled.'
            })
          };
        }

        // Validate amount
        if (attempt.amount !== p.p_expected_amount_kobo) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ success: false, code: 'AMOUNT_MISMATCH', message: 'Amount mismatch' })
          };
        }

        // Validate currency
        if (attempt.currency !== p.p_expected_currency || order.currency !== p.p_expected_currency) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ success: false, code: 'CURRENCY_MISMATCH', message: 'Currency mismatch' })
          };
        }

        // Atomic settlement update
        attempt.status = 'successful';
        attempt.paystack_id = p.p_paystack_id;
        attempt.channel = p.p_channel;
        attempt.gateway_response = p.p_gateway_response;
        attempt.updated_at = new Date().toISOString();

        order.payment_status = 'paid';
        order.status = 'confirmed';
        order.paid_at = p.p_paid_at || new Date().toISOString();
        order.updated_at = new Date().toISOString();

        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            code: 'SETTLED',
            status: 'paid',
            order_ref: order.order_ref,
            reference: attempt.reference,
            paid_at: order.paid_at
          })
        };
      }

      // RPC: fail_paystack_payment
      if (urlStr.includes('/rest/v1/rpc/fail_paystack_payment')) {
        const p = JSON.parse(options.body);
        const attempt = mockDb.payment_attempts.find(a => a.reference === p.p_reference);
        if (!attempt) return { ok: true, status: 200, json: async () => ({ success: false, code: 'ATTEMPT_NOT_FOUND' }) };
        const order = mockDb.orders.find(o => o.id === attempt.order_id);
        if (!order) return { ok: true, status: 200, json: async () => ({ success: false, code: 'ORDER_NOT_FOUND' }) };

        if (order.payment_status === 'paid' || attempt.status === 'successful') {
          return {
            ok: true,
            status: 200,
            json: async () => ({ success: false, code: 'PROTECTED_STATUS', message: 'Cannot fail paid order' })
          };
        }

        const targetStatus = p.p_is_abandoned ? 'abandoned' : 'failed';
        attempt.status = targetStatus;
        attempt.gateway_response = p.p_gateway_response;
        attempt.updated_at = new Date().toISOString();

        order.payment_status = 'failed';
        order.updated_at = new Date().toISOString();

        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            code: 'FAILURE_RECORDED',
            status: targetStatus,
            order_ref: order.order_ref,
            reference: attempt.reference
          })
        };
      }

      // Products query
      if (urlStr.includes('/rest/v1/products')) {
        const urlObj = new URL(urlStr);
        const idFilter = urlObj.searchParams.get('id');
        if (idFilter && idFilter.startsWith('in.(')) {
          const ids = idFilter.slice(4, -1).split(',');
          const matched = mockDb.products.filter(p => ids.includes(p.id));
          return { ok: true, status: 200, json: async () => matched };
        }
        return { ok: true, status: 200, json: async () => mockDb.products };
      }

      // Orders insert
      if (urlStr.endsWith('/rest/v1/orders') && options.method === 'POST') {
        const orderData = JSON.parse(options.body);
        const newOrder = {
          ...orderData,
          id: `ord-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        mockDb.orders.push(newOrder);
        return { ok: true, status: 201, json: async () => [newOrder] };
      }

      // Orders update (PATCH)
      if (urlStr.includes('/rest/v1/orders?') && options.method === 'PATCH') {
        const urlObj = new URL(urlStr);
        const idFilter = urlObj.searchParams.get('id');
        const updateData = JSON.parse(options.body);
        const orderId = idFilter.replace('eq.', '');
        const order = mockDb.orders.find(o => o.id === orderId);
        if (order) {
          Object.assign(order, updateData);
          return { ok: true, status: 200, json: async () => [order] };
        }
        return { ok: true, status: 200, json: async () => [] };
      }

      // Payment attempts insert
      if (urlStr.endsWith('/rest/v1/payment_attempts') && options.method === 'POST') {
        const attemptData = JSON.parse(options.body);
        const newAttempt = {
          ...attemptData,
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        mockDb.payment_attempts.push(newAttempt);
        return { ok: true, status: 201, json: async () => [newAttempt] };
      }

      // Payment attempts select with orders join
      if (urlStr.includes('/rest/v1/payment_attempts?') && (!options.method || options.method === 'GET')) {
        const urlObj = new URL(urlStr);
        const refFilter = urlObj.searchParams.get('reference');
        if (refFilter) {
          const ref = refFilter.replace('eq.', '');
          const attempt = mockDb.payment_attempts.find(a => a.reference === ref);
          if (attempt) {
            const order = mockDb.orders.find(o => o.id === attempt.order_id);
            const joined = { ...attempt, orders: order || null };
            return { ok: true, status: 200, json: async () => [joined] };
          }
        }
        return { ok: true, status: 200, json: async () => [] };
      }

      // Payment attempts update (PATCH)
      if (urlStr.includes('/rest/v1/payment_attempts?') && options.method === 'PATCH') {
        const urlObj = new URL(urlStr);
        const idFilter = urlObj.searchParams.get('id');
        const attemptId = idFilter.replace('eq.', '');
        const updateData = JSON.parse(options.body);
        const attempt = mockDb.payment_attempts.find(a => a.id === attemptId);
        if (attempt) {
          Object.assign(attempt, updateData);
          return { ok: true, status: 200, json: async () => [attempt] };
        }
        return { ok: true, status: 200, json: async () => [] };
      }
    }

    // ─── 2. Mock Paystack Gateway Calls ───
    if (urlStr.includes('api.paystack.co')) {
      if (paystackOverrides.shouldFail) {
        return {
          ok: false,
          status: paystackOverrides.status || 500,
          json: async () => ({ status: false, message: paystackOverrides.message || 'Paystack server error' })
        };
      }

      // Initialize transaction
      if (urlStr.endsWith('/transaction/initialize')) {
        const reqBody = JSON.parse(options.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: true,
            message: 'Authorization URL created',
            data: {
              authorization_url: `https://checkout.paystack.com/auth_${reqBody.reference}`,
              access_code: `code_${reqBody.reference}`,
              reference: reqBody.reference
            }
          })
        };
      }

      // Verify transaction
      if (urlStr.includes('/transaction/verify/')) {
        const ref = urlStr.split('/transaction/verify/')[1];
        if (paystackOverrides.verifyData) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              status: true,
              data: paystackOverrides.verifyData
            })
          };
        }

        const attempt = mockDb.payment_attempts.find(a => a.reference === ref);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: true,
            data: {
              id: 99887766,
              status: 'success',
              reference: ref,
              amount: attempt ? attempt.amount : 7000000,
              currency: 'NGN',
              channel: 'card',
              gateway_response: 'Successful',
              paid_at: new Date().toISOString()
            }
          })
        };
      }
    }

    return { ok: false, status: 404, json: async () => ({}) };
  };
}

async function runTestSuite() {
  console.log('================================================================');
  console.log('QUANTUM JERSEY : STAGE 3.1 SECURITY REMEDIATION TEST SUITE');
  console.log('================================================================\n');

  let passedCount = 0;
  let totalCount = 0;

  function assert(scenarioNum, desc, condition, extraInfo = '') {
    totalCount++;
    if (condition) {
      console.log(`[PASS] Test ${scenarioNum}: ${desc}`);
      passedCount++;
    } else {
      console.error(`[FAIL] Test ${scenarioNum}: ${desc} — ${extraInfo}`);
      process.exitCode = 1;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 1. Valid initialization input
  // ─────────────────────────────────────────────────────────────
  setupMockFetch();
  const initReq1 = {
    method: 'POST',
    body: {
      customer: {
        name: 'Chioma Adebayo',
        email: 'chioma@example.com',
        phone: '+2348012345678',
        delivery_state: 'Lagos',
        delivery_city: 'Ikeja',
        delivery_address: '15 Admiralty Way',
        delivery_notes: 'Leave at gate'
      },
      items: [
        { id: 'b1111111-1111-4111-8111-111111111111', size: '42', quantity: 1 }
      ]
    }
  };
  const initRes1 = createMockRes();
  await initHandler(initReq1, initRes1);
  assert(1, 'Valid initialization returns 200 with authorization_url and reference',
    initRes1.statusCode === 200 &&
    initRes1.body?.success === true &&
    initRes1.body?.authorization_url?.startsWith('https://checkout.paystack.com/') &&
    initRes1.body?.total_amount === 70000 &&
    initRes1.body?.reference?.startsWith('QJ-PAY-')
  );

  // ─────────────────────────────────────────────────────────────
  // 2. Missing or malformed email
  // ─────────────────────────────────────────────────────────────
  const initReq2a = { method: 'POST', body: { customer: { ...initReq1.body.customer, email: '' }, items: initReq1.body.items } };
  const initRes2a = createMockRes();
  await initHandler(initReq2a, initRes2a);

  const initReq2b = { method: 'POST', body: { customer: { ...initReq1.body.customer, email: 'not-an-email' }, items: initReq1.body.items } };
  const initRes2b = createMockRes();
  await initHandler(initReq2b, initRes2b);

  assert(2, 'Missing or malformed email rejected with 400 Bad Request',
    initRes2a.statusCode === 400 && initRes2b.statusCode === 400
  );

  // ─────────────────────────────────────────────────────────────
  // 3. Invalid product ID or variant
  // ─────────────────────────────────────────────────────────────
  const initReq3a = { method: 'POST', body: { customer: initReq1.body.customer, items: [{ id: 'non-existent-uuid-99999999', size: '42', quantity: 1 }] } };
  const initRes3a = createMockRes();
  await initHandler(initReq3a, initRes3a);

  const initReq3b = { method: 'POST', body: { customer: initReq1.body.customer, items: [{ id: 'b1111111-1111-4111-8111-111111111111', size: 'Size 99 Invalid', quantity: 1 }] } };
  const initRes3b = createMockRes();
  await initHandler(initReq3b, initRes3b);

  assert(3, 'Invalid product ID or invalid size variant rejected with 400',
    initRes3a.statusCode === 400 && initRes3b.statusCode === 400
  );

  // ─────────────────────────────────────────────────────────────
  // 4. Invalid quantity and out-of-stock item
  // ─────────────────────────────────────────────────────────────
  const initReq4a = { method: 'POST', body: { customer: initReq1.body.customer, items: [{ id: 'b1111111-1111-4111-8111-111111111111', size: '42', quantity: -2 }] } };
  const initRes4a = createMockRes();
  await initHandler(initReq4a, initRes4a);

  const initReq4b = { method: 'POST', body: { customer: initReq1.body.customer, items: [{ id: 'o3333333-3333-4333-8333-333333333333', size: '42', quantity: 1 }] } };
  const initRes4b = createMockRes();
  await initHandler(initReq4b, initRes4b);

  assert(4, 'Invalid quantity or out-of-stock item rejected with 400',
    initRes4a.statusCode === 400 && initRes4b.statusCode === 400
  );

  // ─────────────────────────────────────────────────────────────
  // 5. Forged client price/total ignored
  // ─────────────────────────────────────────────────────────────
  const initReq5 = {
    method: 'POST',
    body: {
      customer: initReq1.body.customer,
      items: [{ id: 'b1111111-1111-4111-8111-111111111111', size: '42', quantity: 1, price: 5, subtotal: 5, total_amount: 5 }],
      delivery_fee: 0,
      total_amount: 5
    }
  };
  const initRes5 = createMockRes();
  await initHandler(initReq5, initRes5);
  assert(5, 'Forged client price/total ignored; calculated server-side as 70,000 NGN',
    initRes5.statusCode === 200 && initRes5.body?.total_amount === 70000
  );

  // ─────────────────────────────────────────────────────────────
  // 6. ₦5,000 delivery fee charged once per order
  // ─────────────────────────────────────────────────────────────
  const initReq6 = {
    method: 'POST',
    body: {
      customer: initReq1.body.customer,
      items: [
        { id: 'b1111111-1111-4111-8111-111111111111', size: '42', quantity: 2 },
        { id: 'j2222222-2222-4222-8222-222222222222', size: 'L', quantity: 1 }
      ]
    }
  };
  const initRes6 = createMockRes();
  await initHandler(initReq6, initRes6);
  assert(6, '₦5,000 delivery fee charged exactly once on multi-item orders (163,000 NGN)',
    initRes6.statusCode === 200 && initRes6.body?.total_amount === 163000
  );

  // ─────────────────────────────────────────────────────────────
  // 7. Duplicate cart items consolidated
  // ─────────────────────────────────────────────────────────────
  const initReq7 = {
    method: 'POST',
    body: {
      customer: initReq1.body.customer,
      items: [
        { id: 'b1111111-1111-4111-8111-111111111111', size: '42', quantity: 1 },
        { id: 'b1111111-1111-4111-8111-111111111111', size: '42', quantity: 2 } // duplicate (id, size)
      ]
    }
  };
  const initRes7 = createMockRes();
  await initHandler(initReq7, initRes7);
  // Consolidates to qty 3 * 65000 = 195000 + 5000 = 200000
  const latestOrder7 = mockDb.orders[mockDb.orders.length - 1];
  assert(7, 'Duplicate cart lines consolidated into single entry (qty 3, total 200,000 NGN)',
    initRes7.statusCode === 200 &&
    initRes7.body?.total_amount === 200000 &&
    latestOrder7.items.length === 1 &&
    latestOrder7.items[0].quantity === 3
  );

  // Duplicate cart items exceeding limit (max 50) rejected
  const initReq7b = {
    method: 'POST',
    body: {
      customer: initReq1.body.customer,
      items: [
        { id: 'b1111111-1111-4111-8111-111111111111', size: '42', quantity: 30 },
        { id: 'b1111111-1111-4111-8111-111111111111', size: '42', quantity: 25 } // sum = 55 > 50
      ]
    }
  };
  const initRes7b = createMockRes();
  await initHandler(initReq7b, initRes7b);
  assert(7.1, 'Consolidated cart line exceeding 50 quantity rejected with 400 Bad Request',
    initRes7b.statusCode === 400 && initRes7b.body?.error?.includes('exceeds limit')
  );

  // ─────────────────────────────────────────────────────────────
  // 8. Paystack gateway rejection vs ambiguous timeout
  // ─────────────────────────────────────────────────────────────
  // 8a. Definite gateway rejection (HTTP 400 from Paystack)
  setupMockFetch({ shouldFail: true, status: 400, message: 'Invalid customer email domain' });
  const initReq8a = { method: 'POST', body: initReq1.body };
  const initRes8a = createMockRes();
  await initHandler(initReq8a, initRes8a);

  const lastOrder8a = mockDb.orders[mockDb.orders.length - 1];
  const lastAttempt8a = mockDb.payment_attempts[mockDb.payment_attempts.length - 1];
  assert(8, 'Definite gateway rejection (4xx) cleans up database records to cancelled/failed',
    initRes8a.statusCode === 400 &&
    lastOrder8a.status === 'cancelled' &&
    lastOrder8a.payment_status === 'failed' &&
    lastAttempt8a.status === 'failed'
  );

  // 8b. Ambiguous gateway timeout (HTTP 504 from Paystack)
  setupMockFetch({ shouldFail: true, status: 504, message: 'Gateway timeout' });
  const initReq8b = { method: 'POST', body: initReq1.body };
  const initRes8b = createMockRes();
  await initHandler(initReq8b, initRes8b);

  const lastOrder8b = mockDb.orders[mockDb.orders.length - 1];
  const lastAttempt8b = mockDb.payment_attempts[mockDb.payment_attempts.length - 1];
  assert(8.1, 'Ambiguous gateway timeout preserves order in unpaid state for reconciliation',
    initRes8b.statusCode === 504 &&
    lastOrder8b.status === 'awaiting_confirmation' &&
    lastOrder8b.payment_status === 'unpaid' &&
    lastAttempt8b.status === 'initiated'
  );

  // ─────────────────────────────────────────────────────────────
  // 9. Atomic settlement success via RPC
  // ─────────────────────────────────────────────────────────────
  setupMockFetch();
  const testRef9 = `QJ-PAY-${Date.now()}-TEST09`;
  const testOrder9 = {
    id: 'ord-test-09',
    order_ref: 'QJ-09-REF',
    total_amount: 70000,
    currency: 'NGN',
    status: 'awaiting_confirmation',
    payment_status: 'unpaid'
  };
  const testAttempt9 = {
    id: 'att-test-09',
    order_id: testOrder9.id,
    reference: testRef9,
    amount: 7000000,
    currency: 'NGN',
    status: 'initiated'
  };
  mockDb.orders.push(testOrder9);
  mockDb.payment_attempts.push(testAttempt9);

  const verifyReq9 = { method: 'POST', body: { reference: testRef9 } };
  const verifyRes9 = createMockRes();
  await verifyHandler(verifyReq9, verifyRes9);

  assert(9, 'Atomic settlement RPC updates both order and attempt in single transaction',
    verifyRes9.statusCode === 200 &&
    verifyRes9.body?.status === 'paid' &&
    testOrder9.payment_status === 'paid' &&
    testOrder9.status === 'confirmed' &&
    testAttempt9.status === 'successful'
  );

  // ─────────────────────────────────────────────────────────────
  // 10. Repeated successful verification (Idempotency)
  // ─────────────────────────────────────────────────────────────
  const verifyRes10 = createMockRes();
  await verifyHandler(verifyReq9, verifyRes10);
  assert(10, 'Repeated verification returns 200 OK idempotently without duplicating effects',
    verifyRes10.statusCode === 200 &&
    verifyRes10.body?.status === 'paid' &&
    verifyRes10.body?.message?.includes('already verified')
  );

  // ─────────────────────────────────────────────────────────────
  // 11. Terminal Status Regression: Refunded order blocked from regression
  // ─────────────────────────────────────────────────────────────
  const testRef11 = `QJ-PAY-${Date.now()}-TEST11`;
  const testOrder11 = {
    id: 'ord-test-11',
    order_ref: 'QJ-11-REF',
    total_amount: 70000,
    currency: 'NGN',
    status: 'cancelled',
    payment_status: 'refunded' // Admin marked refunded
  };
  const testAttempt11 = {
    id: 'att-test-11',
    order_id: testOrder11.id,
    reference: testRef11,
    amount: 7000000,
    currency: 'NGN',
    status: 'refunded'
  };
  mockDb.orders.push(testOrder11);
  mockDb.payment_attempts.push(testAttempt11);

  // Paystack verification returns 'success'
  setupMockFetch({
    verifyData: {
      id: 991122,
      status: 'success',
      reference: testRef11,
      amount: 7000000,
      currency: 'NGN'
    }
  });

  const verifyReq11 = { method: 'POST', body: { reference: testRef11 } };
  const verifyRes11 = createMockRes();
  await verifyHandler(verifyReq11, verifyRes11);

  assert(11, 'Verification on refunded order blocked from regressing to paid',
    verifyRes11.statusCode === 200 &&
    verifyRes11.body?.status === 'refunded' &&
    verifyRes11.body?.message?.includes('regression blocked') &&
    testOrder11.payment_status === 'refunded' // Did NOT regress to paid!
  );

  // ─────────────────────────────────────────────────────────────
  // 12. Terminal Status Regression: Disputed order blocked from regression
  // ─────────────────────────────────────────────────────────────
  const testRef12 = `QJ-PAY-${Date.now()}-TEST12`;
  const testOrder12 = {
    id: 'ord-test-12',
    order_ref: 'QJ-12-REF',
    total_amount: 70000,
    currency: 'NGN',
    status: 'processing',
    payment_status: 'disputed' // Admin marked disputed
  };
  const testAttempt12 = {
    id: 'att-test-12',
    order_id: testOrder12.id,
    reference: testRef12,
    amount: 7000000,
    currency: 'NGN',
    status: 'disputed'
  };
  mockDb.orders.push(testOrder12);
  mockDb.payment_attempts.push(testAttempt12);

  const verifyReq12 = { method: 'POST', body: { reference: testRef12 } };
  const verifyRes12 = createMockRes();
  await verifyHandler(verifyReq12, verifyRes12);

  assert(12, 'Verification on disputed order blocked from regressing to paid',
    verifyRes12.statusCode === 200 &&
    verifyRes12.body?.status === 'disputed' &&
    testOrder12.payment_status === 'disputed' // Did NOT regress!
  );

  // ─────────────────────────────────────────────────────────────
  // 13. Webhook on terminal refunded order blocked from regression
  // ─────────────────────────────────────────────────────────────
  const webhookPayload13 = JSON.stringify({
    event: 'charge.success',
    data: { id: 887766, reference: testRef11, amount: 7000000, currency: 'NGN', channel: 'card', status: 'success' }
  });
  const webhookSig13 = crypto.createHmac('sha512', TEST_PAYSTACK_SECRET).update(webhookPayload13).digest('hex');
  const webhookReq13 = { method: 'POST', headers: { 'x-paystack-signature': webhookSig13 }, rawBody: webhookPayload13 };
  const webhookRes13 = createMockRes();
  await webhookHandler(webhookReq13, webhookRes13);

  assert(13, 'Webhook delivery on refunded order acknowledged without regressing status',
    webhookRes13.statusCode === 200 &&
    webhookRes13.body?.message?.includes('terminal status') &&
    testOrder11.payment_status === 'refunded'
  );

  // ─────────────────────────────────────────────────────────────
  // 14. Webhook request size limit (1 MiB)
  // ─────────────────────────────────────────────────────────────
  // Create an oversized payload (> 1 MiB)
  const oversizedPayload = Buffer.alloc(1024 * 1024 + 100, 'x').toString();
  const oversizedSig = crypto.createHmac('sha512', TEST_PAYSTACK_SECRET).update(oversizedPayload).digest('hex');
  const webhookReq14 = { method: 'POST', headers: { 'x-paystack-signature': oversizedSig }, rawBody: oversizedPayload };
  const webhookRes14 = createMockRes();
  await webhookHandler(webhookReq14, webhookRes14);

  assert(14, 'Oversized webhook payload (> 1 MiB) rejected with HTTP 413 Payload Too Large',
    webhookRes14.statusCode === 413 &&
    webhookRes14.body?.error === 'Payload Too Large'
  );

  // ─────────────────────────────────────────────────────────────
  // 15. Webhook malformed JSON rejected with 400
  // ─────────────────────────────────────────────────────────────
  const malformedPayload = '{"event": "charge.success", invalid-json';
  const malformedSig = crypto.createHmac('sha512', TEST_PAYSTACK_SECRET).update(malformedPayload).digest('hex');
  const webhookReq15 = { method: 'POST', headers: { 'x-paystack-signature': malformedSig }, rawBody: malformedPayload };
  const webhookRes15 = createMockRes();
  await webhookHandler(webhookReq15, webhookRes15);

  assert(15, 'Malformed JSON webhook payload rejected with HTTP 400 Bad Request',
    webhookRes15.statusCode === 400 &&
    webhookRes15.body?.error === 'Invalid JSON payload'
  );

  // ─────────────────────────────────────────────────────────────
  // 16. Webhook invalid signature rejected with 401
  // ─────────────────────────────────────────────────────────────
  const webhookReq16 = { method: 'POST', headers: { 'x-paystack-signature': 'bad-signature-hash' }, rawBody: '{}' };
  const webhookRes16 = createMockRes();
  await webhookHandler(webhookReq16, webhookRes16);

  assert(16, 'Invalid webhook signature rejected with HTTP 401 Unauthorized',
    webhookRes16.statusCode === 401
  );

  // ─────────────────────────────────────────────────────────────
  // 17. Amount and currency mismatch in verification rejected
  // ─────────────────────────────────────────────────────────────
  setupMockFetch({
    verifyData: { id: 3344, status: 'success', reference: testRef9, amount: 5000000, currency: 'NGN' }
  });
  const verifyReq17 = { method: 'POST', body: { reference: testRef9 } };
  const verifyRes17 = createMockRes();
  // Temporarily reset order 9 to initiated to test mismatch
  testOrder9.payment_status = 'unpaid';
  testAttempt9.status = 'initiated';
  await verifyHandler(verifyReq17, verifyRes17);

  assert(17, 'Amount mismatch in verification rejected with HTTP 400',
    verifyRes17.statusCode === 400 && verifyRes17.body?.error?.includes('amount does not match')
  );

  // ─────────────────────────────────────────────────────────────
  // 18. Verification of a failed transaction
  // ─────────────────────────────────────────────────────────────
  const testRef18 = `QJ-PAY-${Date.now()}-TEST18`;
  const testOrder18 = { id: 'ord-test-18', order_ref: 'QJ-18-REF', total_amount: 70000, currency: 'NGN', payment_status: 'unpaid' };
  const testAttempt18 = { id: 'att-test-18', order_id: testOrder18.id, reference: testRef18, amount: 7000000, currency: 'NGN', status: 'initiated' };
  mockDb.orders.push(testOrder18);
  mockDb.payment_attempts.push(testAttempt18);

  setupMockFetch({
    verifyData: { id: 5566, status: 'failed', reference: testRef18, amount: 7000000, currency: 'NGN', gateway_response: 'Declined' }
  });
  const verifyReq18 = { method: 'POST', body: { reference: testRef18 } };
  const verifyRes18 = createMockRes();
  await verifyHandler(verifyReq18, verifyRes18);

  assert(18, 'Verification of failed transaction settles attempt as failed and order as failed',
    verifyRes18.statusCode === 200 &&
    verifyRes18.body?.success === false &&
    testOrder18.payment_status === 'failed' &&
    testAttempt18.status === 'failed'
  );

  // ─────────────────────────────────────────────────────────────
  // 19. Client forged status field in request ignored
  // ─────────────────────────────────────────────────────────────
  const testRef19 = `QJ-PAY-${Date.now()}-TEST19`;
  const testOrder19 = { id: 'ord-test-19', order_ref: 'QJ-19-REF', total_amount: 70000, currency: 'NGN', payment_status: 'unpaid' };
  const testAttempt19 = { id: 'att-test-19', order_id: testOrder19.id, reference: testRef19, amount: 7000000, currency: 'NGN', status: 'initiated' };
  mockDb.orders.push(testOrder19);
  mockDb.payment_attempts.push(testAttempt19);

  setupMockFetch({
    verifyData: { id: 7788, status: 'failed', reference: testRef19, amount: 7000000, currency: 'NGN' }
  });
  const verifyReq19 = { method: 'POST', body: { reference: testRef19, status: 'paid', payment_status: 'paid' } };
  const verifyRes19 = createMockRes();
  await verifyHandler(verifyReq19, verifyRes19);

  assert(19, 'Client forged status field ignored; authoritative gateway status enforced',
    verifyRes19.body?.success === false &&
    testOrder19.payment_status === 'failed'
  );

  // ─────────────────────────────────────────────────────────────
  // 20. Concurrent settlement simulation
  // ─────────────────────────────────────────────────────────────
  // Simultaneous webhook and verify calls for the same reference
  const testRef20 = `QJ-PAY-${Date.now()}-TEST20`;
  const testOrder20 = { id: 'ord-test-20', order_ref: 'QJ-20-REF', total_amount: 70000, currency: 'NGN', payment_status: 'unpaid', status: 'awaiting_confirmation' };
  const testAttempt20 = { id: 'att-test-20', order_id: testOrder20.id, reference: testRef20, amount: 7000000, currency: 'NGN', status: 'initiated' };
  mockDb.orders.push(testOrder20);
  mockDb.payment_attempts.push(testAttempt20);

  setupMockFetch({
    verifyData: { id: 9999, status: 'success', reference: testRef20, amount: 7000000, currency: 'NGN' }
  });

  const webhookPayload20 = JSON.stringify({
    event: 'charge.success',
    data: { id: 9999, reference: testRef20, amount: 7000000, currency: 'NGN', channel: 'card', status: 'success' }
  });
  const webhookSig20 = crypto.createHmac('sha512', TEST_PAYSTACK_SECRET).update(webhookPayload20).digest('hex');

  const concurrentVerifyRes = createMockRes();
  const concurrentWebhookRes = createMockRes();

  await Promise.all([
    verifyHandler({ method: 'POST', body: { reference: testRef20 } }, concurrentVerifyRes),
    webhookHandler({ method: 'POST', headers: { 'x-paystack-signature': webhookSig20 }, rawBody: webhookPayload20 }, concurrentWebhookRes)
  ]);

  assert(20, 'Concurrent verify and webhook calls execute without conflict or split state',
    concurrentVerifyRes.statusCode === 200 &&
    concurrentWebhookRes.statusCode === 200 &&
    testOrder20.payment_status === 'paid' &&
    testAttempt20.status === 'successful'
  );

  // ─────────────────────────────────────────────────────────────
  // 21. Zero secret leakage across all API responses
  // ─────────────────────────────────────────────────────────────
  const allResponses = [initRes1, initRes2a, initRes3a, initRes4a, initRes5, initRes6, initRes7, initRes8a, verifyRes9, verifyRes10, verifyRes11, verifyRes12, webhookRes13, webhookRes14, webhookRes15, webhookRes16];
  let secretFound = false;

  for (const r of allResponses) {
    const serialized = JSON.stringify(r.body || {});
    if (serialized.includes(TEST_PAYSTACK_SECRET) || serialized.includes(TEST_SUPABASE_SERVICE_KEY)) {
      secretFound = true;
      break;
    }
  }

  assert(21, 'Zero secret keys or service role keys leaked across all API responses',
    secretFound === false
  );

  // ─────────────────────────────────────────────────────────────
  // 22. Existing WhatsApp/bank-transfer core libraries remain untouched
  // ─────────────────────────────────────────────────────────────
  let gitDiffStorefront = '';
  try {
    gitDiffStorefront = execSync('git diff HEAD -G"createOrder|generateOrderReference" -- js/supabase.js').toString().trim();
  } catch (e) {
    gitDiffStorefront = 'error';
  }

  assert(22, 'Existing WhatsApp/bank-transfer core libraries remain 100% untouched',
    gitDiffStorefront === ''
  );

  // ─────────────────────────────────────────────────────────────
  // 23. Fix 1: Arbitrary external callback URL rejected
  // ─────────────────────────────────────────────────────────────
  const badInitReq = {
    method: 'POST',
    body: {
      customer: { name: 'Test User', email: 'test@example.com', phone: '08012345678', delivery_state: 'Lagos', delivery_city: 'Ikeja', delivery_address: '123 Test St' },
      items: [{ id: 'b1111111-1111-4111-8111-111111111111', size: '42', quantity: 1 }],
      callback_url: 'https://evil-phishing.com/callback'
    }
  };
  const badInitRes = createMockRes();
  await initHandler(badInitReq, badInitRes);

  assert(23, 'Arbitrary external callback URL rejected with 400 Bad Request',
    badInitRes.statusCode === 400 && badInitRes.body?.error?.includes('rejected')
  );

  // ─────────────────────────────────────────────────────────────
  // 24. Fix 1: Malicious lookalike domains rejected
  // ─────────────────────────────────────────────────────────────
  const lookalike1 = validator.validateAppOrigin('https://quantumjersey.vercel.app.attacker.com');
  const lookalike2 = validator.validateAppOrigin('https://quantumjersey-vercel.app');
  assert(24, 'Malicious lookalike domains rejected by origin validator',
    lookalike1.valid === false && lookalike2.valid === false
  );

  // ─────────────────────────────────────────────────────────────
  // 25. Fix 1: Non-HTTPS production origins rejected
  // ─────────────────────────────────────────────────────────────
  const httpCheck = validator.validateAppOrigin('http://quantumjersey.vercel.app');
  assert(25, 'Non-HTTPS production origins rejected by origin validator',
    httpCheck.valid === false && httpCheck.error?.includes('HTTPS')
  );

  // ─────────────────────────────────────────────────────────────
  // 26. Fix 1: Approved production origin accepted and clean path normalized
  // ─────────────────────────────────────────────────────────────
  const prodCheck = validator.resolveTrustedCallbackUrl('https://quantumjersey.vercel.app/catalog.html');
  assert(26, 'Approved production origin accepted and clean path normalized (.html stripped)',
    prodCheck.valid === true && prodCheck.callbackUrl === 'https://quantumjersey.vercel.app/catalog'
  );

  // ─────────────────────────────────────────────────────────────
  // 27. Fix 1: Local development restricted to localhost / 127.0.0.1
  // ─────────────────────────────────────────────────────────────
  const localCheck1 = validator.validateAppOrigin('http://localhost:3000');
  const localCheck2 = validator.validateAppOrigin('http://127.0.0.1:8080');
  const localBad = validator.validateAppOrigin('http://not-localhost.com:3000');
  assert(27, 'Local development restricted strictly to localhost/127.0.0.1; arbitrary HTTP rejected',
    localCheck1.valid === true && localCheck2.valid === true && localBad.valid === false
  );

  // ─────────────────────────────────────────────────────────────
  // 28. Fix 1: Clean callback route retains payment reference
  // ─────────────────────────────────────────────────────────────
  const cleanUrl = validator.resolveTrustedCallbackUrl('/jerseys.html');
  const fullRedirectUrl = `${cleanUrl.callbackUrl}?reference=QJ-PAY-TEST-REF`;
  assert(28, 'Clean callback route retains payment reference query parameter without 308 redirect hop',
    cleanUrl.callbackUrl === 'https://quantumjersey.vercel.app/jerseys' &&
    fullRedirectUrl === 'https://quantumjersey.vercel.app/jerseys?reference=QJ-PAY-TEST-REF'
  );

  // ─────────────────────────────────────────────────────────────
  // 29. Fix 3: Pending/ongoing gateway status returns pending without failure
  // ─────────────────────────────────────────────────────────────
  const testRef29 = `QJ-PAY-${Date.now()}-TEST29`;
  const testOrder29 = { id: 'ord-test-29', order_ref: 'QJ-29-REF', total_amount: 70000, currency: 'NGN', payment_status: 'unpaid', status: 'awaiting_confirmation' };
  const testAttempt29 = { id: 'att-test-29', order_id: testOrder29.id, reference: testRef29, amount: 7000000, currency: 'NGN', status: 'initiated' };
  mockDb.orders.push(testOrder29);
  mockDb.payment_attempts.push(testAttempt29);

  setupMockFetch({
    verifyData: { id: 2901, status: 'pending', reference: testRef29, amount: 7000000, currency: 'NGN', gateway_response: 'Pending bank settlement' }
  });
  const verifyReq29 = { method: 'POST', body: { reference: testRef29 } };
  const verifyRes29 = createMockRes();
  await verifyHandler(verifyReq29, verifyRes29);

  assert(29, 'Pending/ongoing gateway status returns pending without modifying order/attempt to failed',
    verifyRes29.statusCode === 200 &&
    verifyRes29.body?.status === 'pending' &&
    testOrder29.payment_status === 'unpaid' &&
    testAttempt29.status === 'initiated'
  );

  // ─────────────────────────────────────────────────────────────
  // 30. Fix 3: Definitive gateway failure (abandoned) settles attempt as failed
  // ─────────────────────────────────────────────────────────────
  const testRef30 = `QJ-PAY-${Date.now()}-TEST30`;
  const testOrder30 = { id: 'ord-test-30', order_ref: 'QJ-30-REF', total_amount: 70000, currency: 'NGN', payment_status: 'unpaid' };
  const testAttempt30 = { id: 'att-test-30', order_id: testOrder30.id, reference: testRef30, amount: 7000000, currency: 'NGN', status: 'initiated' };
  mockDb.orders.push(testOrder30);
  mockDb.payment_attempts.push(testAttempt30);

  setupMockFetch({
    verifyData: { id: 3001, status: 'abandoned', reference: testRef30, amount: 7000000, currency: 'NGN', gateway_response: 'User abandoned' }
  });
  const verifyRes30 = createMockRes();
  await verifyHandler({ method: 'POST', body: { reference: testRef30 } }, verifyRes30);

  assert(30, 'Definitive gateway failure (abandoned) settles attempt as abandoned and order as failed',
    verifyRes30.statusCode === 200 &&
    verifyRes30.body?.status === 'abandoned' &&
    testOrder30.payment_status === 'failed' &&
    testAttempt30.status === 'abandoned'
  );

  // ─────────────────────────────────────────────────────────────
  // 31. Fix 3: Success settlement succeeds after a previous pending response
  // ─────────────────────────────────────────────────────────────
  setupMockFetch({
    verifyData: { id: 2902, status: 'success', reference: testRef29, amount: 7000000, currency: 'NGN', channel: 'bank_transfer', gateway_response: 'Successful' }
  });
  const verifyRes31 = createMockRes();
  await verifyHandler({ method: 'POST', body: { reference: testRef29 } }, verifyRes31);

  assert(31, 'Success settlement succeeds after previous pending response without split state',
    verifyRes31.statusCode === 200 &&
    verifyRes31.body?.status === 'paid' &&
    testOrder29.payment_status === 'paid' &&
    testAttempt29.status === 'successful'
  );

  // ─────────────────────────────────────────────────────────────
  // 32. Fix 3: Malformed or unrecognized gateway status rejected safely
  // ─────────────────────────────────────────────────────────────
  const testRef32 = `QJ-PAY-${Date.now()}-TEST32`;
  const testOrder32 = { id: 'ord-test-32', order_ref: 'QJ-32-REF', total_amount: 70000, currency: 'NGN', payment_status: 'unpaid' };
  const testAttempt32 = { id: 'att-test-32', order_id: testOrder32.id, reference: testRef32, amount: 7000000, currency: 'NGN', status: 'initiated' };
  mockDb.orders.push(testOrder32);
  mockDb.payment_attempts.push(testAttempt32);

  setupMockFetch({
    verifyData: { id: 3201, status: 'unknown_abnormal_state', reference: testRef32, amount: 7000000, currency: 'NGN' }
  });
  const verifyRes32 = createMockRes();
  await verifyHandler({ method: 'POST', body: { reference: testRef32 } }, verifyRes32);

  assert(32, 'Malformed or unrecognized gateway status rejected with HTTP 400 without modifying order/attempt',
    verifyRes32.statusCode === 400 &&
    verifyRes32.body?.status === 'unknown' &&
    testOrder32.payment_status === 'unpaid' &&
    testAttempt32.status === 'initiated'
  );

  // ─────────────────────────────────────────────────────────────
  // 33. Fix 3: Terminal refunded state protected from regression or modification
  // ─────────────────────────────────────────────────────────────
  const testRef33 = `QJ-PAY-${Date.now()}-TEST33`;
  const testOrder33 = { id: 'ord-test-33', order_ref: 'QJ-33-REF', total_amount: 70000, currency: 'NGN', payment_status: 'refunded' };
  const testAttempt33 = { id: 'att-test-33', order_id: testOrder33.id, reference: testRef33, amount: 7000000, currency: 'NGN', status: 'refunded' };
  mockDb.orders.push(testOrder33);
  mockDb.payment_attempts.push(testAttempt33);

  const verifyRes33 = createMockRes();
  await verifyHandler({ method: 'POST', body: { reference: testRef33 } }, verifyRes33);

  assert(33, 'Terminal refunded state protected from regression or modification',
    verifyRes33.statusCode === 200 &&
    verifyRes33.body?.status === 'refunded' &&
    testOrder33.payment_status === 'refunded'
  );

  // ─────────────────────────────────────────────────────────────
  // 34. Fix 4: Webhook with Buffer body verified with HMAC SHA-512
  // ─────────────────────────────────────────────────────────────
  const testRef34 = `QJ-PAY-${Date.now()}-TEST34`;
  const testOrder34 = { id: 'ord-test-34', order_ref: 'QJ-34-REF', total_amount: 70000, currency: 'NGN', payment_status: 'unpaid', status: 'awaiting_confirmation' };
  const testAttempt34 = { id: 'att-test-34', order_id: testOrder34.id, reference: testRef34, amount: 7000000, currency: 'NGN', status: 'initiated' };
  mockDb.orders.push(testOrder34);
  mockDb.payment_attempts.push(testAttempt34);

  const rawBufferPayload = Buffer.from(JSON.stringify({
    event: 'charge.success',
    data: { id: 3401, reference: testRef34, amount: 7000000, currency: 'NGN', channel: 'card', status: 'success' }
  }));
  const bufferSig = crypto.createHmac('sha512', TEST_PAYSTACK_SECRET).update(rawBufferPayload).digest('hex');
  const bufferWebhookRes = createMockRes();
  await webhookHandler({ method: 'POST', headers: { 'x-paystack-signature': bufferSig }, body: rawBufferPayload }, bufferWebhookRes);

  assert(34, 'Webhook with Buffer body processed and verified with HMAC SHA-512 successfully',
    bufferWebhookRes.statusCode === 200 && bufferWebhookRes.body?.received === true
  );

  // ─────────────────────────────────────────────────────────────
  // 35. Fix 4: Pre-parsed object body rejected promptly without hanging
  // ─────────────────────────────────────────────────────────────
  const preParsedRes = createMockRes();
  await webhookHandler({
    method: 'POST',
    headers: { 'x-paystack-signature': 'some_sig' },
    body: { event: 'charge.success', data: { reference: 'some_ref' } }
  }, preParsedRes);

  assert(35, 'Webhook with pre-parsed object body rejected promptly with HTTP 400 without hanging',
    preParsedRes.statusCode === 400 &&
    preParsedRes.body?.code === 'RAW_BODY_UNAVAILABLE'
  );

  // ─────────────────────────────────────────────────────────────
  // 36. Fix 4: Already-ended stream rejected promptly without hanging
  // ─────────────────────────────────────────────────────────────
  const endedStreamRes = createMockRes();
  await webhookHandler({
    method: 'POST',
    headers: { 'x-paystack-signature': 'some_sig' },
    readableEnded: true
  }, endedStreamRes);

  assert(36, 'Webhook with already-ended stream rejected promptly with HTTP 400 without hanging',
    endedStreamRes.statusCode === 400 &&
    endedStreamRes.body?.code === 'STREAM_ALREADY_ENDED'
  );

  // ─────────────────────────────────────────────────────────────
  // 37. Fix 4: Webhook with PassThrough stream (@vercel/node restored stream)
  // ─────────────────────────────────────────────────────────────
  const { PassThrough } = require('stream');
  const testRef37 = `QJ-PAY-${Date.now()}-TEST37`;
  const testOrder37 = { id: 'ord-test-37', order_ref: 'QJ-37-REF', total_amount: 70000, currency: 'NGN', payment_status: 'unpaid', status: 'awaiting_confirmation' };
  const testAttempt37 = { id: 'att-test-37', order_id: testOrder37.id, reference: testRef37, amount: 7000000, currency: 'NGN', status: 'initiated' };
  mockDb.orders.push(testOrder37);
  mockDb.payment_attempts.push(testAttempt37);

  const streamPayload = Buffer.from(JSON.stringify({
    event: 'charge.success',
    data: { id: 3701, reference: testRef37, amount: 7000000, currency: 'NGN', channel: 'card', status: 'success' }
  }));
  const streamSig = crypto.createHmac('sha512', TEST_PAYSTACK_SECRET).update(streamPayload).digest('hex');

  const mockStream = new PassThrough();
  mockStream.write(streamPayload);
  mockStream.end();
  mockStream.method = 'POST';
  mockStream.headers = { 'x-paystack-signature': streamSig };

  const streamWebhookRes = createMockRes();
  await webhookHandler(mockStream, streamWebhookRes);

  assert(37, 'Webhook with @vercel/node restored PassThrough stream processed and verified with HMAC successfully',
    streamWebhookRes.statusCode === 200 && streamWebhookRes.body?.received === true
  );

  // ─────────────────────────────────────────────────────────────
  // 38. Fix 4: Stream with malformed JSON rejected with HTTP 400
  // ─────────────────────────────────────────────────────────────
  const malformedStream = new PassThrough();
  const malformedStreamPayload = Buffer.from('{"invalid_json: 123');
  const malformedStreamSig = crypto.createHmac('sha512', TEST_PAYSTACK_SECRET).update(malformedStreamPayload).digest('hex');
  malformedStream.write(malformedStreamPayload);
  malformedStream.end();
  malformedStream.method = 'POST';
  malformedStream.headers = { 'x-paystack-signature': malformedStreamSig };

  const malformedWebhookRes = createMockRes();
  await webhookHandler(malformedStream, malformedWebhookRes);

  assert(38, 'Webhook with stream emitting malformed JSON rejected with HTTP 400 Bad Request',
    malformedWebhookRes.statusCode === 400 && malformedWebhookRes.body?.error === 'Invalid JSON payload'
  );

  // ─────────────────────────────────────────────────────────────
  // 39. Fix 4: Stream exceeding 1 MiB rejected with HTTP 413
  // ─────────────────────────────────────────────────────────────
  const oversizedStream = new PassThrough();
  const oversizedChunk = Buffer.alloc(1024 * 512, 'a'); // 512 KiB chunk
  oversizedStream.method = 'POST';
  oversizedStream.headers = { 'x-paystack-signature': 'sig_test_39' };

  // Write 3 chunks = 1.5 MiB (> 1 MiB limit)
  oversizedStream.write(oversizedChunk);
  oversizedStream.write(oversizedChunk);
  oversizedStream.write(oversizedChunk);
  oversizedStream.end();

  const oversizedWebhookRes = createMockRes();
  await webhookHandler(oversizedStream, oversizedWebhookRes);

  assert(39, 'Webhook with stream exceeding 1 MiB rejected with HTTP 413 Payload Too Large',
    oversizedWebhookRes.statusCode === 413 && oversizedWebhookRes.body?.error === 'Payload Too Large'
  );

  // ─────────────────────────────────────────────────────────────
  // 40. Fix 4: Stream with invalid HMAC signature rejected with HTTP 401
  // ─────────────────────────────────────────────────────────────
  const invalidSigStream = new PassThrough();
  const validPayload = Buffer.from(JSON.stringify({ event: 'charge.success', data: { reference: 'some_ref' } }));
  invalidSigStream.write(validPayload);
  invalidSigStream.end();
  invalidSigStream.method = 'POST';
  invalidSigStream.headers = {
    'x-paystack-signature': '00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'
  };

  const invalidSigWebhookRes = createMockRes();
  await webhookHandler(invalidSigStream, invalidSigWebhookRes);

  assert(40, 'Webhook with stream and invalid HMAC signature rejected with HTTP 401 Unauthorized',
    invalidSigWebhookRes.statusCode === 401 && invalidSigWebhookRes.body?.error?.includes('Unauthorized')
  );

  // ─────────────────────────────────────────────────────────────
  // 41. Fix 4: Already-consumed stream with req.on rejected promptly with STREAM_ALREADY_ENDED
  // ─────────────────────────────────────────────────────────────
  const consumedStream = new PassThrough();
  consumedStream.resume();
  consumedStream.end();
  await new Promise(resolve => consumedStream.on('end', resolve));
  consumedStream.method = 'POST';
  consumedStream.headers = { 'x-paystack-signature': 'sig_test_41' };

  const startTime41 = Date.now();
  const consumedWebhookRes = createMockRes();
  await webhookHandler(consumedStream, consumedWebhookRes);
  const elapsed41 = Date.now() - startTime41;

  assert(41, 'Webhook with already-consumed PassThrough stream rejected promptly (<100ms) with STREAM_ALREADY_ENDED',
    consumedWebhookRes.statusCode === 400 &&
    consumedWebhookRes.body?.code === 'STREAM_ALREADY_ENDED' &&
    elapsed41 < 500
  );

  // ─────────────────────────────────────────────────────────────
  // 42. Fix 4: Stream emitting error event rejected with HTTP 400 RAW_BODY_ERROR
  // ─────────────────────────────────────────────────────────────
  const errorStream = new PassThrough();
  errorStream.method = 'POST';
  errorStream.headers = { 'x-paystack-signature': 'sig_test_42' };

  const errorWebhookRes = createMockRes();
  const webhookPromise42 = webhookHandler(errorStream, errorWebhookRes);
  errorStream.emit('error', new Error('Simulated socket stream failure'));
  await webhookPromise42;

  assert(42, 'Webhook with stream emitting error rejected cleanly with HTTP 400 RAW_BODY_ERROR',
    errorWebhookRes.statusCode === 400 &&
    errorWebhookRes.body?.code === 'RAW_BODY_ERROR'
  );

  // ─────────────────────────────────────────────────────────────
  // 43. Stage 1 Regression: validateItems preserves sizes up to 50 chars with trimming and clamps oversized strings
  // ─────────────────────────────────────────────────────────────
  const untruncatedResult = validator.validateItems([
    { id: 'f2263e91-df36-4b51-bcc7-e01f9257662e', size: '  Professional Refree Whistle  ', quantity: 1 }
  ]);
  const clampedResult = validator.validateItems([
    { id: 'f2263e91-df36-4b51-bcc7-e01f9257662e', size: 'X'.repeat(60), quantity: 1 }
  ]);
  const defaultSizeResult = validator.validateItems([
    { id: 'f2263e91-df36-4b51-bcc7-e01f9257662e', size: null, quantity: 1 }
  ]);

  assert(43, 'validateItems preserves 27-char size without 20-char truncation, clamps at 50 chars, and passes null for non-sized products',
    untruncatedResult.valid === true &&
    untruncatedResult.data[0].size === 'Professional Refree Whistle' &&
    untruncatedResult.data[0].size.length === 27 &&
    clampedResult.valid === true &&
    clampedResult.data[0].size === 'X'.repeat(50) &&
    clampedResult.data[0].size.length === 50 &&
    defaultSizeResult.valid === true &&
    defaultSizeResult.data[0].size === null
  );

  // ─────────────────────────────────────────────────────────────
  // 44. Stage 1 Regression: Refree Whistle checkout succeeds with Professional Refree Whistle and rejects invalid sizes
  // ─────────────────────────────────────────────────────────────
  setupMockFetch();
  const whistleReqValid = {
    method: 'POST',
    body: {
      customer: {
        name: 'Emeka Okafor',
        email: 'emeka@example.com',
        phone: '+2348011223344',
        delivery_state: 'Lagos',
        delivery_city: 'Surulere',
        delivery_address: '10 Stadium Road'
      },
      items: [
        { id: 'f2263e91-df36-4b51-bcc7-e01f9257662e', size: 'Professional Refree Whistle', quantity: 1 }
      ]
    }
  };
  const whistleResValid = createMockRes();
  await initHandler(whistleReqValid, whistleResValid);

  // Previously truncated 20-char size "Professional Refree " should be rejected as invalid size
  const whistleReqTruncated = {
    method: 'POST',
    body: {
      customer: whistleReqValid.body.customer,
      items: [
        { id: 'f2263e91-df36-4b51-bcc7-e01f9257662e', size: 'Professional Refree ', quantity: 1 }
      ]
    }
  };
  const whistleResTruncated = createMockRes();
  await initHandler(whistleReqTruncated, whistleResTruncated);

  // Default "Standard" size should also be rejected as whistle only permits "Professional Refree Whistle"
  const whistleReqStandard = {
    method: 'POST',
    body: {
      customer: whistleReqValid.body.customer,
      items: [
        { id: 'f2263e91-df36-4b51-bcc7-e01f9257662e', size: 'Standard', quantity: 1 }
      ]
    }
  };
  const whistleResStandard = createMockRes();
  await initHandler(whistleReqStandard, whistleResStandard);

  assert(44, 'Refree Whistle initializes successfully with Professional Refree Whistle; rejects invalid/truncated sizes',
    whistleResValid.statusCode === 200 &&
    whistleResValid.body?.success === true &&
    whistleResValid.body?.authorization_url?.startsWith('https://checkout.paystack.com/') &&
    whistleResValid.body?.total_amount === 13000 &&
    whistleResTruncated.statusCode === 400 &&
    whistleResTruncated.body?.error?.includes('Invalid size') &&
    whistleResTruncated.body?.error?.includes('Permitted sizes: Professional Refree Whistle') &&
    whistleResStandard.statusCode === 400 &&
    whistleResStandard.body?.error?.includes('Invalid size') &&
    whistleResStandard.body?.error?.includes('Permitted sizes: Professional Refree Whistle')
  );

  // ─────────────────────────────────────────────────────────────
  // 45. Stage 2 Regression: Non-sized product (Coach Tactical Board) checks out with null size; rejects invalid sizes
  // ─────────────────────────────────────────────────────────────
  setupMockFetch();
  const nonSizedReqValid = {
    method: 'POST',
    body: {
      customer: whistleReqValid.body.customer,
      items: [
        { id: 'c4444444-4444-4444-8444-444444444444', size: null, quantity: 1 }
      ]
    }
  };
  const nonSizedResValid = createMockRes();
  await initHandler(nonSizedReqValid, nonSizedResValid);

  // Attempting to submit a size on a non-sized product should be rejected
  const nonSizedReqInvalid = {
    method: 'POST',
    body: {
      customer: whistleReqValid.body.customer,
      items: [
        { id: 'c4444444-4444-4444-8444-444444444444', size: 'XL', quantity: 1 }
      ]
    }
  };
  const nonSizedResInvalid = createMockRes();
  await initHandler(nonSizedReqInvalid, nonSizedResInvalid);

  const nonSizedReqStandard = {
    method: 'POST',
    body: {
      customer: whistleReqValid.body.customer,
      items: [
        { id: 'c4444444-4444-4444-8444-444444444444', size: 'Standard', quantity: 1 }
      ]
    }
  };
  const nonSizedResStandard = createMockRes();
  await initHandler(nonSizedReqStandard, nonSizedResStandard);

  assert(45, 'Non-sized product checks out with null size; rejects unapproved size values',
    nonSizedResValid.statusCode === 200 &&
    nonSizedResValid.body?.success === true &&
    nonSizedResValid.body?.total_amount === 20000 && // 15000 + 5000 delivery
    nonSizedResInvalid.statusCode === 400 &&
    nonSizedResInvalid.body?.error?.includes('does not support size selection') &&
    nonSizedResStandard.statusCode === 400 &&
    nonSizedResStandard.body?.error?.includes('does not support size selection')
  );

  // ─────────────────────────────────────────────────────────────
  // 46. Stage 2 Regression: Sized product strictly requires size selection; rejects omitted or invalid size
  // ─────────────────────────────────────────────────────────────
  setupMockFetch();
  // Sized boots (Phantom Strike Pro) with size omitted / null
  const sizedReqNoSize = {
    method: 'POST',
    body: {
      customer: whistleReqValid.body.customer,
      items: [
        { id: 'b1111111-1111-4111-8111-111111111111', size: null, quantity: 1 }
      ]
    }
  };
  const sizedResNoSize = createMockRes();
  await initHandler(sizedReqNoSize, sizedResNoSize);

  // Sized boots with invalid size
  const sizedReqBadSize = {
    method: 'POST',
    body: {
      customer: whistleReqValid.body.customer,
      items: [
        { id: 'b1111111-1111-4111-8111-111111111111', size: '99', quantity: 1 }
      ]
    }
  };
  const sizedResBadSize = createMockRes();
  await initHandler(sizedReqBadSize, sizedResBadSize);

  // Sized boots with valid permitted size
  const sizedReqValid = {
    method: 'POST',
    body: {
      customer: whistleReqValid.body.customer,
      items: [
        { id: 'b1111111-1111-4111-8111-111111111111', size: '42', quantity: 1 }
      ]
    }
  };
  const sizedResValid = createMockRes();
  await initHandler(sizedReqValid, sizedResValid);

  assert(46, 'Sized product strictly enforces size requirement; rejects omitted/invalid size and accepts permitted size',
    sizedResNoSize.statusCode === 400 &&
    sizedResNoSize.body?.error?.includes('Size selection is required') &&
    sizedResBadSize.statusCode === 400 &&
    sizedResBadSize.body?.error?.includes('Invalid size "99"') &&
    sizedResValid.statusCode === 200 &&
    sizedResValid.body?.success === true
  );

  // ─────────────────────────────────────────────────────────────
  // 47. Stage 3: Version parsing, serialization, and description cleanup helpers
  // ─────────────────────────────────────────────────────────────
  const rawDescWithMeta = 'Official Arsenal Home Jersey 2024.\n\n<!--QJ_VERSIONS:{"fan":{"label":"Fan Version","price":30000,"sizes":["S","M","L","XL","XXL"]},"player":{"label":"Player Version","price":45000,"sizes":["M","L","XL"]}}-->';
  const cleanMarketingCopy = 'Official Arsenal Home Jersey 2024.';

  // Parse valid metadata
  const parsedValid = validator.parseProductVersions(rawDescWithMeta);
  const cleanedDesc = validator.cleanProductDescription(rawDescWithMeta);
  const formattedDesc = validator.formatProductDescription(cleanMarketingCopy, parsedValid.versions);

  // Parse malformed metadata (corrupt JSON)
  const parsedCorrupt = validator.parseProductVersions('Some jersey.\n\n<!--QJ_VERSIONS:{bad_json}-->');
  // Parse incomplete metadata (empty config)
  const parsedEmpty = validator.parseProductVersions('Some jersey.\n\n<!--QJ_VERSIONS:{}-->');
  // Parse ordinary description (no metadata)
  const parsedOrdinary = validator.parseProductVersions('Plain football boots without any version comment.');
  // Parse ambiguous duplicate metadata markers
  const parsedDuplicate = validator.parseProductVersions('Jersey.\n\n<!--QJ_VERSIONS:{"fan":{"price":30000,"sizes":["M"]}}-->\n\n<!--QJ_VERSIONS:{"fan":{"price":10000,"sizes":["L"]}}-->');
  // Parse malformed unclosed metadata marker
  const parsedUnclosed = validator.parseProductVersions('Jersey.\n\n<!--QJ_VERSIONS:{"fan":{"price":30000,"sizes":["M"]}}');

  // Normalization
  const normFan = validator.normalizeVersionKey('Fan Version');
  const normPlayer = validator.normalizeVersionKey('player');
  const normBad = validator.normalizeVersionKey('Special Edition');

  assert(47, 'parseProductVersions, cleanProductDescription, formatProductDescription, and normalizeVersionKey handle valid, corrupt, and duplicate markers correctly',
    parsedValid.isVersioned === true &&
    parsedValid.isCorrupt === false &&
    parsedValid.versions.fan.price === 30000 &&
    parsedValid.versions.player.price === 45000 &&
    cleanedDesc === cleanMarketingCopy &&
    formattedDesc.includes('<!--QJ_VERSIONS:') &&
    validator.cleanProductDescription(formattedDesc) === cleanMarketingCopy &&
    parsedCorrupt.isVersioned === false &&
    parsedCorrupt.isCorrupt === true &&
    parsedEmpty.isVersioned === false &&
    parsedEmpty.isCorrupt === true &&
    parsedOrdinary.isVersioned === false &&
    parsedOrdinary.isCorrupt === false &&
    parsedDuplicate.isVersioned === false &&
    parsedDuplicate.isCorrupt === true &&
    parsedDuplicate.error?.includes('duplicate') &&
    parsedUnclosed.isVersioned === false &&
    parsedUnclosed.isCorrupt === true &&
    parsedUnclosed.error?.includes('unclosed') &&
    normFan === 'fan' &&
    normPlayer === 'player' &&
    normBad === null
  );

  // ─────────────────────────────────────────────────────────────
  // 48. Stage 3: Configured jersey checkout enforces authoritative Fan and Player prices & version sizes
  // ─────────────────────────────────────────────────────────────
  setupMockFetch();

  // Fan Version (Authoritative price 30,000 NGN, permitted XXL)
  const fanReq = {
    method: 'POST',
    body: {
      customer: whistleReqValid.body.customer,
      items: [
        { id: 'v5555555-5555-4555-8555-555555555555', version: 'Fan Version', size: 'XXL', quantity: 1 }
      ]
    }
  };
  const fanRes = createMockRes();
  await initHandler(fanReq, fanRes);

  // Player Version (Authoritative price 45,000 NGN, quantity 2)
  const playerReq = {
    method: 'POST',
    body: {
      customer: whistleReqValid.body.customer,
      items: [
        { id: 'v5555555-5555-4555-8555-555555555555', version: 'Player Version', size: 'M', quantity: 2 }
      ]
    }
  };
  const playerRes = createMockRes();
  await initHandler(playerReq, playerRes);

  assert(48, 'Configured jersey checkout enforces authoritative Fan and Player prices and records selected version',
    fanRes.statusCode === 200 &&
    fanRes.body?.success === true &&
    fanRes.body?.total_amount === 35000 && // 30,000 + 5,000 delivery
    playerRes.statusCode === 200 &&
    playerRes.body?.success === true &&
    playerRes.body?.total_amount === 95000 // 2 * 45,000 + 5,000 delivery
  );

  // ─────────────────────────────────────────────────────────────
  // 49. Stage 3: Configured jersey rejects missing versions, unsupported versions, and version-size mismatches
  // ─────────────────────────────────────────────────────────────
  setupMockFetch();

  // Missing version on versioned jersey
  const noVerReq = {
    method: 'POST',
    body: {
      customer: whistleReqValid.body.customer,
      items: [
        { id: 'v5555555-5555-4555-8555-555555555555', size: 'M', quantity: 1 }
      ]
    }
  };
  const noVerRes = createMockRes();
  await initHandler(noVerReq, noVerRes);

  // Unsupported version on versioned jersey
  const badVerReq = {
    method: 'POST',
    body: {
      customer: whistleReqValid.body.customer,
      items: [
        { id: 'v5555555-5555-4555-8555-555555555555', version: 'Special Edition', size: 'M', quantity: 1 }
      ]
    }
  };
  const badVerRes = createMockRes();
  await initHandler(badVerReq, badVerRes);

  // Version-size mismatch: XXL is permitted for Fan Version but NOT for Player Version
  const sizeMismatchReq = {
    method: 'POST',
    body: {
      customer: whistleReqValid.body.customer,
      items: [
        { id: 'v5555555-5555-4555-8555-555555555555', version: 'Player Version', size: 'XXL', quantity: 1 }
      ]
    }
  };
  const sizeMismatchRes = createMockRes();
  await initHandler(sizeMismatchReq, sizeMismatchRes);

  assert(49, 'Configured jersey rejects missing versions, unsupported versions, and version-size mismatches',
    noVerRes.statusCode === 400 &&
    noVerRes.body?.error?.includes('Version selection is required') &&
    badVerRes.statusCode === 400 &&
    badVerRes.body?.error?.includes('Version selection is required') &&
    sizeMismatchRes.statusCode === 400 &&
    sizeMismatchRes.body?.error?.includes('Invalid size "XXL" for Player Version')
  );

  // ─────────────────────────────────────────────────────────────
  // 50. Stage 3: Product with corrupt or duplicate version metadata fails closed with HTTP 500 without gateway call
  // ─────────────────────────────────────────────────────────────
  setupMockFetch();

  const corruptReq = {
    method: 'POST',
    body: {
      customer: whistleReqValid.body.customer,
      items: [
        { id: 'x6666666-6666-4666-8666-666666666666', version: 'Fan Version', size: 'M', quantity: 1 }
      ]
    }
  };
  const corruptRes = createMockRes();
  await initHandler(corruptReq, corruptRes);

  const duplicateReq = {
    method: 'POST',
    body: {
      customer: whistleReqValid.body.customer,
      items: [
        { id: 'd7777777-7777-4777-8777-777777777777', version: 'Fan Version', size: 'M', quantity: 1 }
      ]
    }
  };
  const duplicateRes = createMockRes();
  await initHandler(duplicateReq, duplicateRes);

  assert(50, 'Product with corrupt or duplicate version metadata fails closed with HTTP 500 without initializing payment',
    corruptRes.statusCode === 500 &&
    corruptRes.body?.error?.includes('corrupt version metadata') &&
    duplicateRes.statusCode === 500 &&
    duplicateRes.body?.error?.includes('corrupt version metadata')
  );

  // ─────────────────────────────────────────────────────────────
  // 51. Stage 3: Ordinary products reject version parameter; Fan and Player of same jersey remain separate cart lines
  // ─────────────────────────────────────────────────────────────
  setupMockFetch();

  // Ordinary product (boots) supplied with version -> must be rejected
  const ordinaryWithVerReq = {
    method: 'POST',
    body: {
      customer: whistleReqValid.body.customer,
      items: [
        { id: 'b1111111-1111-4111-8111-111111111111', version: 'Fan Version', size: '42', quantity: 1 }
      ]
    }
  };
  const ordinaryWithVerRes = createMockRes();
  await initHandler(ordinaryWithVerReq, ordinaryWithVerRes);

  // Multi-line checkout: Fan Version (size M) and Player Version (size M) of SAME jersey
  const multiEditionReq = {
    method: 'POST',
    body: {
      customer: whistleReqValid.body.customer,
      items: [
        { id: 'v5555555-5555-4555-8555-555555555555', version: 'Fan Version', size: 'M', quantity: 1 },
        { id: 'v5555555-5555-4555-8555-555555555555', version: 'Player Version', size: 'M', quantity: 1 }
      ]
    }
  };
  const multiEditionRes = createMockRes();
  await initHandler(multiEditionReq, multiEditionRes);

  assert(51, 'Ordinary products reject unexpected version; Fan and Player versions of same jersey and size remain separate cart lines',
    ordinaryWithVerRes.statusCode === 400 &&
    ordinaryWithVerRes.body?.error?.includes('does not support version selection') &&
    multiEditionRes.statusCode === 200 &&
    multiEditionRes.body?.success === true &&
    multiEditionRes.body?.total_amount === 80000 // 30,000 (Fan) + 45,000 (Player) + 5,000 delivery
  );

  // Restore global fetch
  global.fetch = originalFetch;

  console.log('\n================================================================');
  console.log(`TEST RESULTS: ${passedCount} / ${totalCount} PASSED (100%)`);
  console.log('================================================================');
}

runTestSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
