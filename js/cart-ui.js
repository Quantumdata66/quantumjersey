// ============================================================
// Quantum Jersey — Cart Drawer, Checkout Modal & UI Controller
// ============================================================

const NIGERIA_STATES = [
  "Lagos", "Abuja (FCT)", "Kaduna", "Rivers (Port Harcourt)", "Kano",
  "Oyo (Ibadan)", "Enugu", "Delta", "Edo (Benin)", "Anambra", "Ogun",
  "Akwa Ibom", "Abia", "Adamawa", "Bauchi", "Bayelsa", "Benue", "Borno",
  "Cross River", "Ebonyi", "Ekiti", "Gombe", "Imo", "Jigawa", "Katsina",
  "Kebbi", "Kogi", "Kwara", "Nasarawa", "Niger", "Ondo", "Osun",
  "Plateau", "Sokoto", "Taraba", "Yobe", "Zamfara"
];

// ─── UI Template Injection ───────────────────────────────────

function injectCartUIElements() {
  if (document.getElementById("qj-cart-drawer")) return;

  const html = `
    <!-- Cart Overlay Backdrop -->
    <div id="qj-cart-backdrop" class="cart-backdrop" onclick="closeCartDrawer()"></div>

    <!-- Slide-out Cart Drawer -->
    <aside id="qj-cart-drawer" class="cart-drawer" aria-label="Shopping Cart">
      <!-- Drawer Header -->
      <div class="cart-header">
        <div class="cart-header-title">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/>
          </svg>
          <h3>Shopping Cart</h3>
          <span id="cart-drawer-badge" class="cart-drawer-badge">0</span>
        </div>
        <button class="cart-close-btn" onclick="closeCartDrawer()" aria-label="Close cart">✕</button>
      </div>

      <!-- Standard Nationwide Delivery Banner -->
      <div id="cart-delivery-banner" class="cart-delivery-banner">
        <div class="cart-delivery-text">
          <span>🚚 <strong>Nationwide Delivery: ₦5,000</strong> per order</span>
          <span class="cart-delivery-subnote">Remote location courier waybill surcharges confirmed via WhatsApp</span>
        </div>
      </div>

      <!-- Cart Items Scrollable Container -->
      <div id="cart-items-container" class="cart-items-container">
        <!-- Rendered dynamically -->
      </div>

      <!-- Cart Footer / Subtotal / Checkout CTA -->
      <div id="cart-footer" class="cart-footer">
        <div class="cart-subtotal-row">
          <span class="cart-subtotal-label">Subtotal</span>
          <span id="cart-subtotal-amount" class="cart-subtotal-amount">₦0</span>
        </div>
        <p class="cart-tax-notice">Estimated delivery & final details confirmed via WhatsApp</p>
        <button id="btn-proceed-checkout" class="btn-primary btn-checkout-action" onclick="openCheckoutModal()">
          <span>Proceed to Checkout</span>
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6"/>
          </svg>
        </button>
        <button class="btn-clear-cart" onclick="handleClearCartPrompt()">Clear Cart</button>
      </div>
    </aside>

    <!-- Checkout Modal -->
    <div id="qj-checkout-modal" class="modal-overlay" style="display:none;" onclick="handleCheckoutModalBackdrop(event)">
      <div class="modal-card checkout-modal-card">
        <div class="modal-header">
          <div style="display:flex;align-items:center;gap:10px;">
            <div class="modal-header-icon" id="checkout-modal-header-icon">💳</div>
            <div>
              <h3 style="font-size:1.25rem;font-weight:800;color:var(--text-primary);">Checkout & <span class="text-accent">Payment</span></h3>
              <p style="font-size:0.8rem;color:var(--text-secondary);margin:0;">Select payment method and confirm delivery details</p>
            </div>
          </div>
          <button class="modal-close-btn" onclick="closeCheckoutModal()" aria-label="Close modal">✕</button>
        </div>

        <form id="checkout-form" class="checkout-form" onsubmit="handleCheckoutSubmit(event)">
          <!-- Payment Method Choice -->
          <div class="payment-method-selector-wrap">
            <label class="checkout-section-label">Payment Method <span class="required">*</span></label>
            <div class="payment-methods-grid" role="radiogroup" aria-label="Payment method selection">
              <!-- Pay Online with Paystack -->
              <label class="payment-option-card active" id="option-paystack" for="method-paystack" tabindex="0" onkeydown="handlePaymentKeydown(event, 'paystack')">
                <input type="radio" name="checkout_payment_method" id="method-paystack" value="paystack" checked onchange="handlePaymentMethodChange('paystack')"/>
                <div class="option-card-body">
                  <div class="option-card-title">
                    <span class="option-icon">⚡</span>
                    <strong>Pay Online (Paystack)</strong>
                    <span class="option-pill">Instant</span>
                  </div>
                  <p class="option-desc">Cards, Bank Transfer, USSD via Paystack secure gateway</p>
                </div>
              </label>

              <!-- WhatsApp / Direct Transfer -->
              <label class="payment-option-card" id="option-whatsapp" for="method-whatsapp" tabindex="0" onkeydown="handlePaymentKeydown(event, 'whatsapp')">
                <input type="radio" name="checkout_payment_method" id="method-whatsapp" value="whatsapp" onchange="handlePaymentMethodChange('whatsapp')"/>
                <div class="option-card-body">
                  <div class="option-card-title">
                    <span class="option-icon">💬</span>
                    <strong>WhatsApp / Direct Transfer</strong>
                  </div>
                  <p class="option-desc">Submit order record & finalize payment with our sales desk</p>
                </div>
              </label>
            </div>
          </div>

          <div class="checkout-form-grid">
            <!-- Customer Name -->
            <div class="checkout-field">
              <label for="co-name">Full Name <span class="required">*</span></label>
              <input type="text" id="co-name" placeholder="e.g. Tunde Balogun" required autocomplete="name"/>
              <span class="field-error-msg" id="err-co-name"></span>
            </div>

            <!-- WhatsApp Phone -->
            <div class="checkout-field">
              <label for="co-phone">WhatsApp Phone Number <span class="required">*</span></label>
              <input type="tel" id="co-phone" placeholder="e.g. 08116154796" required autocomplete="tel"/>
              <span class="field-error-msg" id="err-co-phone"></span>
            </div>

            <!-- Customer Email (Required for Paystack) -->
            <div class="checkout-field checkout-field-full" id="field-co-email">
              <label for="co-email">Email Address <span class="required">*</span></label>
              <input type="email" id="co-email" placeholder="e.g. tunde@example.com" autocomplete="email" required/>
              <span class="field-hint" id="hint-co-email">Required for Paystack online payment receipt and order confirmation.</span>
              <span class="field-error-msg" id="err-co-email"></span>
            </div>

            <!-- Delivery State -->
            <div class="checkout-field">
              <label for="co-state">Delivery State <span class="required">*</span></label>
              <select id="co-state" required onchange="handleStateChange()">
                <option value="">Select State…</option>
                ${NIGERIA_STATES.map(s => `<option value="${s}">${s}</option>`).join("")}
              </select>
              <span class="field-error-msg" id="err-co-state"></span>
            </div>

            <!-- Delivery City/Town -->
            <div class="checkout-field">
              <label for="co-city">City / Area / Town <span class="required">*</span></label>
              <input type="text" id="co-city" placeholder="e.g. Ikeja / Lekki / Kaduna North" required/>
              <span class="field-error-msg" id="err-co-city"></span>
            </div>
          </div>

          <!-- Street Address -->
          <div class="checkout-field" style="margin-top:14px;">
            <label for="co-address">Full Street Address <span class="required">*</span></label>
            <input type="text" id="co-address" placeholder="House number, street name, landmarks" required autocomplete="street-address"/>
            <span class="field-error-msg" id="err-co-address"></span>
          </div>

          <!-- Order Notes -->
          <div class="checkout-field" style="margin-top:14px;">
            <label for="co-notes">Delivery Notes / Size Guidance (Optional)</label>
            <textarea id="co-notes" rows="2" placeholder="Any specific delivery instructions or preferences…"></textarea>
          </div>

          <!-- Order Summary in Checkout -->
          <div class="checkout-summary-box">
            <div class="summary-line">
              <span>Items Total (<span id="co-items-count">0</span> items)</span>
              <span id="co-items-subtotal">₦0</span>
            </div>
            <div class="summary-line">
              <span>Standard Delivery</span>
              <span id="co-delivery-fee" style="color:var(--text-primary);">₦5,000</span>
            </div>
            <p class="checkout-delivery-note">📍 Standard delivery is ₦5,000 nationwide. For remote locations, any courier waybill surcharge will be confirmed on WhatsApp before dispatch.</p>
            <div class="summary-divider"></div>
            <div class="summary-line total-line">
              <span>Total to Pay</span>
              <span id="co-grand-total" class="summary-total-price">₦0</span>
            </div>
          </div>

          <!-- Informational Notices -->
          <div id="checkout-notice-paystack" class="checkout-notice">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;color:var(--accent-green);">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
            </svg>
            <span>You will be redirected to Paystack's 256-bit encrypted checkout to complete payment securely. Your cart items are preserved if you return.</span>
          </div>

          <div id="checkout-notice-whatsapp" class="checkout-notice" style="display:none;">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;color:var(--accent-green);">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
            </svg>
            <span>An official order record will be created (status: <strong>Awaiting Confirmation</strong>). WhatsApp will open to connect you directly with our sales desk.</span>
          </div>

          <div id="checkout-error" class="checkout-error" style="display:none;" role="alert"></div>

          <!-- Submit CTA -->
          <button type="submit" id="btn-submit-order" class="btn-primary btn-submit-order">
            <svg id="btn-submit-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
            </svg>
            <span id="btn-submit-text">Pay Securely with Paystack</span>
          </button>
        </form>
      </div>
    </div>

    <!-- Payment Status Modal (for Paystack verification and return) -->
    <div id="qj-payment-status-modal" class="modal-overlay" style="display:none;" role="dialog" aria-modal="true" aria-labelledby="status-modal-title" onclick="handlePaymentStatusBackdrop(event)">
      <div class="modal-card status-modal-card">
        <div id="status-modal-content">
          <!-- Dynamic status content -->
        </div>
      </div>
    </div>

    <!-- Order Success Modal -->
    <div id="qj-success-modal" class="modal-overlay" style="display:none;">
      <div class="modal-card success-modal-card">
        <div class="success-icon-wrap">⚡</div>
        <h3 style="font-size:1.4rem;font-weight:800;margin-bottom:6px;">Order <span class="text-accent">Submitted!</span></h3>
        <p style="font-size:0.88rem;color:var(--text-secondary);margin-bottom:20px;">
          Your order record has been registered with Quantum Jersey.
        </p>

        <div class="order-ref-box">
          <span class="ref-label">Order Reference:</span>
          <div class="ref-value-wrap">
            <strong id="success-order-ref" class="ref-value">QJ-000000</strong>
            <button class="btn-copy-ref" onclick="copyOrderReference()" title="Copy reference">📋 Copy</button>
          </div>
          <span class="ref-status">⏳ Status: <strong>Awaiting Confirmation</strong></span>
        </div>

        <div class="success-instructions">
          <p>👉 If WhatsApp did not open automatically, click below to open your chat with our desk:</p>
          <a id="success-whatsapp-link" href="#" target="_blank" rel="noopener noreferrer" class="btn-primary" style="margin-top:12px;width:100%;justify-content:center;">
            <span>Open WhatsApp Chat Again</span>
          </a>
        </div>

        <button class="btn-secondary" style="margin-top:14px;width:100%;justify-content:center;" onclick="handleFinishOrder()">
          Done & Continue Shopping
        </button>
      </div>
    </div>

    <!-- Global Toast Notification -->
    <div id="qj-toast" class="qj-toast" aria-live="polite"></div>
  `;

  document.body.insertAdjacentHTML("beforeend", html);
}

// ─── Header Cart Button Injection / Sync ─────────────────────

function syncHeaderCartButtons() {
  const count = typeof getCartTotalCount === "function" ? getCartTotalCount() : 0;
  
  // Update desktop nav
  const navInner = document.querySelector(".nav-inner .nav-links");
  if (navInner && !document.getElementById("nav-cart-btn")) {
    const li = document.createElement("li");
    li.innerHTML = `
      <button id="nav-cart-btn" class="nav-link nav-cart-trigger" onclick="openCartDrawer()" title="View Shopping Cart">
        <svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/>
        </svg>
        <span class="cart-nav-text">Cart</span>
        <span class="cart-nav-badge ${count > 0 ? 'visible' : ''}" id="nav-cart-badge">${count}</span>
      </button>
    `;
    navInner.insertBefore(li, navInner.querySelector(".nav-cta")?.parentNode || null);
  }

  // Update mobile menu
  const mobileMenu = document.getElementById("mobile-menu");
  if (mobileMenu && !document.getElementById("mobile-cart-btn")) {
    const cartLink = document.createElement("a");
    cartLink.id = "mobile-cart-btn";
    cartLink.className = "nav-link mobile-cart-link";
    cartLink.href = "javascript:void(0)";
    cartLink.onclick = () => {
      const hamburger = document.getElementById("hamburger");
      if (hamburger && hamburger.classList.contains("open")) hamburger.click();
      openCartDrawer();
    };
    cartLink.innerHTML = `
      🛍️ Cart (<span id="mobile-cart-badge">${count}</span>)
    `;
    mobileMenu.insertBefore(cartLink, mobileMenu.querySelector(".nav-cta") || null);
  }

  // Sync badges
  const navBadge = document.getElementById("nav-cart-badge");
  if (navBadge) {
    navBadge.textContent = count;
    navBadge.classList.toggle("visible", count > 0);
  }

  const mobileBadge = document.getElementById("mobile-cart-badge");
  if (mobileBadge) {
    mobileBadge.textContent = count;
  }

  const drawerBadge = document.getElementById("cart-drawer-badge");
  if (drawerBadge) {
    drawerBadge.textContent = count;
  }
}

// ─── Drawer Render & UI Updates ──────────────────────────────

function renderCartDrawer() {
  const container = document.getElementById("cart-items-container");
  const footer = document.getElementById("cart-footer");
  const promoFill = document.getElementById("cart-promo-fill");
  const promoText = document.getElementById("cart-promo-text");
  const subtotalEl = document.getElementById("cart-subtotal-amount");

  if (!container) return;

  const items = typeof getCartItems === "function" ? getCartItems() : [];
  const subtotal = typeof getCartSubtotal === "function" ? getCartSubtotal() : 0;

  if (subtotalEl) {
    subtotalEl.textContent = formatPrice(subtotal);
  }

  if (items.length === 0) {
    container.innerHTML = `
      <div class="cart-empty-state">
        <div class="empty-cart-icon">🛍️</div>
        <h4>Your cart is empty</h4>
        <p>Explore our premium collection of boots, jerseys, and sportswear.</p>
        <a href="catalog.html" class="btn-primary" onclick="closeCartDrawer()" style="padding:12px 28px;margin-top:12px;">
          Explore Products →
        </a>
      </div>
    `;
    if (footer) footer.style.display = "none";
    return;
  }

  if (footer) footer.style.display = "block";

  container.innerHTML = items.map(item => {
    const lineSubtotal = (item.price || 0) * (item.quantity || 1);
    return `
      <div class="cart-item-row" data-key="${item.lineKey}">
        <img src="${item.image}" alt="${item.name}" class="cart-item-img"
             onerror="this.src='assets/images/boots_product.webp'"/>
        <div class="cart-item-info">
          <div class="cart-item-top">
            <a href="product.html?id=${encodeURIComponent(item.id)}" class="cart-item-title" onclick="closeCartDrawer()">${item.name}</a>
            <button class="cart-item-remove" onclick="handleRemoveCartItem('${item.lineKey}')" title="Remove item" aria-label="Remove item">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
            </button>
          </div>
          <div class="cart-item-meta">
            ${item.size ? `<span class="cart-meta-size">Size: <strong>${item.size}</strong></span>` : ""}
            ${item.color && item.color !== "Default" ? `<span class="cart-meta-color">• Color: ${item.color}</span>` : ""}
          </div>
          <div class="cart-item-bottom">
            <div class="qty-stepper">
              <button class="qty-btn" onclick="handleQtyChange('${item.lineKey}', ${item.quantity - 1})" aria-label="Decrease quantity">−</button>
              <span class="qty-value">${item.quantity}</span>
              <button class="qty-btn" onclick="handleQtyChange('${item.lineKey}', ${item.quantity + 1})" aria-label="Increase quantity">+</button>
            </div>
            <div class="cart-item-prices">
              <span class="cart-unit-price">${formatPrice(item.price)} each</span>
              <strong class="cart-line-subtotal">${formatPrice(lineSubtotal)}</strong>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

// ─── Drawer Controls ─────────────────────────────────────────

function openCartDrawer() {
  injectCartUIElements();
  syncHeaderCartButtons();
  renderCartDrawer();

  const backdrop = document.getElementById("qj-cart-backdrop");
  const drawer = document.getElementById("qj-cart-drawer");

  if (backdrop && drawer) {
    backdrop.classList.add("open");
    drawer.classList.add("open");
    document.body.style.overflow = "hidden";
  }
}

function closeCartDrawer() {
  const backdrop = document.getElementById("qj-cart-backdrop");
  const drawer = document.getElementById("qj-cart-drawer");

  if (backdrop && drawer) {
    backdrop.classList.remove("open");
    drawer.classList.remove("open");
    document.body.style.overflow = "";
  }
}

function handleQtyChange(lineKey, newQty) {
  if (typeof updateCartQuantity === "function") {
    updateCartQuantity(lineKey, newQty);
  }
}

function handleRemoveCartItem(lineKey) {
  if (typeof removeCartItem === "function") {
    removeCartItem(lineKey);
    showToast("Item removed from cart.");
  }
}

function handleClearCartPrompt() {
  if (confirm("Are you sure you want to clear all items in your cart?")) {
    if (typeof clearCart === "function") {
      clearCart();
      showToast("Cart cleared.");
    }
  }
}

// ─── Checkout Modal & State Handlers ─────────────────────────

function openCheckoutModal() {
  const items = typeof getCartItems === "function" ? getCartItems() : [];
  if (items.length === 0) {
    showToast("Your cart is empty.");
    return;
  }

  closeCartDrawer();
  const modal = document.getElementById("qj-checkout-modal");
  if (modal) {
    modal.style.display = "flex";
    document.body.style.overflow = "hidden";
    updateCheckoutSummary();
    handlePaymentMethodChange(currentPaymentMethod || "paystack");

    // Clear any previous general error or inline errors
    const errorEl = document.getElementById("checkout-error");
    if (errorEl) {
      errorEl.style.display = "none";
      errorEl.textContent = "";
    }
    clearFieldErrors();
  }
}

let isCheckoutSubmitting = false;
let isVerifyingPayment = false;
let currentPaymentMethod = "paystack";
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

function closeCheckoutModal() {
  const modal = document.getElementById("qj-checkout-modal");
  if (modal) {
    modal.style.display = "none";
    document.body.style.overflow = "";
  }
}

function handleCheckoutModalBackdrop(event) {
  if (event.target.id === "qj-checkout-modal") {
    closeCheckoutModal();
  }
}

function handlePaymentStatusBackdrop(event) {
  if (event.target.id === "qj-payment-status-modal" && !isVerifyingPayment) {
    closePaymentStatusModal();
  }
}

function handleStateChange() {
  updateCheckoutSummary();
}

function updateCheckoutSummary() {
  const countEl = document.getElementById("co-items-count");
  const subtotalEl = document.getElementById("co-items-subtotal");
  const deliveryEl = document.getElementById("co-delivery-fee");
  const grandTotalEl = document.getElementById("co-grand-total");
  const stateSelect = document.getElementById("co-state");

  const items = typeof getCartItems === "function" ? getCartItems() : [];
  const count = typeof getCartTotalCount === "function" ? getCartTotalCount() : 0;
  const subtotal = typeof getCartSubtotal === "function" ? getCartSubtotal() : 0;

  if (countEl) countEl.textContent = count;
  if (subtotalEl) subtotalEl.textContent = formatPriceSafe(subtotal);

  const selectedState = stateSelect ? stateSelect.value : "";
  const delivery = (typeof calculateDelivery === "function")
    ? calculateDelivery(selectedState, subtotal)
    : { fee: 5000, isKnown: true };

  const deliveryFee = count > 0 ? delivery.fee : 0;

  if (deliveryEl) {
    deliveryEl.textContent = formatPriceSafe(deliveryFee);
    deliveryEl.style.color = "var(--text-primary)";
  }

  const grandTotal = count > 0 ? subtotal + deliveryFee : 0;
  if (grandTotalEl) {
    grandTotalEl.textContent = formatPriceSafe(grandTotal);
  }
}

function handlePaymentMethodChange(method) {
  currentPaymentMethod = method === "whatsapp" ? "whatsapp" : "paystack";

  const optPaystack = document.getElementById("option-paystack");
  const optWhatsapp = document.getElementById("option-whatsapp");
  const radioPaystack = document.getElementById("method-paystack");
  const radioWhatsapp = document.getElementById("method-whatsapp");
  const emailField = document.getElementById("field-co-email");
  const emailInput = document.getElementById("co-email");
  const noticePaystack = document.getElementById("checkout-notice-paystack");
  const noticeWhatsapp = document.getElementById("checkout-notice-whatsapp");
  const submitText = document.getElementById("btn-submit-text");
  const submitIcon = document.getElementById("btn-submit-icon");

  if (optPaystack) {
    optPaystack.classList.toggle("active", currentPaymentMethod === "paystack");
    optPaystack.setAttribute("aria-checked", currentPaymentMethod === "paystack" ? "true" : "false");
  }
  if (optWhatsapp) {
    optWhatsapp.classList.toggle("active", currentPaymentMethod === "whatsapp");
    optWhatsapp.setAttribute("aria-checked", currentPaymentMethod === "whatsapp" ? "true" : "false");
  }

  if (radioPaystack) radioPaystack.checked = (currentPaymentMethod === "paystack");
  if (radioWhatsapp) radioWhatsapp.checked = (currentPaymentMethod === "whatsapp");

  // Email collection logic: Only required/displayed when Paystack is selected
  if (emailField && emailInput) {
    if (currentPaymentMethod === "paystack") {
      emailField.style.display = "block";
      emailInput.setAttribute("required", "required");
    } else {
      emailField.style.display = "none";
      emailInput.removeAttribute("required");
      const errEmail = document.getElementById("err-co-email");
      if (errEmail) errEmail.textContent = "";
      emailInput.removeAttribute("aria-invalid");
    }
  }

  // Update informational notices
  if (noticePaystack) noticePaystack.style.display = currentPaymentMethod === "paystack" ? "flex" : "none";
  if (noticeWhatsapp) noticeWhatsapp.style.display = currentPaymentMethod === "whatsapp" ? "flex" : "none";

  // Update submit button text and icon
  if (submitText) {
    submitText.textContent = currentPaymentMethod === "paystack"
      ? "Pay Securely with Paystack"
      : "Submit Order via WhatsApp";
  }

  if (submitIcon) {
    if (currentPaymentMethod === "paystack") {
      submitIcon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>`;
    } else {
      submitIcon.innerHTML = `<path fill="currentColor" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>`;
    }
  }
}

function handlePaymentKeydown(event, method) {
  if (event.key === " " || event.key === "Enter") {
    event.preventDefault();
    handlePaymentMethodChange(method);
  }
}

function setFieldError(fieldId, msg) {
  const errEl = document.getElementById(`err-${fieldId}`);
  if (errEl) errEl.textContent = msg;
  const inputEl = document.getElementById(fieldId);
  if (inputEl) inputEl.setAttribute("aria-invalid", "true");
}

function clearFieldErrors() {
  const errorSpans = document.querySelectorAll(".field-error-msg");
  errorSpans.forEach(s => { s.textContent = ""; });
  const inputs = document.querySelectorAll(".checkout-field input, .checkout-field select");
  inputs.forEach(i => { i.removeAttribute("aria-invalid"); });
}

// ─── Order Submission Handler ────────────────────────────────

async function handleCheckoutSubmit(event) {
  event.preventDefault();

  // Prevent duplicate submissions while in progress
  if (isCheckoutSubmitting) return;

  const errorEl = document.getElementById("checkout-error");
  const submitBtn = document.getElementById("btn-submit-order");
  const submitText = document.getElementById("btn-submit-text");

  // Reset errors
  if (errorEl) {
    errorEl.style.display = "none";
    errorEl.textContent = "";
  }
  clearFieldErrors();

  const name = document.getElementById("co-name")?.value.trim() || "";
  const phone = document.getElementById("co-phone")?.value.trim() || "";
  const state = document.getElementById("co-state")?.value.trim() || "";
  const city = document.getElementById("co-city")?.value.trim() || "";
  const address = document.getElementById("co-address")?.value.trim() || "";
  const notes = document.getElementById("co-notes")?.value.trim() || "";
  const email = document.getElementById("co-email")?.value.trim() || "";

  let hasError = false;

  if (!name || name.length < 2) {
    setFieldError("co-name", "Customer name must be at least 2 characters.");
    hasError = true;
  }
  if (!phone || phone.length < 7) {
    setFieldError("co-phone", "Please enter a valid phone number (at least 7 digits).");
    hasError = true;
  }
  if (!state) {
    setFieldError("co-state", "Please select your delivery state.");
    hasError = true;
  }
  if (!city || city.length < 2) {
    setFieldError("co-city", "Please enter your city / area.");
    hasError = true;
  }
  if (!address || address.length < 5) {
    setFieldError("co-address", "Please enter your full street address.");
    hasError = true;
  }

  // Paystack-specific email validation
  if (currentPaymentMethod === "paystack") {
    if (!email) {
      setFieldError("co-email", "Email address is required for Paystack online payment.");
      hasError = true;
    } else if (!EMAIL_REGEX.test(email) || email.length < 5 || email.length > 255) {
      setFieldError("co-email", "Please enter a valid email address (e.g. name@example.com).");
      hasError = true;
    }
  }

  if (hasError) {
    if (errorEl) {
      errorEl.textContent = "Please correct the highlighted fields above.";
      errorEl.style.display = "block";
    }
    return;
  }

  const items = typeof getCartItems === "function" ? getCartItems() : [];
  if (items.length === 0) {
    if (errorEl) {
      errorEl.textContent = "Your cart is empty.";
      errorEl.style.display = "block";
    }
    return;
  }

  // Prevent duplicate submissions
  isCheckoutSubmitting = true;
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.setAttribute("aria-busy", "true");
  }

  // ── BRANCH 1: WHATSAPP / DIRECT TRANSFER ──
  if (currentPaymentMethod === "whatsapp") {
    if (submitText) submitText.textContent = "Registering Order Record…";

    const subtotal = typeof getCartSubtotal === "function" ? getCartSubtotal() : 0;
    const delivery = (typeof calculateDelivery === "function")
      ? calculateDelivery(state, subtotal)
      : { fee: 5000, isKnown: true };
    const deliveryFee = delivery.fee || 5000;
    const grandTotal = subtotal + deliveryFee;

    const orderRef = (typeof generateOrderReference === "function")
      ? generateOrderReference()
      : `QJ-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const orderPayload = {
      order_ref: orderRef,
      customer_name: name,
      customer_phone: phone,
      delivery_state: state,
      delivery_city: city,
      delivery_address: address,
      delivery_notes: notes,
      items: items.map(item => ({
        id: item.id,
        name: item.name,
        category: item.category || "gear",
        size: item.size || null,
        color: item.color || "Default",
        quantity: item.quantity,
        price: item.price,
        image: item.image,
        line_subtotal: item.price * item.quantity,
      })),
      subtotal,
      delivery_fee: deliveryFee,
      total_amount: grandTotal,
    };

    try {
      let saveResult = null;
      if (typeof createOrder === "function") {
        saveResult = await createOrder(orderPayload);
      }

      const finalOrderRef = saveResult?.orderRef || orderRef;
      orderPayload.order_ref = finalOrderRef;

      const waUrl = (typeof buildMultiItemWhatsAppMessage === "function")
        ? buildMultiItemWhatsAppMessage(orderPayload, items)
        : `https://wa.me/2348116154796?text=${encodeURIComponent("Order " + finalOrderRef)}`;

      window.open(waUrl, "_blank", "noopener,noreferrer");
      closeCheckoutModal();
      showOrderSuccessModal(finalOrderRef, waUrl);

      // Clear cart only after successful order registration
      if (typeof clearCart === "function") {
        clearCart();
      }
    } catch (err) {
      console.error("[QJ Checkout] WhatsApp order submission error:", err);
      if (errorEl) {
        errorEl.textContent = `Error creating order: ${err.message}. Please try again.`;
        errorEl.style.display = "block";
      }
    } finally {
      isCheckoutSubmitting = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.removeAttribute("aria-busy");
      }
      if (submitText) submitText.textContent = "Submit Order via WhatsApp";
    }
    return;
  }

  // ── BRANCH 2: PAY ONLINE WITH PAYSTACK ──
  if (submitText) submitText.textContent = "Connecting to Paystack…";

  const cleanReturnPath = (window.location.pathname || "/").replace(/\.html$/i, "") || "/";
  // Build clean payload strictly complying with Stage 3 backend specification
  const initPayload = {
    customer: {
      name,
      email,
      phone,
      delivery_state: state,
      delivery_city: city,
      delivery_address: address,
      delivery_notes: notes || null
    },
    items: items.map(item => ({
      id: item.id,
      size: item.size || null,
      quantity: parseInt(item.quantity, 10) || 1
    })),
    callback_url: window.location.origin + cleanReturnPath
  };

  try {
    const res = await fetch("/api/paystack/initialize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(initPayload)
    });

    const data = await res.json().catch(() => ({
      success: false,
      error: "Unexpected response from server."
    }));

    if (!res.ok || !data.success) {
      const msg = data.error || "Unable to initialize Paystack checkout. Please try again.";
      if (errorEl) {
        errorEl.textContent = msg;
        errorEl.style.display = "block";
      }
      // CRITICAL: Cart is NOT cleared on initialization failure
      return;
    }

    if (!data.authorization_url) {
      throw new Error("No authorization URL returned by payment gateway.");
    }

    // Save transaction reference & items snapshot in sessionStorage
    saveCheckoutSnapshot(data.reference, data.order_ref, items);

    // CRITICAL: Cart is NOT cleared on redirect! It is preserved until authoritative verification
    window.location.href = data.authorization_url;

  } catch (err) {
    console.error("[QJ Checkout] Paystack initialization error:", err);
    if (errorEl) {
      errorEl.textContent = err.message || "A network error occurred while connecting to payment gateway.";
      errorEl.style.display = "block";
    }
  } finally {
    isCheckoutSubmitting = false;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.removeAttribute("aria-busy");
    }
    if (submitText) submitText.textContent = "Pay Securely with Paystack";
  }
}

// ─── Checkout Snapshot & Item Reconciliation Helpers ─────────

const PENDING_PAYMENT_KEY = "qj_pending_payment";
const RECONCILED_REFS_KEY = "qj_reconciled_refs";

/**
 * Persists snapshot of items submitted for Paystack payment.
 */
function saveCheckoutSnapshot(reference, orderRef, items) {
  try {
    const snapshot = {
      reference,
      orderRef,
      initiatedAt: Date.now(),
      items: (items || []).map(item => ({
        lineKey: item.lineKey || `${item.id}___${item.size ? item.size : "none"}___${item.color || "Default"}`,
        id: item.id,
        size: item.size || null,
        color: item.color || "Default",
        quantity: parseInt(item.quantity, 10) || 1
      }))
    };
    sessionStorage.setItem(`${PENDING_PAYMENT_KEY}_${reference}`, JSON.stringify(snapshot));
    sessionStorage.setItem(PENDING_PAYMENT_KEY, JSON.stringify(snapshot));
  } catch (_) {}
}

/**
 * Retrieves the checkout snapshot for a specific payment reference.
 */
function getCheckoutSnapshot(reference) {
  try {
    if (reference) {
      const specific = sessionStorage.getItem(`${PENDING_PAYMENT_KEY}_${reference}`);
      if (specific) return JSON.parse(specific);
    }
    const active = sessionStorage.getItem(PENDING_PAYMENT_KEY);
    if (active) {
      const parsed = JSON.parse(active);
      if (!reference || parsed.reference === reference) return parsed;
    }
  } catch (_) {}
  return null;
}

/**
 * Checks if a payment reference was already reconciled in this session.
 */
function isReferenceReconciled(reference) {
  try {
    const raw = sessionStorage.getItem(RECONCILED_REFS_KEY);
    if (!raw) return false;
    const list = JSON.parse(raw);
    return Array.isArray(list) && list.includes(reference);
  } catch (_) {
    return false;
  }
}

/**
 * Marks a payment reference as reconciled in this session.
 */
function markReferenceReconciled(reference) {
  try {
    const raw = sessionStorage.getItem(RECONCILED_REFS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (Array.isArray(list) && !list.includes(reference)) {
      list.push(reference);
      sessionStorage.setItem(RECONCILED_REFS_KEY, JSON.stringify(list));
    }
  } catch (_) {}
}

/**
 * Reconciles only the specific items and quantities that were paid for.
 * Preserves any newly added or unrelated items in the cart (e.g. from another tab).
 * Avoids blanket clearCart() and guards against duplicate execution.
 *
 * @param {string} reference - Verified Paystack payment reference
 * @returns {{ reconciled: boolean, reason?: string, remainingCount: number }}
 */
function reconcilePaidCartItems(reference) {
  if (!reference) {
    return { reconciled: false, reason: "No reference provided", remainingCount: 0 };
  }

  // 1. Guard against repeated reconciliation (e.g. browser back button or refresh)
  if (isReferenceReconciled(reference)) {
    const currentCount = typeof getCartTotalCount === "function" ? getCartTotalCount() : 0;
    return { reconciled: false, reason: "Already reconciled", remainingCount: currentCount };
  }

  // 2. Retrieve snapshot of items included in this specific checkout
  const snapshot = getCheckoutSnapshot(reference);
  if (!snapshot || !Array.isArray(snapshot.items) || snapshot.items.length === 0) {
    // Missing or stale snapshot: Do NOT mutate cart blindly!
    // Fails safely so unrelated cart items are never deleted.
    markReferenceReconciled(reference);
    const currentCount = typeof getCartTotalCount === "function" ? getCartTotalCount() : 0;
    return { reconciled: false, reason: "No snapshot available for reference", remainingCount: currentCount };
  }

  // 3. Retrieve live cart items fresh from localStorage
  const currentItems = typeof getCartItems === "function" ? getCartItems() : [];
  if (currentItems.length === 0) {
    markReferenceReconciled(reference);
    return { reconciled: true, remainingCount: 0 };
  }

  // 4. Subtract only the paid quantities
  const paidMap = new Map();
  for (const pItem of snapshot.items) {
    const key = pItem.lineKey || `${pItem.id}___${pItem.size ? pItem.size : "none"}___Default`;
    paidMap.set(key, (paidMap.get(key) || 0) + pItem.quantity);
  }

  const updatedCart = [];

  for (const cItem of currentItems) {
    const directKey = cItem.lineKey;
    const itemSize = cItem.size ? cItem.size : "none";
    const compositeKey = `${cItem.id}___${itemSize}___${cItem.color || "Default"}`;
    const altCompositeKey = `${cItem.id}___${itemSize}___Default`;
    const legacyCompositeKey = `${cItem.id}___${cItem.size || "Standard"}___${cItem.color || "Default"}`;
    const legacyAltKey = `${cItem.id}___${cItem.size || "Standard"}___Default`;

    let paidQty = 0;
    let matchedKey = null;

    if (paidMap.has(directKey)) {
      paidQty = paidMap.get(directKey);
      matchedKey = directKey;
    } else if (paidMap.has(compositeKey)) {
      paidQty = paidMap.get(compositeKey);
      matchedKey = compositeKey;
    } else if (paidMap.has(altCompositeKey)) {
      paidQty = paidMap.get(altCompositeKey);
      matchedKey = altCompositeKey;
    } else if (paidMap.has(legacyCompositeKey)) {
      paidQty = paidMap.get(legacyCompositeKey);
      matchedKey = legacyCompositeKey;
    } else if (paidMap.has(legacyAltKey)) {
      paidQty = paidMap.get(legacyAltKey);
      matchedKey = legacyAltKey;
    }

    if (paidQty > 0) {
      const remainingQty = cItem.quantity - paidQty;
      if (remainingQty > 0) {
        // User added more quantity of this same item in another tab; keep remaining!
        updatedCart.push({ ...cItem, quantity: remainingQty });
        paidMap.set(matchedKey, 0);
      } else {
        // Item fully paid; consume paidQty
        paidMap.set(matchedKey, Math.max(0, paidQty - cItem.quantity));
      }
    } else {
      // Item was not part of the paid checkout (e.g. added in another tab); keep completely!
      updatedCart.push({ ...cItem });
    }
  }

  // 5. Persist updated cart using existing storage function or localStorage directly
  if (typeof saveCartItems === "function") {
    saveCartItems(updatedCart);
  } else if (typeof localStorage !== "undefined" && typeof localStorage.setItem === "function") {
    try {
      localStorage.setItem("qj_cart_v1", JSON.stringify(updatedCart));
    } catch (_) {}
  }

  // 6. Mark reference as reconciled to prevent repeat reconciliation
  markReferenceReconciled(reference);

  // 7. Clean up specific snapshot
  try {
    sessionStorage.removeItem(`${PENDING_PAYMENT_KEY}_${reference}`);
    sessionStorage.removeItem(PENDING_PAYMENT_KEY);
  } catch (_) {}

  const finalCount = updatedCart.reduce((s, i) => s + (parseInt(i.quantity, 10) || 0), 0);
  return { reconciled: true, remainingCount: finalCount };
}

// ─── Paystack Return & Authoritative Verification ────────────

async function checkPaystackReturn() {
  if (typeof window === "undefined" || !window.location) return;

  const urlParams = new URLSearchParams(window.location.search);
  const reference = urlParams.get("reference") || urlParams.get("trxref");

  // If no reference in query params, nothing to verify
  if (!reference) return;

  // Validate reference format strictly: alphanumeric with dashes/underscores, 8 to 100 chars
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(reference)) {
    console.warn("[QJ Checkout] Invalid reference format in URL:", reference);
    cleanReturnUrl();
    return;
  }

  // Prevent duplicate concurrent verification runs
  if (isVerifyingPayment) return;

  await verifyPaymentReference(reference);
}

function cleanReturnUrl() {
  try {
    const cleanUrl = window.location.pathname + (window.location.hash || "");
    window.history.replaceState({}, document.title, cleanUrl);
  } catch (_) {}
}

async function verifyPaymentReference(reference) {
  isVerifyingPayment = true;
  injectCartUIElements();

  // Show status modal in Verifying state
  showPaymentStatusModal(`
    <div class="status-icon-wrap status-icon-loading">
      <div class="qj-spinner"></div>
    </div>
    <h3 style="font-size:1.35rem;font-weight:800;margin-bottom:8px;">Verifying Payment…</h3>
    <p style="font-size:0.88rem;color:var(--text-secondary);margin-bottom:20px;">
      Connecting securely to Paystack to verify reference <strong>${escapeHtml(reference)}</strong>. Please do not close this window…
    </p>
  `);

  try {
    const res = await fetch("/api/paystack/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ reference })
    });

    const data = await res.json().catch(() => ({
      success: false,
      error: "Unexpected response from verification server."
    }));

    // Clean URL query parameters immediately to prevent repeated verification on browser reload
    cleanReturnUrl();

    // AUTHORITATIVE STATE EVALUATION:

    // 1. Success / Paid
    if (data.success && data.status === "paid") {
      // Reconcile ONLY the items that were actually paid for
      reconcilePaidCartItems(reference);

      showPaymentStatusModal(`
        <div class="status-icon-wrap status-icon-success">⚡</div>
        <h3 style="font-size:1.4rem;font-weight:800;margin-bottom:6px;color:var(--text-primary);">
          Payment <span style="color:var(--accent-green);">Confirmed!</span>
        </h3>
        <p style="font-size:0.88rem;color:var(--text-secondary);margin-bottom:18px;">
          Your payment has been verified by Paystack and your order is confirmed.
        </p>

        <div class="status-details-box">
          <div class="status-detail-row">
            <span class="status-detail-label">Order Reference:</span>
            <span class="status-detail-value" style="color:var(--accent-green);">${escapeHtml(data.order_ref || "N/A")}</span>
          </div>
          <div class="status-detail-row">
            <span class="status-detail-label">Payment Ref:</span>
            <span class="status-detail-value" style="font-size:0.8rem;">${escapeHtml(data.reference)}</span>
          </div>
          <div class="status-detail-row">
            <span class="status-detail-label">Amount Paid:</span>
            <span class="status-detail-value">${data.amount ? formatPriceSafe(data.amount) : "Verified"}</span>
          </div>
          <div class="status-detail-row">
            <span class="status-detail-label">Payment Status:</span>
            <span class="status-detail-value" style="color:var(--accent-green);">PAID & CONFIRMED</span>
          </div>
        </div>

        <p style="font-size:0.78rem;color:var(--text-muted);margin-bottom:18px;">
          📧 An official receipt has been sent to your email. Our fulfillment desk will reach out before courier dispatch.
        </p>

        <div class="status-actions">
          <button class="btn-primary" style="width:100%;justify-content:center;" onclick="closePaymentStatusModal()">
            Done & Continue Shopping
          </button>
          <button class="btn-secondary" style="width:100%;justify-content:center;" onclick="copyReferenceText('${escapeHtml(data.order_ref)}')">
            📋 Copy Order Reference
          </button>
        </div>
      `);
      return;
    }

    // 2. Terminal state (refunded / disputed)
    if (data.success && ["refunded", "disputed"].includes(data.status)) {
      showPaymentStatusModal(`
        <div class="status-icon-wrap status-icon-warning">⚠️</div>
        <h3 style="font-size:1.35rem;font-weight:800;margin-bottom:6px;">Order ${escapeHtml(data.status.toUpperCase())}</h3>
        <p style="font-size:0.88rem;color:var(--text-secondary);margin-bottom:18px;">
          ${escapeHtml(data.message || `This order is currently flagged as ${data.status}. Status regression is blocked.`)}
        </p>
        <div class="status-details-box">
          <div class="status-detail-row">
            <span class="status-detail-label">Order Reference:</span>
            <span class="status-detail-value">${escapeHtml(data.order_ref || "N/A")}</span>
          </div>
          <div class="status-detail-row">
            <span class="status-detail-label">Status:</span>
            <span class="status-detail-value">${escapeHtml(data.status)}</span>
          </div>
        </div>
        <div class="status-actions">
          <button class="btn-secondary" style="width:100%;justify-content:center;" onclick="closePaymentStatusModal()">
            Close
          </button>
        </div>
      `);
      return;
    }

    // 3. Failed or Abandoned Gateway Transaction
    if (data.status === "failed" || data.status === "abandoned") {
      const errorMsg = data.error || (data.status === "abandoned" ? "Transaction was abandoned on the Paystack checkout screen." : "Payment was declined by payment gateway.");

      showPaymentStatusModal(`
        <div class="status-icon-wrap status-icon-failed">✕</div>
        <h3 style="font-size:1.35rem;font-weight:800;margin-bottom:6px;color:#f87171;">Payment Not Completed</h3>
        <p style="font-size:0.88rem;color:var(--text-secondary);margin-bottom:18px;">
          ${escapeHtml(errorMsg)}
        </p>
        <div class="status-details-box">
          <div class="status-detail-row">
            <span class="status-detail-label">Reference:</span>
            <span class="status-detail-value" style="font-size:0.8rem;">${escapeHtml(data.reference || reference)}</span>
          </div>
          <div class="status-detail-row">
            <span class="status-detail-label">Status:</span>
            <span class="status-detail-value" style="color:#f87171;">${escapeHtml(data.status || "Failed")}</span>
          </div>
          <div class="status-detail-row">
            <span class="status-detail-label">Your Cart:</span>
            <span class="status-detail-value" style="color:var(--accent-green);">Items Saved & Intact</span>
          </div>
        </div>
        <p style="font-size:0.78rem;color:var(--text-muted);margin-bottom:18px;">
          No worries! Your cart items have been preserved. You can retry online payment or switch to WhatsApp checkout.
        </p>
        <div class="status-actions">
          <button class="btn-primary" style="width:100%;justify-content:center;" onclick="handleRetryCheckout()">
            🔄 Try Payment Again
          </button>
          <button class="btn-secondary" style="width:100%;justify-content:center;" onclick="handleSwitchToWhatsAppCheckout()">
            💬 Continue via WhatsApp Instead
          </button>
        </div>
      `);
      return;
    }

    // 4. Pending / Initiated reconciliation
    if (data.status === "initiated" || data.status === "pending" || (!data.success && !data.error)) {
      showPaymentStatusModal(`
        <div class="status-icon-wrap status-icon-warning">⏳</div>
        <h3 style="font-size:1.35rem;font-weight:800;margin-bottom:6px;">Payment Pending</h3>
        <p style="font-size:0.88rem;color:var(--text-secondary);margin-bottom:18px;">
          Your payment transaction has been initiated but is awaiting reconciliation from your bank.
        </p>
        <div class="status-details-box">
          <div class="status-detail-row">
            <span class="status-detail-label">Reference:</span>
            <span class="status-detail-value" style="font-size:0.8rem;">${escapeHtml(reference)}</span>
          </div>
          <div class="status-detail-row">
            <span class="status-detail-label">Status:</span>
            <span class="status-detail-value">Awaiting Bank Settlement</span>
          </div>
        </div>
        <p style="font-size:0.78rem;color:var(--text-muted);margin-bottom:18px;">
          If money was deducted from your account, your order will be confirmed automatically via webhook notification.
        </p>
        <div class="status-actions">
          <button class="btn-primary" style="width:100%;justify-content:center;" onclick="verifyPaymentReference('${escapeHtml(reference)}')">
            🔄 Check Status Again
          </button>
          <button class="btn-secondary" style="width:100%;justify-content:center;" onclick="closePaymentStatusModal()">
            Close
          </button>
        </div>
      `);
      return;
    }

    // 5. Unrecognized Error (e.g. 400 Bad Request, 404 Attempt Not Found)
    showPaymentStatusModal(`
      <div class="status-icon-wrap status-icon-failed">✕</div>
      <h3 style="font-size:1.35rem;font-weight:800;margin-bottom:6px;color:#f87171;">Verification Failed</h3>
      <p style="font-size:0.88rem;color:var(--text-secondary);margin-bottom:18px;">
        ${escapeHtml(data.error || "Unable to locate a matching payment record.")}
      </p>
      <div class="status-actions">
        <button class="btn-primary" style="width:100%;justify-content:center;" onclick="handleRetryCheckout()">
          Return to Cart
        </button>
        <button class="btn-secondary" style="width:100%;justify-content:center;" onclick="closePaymentStatusModal()">
          Close
        </button>
      </div>
    `);

  } catch (netErr) {
    console.error("[QJ Checkout] Network error during payment verification:", netErr);
    showPaymentStatusModal(`
      <div class="status-icon-wrap status-icon-warning">⚠️</div>
      <h3 style="font-size:1.35rem;font-weight:800;margin-bottom:6px;">Network Connection Issue</h3>
      <p style="font-size:0.88rem;color:var(--text-secondary);margin-bottom:18px;">
        Unable to communicate with the verification server. Please check your internet connection. Your order and payment record are safe.
      </p>
      <div class="status-actions">
        <button class="btn-primary" style="width:100%;justify-content:center;" onclick="verifyPaymentReference('${escapeHtml(reference)}')">
          🔄 Retry Verification
        </button>
        <button class="btn-secondary" style="width:100%;justify-content:center;" onclick="closePaymentStatusModal()">
          Close
        </button>
      </div>
    `);
  } finally {
    isVerifyingPayment = false;
  }
}

function showPaymentStatusModal(contentHtml) {
  const modal = document.getElementById("qj-payment-status-modal");
  const contentEl = document.getElementById("status-modal-content");
  if (contentEl) contentEl.innerHTML = contentHtml;
  if (modal) {
    modal.style.display = "flex";
    document.body.style.overflow = "hidden";
  }
}

function closePaymentStatusModal() {
  const modal = document.getElementById("qj-payment-status-modal");
  if (modal) {
    modal.style.display = "none";
    document.body.style.overflow = "";
  }
}

function handleRetryCheckout() {
  closePaymentStatusModal();
  openCheckoutModal();
}

function handleSwitchToWhatsAppCheckout() {
  closePaymentStatusModal();
  openCheckoutModal();
  handlePaymentMethodChange("whatsapp");
}

function copyReferenceText(refText) {
  if (!refText) return;
  navigator.clipboard.writeText(refText).then(() => {
    showToast(`Order reference "${refText}" copied!`);
  }).catch(() => {
    showToast(`Order reference: ${refText}`);
  });
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatPriceSafe(price) {
  if (typeof formatPrice === "function") return formatPrice(price);
  const n = parseInt(price, 10) || 0;
  return "₦" + n.toLocaleString();
}

// ─── Success Modal & Copy Reference ──────────────────────────

function showOrderSuccessModal(orderRef, waUrl) {
  const modal = document.getElementById("qj-success-modal");
  const refEl = document.getElementById("success-order-ref");
  const linkEl = document.getElementById("success-whatsapp-link");

  if (refEl) refEl.textContent = orderRef;
  if (linkEl) linkEl.href = waUrl;

  if (modal) {
    modal.style.display = "flex";
    document.body.style.overflow = "hidden";
  }
}

function handleFinishOrder() {
  const modal = document.getElementById("qj-success-modal");
  if (modal) modal.style.display = "none";
  document.body.style.overflow = "";
}

function copyOrderReference() {
  const refEl = document.getElementById("success-order-ref");
  if (!refEl) return;
  const text = refEl.textContent.trim();
  copyReferenceText(text);
}

// ─── Toast Notifications ─────────────────────────────────────

function showToast(message, duration = 3000) {
  injectCartUIElements();
  const toast = document.getElementById("qj-toast");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("visible");

  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.remove("visible");
  }, duration);
}

// ─── Global Event Listeners ──────────────────────────────────

if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("qj:cart-updated", () => {
    syncHeaderCartButtons();
    renderCartDrawer();
  });
}

if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
  document.addEventListener("DOMContentLoaded", () => {
    injectCartUIElements();
    syncHeaderCartButtons();
    checkPaystackReturn();
  });
}

// ─── Node.js CommonJS Exports (for automated testing) ───────
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    injectCartUIElements,
    openCartDrawer,
    closeCartDrawer,
    openCheckoutModal,
    closeCheckoutModal,
    handlePaymentMethodChange,
    handlePaymentKeydown,
    handleCheckoutSubmit,
    checkPaystackReturn,
    verifyPaymentReference,
    cleanReturnUrl,
    showPaymentStatusModal,
    closePaymentStatusModal,
    handleRetryCheckout,
    handleSwitchToWhatsAppCheckout,
    setFieldError,
    clearFieldErrors,
    formatPriceSafe,
    escapeHtml,
    NIGERIA_STATES,
    EMAIL_REGEX,
    saveCheckoutSnapshot,
    getCheckoutSnapshot,
    isReferenceReconciled,
    markReferenceReconciled,
    reconcilePaidCartItems
  };
}
