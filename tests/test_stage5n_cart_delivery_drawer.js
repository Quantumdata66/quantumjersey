// ============================================================
// Quantum Jersey — Stage 5N Test Suite
// Cart Delivery-Fee Breakdown & Mobile Cart-Drawer Navigation
// ============================================================

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('================================================================');
console.log('QUANTUM JERSEY : STAGE 5N CART DELIVERY & DRAWER SUITE');
console.log('================================================================\n');

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

// Simulated mock DOM environment
const cart = require('../js/cart.js');
let cartUI = null;

function setupMockEnv() {
  const store = {};
  const mockStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { for (const k in store) delete store[k]; }
  };

  const elements = new Map();

  function createMockElement(id, tag = 'div') {
    const classSet = new Set();
    const el = {
      id,
      tagName: tag.toUpperCase(),
      classList: {
        add: (c) => classSet.add(c),
        remove: (c) => classSet.delete(c),
        contains: (c) => classSet.has(c),
        toggle: (c, force) => {
          if (force === undefined) {
            if (classSet.has(c)) { classSet.delete(c); return false; }
            classSet.add(c); return true;
          } else if (force) {
            classSet.add(c); return true;
          } else {
            classSet.delete(c); return false;
          }
        }
      },
      style: {},
      attributes: {},
      children: [],
      textContent: '',
      innerHTML: '',
      value: '',
      disabled: false,
      isConnected: true,
      focus: () => {
        mockDocument.activeElement = el;
        el._focused = true;
      },
      blur: () => {
        if (mockDocument.activeElement === el) mockDocument.activeElement = null;
        el._focused = false;
      },
      setAttribute: (k, v) => { el.attributes[k] = String(v); },
      getAttribute: (k) => (k in el.attributes ? el.attributes[k] : null),
      removeAttribute: (k) => { delete el.attributes[k]; },
      addEventListener: (evt, fn) => {
        el._listeners = el._listeners || {};
        el._listeners[evt] = el._listeners[evt] || [];
        el._listeners[evt].push(fn);
      },
      querySelector: (sel) => {
        if (sel === '.cart-close-btn') return elements.get('cart-close-btn') || createMockElement('cart-close-btn', 'button');
        if (sel === '#cart-live-region') return elements.get('cart-live-region');
        return null;
      },
      querySelectorAll: (sel) => {
        return el.children || [];
      }
    };
    elements.set(id, el);
    return el;
  }

  // Pre-seed known elements
  const backdrop = createMockElement('qj-cart-backdrop');
  const drawer = createMockElement('qj-cart-drawer', 'aside');
  const itemsContainer = createMockElement('cart-items-container');
  const footer = createMockElement('cart-footer');
  const itemsSubtotal = createMockElement('cart-items-subtotal');
  const deliveryFee = createMockElement('cart-delivery-fee');
  const totalAmount = createMockElement('cart-total-amount');
  const subtotalLegacy = createMockElement('cart-subtotal-amount');
  const checkoutModal = createMockElement('qj-checkout-modal');
  checkoutModal.style.display = 'none';
  const statusModal = createMockElement('qj-payment-status-modal');
  statusModal.style.display = 'none';
  const successModal = createMockElement('qj-success-modal');
  successModal.style.display = 'none';
  const toast = createMockElement('qj-toast');
  const navCartBadge = createMockElement('nav-cart-badge');
  const drawerBadge = createMockElement('cart-drawer-badge');
  const liveRegion = createMockElement('cart-live-region');
  liveRegion.setAttribute('aria-live', 'polite');
  liveRegion.setAttribute('aria-atomic', 'true');

  const historyStack = [{ state: null, url: 'http://localhost/' }];
  let historyIdx = 0;

  const mockWindow = {
    location: { href: 'http://localhost/', origin: 'http://localhost', pathname: '/' },
    history: {
      pushState: (state, title, url) => {
        historyStack.push({ state, url });
        historyIdx++;
      },
      replaceState: (state, title, url) => {
        historyStack[historyIdx] = { state, url };
      },
      back: () => {
        if (historyIdx > 0) {
          historyIdx--;
          const prev = historyStack[historyIdx];
          const popEvent = { state: prev.state };
          if (mockWindow._listeners && mockWindow._listeners['popstate']) {
            mockWindow._listeners['popstate'].forEach(fn => fn(popEvent));
          }
        }
      },
      get length() { return historyStack.length; },
      get current() { return historyStack[historyIdx]; }
    },
    addEventListener: (evt, fn) => {
      mockWindow._listeners = mockWindow._listeners || {};
      mockWindow._listeners[evt] = mockWindow._listeners[evt] || [];
      mockWindow._listeners[evt].push(fn);
    },
    removeEventListener: (evt, fn) => {
      if (mockWindow._listeners && mockWindow._listeners[evt]) {
        mockWindow._listeners[evt] = mockWindow._listeners[evt].filter(f => f !== fn);
      }
    },
    dispatchEvent: (evt) => {
      if (mockWindow._listeners && mockWindow._listeners[evt.type]) {
        mockWindow._listeners[evt.type].forEach(fn => fn(evt));
      }
    }
  };

  const mockDocument = {
    body: { style: {} },
    documentElement: { style: {}, scrollTop: 0 },
    activeElement: null,
    getElementById: (id) => elements.get(id) || null,
    querySelector: (sel) => {
      if (sel === '#qj-cart-drawer') return elements.get('qj-cart-drawer');
      if (sel === '#cart-live-region') return elements.get('cart-live-region');
      return null;
    },
    querySelectorAll: (sel) => [],
    addEventListener: (evt, fn) => {
      mockDocument._listeners = mockDocument._listeners || {};
      mockDocument._listeners[evt] = mockDocument._listeners[evt] || [];
      mockDocument._listeners[evt].push(fn);
    },
    dispatchEvent: (evt) => {
      if (mockDocument._listeners && mockDocument._listeners[evt.type]) {
        mockDocument._listeners[evt.type].forEach(fn => fn(evt));
      }
    }
  };

  global.localStorage = mockStorage;
  global.window = mockWindow;
  global.document = mockDocument;
  global.CustomEvent = class {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail || {};
    }
  };

  global.getCartItems = cart.getCartItems;
  global.getCartTotals = cart.getCartTotals;
  global.getCartSubtotal = cart.getCartSubtotal;
  global.getCartTotalCount = cart.getCartTotalCount;
  global.updateCartQuantity = cart.updateCartQuantity;
  global.removeCartItem = cart.removeCartItem;
  global.clearCart = cart.clearCart;
  global.saveCartItems = cart.saveCartItems;
  global.STANDARD_DELIVERY_FEE = cart.STANDARD_DELIVERY_FEE;

  if (typeof cartUI !== "undefined") {
    mockWindow.addEventListener("popstate", (e) => cartUI.handleCartPopstate(e));
    mockWindow.addEventListener("keydown", (e) => cartUI.handleCartKeydown(e));
  }

  return { mockStorage, elements, mockWindow, mockDocument, historyStack };
}

// Load production libraries
setupMockEnv();
cartUI = require('../js/cart-ui.js');
const products = require('../js/products.js');
const initializeHandler = require('../api/paystack/initialize.js');

// ─────────────────────────────────────────────────────────────
// 1. Shared Constant: STANDARD_DELIVERY_FEE === 5000 NGN
// ─────────────────────────────────────────────────────────────
try {
  assert.strictEqual(cart.STANDARD_DELIVERY_FEE, 5000, 'cart.js defines STANDARD_DELIVERY_FEE as 5000');
  assert.strictEqual(cartUI.STANDARD_DELIVERY_FEE, 5000, 'cart-ui.js exports STANDARD_DELIVERY_FEE as 5000');

  // Verify server-side initialize.js definition matches
  const initCode = fs.readFileSync(path.join(__dirname, '../api/paystack/initialize.js'), 'utf8');
  assert(initCode.includes('STANDARD_DELIVERY_FEE = 5000'), 'initialize.js defines STANDARD_DELIVERY_FEE as 5000 NGN');

  reportPass(1, 'Shared nationwide delivery fee constant (5,000 NGN) strictly consistent across client and server');
} catch (err) {
  reportFail(1, 'Shared delivery fee constant mismatch', err);
}

// ─────────────────────────────────────────────────────────────
// 2. Authoritative Calculations: Subtotal, Fee & Grand Total
// ─────────────────────────────────────────────────────────────
try {
  const { mockStorage } = setupMockEnv();

  // Test 2A: Empty cart
  cart.clearCart();
  const emptyTotals = cart.getCartTotals();
  assert.strictEqual(emptyTotals.subtotal, 0, 'Empty cart subtotal is 0');
  assert.strictEqual(emptyTotals.deliveryFee, 0, 'Empty cart delivery fee is 0');
  assert.strictEqual(emptyTotals.total, 0, 'Empty cart total is 0');
  assert.strictEqual(emptyTotals.isEmpty, true, 'Empty cart flag is true');

  // Test 2B: 1 item (price 65,000, qty 1)
  mockStorage.setItem('qj_cart_v1', JSON.stringify([
    { lineKey: 'item-1', id: 'boot-1', name: 'Phantom Boot', price: 65000, quantity: 1 }
  ]));
  const totals1 = cart.getCartTotals();
  assert.strictEqual(totals1.subtotal, 65000, 'Subtotal for 1 item is unit price * 1');
  assert.strictEqual(totals1.deliveryFee, 5000, 'Delivery fee is ₦5,000 for non-empty order');
  assert.strictEqual(totals1.total, 70000, 'Grand Total is 65,000 + 5,000 = 70,000');

  // Test 2C: Multiple items and quantities (65,000 * 2 + 35,000 * 1 = 165,000)
  mockStorage.setItem('qj_cart_v1', JSON.stringify([
    { lineKey: 'item-1', id: 'boot-1', name: 'Phantom Boot', price: 65000, quantity: 2 },
    { lineKey: 'item-2', id: 'jersey-1', name: 'Nigeria Jersey', price: 35000, quantity: 1 }
  ]));
  const totals2 = cart.getCartTotals();
  assert.strictEqual(totals2.subtotal, 165000, 'Subtotal correctly sums all items');
  assert.strictEqual(totals2.deliveryFee, 5000, 'Delivery fee remains strictly flat ₦5,000 (never multiplied per item)');
  assert.strictEqual(totals2.total, 170000, 'Total is 165,000 + 5,000 = 170,000');

  reportPass(2, 'Subtotal, single ₦5,000 delivery fee, and grand total correctly calculated');
} catch (err) {
  reportFail(2, 'Totals calculation test failed', err);
}

// ─────────────────────────────────────────────────────────────
// 3. Three Clearly Labelled Rows Rendered in Cart Drawer
// ─────────────────────────────────────────────────────────────
try {
  const { mockStorage, elements } = setupMockEnv();

  // Populate 1 item
  mockStorage.setItem('qj_cart_v1', JSON.stringify([
    { lineKey: 'k1', id: 'prod-1', name: 'Vapor 15 Pro', price: 75000, quantity: 1, image: 'img.webp' }
  ]));

  cartUI.renderCartDrawer();

  const subtotalEl = elements.get('cart-items-subtotal');
  const deliveryEl = elements.get('cart-delivery-fee');
  const totalEl = elements.get('cart-total-amount');

  assert(subtotalEl !== undefined, '#cart-items-subtotal element exists');
  assert(deliveryEl !== undefined, '#cart-delivery-fee element exists');
  assert(totalEl !== undefined, '#cart-total-amount element exists');

  assert.strictEqual(subtotalEl.textContent, '₦75,000', 'Items Subtotal displays ₦75,000');
  assert.strictEqual(deliveryEl.textContent, '₦5,000', 'Delivery Fee displays ₦5,000');
  assert.strictEqual(totalEl.textContent, '₦80,000', 'Total displays ₦80,000');

  // Verify HTML template contains required row labels and courier subnote
  const drawerHtml = fs.readFileSync(path.join(__dirname, '../js/cart-ui.js'), 'utf8');
  assert(drawerHtml.includes('Items Subtotal'), 'Drawer template includes "Items Subtotal" row label');
  assert(drawerHtml.includes('Delivery Fee'), 'Drawer template includes "Delivery Fee" row label');
  assert(drawerHtml.includes('Nationwide courier dispatch'), 'Drawer template includes "Nationwide courier dispatch" descriptor');
  assert(drawerHtml.includes('Total'), 'Drawer template includes "Total" row label');

  reportPass(3, 'Cart drawer renders three clearly labelled rows: Items Subtotal, Delivery Fee (Nationwide courier dispatch), Total');
} catch (err) {
  reportFail(3, 'Drawer summary rows test failed', err);
}

// ─────────────────────────────────────────────────────────────
// 4. Empty Cart Displays ₦0 Totals and Zero Delivery Fee
// ─────────────────────────────────────────────────────────────
try {
  const { mockStorage, elements } = setupMockEnv();

  // Clear cart
  mockStorage.setItem('qj_cart_v1', '[]');
  cartUI.renderCartDrawer();

  const subtotalEl = elements.get('cart-items-subtotal');
  const deliveryEl = elements.get('cart-delivery-fee');
  const totalEl = elements.get('cart-total-amount');
  const container = elements.get('cart-items-container');
  const footer = elements.get('cart-footer');

  assert.strictEqual(subtotalEl.textContent, '₦0', 'Empty cart items subtotal is ₦0');
  assert.strictEqual(deliveryEl.textContent, '₦0', 'Empty cart delivery fee is ₦0');
  assert.strictEqual(totalEl.textContent, '₦0', 'Empty cart total is ₦0');
  assert.strictEqual(footer.style.display, 'none', 'Empty cart footer is hidden');
  assert(container.innerHTML.includes('Your cart is empty'), 'Empty state messaging displayed');
  assert(container.innerHTML.includes('Continue Shopping'), 'Empty state includes Continue Shopping action');

  reportPass(4, 'Empty cart shows ₦0 across all amounts and does not charge delivery fee until an item is added');
} catch (err) {
  reportFail(4, 'Empty cart zero fee test failed', err);
}

// ─────────────────────────────────────────────────────────────
// 5. Dynamic Recalculation on Quantity Changes & Removal
// ─────────────────────────────────────────────────────────────
try {
  const { mockStorage, elements } = setupMockEnv();

  // Seed 1 item: price 50,000, qty 1
  mockStorage.setItem('qj_cart_v1', JSON.stringify([
    { lineKey: 'k10', id: 'jersey-10', name: 'Club Jersey', price: 50000, quantity: 1, image: 'img.webp' }
  ]));
  cartUI.renderCartDrawer();
  assert.strictEqual(elements.get('cart-total-amount').textContent, '₦55,000');

  // Increment quantity to 3 via handleQtyChange
  cart.updateCartQuantity('k10', 3);
  cartUI.renderCartDrawer();
  assert.strictEqual(elements.get('cart-items-subtotal').textContent, '₦150,000', 'Subtotal updated to ₦150,000');
  assert.strictEqual(elements.get('cart-delivery-fee').textContent, '₦5,000', 'Delivery fee remains ₦5,000');
  assert.strictEqual(elements.get('cart-total-amount').textContent, '₦155,000', 'Total updated to ₦155,000');

  // Decrement to 0 removes item
  cart.updateCartQuantity('k10', 0);
  assert.strictEqual(cart.getCartItems().length, 0, 'Quantity 0 removes item from cart');
  cartUI.renderCartDrawer();
  assert.strictEqual(elements.get('cart-items-subtotal').textContent, '₦0', 'Subtotal resets to ₦0');
  assert.strictEqual(elements.get('cart-delivery-fee').textContent, '₦0', 'Delivery fee resets to ₦0');
  assert.strictEqual(elements.get('cart-total-amount').textContent, '₦0', 'Total resets to ₦0');

  reportPass(5, 'Cart totals recalculate immediately on quantity increment, decrement, and item removal');
} catch (err) {
  reportFail(5, 'Dynamic recalculation test failed', err);
}

// ─────────────────────────────────────────────────────────────
// 6. Non-Finite & Invalid Quantity Guarding
// ─────────────────────────────────────────────────────────────
try {
  const { mockStorage } = setupMockEnv();

  // Seed item with corrupted/NaN values
  mockStorage.setItem('qj_cart_v1', JSON.stringify([
    { lineKey: 'k-nan', id: 'p-nan', name: 'Corrupt Item', price: NaN, quantity: 'invalid' }
  ]));

  const totals = cart.getCartTotals();
  assert(Number.isFinite(totals.subtotal), 'Subtotal must be finite even with NaN price');
  assert(Number.isFinite(totals.deliveryFee), 'Delivery fee must be finite');
  assert(Number.isFinite(totals.total), 'Total must be finite');
  assert.strictEqual(cartUI.formatPriceSafe(NaN), '₦0', 'formatPriceSafe converts NaN to ₦0');
  assert.strictEqual(cartUI.formatPriceSafe(Infinity), '₦0', 'formatPriceSafe converts Infinity to ₦0');
  assert.strictEqual(cartUI.formatPriceSafe(-500), '₦0', 'formatPriceSafe converts negative values to ₦0');

  reportPass(6, 'Invalid quantities and non-finite/negative amounts are safely guarded and sanitized');
} catch (err) {
  reportFail(6, 'Non-finite guarding test failed', err);
}

// ─────────────────────────────────────────────────────────────
// 7. Authoritative Checkout Compatibility (Paystack & WhatsApp)
// ─────────────────────────────────────────────────────────────
try {
  // Case 7A: Server-side Paystack initialize recalculation
  const initCode = fs.readFileSync(path.join(__dirname, '../api/paystack/initialize.js'), 'utf8');
  assert(initCode.includes('STANDARD_DELIVERY_FEE'), 'initialize.js imports and uses STANDARD_DELIVERY_FEE');
  assert(initCode.includes('totalAmountNaira = calculatedSubtotal + deliveryFee'), 'initialize.js adds delivery fee to verified subtotal');
  assert(initCode.includes('amountKobo = totalAmountNaira * 100'), 'initialize.js converts total (subtotal + fee) to kobo for Paystack gateway');

  // Case 7B: WhatsApp message output formatting
  const mockOrderData = {
    order_ref: 'QJ-TEST-1234',
    customer_name: 'Emeka Okafor',
    customer_phone: '08099887766',
    delivery_address: '10 Marina Street',
    delivery_city: 'Lagos Island',
    delivery_state: 'Lagos',
    subtotal: 90000,
    delivery_fee: 5000,
    total_amount: 95000
  };
  const mockItems = [
    { id: 'boot-1', name: 'Speed Boot', price: 90000, quantity: 1 }
  ];

  const waUrl = products.buildMultiItemWhatsAppMessage(mockOrderData, mockItems);
  assert(waUrl.includes('Items%20Subtotal%3A%20*%E2%82%A690%2C000*') || waUrl.includes('Items Subtotal') || decodeURIComponent(waUrl).includes('Items Subtotal: *₦90,000*'), 'WhatsApp message contains Items Subtotal');
  assert(waUrl.includes('Standard%20Delivery%3A%20*%E2%82%A65%2C000') || decodeURIComponent(waUrl).includes('Standard Delivery: *₦5,000'), 'WhatsApp message contains Standard Delivery: ₦5,000');
  assert(waUrl.includes('Estimated%20Total%3A%20%E2%82%A695%2C000') || decodeURIComponent(waUrl).includes('Estimated Total: ₦95,000'), 'WhatsApp message contains Estimated Total matching subtotal + fee');

  reportPass(7, 'Exact same authoritative subtotal, ₦5,000 fee, and total are reconciled across WhatsApp and Paystack');
} catch (err) {
  reportFail(7, 'Checkout compatibility test failed', err);
}

// ─────────────────────────────────────────────────────────────
// 8. Drawer Overlay, Close Button & Continue Shopping Controls
// ─────────────────────────────────────────────────────────────
try {
  const { elements } = setupMockEnv();

  cartUI.openCartDrawer();
  const drawer = elements.get('qj-cart-drawer');
  const backdrop = elements.get('qj-cart-backdrop');

  assert(drawer.classList.contains('open'), 'openCartDrawer adds .open to drawer');
  assert(backdrop.classList.contains('open'), 'openCartDrawer adds .open to backdrop');
  assert.strictEqual(drawer.getAttribute('aria-hidden'), 'false', 'Drawer marked aria-hidden="false" when open');

  // Close via closeCartDrawer (used by Close Button and Continue Shopping)
  cartUI.closeCartDrawer();
  assert(!drawer.classList.contains('open'), 'closeCartDrawer removes .open from drawer');
  assert(!backdrop.classList.contains('open'), 'closeCartDrawer removes .open from backdrop');
  assert.strictEqual(drawer.getAttribute('aria-hidden'), 'true', 'Drawer marked aria-hidden="true" when closed');

  // Verify Continue Shopping button exists in injected template
  const uiCode = fs.readFileSync(path.join(__dirname, '../js/cart-ui.js'), 'utf8');
  assert(uiCode.includes('btn-continue-shopping'), 'cart-ui.js includes btn-continue-shopping element');
  assert(uiCode.includes('Continue Shopping'), 'cart-ui.js includes "Continue Shopping" button text');

  reportPass(8, 'Drawer open/close controls, backdrop click handler, close button, and Continue Shopping action operate cleanly');
} catch (err) {
  reportFail(8, 'Drawer controls test failed', err);
}

// ─────────────────────────────────────────────────────────────
// 9. Scroll Locking and Restoration
// ─────────────────────────────────────────────────────────────
try {
  const { mockDocument } = setupMockEnv();

  mockDocument.body.style.overflow = 'auto';
  cartUI.lockBodyScroll();
  assert.strictEqual(mockDocument.body.style.overflow, 'hidden', 'lockBodyScroll locks body overflow to hidden');
  assert.strictEqual(mockDocument.documentElement.style.overflow, 'hidden', 'lockBodyScroll locks documentElement overflow to hidden');

  cartUI.restoreBodyScroll();
  assert.strictEqual(mockDocument.body.style.overflow, 'auto', 'restoreBodyScroll restores original body overflow');

  reportPass(9, 'Background body scrolling is locked while drawer is open and restored on close');
} catch (err) {
  reportFail(9, 'Scroll locking test failed', err);
}

// ─────────────────────────────────────────────────────────────
// 10. History API & Browser Back / Mobile Swipe-Back
// ─────────────────────────────────────────────────────────────
try {
  const { mockWindow, elements, historyStack } = setupMockEnv();

  // Initial history length
  const initialLength = historyStack.length;

  // Open drawer
  cartUI.openCartDrawer();
  assert.strictEqual(historyStack.length, initialLength + 1, 'Opening drawer pushes history entry');
  assert.deepStrictEqual(historyStack[historyStack.length - 1].state, { qjDrawer: 'cart' }, 'Pushed state contains { qjDrawer: "cart" }');

  // Simulate user pressing browser Back button / mobile swipe-back
  mockWindow.history.back();

  // Drawer should close upon popstate
  const drawer = elements.get('qj-cart-drawer');
  assert(!drawer.classList.contains('open'), 'Mobile Back / swipe-back closes the drawer without navigating away');

  // Repeated cycle: Open drawer and close via UI
  cartUI.openCartDrawer();
  assert(drawer.classList.contains('open'));
  cartUI.closeCartDrawer();
  assert(!drawer.classList.contains('open'));

  reportPass(10, 'History API integration: mobile swipe-back/Back button closes drawer first without loops or duplicate states');
} catch (err) {
  reportFail(10, 'History API test failed', err);
}

// ─────────────────────────────────────────────────────────────
// 11. Escape Key, Accessibility Semantics & Reduced-Motion
// ─────────────────────────────────────────────────────────────
try {
  const { elements } = setupMockEnv();

  // Open drawer
  cartUI.openCartDrawer();
  const drawer = elements.get('qj-cart-drawer');
  assert(drawer.classList.contains('open'));

  // Trigger Escape key
  cartUI.handleCartKeydown({ key: 'Escape' });
  assert(!drawer.classList.contains('open'), 'Escape key cleanly closes open cart drawer');

  // Check accessibility attributes in DOM template
  const uiCode = fs.readFileSync(path.join(__dirname, '../js/cart-ui.js'), 'utf8');
  assert(uiCode.includes('role="dialog"'), 'Drawer includes role="dialog"');
  assert(uiCode.includes('aria-modal="true"'), 'Drawer includes aria-modal="true"');
  assert(uiCode.includes('aria-label="Shopping Cart"'), 'Drawer includes aria-label="Shopping Cart"');

  // Check reduced-motion rule in CSS
  const cssCode = fs.readFileSync(path.join(__dirname, '../css/style.css'), 'utf8');
  assert(cssCode.includes('prefers-reduced-motion: reduce'), 'style.css includes prefers-reduced-motion media query');
  assert(cssCode.includes('.cart-drawer') && cssCode.includes('transition: none !important'), 'Reduced motion disables cart drawer transition animation');

  reportPass(11, 'Escape key dismiss, dialog accessibility attributes, and reduced-motion preferences supported');
} catch (err) {
  reportFail(11, 'Accessibility and reduced-motion test failed', err);
}

// ─────────────────────────────────────────────────────────────
// 12. Backdrop Click Safety & Click Inside Isolation
// ─────────────────────────────────────────────────────────────
try {
  const uiCode = fs.readFileSync(path.join(__dirname, '../js/cart-ui.js'), 'utf8');
  assert(uiCode.includes('id="qj-cart-backdrop" class="cart-backdrop" onclick="closeCartDrawer()"'), 'Backdrop has closeCartDrawer onclick handler');
  assert(uiCode.includes('id="qj-cart-drawer"') && uiCode.includes('onclick="event.stopPropagation()"'), 'Drawer stops event propagation so clicking inside does not trigger backdrop close');

  reportPass(12, 'Clicking backdrop closes drawer while clicking inside drawer is isolated from accidental closure');
} catch (err) {
  reportFail(12, 'Backdrop click isolation test failed', err);
}

// ─────────────────────────────────────────────────────────────
// 13. Focus Trapping: Tab / Shift+Tab & Empty Focusable Guard
// ─────────────────────────────────────────────────────────────
try {
  const { elements, mockDocument } = setupMockEnv();
  const drawer = elements.get('qj-cart-drawer');

  // Case 13A: Populate 3 focusable elements inside drawer
  const btn1 = { id: 'btn-close', tagName: 'BUTTON', disabled: false, style: {}, focus: () => { mockDocument.activeElement = btn1; } };
  const btn2 = { id: 'btn-qty-plus', tagName: 'BUTTON', disabled: false, style: {}, focus: () => { mockDocument.activeElement = btn2; } };
  const btn3 = { id: 'btn-checkout', tagName: 'BUTTON', disabled: false, style: {}, focus: () => { mockDocument.activeElement = btn3; } };
  drawer.children = [btn1, btn2, btn3];

  drawer.classList.add('open');

  // Start with focus on last element (btn3); Tab should cycle to first element (btn1)
  mockDocument.activeElement = btn3;
  let defaultPrevented = false;
  const tabEvt = { key: 'Tab', shiftKey: false, preventDefault: () => { defaultPrevented = true; } };
  cartUI.handleCartKeydown(tabEvt);
  assert(defaultPrevented, 'Tab on last element prevents default browser escape');
  assert.strictEqual(mockDocument.activeElement, btn1, 'Tab on last focusable cycles focus to first focusable');

  // Start with focus on first element (btn1); Shift+Tab should cycle to last element (btn3)
  mockDocument.activeElement = btn1;
  defaultPrevented = false;
  const shiftTabEvt = { key: 'Tab', shiftKey: true, preventDefault: () => { defaultPrevented = true; } };
  cartUI.handleCartKeydown(shiftTabEvt);
  assert(defaultPrevented, 'Shift+Tab on first element prevents default');
  assert.strictEqual(mockDocument.activeElement, btn3, 'Shift+Tab on first element cycles focus to last focusable');

  // Case 13B: Focus landed outside drawer (e.g. document body) while drawer is open
  mockDocument.activeElement = null;
  defaultPrevented = false;
  cartUI.handleCartKeydown({ key: 'Tab', shiftKey: false, preventDefault: () => { defaultPrevented = true; } });
  assert.strictEqual(mockDocument.activeElement, btn1, 'Tab from outside focusable list focuses first element');

  mockDocument.activeElement = null;
  cartUI.handleCartKeydown({ key: 'Tab', shiftKey: true, preventDefault: () => { defaultPrevented = true; } });
  assert.strictEqual(mockDocument.activeElement, btn3, 'Shift+Tab from outside focusable list focuses last element');

  // Case 13C: Drawer with zero focusables prevents escape and keeps focus on drawer container
  drawer.children = [];
  let drawerFocused = false;
  drawer.focus = () => { drawerFocused = true; };
  defaultPrevented = false;
  cartUI.handleCartKeydown({ key: 'Tab', shiftKey: false, preventDefault: () => { defaultPrevented = true; } });
  assert(defaultPrevented, 'Empty focusable drawer prevents Tab default');
  assert(drawerFocused, 'Empty focusable drawer focuses drawer container itself');

  reportPass(13, 'Focus trapping keeps focus inside open drawer in both Tab and Shift+Tab directions and handles empty elements');
} catch (err) {
  reportFail(13, 'Focus trapping test failed', err);
}

// ─────────────────────────────────────────────────────────────
// 14. Focus Trapping Deferral During Higher-Priority Modals
// ─────────────────────────────────────────────────────────────
try {
  const { elements, mockDocument } = setupMockEnv();
  const drawer = elements.get('qj-cart-drawer');
  const checkoutModal = elements.get('qj-checkout-modal');
  const btn1 = { id: 'btn-close', tagName: 'BUTTON', disabled: false, style: {}, focus: () => { mockDocument.activeElement = btn1; } };
  drawer.children = [btn1];

  drawer.classList.add('open');
  checkoutModal.style.display = 'flex'; // Checkout modal is active

  // When checkout modal is open, Tab should NOT be trapped into the cart drawer
  let defaultPrevented = false;
  cartUI.handleCartKeydown({ key: 'Tab', shiftKey: false, preventDefault: () => { defaultPrevented = true; } });
  assert(!defaultPrevented, 'Tab key is not intercepted by cart drawer when checkout modal is active');

  reportPass(14, 'Cart focus trapping cleanly defers while checkout or status modal is open');
} catch (err) {
  reportFail(14, 'Modal focus deferral test failed', err);
}

// ─────────────────────────────────────────────────────────────
// 15. Focus Restoration to Opener on Close
// ─────────────────────────────────────────────────────────────
try {
  const { elements, mockDocument } = setupMockEnv();
  const openerBtn = {
    id: 'header-cart-btn',
    tagName: 'BUTTON',
    disabled: false,
    isConnected: true,
    focus: () => { mockDocument.activeElement = openerBtn; }
  };

  // Simulate opener button triggering drawer open
  mockDocument.activeElement = openerBtn;
  cartUI.openCartDrawer();

  // Close drawer
  cartUI.closeCartDrawer();
  assert.strictEqual(mockDocument.activeElement, openerBtn, 'Closing drawer restores focus to opener button');

  // Case 15B: If opener was disabled, does not throw or focus disabled element
  openerBtn.disabled = true;
  mockDocument.activeElement = null;
  cartUI.openCartDrawer();
  cartUI.closeCartDrawer();
  assert.strictEqual(mockDocument.activeElement, null, 'Disabled opener does not receive focus');

  reportPass(15, 'Focus is restored to the original opener button when drawer closes, safely checking usability');
} catch (err) {
  reportFail(15, 'Focus restoration test failed', err);
}

// ─────────────────────────────────────────────────────────────
// 16. Nested Modal Scroll Locking & Pre-Existing Overflow
// ─────────────────────────────────────────────────────────────
try {
  const { mockDocument, elements } = setupMockEnv();

  // Page starts with specific pre-existing overflow values
  mockDocument.body.style.overflow = 'auto';
  mockDocument.documentElement.style.overflow = 'scroll';

  // 1. Open drawer -> locks scrolling
  cartUI.lockBodyScroll();
  assert.strictEqual(mockDocument.body.style.overflow, 'hidden', 'Body locked to hidden');
  assert.strictEqual(mockDocument.documentElement.style.overflow, 'hidden', 'documentElement locked to hidden');

  // 2. Open checkout modal while drawer is open (simulate openCheckoutModal calling lockBodyScroll again)
  const checkoutModal = elements.get('qj-checkout-modal');
  checkoutModal.style.display = 'flex';
  cartUI.lockBodyScroll(); // Second lock call must NOT overwrite original 'auto'/'scroll' with 'hidden'
  assert.strictEqual(mockDocument.body.style.overflow, 'hidden');

  // 3. Transition to payment status modal
  const statusModal = elements.get('qj-payment-status-modal');
  statusModal.style.display = 'flex';
  checkoutModal.style.display = 'none';
  cartUI.restoreBodyScroll(); // Attempt restore while statusModal is open
  assert.strictEqual(mockDocument.body.style.overflow, 'hidden', 'Scroll remains locked while payment status modal is open');

  // 4. Close status modal -> all overlays now closed
  statusModal.style.display = 'none';
  cartUI.restoreBodyScroll();
  assert.strictEqual(mockDocument.body.style.overflow, 'auto', 'Original body overflow "auto" restored without being corrupted');
  assert.strictEqual(mockDocument.documentElement.style.overflow, 'scroll', 'Original documentElement overflow "scroll" restored');

  reportPass(16, 'Nested modal transitions preserve pre-existing overflow without overwriting with "hidden"');
} catch (err) {
  reportFail(16, 'Nested scroll lock test failed', err);
}

// ─────────────────────────────────────────────────────────────
// 17. Polite Live-Region Announcements for Screen Readers
// ─────────────────────────────────────────────────────────────
try {
  const { elements, mockStorage } = setupMockEnv();
  const liveRegion = elements.get('cart-live-region');
  const drawer = elements.get('qj-cart-drawer');
  drawer.classList.add('open');

  // Case 17A: Empty cart announcement
  mockStorage.setItem('qj_cart_v1', '[]');
  cartUI.renderCartDrawer();
  assert(liveRegion.textContent.includes('empty'), 'Empty cart announces empty status');
  assert(liveRegion.textContent.includes('₦0'), 'Empty cart announces ₦0 totals');

  // Case 17B: Populated cart announcement
  mockStorage.setItem('qj_cart_v1', JSON.stringify([
    { lineKey: 'k1', id: 'boot-1', name: 'Speed Pro', price: 60000, quantity: 2 }
  ]));
  cartUI.renderCartDrawer();
  assert(liveRegion.textContent.includes('2 items'), 'Announces item count');
  assert(liveRegion.textContent.includes('₦120,000'), 'Announces subtotal');
  assert(liveRegion.textContent.includes('₦5,000'), 'Announces delivery fee');
  assert(liveRegion.textContent.includes('₦125,000'), 'Announces grand total');

  // Case 17C: Repeating the same totals does not flap or re-render noisy identical announcements
  const firstText = liveRegion.textContent;
  cartUI.renderCartDrawer();
  assert.strictEqual(liveRegion.textContent, firstText, 'Repeated renders with identical totals do not flap announcement');

  reportPass(17, 'Screen-reader polite live region announces cart totals, item counts, and empty states without noise');
} catch (err) {
  reportFail(17, 'Live region announcement test failed', err);
}

console.log('\n================================================================');
console.log(`STAGE 5N TEST RESULTS: ${passCount} / ${passCount + failCount} PASSED`);
console.log('================================================================\n');

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
