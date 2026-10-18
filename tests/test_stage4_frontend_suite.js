// ============================================================
// Quantum Jersey — Stage 4 Frontend Integration Test Suite
// Verified Mock Test Harness for Paystack Storefront Checkout
// ============================================================

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Colors for terminal reporting
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

let passedCount = 0;
let totalCount = 0;

function reportPass(id, title) {
  totalCount++;
  passedCount++;
  console.log(`${GREEN}[PASS] Test ${id}: ${title}${RESET}`);
}

function reportFail(id, title, err) {
  totalCount++;
  console.error(`${RED}[FAIL] Test ${id}: ${title}${RESET}`);
  console.error(err);
}

// ─────────────────────────────────────────────────────────────
// Lightweight In-Memory DOM & Browser Mock Environment
// ─────────────────────────────────────────────────────────────

class MockElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.id = '';
    this.className = '';
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
    this.style = {};
    this.attributes = {};
    this.children = [];
    this.innerHTML = '';
    this.textContent = '';
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this._listeners = {};
  }

  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k] || null; }
  removeAttribute(k) { delete this.attributes[k]; }
  hasAttribute(k) { return k in this.attributes; }

  addEventListener(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
  }

  dispatchEvent(event) {
    const list = this._listeners[event.type] || [];
    for (const fn of list) fn(event);
  }

  click() {
    this.dispatchEvent({ type: 'click', target: this, preventDefault() {} });
  }

  querySelector(sel) {
    return this.querySelectorAll(sel)[0] || null;
  }

  querySelectorAll(sel) {
    const results = [];
    const check = (node) => {
      if (matchesSelector(node, sel)) results.push(node);
      for (const child of node.children) check(child);
    };
    check(this);
    return results;
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }
}

function matchesSelector(node, sel) {
  if (sel.startsWith('#')) return node.id === sel.slice(1);
  if (sel.startsWith('.')) return node.classList && node.classList.contains(sel.slice(1));
  if (sel === 'input' || sel === 'select' || sel === 'button') return node.tagName === sel.toUpperCase();
  return false;
}

// Global simulated DOM registry
let elementRegistry = new Map();

function createMockDocument() {
  const body = new MockElement('body');
  return {
    body,
    getElementById(id) {
      return elementRegistry.get(id) || null;
    },
    querySelector(sel) {
      if (sel.startsWith('#')) return this.getElementById(sel.slice(1));
      return body.querySelector(sel);
    },
    querySelectorAll(sel) {
      return body.querySelectorAll(sel);
    },
    createElement(tag) {
      return new MockElement(tag);
    },
    addEventListener(event, fn) {}
  };
}

class MockStorage {
  constructor() { this.store = new Map(); }
  getItem(k) { return this.store.has(k) ? this.store.get(k) : null; }
  setItem(k, v) { this.store.set(k, String(v)); }
  removeItem(k) { this.store.delete(k); }
  clear() { this.store.clear(); }
}

// ─────────────────────────────────────────────────────────────
// Setup Simulated Window Global
// ─────────────────────────────────────────────────────────────

function setupMockEnvironment(initialSearch = '') {
  elementRegistry.clear();
  const mockStorage = new MockStorage();
  const mockSession = new MockStorage();
  const mockDoc = createMockDocument();

  // Parse simulated elements from cart-ui
  const mockWindow = {
    location: {
      origin: 'https://quantumjersey.com',
      pathname: '/catalog.html',
      search: initialSearch,
      hash: '',
      href: `https://quantumjersey.com/catalog.html${initialSearch}`
    },
    history: {
      replaceState: (state, title, url) => {
        mockWindow.location.pathname = url.split('?')[0];
        mockWindow.location.search = url.includes('?') ? '?' + url.split('?')[1] : '';
        mockWindow.location.href = `https://quantumjersey.com${url}`;
      }
    },
    localStorage: mockStorage,
    sessionStorage: mockSession,
    open: (url) => ({ url, closed: false }),
    clipboard: {
      text: '',
      writeText: async (t) => { mockWindow.clipboard.text = t; }
    },
    navigator: {
      clipboard: {
        writeText: async (t) => { mockWindow.clipboard.text = t; }
      }
    },
    addEventListener: () => {},
    dispatchEvent: () => {}
  };

  // Populate mock element registry with expected modal IDs
  const register = (id, tag = 'div') => {
    const el = new MockElement(tag);
    el.id = id;
    elementRegistry.set(id, el);
    return el;
  };

  register('qj-cart-drawer');
  register('qj-cart-backdrop');
  register('cart-items-container');
  register('cart-footer');
  register('cart-subtotal-amount');
  register('qj-checkout-modal');
  register('checkout-form', 'form');
  register('option-paystack', 'label');
  register('option-whatsapp', 'label');
  register('method-paystack', 'input');
  register('method-whatsapp', 'input');
  register('field-co-email');
  register('co-name', 'input');
  register('co-phone', 'input');
  register('co-email', 'input');
  register('co-state', 'select');
  register('co-city', 'input');
  register('co-address', 'input');
  register('co-notes', 'textarea');
  register('co-items-count');
  register('co-items-subtotal');
  register('co-delivery-fee');
  register('co-grand-total');
  register('checkout-notice-paystack');
  register('checkout-notice-whatsapp');
  register('checkout-error');
  register('btn-submit-order', 'button');
  register('btn-submit-text');
  register('btn-submit-icon');
  register('err-co-name');
  register('err-co-phone');
  register('err-co-email');
  register('err-co-state');
  register('err-co-city');
  register('err-co-address');
  const statusModal = register('qj-payment-status-modal');
  statusModal.style.display = 'none';
  register('status-modal-content');
  const successModal = register('qj-success-modal');
  successModal.style.display = 'none';
  register('success-order-ref');
  register('success-whatsapp-link');
  register('qj-toast');
  register('admin-orders-list');
  register('admin-orders-pagination');
  register('nav-orders-count-badge');
  register('orders-search', 'input');

  global.window = mockWindow;
  global.document = mockDoc;
  global.localStorage = mockStorage;
  global.sessionStorage = mockSession;
  global.navigator = mockWindow.navigator;

  // Global cart helpers matching js/cart.js behavior
  global.getCartItems = () => {
    try {
      const raw = mockStorage.getItem('qj_cart_v1');
      return raw ? JSON.parse(raw) : [];
    } catch (_) { return []; }
  };
  global.getCartTotalCount = () => {
    return global.getCartItems().reduce((sum, item) => sum + (item.quantity || 1), 0);
  };
  global.getCartSubtotal = () => {
    return global.getCartItems().reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 1)), 0);
  };
  global.calculateDelivery = (state, subtotal) => {
    return { fee: 5000, isKnown: true };
  };
  global.clearCart = () => {
    mockStorage.setItem('qj_cart_v1', '[]');
  };
  global.saveCartItems = (items) => {
    mockStorage.setItem('qj_cart_v1', JSON.stringify(items));
  };

  global.DEFAULT_PRODUCTS = global.DEFAULT_PRODUCTS || [];
  global.formatPrice = global.formatPrice || ((p) => '₦' + (Number(p) || 0).toLocaleString());
  return { mockWindow, mockDoc, mockStorage, mockSession };
}

// ─────────────────────────────────────────────────────────────
// Load cart-ui.js, admin.js, and supabase.js
// ─────────────────────────────────────────────────────────────

setupMockEnvironment();
const cartUI = require('../js/cart-ui.js');
const admin = require('../js/admin.js');
const supabaseLib = require('../js/supabase.js');

// ─────────────────────────────────────────────────────────────
// Test Suite Execution
// ─────────────────────────────────────────────────────────────

async function runStage4TestSuite() {
  console.log('================================================================');
  console.log('QUANTUM JERSEY : STAGE 4 FRONTEND PAYSTACK INTEGRATION TESTS');
  console.log('================================================================\n');

  // ─────────────────────────────────────────────────────────────
  // 1. WhatsApp/bank-transfer path remains functional
  // ─────────────────────────────────────────────────────────────
  try {
    const { mockStorage } = setupMockEnvironment();
    // Seed cart
    mockStorage.setItem('qj_cart_v1', JSON.stringify([
      { id: 'b1111111-1111-4111-8111-111111111111', name: 'Phantom Strike Pro', size: '42', quantity: 1, price: 65000 }
    ]));

    // Global helper mocks
    let createdOrderPayload = null;
    let openedWhatsAppUrl = null;
    global.createOrder = async (payload) => {
      createdOrderPayload = payload;
      return { orderRef: payload.order_ref };
    };
    global.buildMultiItemWhatsAppMessage = (order) => {
      return `https://wa.me/2348116154796?text=Order%20${order.order_ref}`;
    };
    global.clearCart = () => {
      mockStorage.setItem('qj_cart_v1', '[]');
    };
    global.window.open = (url) => {
      openedWhatsAppUrl = url;
      return { url };
    };

    // Switch to WhatsApp
    cartUI.handlePaymentMethodChange('whatsapp');
    assert.strictEqual(elementRegistry.get('field-co-email').style.display, 'none', 'Email field should be hidden for WhatsApp');
    assert.strictEqual(elementRegistry.get('co-email').getAttribute('required'), null, 'Email field should not be required for WhatsApp');

    // Fill form without email
    elementRegistry.get('co-name').value = 'Musa Bello';
    elementRegistry.get('co-phone').value = '08012345678';
    elementRegistry.get('co-state').value = 'Lagos';
    elementRegistry.get('co-city').value = 'Ikeja';
    elementRegistry.get('co-address').value = '14 Allen Avenue';

    // Submit
    await cartUI.handleCheckoutSubmit({ preventDefault: () => {} });

    assert(createdOrderPayload !== null, 'createOrder was called');
    assert.strictEqual(createdOrderPayload.customer_name, 'Musa Bello');
    assert.strictEqual(createdOrderPayload.delivery_state, 'Lagos');
    assert(openedWhatsAppUrl && openedWhatsAppUrl.includes('wa.me'), 'WhatsApp window opened');
    assert.strictEqual(elementRegistry.get('qj-success-modal').style.display, 'flex', 'Success modal shown');
    assert.strictEqual(mockStorage.getItem('qj_cart_v1'), '[]', 'Cart cleared after WhatsApp submission');

    reportPass(1, 'WhatsApp/bank-transfer checkout path remains functional & intact');
  } catch (err) {
    reportFail(1, 'WhatsApp path failed', err);
  }

  // ─────────────────────────────────────────────────────────────
  // 1.1. WhatsApp checkout handles order persistence failure safely
  // ─────────────────────────────────────────────────────────────
  try {
    const { mockStorage } = setupMockEnvironment();
    // Seed cart
    mockStorage.setItem('qj_cart_v1', JSON.stringify([
      { id: 'b1111111-1111-4111-8111-111111111111', name: 'Phantom Strike Pro', size: '42', quantity: 1, price: 65000 }
    ]));

    let openedWhatsAppUrl = null;
    let createOrderCalled = false;
    global.createOrder = async (payload) => {
      createOrderCalled = true;
      return {
        data: payload,
        error: { message: 'Database insert rejected by RLS' },
        orderRef: payload.order_ref
      };
    };
    global.window.open = (url) => {
      openedWhatsAppUrl = url;
      return { url };
    };

    // Switch to WhatsApp
    cartUI.handlePaymentMethodChange('whatsapp');

    // Fill form
    elementRegistry.get('co-name').value = 'Musa Bello';
    elementRegistry.get('co-phone').value = '08012345678';
    elementRegistry.get('co-state').value = 'Lagos';
    elementRegistry.get('co-city').value = 'Ikeja';
    elementRegistry.get('co-address').value = '14 Allen Avenue';

    // Submit
    await cartUI.handleCheckoutSubmit({ preventDefault: () => {} });

    assert(createOrderCalled, 'createOrder was called');
    assert.strictEqual(openedWhatsAppUrl, null, 'WhatsApp window must NOT be opened when persistence fails');
    assert.notStrictEqual(elementRegistry.get('qj-success-modal').style.display, 'flex', 'Success modal must NOT be shown when persistence fails');
    const storedCart = JSON.parse(mockStorage.getItem('qj_cart_v1') || '[]');
    assert.strictEqual(storedCart.length, 1, 'Cart items must NOT be cleared when persistence fails');
    assert.strictEqual(elementRegistry.get('checkout-error').style.display, 'block', 'Checkout error element must be displayed');
    assert(elementRegistry.get('checkout-error').textContent.includes('Database insert rejected by RLS'), 'Error element must display the failure reason');
    assert.strictEqual(elementRegistry.get('btn-submit-order').disabled, false, 'Submit button must be re-enabled after failure');

    reportPass('1.1', 'Failed cart order persistence halts checkout, displays error, and preserves cart');
  } catch (err) {
    reportFail('1.1', 'Cart persistence failure test failed', err);
  }

  // ─────────────────────────────────────────────────────────────
  // 2. Paystack choice requires a valid email
  // ─────────────────────────────────────────────────────────────
  try {
    const { mockStorage } = setupMockEnvironment();
    mockStorage.setItem('qj_cart_v1', JSON.stringify([
      { id: 'b1111111-1111-4111-8111-111111111111', name: 'Boot', size: '42', quantity: 1, price: 65000 }
    ]));

    cartUI.handlePaymentMethodChange('paystack');
    assert.strictEqual(elementRegistry.get('field-co-email').style.display, 'block', 'Email field shown for Paystack');
    assert.strictEqual(elementRegistry.get('co-email').getAttribute('required'), 'required', 'Email marked required');

    elementRegistry.get('co-name').value = 'Tunde Balogun';
    elementRegistry.get('co-phone').value = '08098765432';
    elementRegistry.get('co-state').value = 'Lagos';
    elementRegistry.get('co-city').value = 'Lekki';
    elementRegistry.get('co-address').value = 'Plot 5 Admiralty Way';

    // Subcase 2A: Empty email
    elementRegistry.get('co-email').value = '';
    await cartUI.handleCheckoutSubmit({ preventDefault: () => {} });
    assert(elementRegistry.get('err-co-email').textContent.includes('required'), 'Rejects empty email');

    // Subcase 2B: Malformed email
    elementRegistry.get('co-email').value = 'invalid-email-format';
    await cartUI.handleCheckoutSubmit({ preventDefault: () => {} });
    assert(elementRegistry.get('err-co-email').textContent.includes('valid email'), 'Rejects invalid email regex');

    // Subcase 2C: Valid email clears error
    elementRegistry.get('co-email').value = 'tunde@example.com';
    let fetchCalled = false;
    global.fetch = async () => {
      fetchCalled = true;
      return { ok: true, json: async () => ({ success: true, authorization_url: 'https://checkout.paystack.com/auth1', reference: 'ref1' }) };
    };
    await cartUI.handleCheckoutSubmit({ preventDefault: () => {} });
    assert(fetchCalled, 'Valid email allows submission to proceed');

    reportPass(2, 'Paystack checkout strictly requires valid email address');
  } catch (err) {
    reportFail(2, 'Email validation failed', err);
  }

  // ─────────────────────────────────────────────────────────────
  // 3. Initialization sends only agreed payload fields
  // ─────────────────────────────────────────────────────────────
  try {
    const { mockStorage } = setupMockEnvironment();
    mockStorage.setItem('qj_cart_v1', JSON.stringify([
      { id: 'b1111111-1111-4111-8111-111111111111', name: 'Phantom Strike', size: '42', quantity: 2, price: 65000 }
    ]));

    cartUI.handlePaymentMethodChange('paystack');
    elementRegistry.get('co-name').value = 'Tunde Balogun';
    elementRegistry.get('co-phone').value = '08098765432';
    elementRegistry.get('co-email').value = 'tunde@example.com';
    elementRegistry.get('co-state').value = 'Oyo';
    elementRegistry.get('co-city').value = 'Ibadan';
    elementRegistry.get('co-address').value = 'Bodija Estate';
    elementRegistry.get('co-notes').value = 'Leave at gate';

    let sentPayload = null;
    global.fetch = async (url, opts) => {
      if (url.includes('/initialize')) {
        sentPayload = JSON.parse(opts.body);
      }
      return { ok: true, json: async () => ({ success: true, authorization_url: 'https://checkout.paystack.com/123', reference: 'ref_123' }) };
    };

    await cartUI.handleCheckoutSubmit({ preventDefault: () => {} });

    assert(sentPayload !== null, 'Sent payload captured');
    assert.deepStrictEqual(Object.keys(sentPayload).sort(), ['callback_url', 'customer', 'items'].sort());
    assert.deepStrictEqual(Object.keys(sentPayload.customer).sort(), [
      'delivery_address', 'delivery_city', 'delivery_notes', 'delivery_state', 'email', 'name', 'phone'
    ].sort());
    assert.strictEqual(sentPayload.items.length, 1);
    assert.deepStrictEqual(Object.keys(sentPayload.items[0]).sort(), ['id', 'quantity', 'size'].sort());

    reportPass(3, 'Initialization sends only strictly agreed contract payload fields');
  } catch (err) {
    reportFail(3, 'Payload fields mismatch', err);
  }

  // ─────────────────────────────────────────────────────────────
  // 4. Client-submitted totals are not treated as authoritative
  // ─────────────────────────────────────────────────────────────
  try {
    const { mockStorage } = setupMockEnvironment();
    // Tampered price in client cart
    mockStorage.setItem('qj_cart_v1', JSON.stringify([
      { id: 'b1111111-1111-4111-8111-111111111111', name: 'Boot', size: '42', quantity: 1, price: 10 } // Forged ₦10!
    ]));

    cartUI.handlePaymentMethodChange('paystack');
    elementRegistry.get('co-name').value = 'Hacker';
    elementRegistry.get('co-phone').value = '08011112222';
    elementRegistry.get('co-email').value = 'hacker@example.com';
    elementRegistry.get('co-state').value = 'Lagos';
    elementRegistry.get('co-city').value = 'Ikeja';
    elementRegistry.get('co-address').value = 'Somewhere';

    let sentPayload = null;
    global.fetch = async (url, opts) => {
      sentPayload = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ success: true, authorization_url: 'https://checkout.paystack.com/auth_safe', reference: 'ref_safe' }) };
    };

    await cartUI.handleCheckoutSubmit({ preventDefault: () => {} });

    // Confirm client price/subtotal/total was NOT sent to server
    assert.strictEqual(sentPayload.price, undefined, 'Client price must not be in root payload');
    assert.strictEqual(sentPayload.total_amount, undefined, 'Client total amount must not be in root payload');
    assert.strictEqual(sentPayload.items[0].price, undefined, 'Client price must not be in items payload');

    reportPass(4, 'Client prices & totals are completely excluded from server request');
  } catch (err) {
    reportFail(4, 'Client total verification failed', err);
  }

  // ─────────────────────────────────────────────────────────────
  // 5. Double-clicks do not create duplicate initialization requests
  // ─────────────────────────────────────────────────────────────
  try {
    const { mockStorage } = setupMockEnvironment();
    mockStorage.setItem('qj_cart_v1', JSON.stringify([
      { id: 'b1111111-1111-4111-8111-111111111111', name: 'Boot', size: '42', quantity: 1, price: 65000 }
    ]));

    cartUI.handlePaymentMethodChange('paystack');
    elementRegistry.get('co-name').value = 'Speedy User';
    elementRegistry.get('co-phone').value = '08012345678';
    elementRegistry.get('co-email').value = 'speedy@example.com';
    elementRegistry.get('co-state').value = 'Lagos';
    elementRegistry.get('co-city').value = 'Lekki';
    elementRegistry.get('co-address').value = '123 Expressway';

    let fetchCount = 0;
    let resolveFirstFetch;
    const slowFetchPromise = new Promise(resolve => { resolveFirstFetch = resolve; });

    global.fetch = async () => {
      fetchCount++;
      await slowFetchPromise;
      return { ok: true, json: async () => ({ success: true, authorization_url: 'https://checkout.paystack.com/1', reference: 'ref1' }) };
    };

    // First click initiates async request
    const p1 = cartUI.handleCheckoutSubmit({ preventDefault: () => {} });

    // Second immediate click while first is in-flight
    const p2 = cartUI.handleCheckoutSubmit({ preventDefault: () => {} });

    // Resolve first fetch
    resolveFirstFetch();
    await Promise.all([p1, p2]);

    assert.strictEqual(fetchCount, 1, 'Fetch was executed exactly ONCE despite rapid duplicate trigger');

    reportPass(5, 'Double-clicks prevented; exactly one initialization request sent');
  } catch (err) {
    reportFail(5, 'Double-click prevention failed', err);
  }

  // ─────────────────────────────────────────────────────────────
  // 6. Initialization failure preserves cart contents
  // ─────────────────────────────────────────────────────────────
  try {
    const { mockStorage } = setupMockEnvironment();
    const initialCart = [
      { id: 'b1111111-1111-4111-8111-111111111111', name: 'Boot', size: '42', quantity: 1, price: 65000 }
    ];
    mockStorage.setItem('qj_cart_v1', JSON.stringify(initialCart));

    cartUI.handlePaymentMethodChange('paystack');
    elementRegistry.get('co-name').value = 'Tunde Balogun';
    elementRegistry.get('co-phone').value = '08012345678';
    elementRegistry.get('co-email').value = 'tunde@example.com';
    elementRegistry.get('co-state').value = 'Lagos';
    elementRegistry.get('co-city').value = 'Ikeja';
    elementRegistry.get('co-address').value = '14 Allen Avenue';

    global.fetch = async () => {
      return {
        ok: false,
        json: async () => ({ success: false, error: 'Product out of stock' })
      };
    };

    await cartUI.handleCheckoutSubmit({ preventDefault: () => {} });

    // Assert cart was NOT cleared
    const storedCart = JSON.parse(mockStorage.getItem('qj_cart_v1'));
    assert.strictEqual(storedCart.length, 1, 'Cart items remain preserved');
    assert.strictEqual(elementRegistry.get('checkout-error').textContent, 'Product out of stock', 'Error message rendered');
    assert.strictEqual(elementRegistry.get('btn-submit-order').disabled, false, 'Submit button re-enabled');

    reportPass(6, 'Initialization failure preserves cart items and displays recoverable error');
  } catch (err) {
    reportFail(6, 'Initialization failure preservation failed', err);
  }

  // ─────────────────────────────────────────────────────────────
  // 7. Successful initialization redirects only to returned authorization URL
  // ─────────────────────────────────────────────────────────────
  try {
    const { mockWindow, mockStorage, mockSession } = setupMockEnvironment();
    mockStorage.setItem('qj_cart_v1', JSON.stringify([
      { id: 'b1111111-1111-4111-8111-111111111111', name: 'Boot', size: '42', quantity: 1, price: 65000 }
    ]));

    cartUI.handlePaymentMethodChange('paystack');
    elementRegistry.get('co-name').value = 'Tunde Balogun';
    elementRegistry.get('co-phone').value = '08012345678';
    elementRegistry.get('co-email').value = 'tunde@example.com';
    elementRegistry.get('co-state').value = 'Lagos';
    elementRegistry.get('co-city').value = 'Ikeja';
    elementRegistry.get('co-address').value = '14 Allen Avenue';

    const targetAuthUrl = 'https://checkout.paystack.com/auth_secure_target_789';

    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        success: true,
        authorization_url: targetAuthUrl,
        reference: 'QJ-PAY-REF-789',
        order_ref: 'QJ-ORD-789'
      })
    });

    await cartUI.handleCheckoutSubmit({ preventDefault: () => {} });

    assert.strictEqual(mockWindow.location.href, targetAuthUrl, 'Redirected strictly to returned authorization URL');
    assert(mockSession.getItem('qj_pending_payment') !== null, 'Pending payment reference stored in session');
    assert.strictEqual(JSON.parse(mockStorage.getItem('qj_cart_v1')).length, 1, 'Cart preserved across redirect');

    reportPass(7, 'Successful initialization redirects only to gateway authorization URL with cart preserved');
  } catch (err) {
    reportFail(7, 'Authorization redirect test failed', err);
  }

  // ─────────────────────────────────────────────────────────────
  // 8. Return URL with a reference invokes server verification
  // ─────────────────────────────────────────────────────────────
  try {
    const { mockWindow } = setupMockEnvironment('?reference=QJ-PAY-RETURN-101');
    let verifyRefCaptured = null;

    global.fetch = async (url, opts) => {
      if (url.includes('/verify')) {
        verifyRefCaptured = JSON.parse(opts.body).reference;
      }
      return {
        ok: true,
        json: async () => ({
          success: true,
          status: 'paid',
          reference: 'QJ-PAY-RETURN-101',
          order_ref: 'QJ-ORD-101',
          amount: 70000
        })
      };
    };

    await cartUI.checkPaystackReturn();

    assert.strictEqual(verifyRefCaptured, 'QJ-PAY-RETURN-101', 'Verify endpoint invoked with URL reference');
    assert(!mockWindow.location.search.includes('reference='), 'Reference cleaned from URL via replaceState');
    assert.strictEqual(elementRegistry.get('qj-payment-status-modal').style.display, 'flex', 'Status modal shown');

    reportPass(8, 'Return URL reference triggers server-side verification and query string clean-up');
  } catch (err) {
    reportFail(8, 'Return verification invocation failed', err);
  }

  // ─────────────────────────────────────────────────────────────
  // 9. Forged success query parameter never produces a success screen
  // ─────────────────────────────────────────────────────────────
  try {
    // Attack 9A: User appends ?status=success&paid=true without reference
    setupMockEnvironment('?status=success&paid=true');
    await cartUI.checkPaystackReturn();
    assert.strictEqual(elementRegistry.get('qj-payment-status-modal').style.display, 'none', 'Modal never opened without reference');

    // Attack 9B: User fabricates a reference that server rejects with 404
    setupMockEnvironment('?reference=QJ-PAY-FORGED-FAKE-REF');
    global.fetch = async () => ({
      ok: false,
      json: async () => ({ success: false, error: 'No matching payment attempt found for the provided reference.' })
    });

    await cartUI.checkPaystackReturn();
    const modalContent = elementRegistry.get('status-modal-content').innerHTML;
    assert(!modalContent.includes('Payment Confirmed'), 'Never displays Confirmed screen');
    assert(modalContent.includes('Verification Failed') || modalContent.includes('No matching payment attempt'), 'Displays verification failure');

    reportPass(9, 'Forged query parameters strictly rejected; only authoritative server response accepted');
  } catch (err) {
    reportFail(9, 'Forged parameter test failed', err);
  }

  // ─────────────────────────────────────────────────────────────
  // 10. Pending, failed, cancelled, and network-error return paths
  // ─────────────────────────────────────────────────────────────
  try {
    const { mockStorage } = setupMockEnvironment();
    mockStorage.setItem('qj_cart_v1', JSON.stringify([{ id: 'boot1', quantity: 1 }]));

    // Path 10A: Failed gateway transaction
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ success: false, status: 'failed', error: 'Insufficient funds' })
    });
    await cartUI.verifyPaymentReference('QJ-PAY-FAIL-1');
    assert(elementRegistry.get('status-modal-content').innerHTML.includes('Insufficient funds'), 'Displays gateway failure error');
    assert.strictEqual(JSON.parse(mockStorage.getItem('qj_cart_v1')).length, 1, 'Cart preserved on failure');

    // Path 10B: Abandoned gateway transaction
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ success: false, status: 'abandoned', error: 'Customer cancelled transaction' })
    });
    await cartUI.verifyPaymentReference('QJ-PAY-ABANDON-1');
    assert(elementRegistry.get('status-modal-content').innerHTML.includes('Payment Not Completed'), 'Displays abandoned status');
    assert.strictEqual(JSON.parse(mockStorage.getItem('qj_cart_v1')).length, 1, 'Cart preserved on abandonment');

    // Path 10C: Pending / initiated
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ success: false, status: 'initiated' })
    });
    await cartUI.verifyPaymentReference('QJ-PAY-PENDING-1');
    assert(elementRegistry.get('status-modal-content').innerHTML.includes('Payment Pending'), 'Displays pending reconciliation status');
    assert.strictEqual(JSON.parse(mockStorage.getItem('qj_cart_v1')).length, 1, 'Cart preserved on pending state');

    // Path 10D: Network failure
    global.fetch = async () => {
      throw new TypeError('Failed to fetch');
    };
    await cartUI.verifyPaymentReference('QJ-PAY-NETERR-1');
    assert(elementRegistry.get('status-modal-content').innerHTML.includes('Network Connection Issue'), 'Displays network error');
    assert.strictEqual(JSON.parse(mockStorage.getItem('qj_cart_v1')).length, 1, 'Cart preserved on network drop');

    reportPass(10, 'All failed, abandoned, pending, and network-error recovery paths handled safely');
  } catch (err) {
    reportFail(10, 'Return paths test failed', err);
  }

  // ─────────────────────────────────────────────────────────────
  // 11. Cart is not cleared before confirmed success
  // ─────────────────────────────────────────────────────────────
  try {
    const { mockStorage } = setupMockEnvironment();
    const cartItems = [{ id: 'item1', quantity: 1, price: 10000 }];
    mockStorage.setItem('qj_cart_v1', JSON.stringify(cartItems));

    global.clearCart = () => { mockStorage.setItem('qj_cart_v1', '[]'); };

    // 11A: Verify during failed settlement -> cart intact
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ success: false, status: 'failed' })
    });
    await cartUI.verifyPaymentReference('REF_FAIL');
    assert.strictEqual(mockStorage.getItem('qj_cart_v1'), JSON.stringify(cartItems), 'Cart intact after failed verification');

    // 11B: Verify during confirmed paid settlement -> paid item reconciled
    cartUI.saveCheckoutSnapshot('REF_PAID', 'QJ-ORD', cartItems);
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ success: true, status: 'paid', reference: 'REF_PAID', order_ref: 'QJ-ORD', amount: 15000 })
    });
    await cartUI.verifyPaymentReference('REF_PAID');
    assert.strictEqual(mockStorage.getItem('qj_cart_v1'), '[]', 'Paid item reconciled upon confirmed paid status');

    // 11C: Multi-tab scenario: New unrelated item added during gateway trip is PRESERVED
    const originalPaidItem = { id: 'item_paid', size: '42', quantity: 1, price: 50000 };
    const tab2UnrelatedItem = { id: 'item_tab2', size: 'M', quantity: 2, price: 28000 };
    cartUI.saveCheckoutSnapshot('REF_MULTITAB', 'QJ-ORD-2', [originalPaidItem]);
    // Current cart in storage has BOTH items (simulating Tab 2 adding item_tab2 while user was on gateway)
    mockStorage.setItem('qj_cart_v1', JSON.stringify([originalPaidItem, tab2UnrelatedItem]));

    global.fetch = async () => ({
      ok: true,
      json: async () => ({ success: true, status: 'paid', reference: 'REF_MULTITAB', order_ref: 'QJ-ORD-2', amount: 55000 })
    });
    await cartUI.verifyPaymentReference('REF_MULTITAB');
    const multiTabRemaining = JSON.parse(mockStorage.getItem('qj_cart_v1'));
    assert.strictEqual(multiTabRemaining.length, 1, 'Unrelated item preserved; only paid item reconciled');
    assert.strictEqual(multiTabRemaining[0].id, 'item_tab2', 'Correct unrelated item preserved');
    assert.strictEqual(multiTabRemaining[0].quantity, 2, 'Unrelated item quantity preserved');

    // 11D: Repeated return verification (e.g. Browser Back navigation or refresh) does NOT double-reconcile
    const reVerificationResult = cartUI.reconcilePaidCartItems('REF_MULTITAB');
    assert.strictEqual(reVerificationResult.reconciled, false, 'Repeated verification blocked from mutating cart twice');
    assert.strictEqual(reVerificationResult.reason, 'Already reconciled', 'Clean already-reconciled guard reason');

    // 11E: Unrelated, shared or missing snapshot reference does NOT mutate cart
    const preSharedCart = mockStorage.getItem('qj_cart_v1');
    const staleResult = cartUI.reconcilePaidCartItems('REF_UNKNOWN_OR_SHARED');
    assert.strictEqual(staleResult.reconciled, false, 'Missing snapshot reference does not mutate cart');
    assert.strictEqual(mockStorage.getItem('qj_cart_v1'), preSharedCart, 'Cart contents unchanged for unknown reference');

    reportPass(11, 'Cart items reconciled specifically by order; multi-tab and back navigation safe');
  } catch (err) {
    reportFail(11, 'Cart clearing rule test failed', err);
  }

  // ─────────────────────────────────────────────────────────────
  // 12. No secret keys appear in browser bundles, HTML, or client requests
  // ─────────────────────────────────────────────────────────────
  try {
    const storefrontFiles = [
      'js/cart-ui.js',
      'js/cart.js',
      'js/supabase.js',
      'js/products.js',
      'js/render.js',
      'css/style.css',
      'index.html',
      'catalog.html',
      'product.html',
      'boots.html',
      'jerseys.html',
      'sportswear.html',
      'contact.html',
      'review.html',
      'faq.html'
    ];

    let foundSecret = false;
    let leakedInFile = '';

    for (const file of storefrontFiles) {
      const fullPath = path.join(__dirname, '..', file);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        // Check for Paystack secret key patterns (live or test)
        if (/sk_live_[0-9a-zA-Z]{20,}/.test(content) || /sk_test_[0-9a-zA-Z]{20,}/.test(content)) {
          foundSecret = true;
          leakedInFile = `${file} contains Paystack secret key pattern`;
          break;
        }
        // Check for Supabase service role key patterns
        if (/service_role/.test(content)) {
          foundSecret = true;
          leakedInFile = `${file} contains service_role key`;
          break;
        }
      }
    }

    assert(!foundSecret, `No secret keys leaked in browser storefront files: ${leakedInFile}`);
    reportPass(12, 'Zero secret keys or service-role keys found across all storefront client files');
  } catch (err) {
    reportFail(12, 'Secret scanning test failed', err);
  }

  // ─────────────────────────────────────────────────────────────
  // 13. Stage 2 Optional Sizing: Non-sized products checkout with null size without inventing "Standard"
  // ─────────────────────────────────────────────────────────────
  try {
    const { mockStorage } = setupMockEnvironment();
    // Non-sized product in cart
    mockStorage.setItem('qj_cart_v1', JSON.stringify([
      { id: 'c4444444-4444-4444-8444-444444444444', name: 'Coach Tactical Board', size: null, quantity: 1, price: 15000 }
    ]));

    let capturedInitPayload = null;
    global.fetch = async (url, opts) => {
      if (url === '/api/paystack/initialize') {
        capturedInitPayload = JSON.parse(opts.body);
        return {
          ok: true,
          json: async () => ({
            success: true,
            authorization_url: 'https://checkout.paystack.com/mock-non-sized',
            reference: 'QJ-PAY-NONSIZED',
            order_ref: 'QJ-ORD-NONSIZED'
          })
        };
      }
      return { ok: false };
    };

    cartUI.handlePaymentMethodChange('paystack');
    elementRegistry.get('co-name').value = 'Coach Musa';
    elementRegistry.get('co-email').value = 'musa@example.com';
    elementRegistry.get('co-phone').value = '+2348011223344';
    elementRegistry.get('co-state').value = 'Lagos';
    elementRegistry.get('co-city').value = 'Surulere';
    elementRegistry.get('co-address').value = 'National Stadium';

    await cartUI.handleCheckoutSubmit({ preventDefault: () => {} });

    assert(capturedInitPayload !== null, 'Paystack init request was sent');
    assert.strictEqual(capturedInitPayload.items[0].id, 'c4444444-4444-4444-8444-444444444444');
    assert.strictEqual(capturedInitPayload.items[0].size, null, 'Non-sized item size is null without inventing Standard');
    assert.strictEqual(capturedInitPayload.items[0].quantity, 1);

    reportPass(13, 'Non-sized product checkout sends null size without inventing "Standard"');
  } catch (err) {
    reportFail(13, 'Non-sized product checkout test failed', err);
  }

  // ─────────────────────────────────────────────────────────────
  // 14. Stage 3: Versioned jersey Paystack checkout sends selected version and size
  // ─────────────────────────────────────────────────────────────
  try {
    const { mockStorage } = setupMockEnvironment();
    // Versioned jersey in cart
    mockStorage.setItem('qj_cart_v1', JSON.stringify([
      {
        id: 'v5555555-5555-4555-8555-555555555555',
        name: 'Arsenal 24/25 Home',
        version: 'Fan Version',
        size: 'XXL',
        quantity: 1,
        price: 30000
      }
    ]));

    let capturedInitPayload = null;
    global.fetch = async (url, opts) => {
      if (url === '/api/paystack/initialize') {
        capturedInitPayload = JSON.parse(opts.body);
        return {
          ok: true,
          json: async () => ({
            success: true,
            authorization_url: 'https://checkout.paystack.com/mock-fan-version',
            reference: 'QJ-PAY-FANVER',
            order_ref: 'QJ-ORD-FANVER'
          })
        };
      }
      return { ok: false };
    };

    cartUI.handlePaymentMethodChange('paystack');
    elementRegistry.get('co-name').value = 'Bukayo Saka';
    elementRegistry.get('co-email').value = 'saka@example.com';
    elementRegistry.get('co-phone').value = '+2348099887766';
    elementRegistry.get('co-state').value = 'Lagos';
    elementRegistry.get('co-city').value = 'Ikeja';
    elementRegistry.get('co-address').value = 'Emirates Way';

    await cartUI.handleCheckoutSubmit({ preventDefault: () => {} });

    assert(capturedInitPayload !== null, 'Paystack init request was sent');
    assert.strictEqual(capturedInitPayload.items[0].id, 'v5555555-5555-4555-8555-555555555555');
    assert.strictEqual(capturedInitPayload.items[0].version, 'Fan Version', 'Version preserved in payload');
    assert.strictEqual(capturedInitPayload.items[0].size, 'XXL', 'Version-specific size preserved in payload');
    assert.strictEqual(capturedInitPayload.items[0].quantity, 1);

    reportPass(14, 'Versioned jersey checkout sends version and version-specific size to Paystack');
  } catch (err) {
    reportFail(14, 'Versioned jersey checkout test failed', err);
  }

  // ─────────────────────────────────────────────────────────────
  // 15. Stage 3: Cart identity preserves Fan Version and Player Version as separate line items
  // ─────────────────────────────────────────────────────────────
  try {
    const cartLib = require('../js/cart.js');

    // Line key generation tests
    const keyFan = cartLib.generateLineKey('jersey-123', 'L', 'Default', 'Fan Version');
    const keyPlayer = cartLib.generateLineKey('jersey-123', 'L', 'Default', 'Player Version');
    const keyLegacy = cartLib.generateLineKey('jersey-123', 'L', 'Default', null);

    assert(keyFan.includes('fan version'), 'Fan Version key contains version token');
    assert(keyPlayer.includes('player version'), 'Player Version key contains version token');
    assert.notStrictEqual(keyFan, keyPlayer, 'Fan Version and Player Version generate distinct line keys');
    assert.strictEqual(keyLegacy, 'jersey-123___L___Default', 'Legacy item retains 3-part key without version token');

    // Add both versions to in-memory mock storage
    const { mockStorage } = setupMockEnvironment();
    global.getProductById = (id) => ({
      id: 'jersey-123',
      name: 'Real Madrid 24/25 Home',
      category: 'jerseys',
      versions: {
        fan: { price: 32000, sizes: ['S', 'M', 'L', 'XL'] },
        player: { price: 48000, sizes: ['M', 'L', 'XL'] }
      }
    });

    cartLib.addToCart('jersey-123', 'L', 1, { version: 'Fan Version' });
    cartLib.addToCart('jersey-123', 'L', 1, { version: 'Player Version' });

    const items = cartLib.getCartItems();
    assert.strictEqual(items.length, 2, 'Fan and Player versions of same jersey and size remain separate items');
    assert.strictEqual(items[0].version, 'Fan Version');
    assert.strictEqual(items[0].price, 32000, 'Fan version uses fan price');
    assert.strictEqual(items[1].version, 'Player Version');
    assert.strictEqual(items[1].price, 48000, 'Player version uses player price');

    const subtotal = cartLib.getCartSubtotal();
    assert.strictEqual(subtotal, 80000, 'Cart subtotal correctly sums independent version prices');

    reportPass(15, 'Cart identity keeps Fan and Player versions separate with independent pricing');
  } catch (err) {
    reportFail(15, 'Cart identity test failed', err);
  }

  // ─────────────────────────────────────────────────────────────
  // 16. Admin order fetch errors render clear error state
  // ─────────────────────────────────────────────────────────────
  try {
    setupMockEnvironment();
    const listEl = elementRegistry.get('admin-orders-list');

    // Case 16A: Failed query returns error
    global.fetchOrders = async () => ({
      orders: [],
      totalCount: 0,
      hasMore: false,
      page: 0,
      error: 'JWT expired or RLS permission denied'
    });

    await admin.loadAdminOrders();

    assert.strictEqual(listEl.children.length, 1, 'Should render 1 child element for error');
    assert(listEl.children[0].textContent.includes('Error loading orders: JWT expired or RLS permission denied'), 'Error banner displays specific failure reason');
    assert.notStrictEqual(listEl.innerHTML, '<p class="admin-empty">No orders found matching this filter.</p>', 'Failed query must NOT display empty order list message');

    // Case 16B: Genuine zero orders returns empty state without error
    global.fetchOrders = async () => ({
      orders: [],
      totalCount: 0,
      hasMore: false,
      page: 0
    });

    await admin.loadAdminOrders();
    assert.strictEqual(listEl.innerHTML, '<p class="admin-empty">No orders found matching this filter.</p>', 'Genuinely empty result displays standard empty filter message');

    reportPass(16, 'Admin order fetch errors display clear error state and preserve empty state on success');
  } catch (err) {
    reportFail(16, 'Admin order error handling test failed', err);
  }

  // ─────────────────────────────────────────────────────────────
  // 17. Admin session re-hydration & fetchOrders regression suite
  // ─────────────────────────────────────────────────────────────
  try {
    // (i) client present + no session + getAdminSession returns null -> fetchOrders returns error and does NOT read localStorage
    {
      const { mockStorage } = setupMockEnvironment();
      mockStorage.setItem('qj_local_orders', JSON.stringify([
        { id: 'loc-1', order_ref: 'LOCAL-1', status: 'awaiting_confirmation' }
      ]));

      global.getSupabaseClient = () => ({
        from: () => ({
          select: () => ({
            order: () => ({
              range: async () => ({ data: [], count: 0, error: null })
            })
          })
        })
      });
      global.getAdminSession = async () => null;

      const result = await supabaseLib.fetchOrders({}, null);
      assert.ok(result.error, 'Must return error when client is present but session is null and unresolvable');
      assert.strictEqual(result.orders.length, 0, 'Must NOT return orders from localStorage when client is configured');
      assert.strictEqual(result.totalCount, 0, 'Total count must be 0 on unauthenticated fetch');
    }

    // (ii) client present + session present -> normal query path
    {
      setupMockEnvironment();
      const mockOrders = [
        { id: 'ord-101', order_ref: 'QJ-PROD-001', status: 'awaiting_confirmation', created_at: new Date().toISOString() }
      ];

      global.getSupabaseClient = () => ({
        from: (table) => {
          assert.strictEqual(table, 'orders', 'Must query orders table');
          return {
            select: () => ({
              order: () => ({
                range: async () => ({
                  data: mockOrders,
                  count: 1,
                  error: null
                })
              })
            })
          };
        }
      });

      const validSession = { user: { email: 'admin@quantumjersey.com', app_metadata: { role: 'admin' } } };
      const result = await supabaseLib.fetchOrders({ page: 0, pageSize: 25 }, validSession);
      assert.strictEqual(result.error, undefined, 'Must not return error for valid session query');
      assert.strictEqual(result.orders.length, 1, 'Must return fetched order rows');
      assert.strictEqual(result.orders[0].order_ref, 'QJ-PROD-001', 'Must match mock order reference');
      assert.strictEqual(result.totalCount, 1, 'Must match total count');
    }

    // (iii) no client -> localStorage fallback works
    {
      const { mockStorage } = setupMockEnvironment();
      mockStorage.setItem('qj_local_orders', JSON.stringify([
        { id: 'loc-offline', order_ref: 'OFFLINE-ORDER', status: 'awaiting_confirmation' }
      ]));

      global.getSupabaseClient = () => null;

      const result = await supabaseLib.fetchOrders({ status: 'all', page: 0, pageSize: 20 }, null);
      assert.strictEqual(result.error, undefined, 'Offline fallback must not return error');
      assert.strictEqual(result.orders.length, 1, 'Offline fallback reads localStorage');
      assert.strictEqual(result.orders[0].order_ref, 'OFFLINE-ORDER', 'Matches stored offline order');
      assert.strictEqual(result.totalCount, 1, 'Total count reflects local orders count');
    }

    // (iv) loadAdminOrders re-hydrates _adminSession when null
    {
      setupMockEnvironment();
      const listEl = elementRegistry.get('admin-orders-list');

      const rehydratedSession = {
        user: { email: 'rehydrated-admin@quantumjersey.com', app_metadata: { role: 'admin' } }
      };

      global.getAdminSession = async () => rehydratedSession;

      let capturedSession = null;
      global.fetchOrders = async (params, session) => {
        capturedSession = session;
        return {
          orders: [{ id: 'rehydrated-order', order_ref: 'QJ-REHYDRATED', status: 'awaiting_confirmation' }],
          totalCount: 1
        };
      };

      await admin.loadAdminOrders();

      assert.ok(capturedSession !== null, 'loadAdminOrders must have re-hydrated and passed session');
      assert.strictEqual(capturedSession.user.email, 'rehydrated-admin@quantumjersey.com', 'Passed session matches rehydrated session');
      assert.ok(listEl.innerHTML.includes('QJ-REHYDRATED'), 'Orders rendered after re-hydration');
    }

    // (v) orders-search autofilled with admin email is cleansed to prevent false empty filter
    {
      setupMockEnvironment();
      await admin.handleLogout();
      const searchInput = elementRegistry.get('orders-search');
      searchInput.value = 'tairuazeez544@gmail.com';

      global.getAdminSession = async () => ({
        user: { email: 'tairuazeez544@gmail.com', app_metadata: { role: 'admin' } }
      });

      let capturedParams = null;
      global.fetchOrders = async (params, session) => {
        capturedParams = params;
        return { orders: [{ id: 'clean-1', order_ref: 'QJ-CLEANSED' }], totalCount: 1 };
      };

      await admin.loadAdminOrders();

      assert.strictEqual(searchInput.value, '', 'Autofilled admin email must be cleared from search input');
      assert.strictEqual(capturedParams.search, '', 'Search query param must be empty string');
    }

    reportPass(17, 'Session re-hydration & fetchOrders regression suite: (i) client+no-session errors without localStorage leak; (ii) client+session queries Supabase; (iii) no client uses localStorage; (iv) loadAdminOrders re-hydrates null session; (v) autofilled admin email cleansed');
  } catch (err) {
    reportFail(17, 'Session re-hydration and fetchOrders regression suite failed', err);
  }

  // ─────────────────────────────────────────────────────────────
  // Final Results
  // ─────────────────────────────────────────────────────────────
  console.log('\n================================================================');
  console.log(`STAGE 4 TEST RESULTS: ${passedCount} / ${totalCount} PASSED (${Math.round((passedCount/totalCount)*100)}%)`);
  console.log('================================================================\n');

  if (passedCount !== totalCount) {
    process.exit(1);
  }
}

runStage4TestSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
