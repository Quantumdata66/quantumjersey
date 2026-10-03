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

      <!-- Free Delivery Progress Bar -->
      <div id="cart-promo-banner" class="cart-promo-banner">
        <div class="cart-promo-text" id="cart-promo-text">
          Free delivery in Lagos & Kaduna on orders over ₦50,000!
        </div>
        <div class="cart-promo-track">
          <div id="cart-promo-fill" class="cart-promo-fill" style="width: 0%"></div>
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
            <div class="modal-header-icon">💬</div>
            <div>
              <h3 style="font-size:1.25rem;font-weight:800;color:var(--text-primary);">WhatsApp <span class="text-accent">Checkout</span></h3>
              <p style="font-size:0.8rem;color:var(--text-secondary);margin:0;">Confirm your delivery details to generate order record</p>
            </div>
          </div>
          <button class="modal-close-btn" onclick="closeCheckoutModal()" aria-label="Close modal">✕</button>
        </div>

        <form id="checkout-form" class="checkout-form" onsubmit="handleCheckoutSubmit(event)">
          <div class="checkout-form-grid">
            <!-- Customer Name -->
            <div class="checkout-field">
              <label for="co-name">Full Name <span class="required">*</span></label>
              <input type="text" id="co-name" placeholder="e.g. Tunde Balogun" required autocomplete="name"/>
            </div>

            <!-- WhatsApp Phone -->
            <div class="checkout-field">
              <label for="co-phone">WhatsApp Phone Number <span class="required">*</span></label>
              <input type="tel" id="co-phone" placeholder="e.g. 08116154796" required autocomplete="tel"/>
            </div>

            <!-- Delivery State -->
            <div class="checkout-field">
              <label for="co-state">Delivery State <span class="required">*</span></label>
              <select id="co-state" required onchange="handleStateChange()">
                <option value="">Select State…</option>
                ${NIGERIA_STATES.map(s => `<option value="${s}">${s}</option>`).join("")}
              </select>
            </div>

            <!-- Delivery City/Town -->
            <div class="checkout-field">
              <label for="co-city">City / Area / Town <span class="required">*</span></label>
              <input type="text" id="co-city" placeholder="e.g. Ikeja / Lekki / Kaduna North" required/>
            </div>
          </div>

          <!-- Street Address -->
          <div class="checkout-field" style="margin-top:14px;">
            <label for="co-address">Full Street Address <span class="required">*</span></label>
            <input type="text" id="co-address" placeholder="House number, street name, landmarks" required autocomplete="street-address"/>
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
              <span>Estimated Delivery</span>
              <span id="co-delivery-fee" style="color:var(--accent-green);">Select state</span>
            </div>
            <div class="summary-divider"></div>
            <div class="summary-line total-line">
              <span>Estimated Total</span>
              <span id="co-grand-total" class="summary-total-price">₦0</span>
            </div>
          </div>

          <div class="checkout-notice">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;color:var(--accent-green);">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
            </svg>
            <span>An official order record will be created (status: <strong>Awaiting Confirmation</strong>). WhatsApp will open to connect you directly with our sales desk.</span>
          </div>

          <div id="checkout-error" class="checkout-error" style="display:none;"></div>

          <!-- Submit CTA -->
          <button type="submit" id="btn-submit-order" class="btn-primary btn-submit-order">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            <span>Submit Order via WhatsApp</span>
          </button>
        </form>
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

  // Free delivery promo logic
  const FREE_THRESHOLD = 50000;
  if (subtotal >= FREE_THRESHOLD) {
    if (promoFill) promoFill.style.width = "100%";
    if (promoText) promoText.innerHTML = `🎉 <strong>Free Delivery unlocked</strong> for Lagos & Kaduna!`;
  } else {
    const remaining = FREE_THRESHOLD - subtotal;
    const pct = Math.min(100, Math.round((subtotal / FREE_THRESHOLD) * 100));
    if (promoFill) promoFill.style.width = `${pct}%`;
    if (promoText) promoText.innerHTML = `Add <strong>${formatPrice(remaining)}</strong> more for Free Delivery (Lagos & Kaduna)`;
  }

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
            <span class="cart-meta-size">Size: <strong>${item.size || "Standard"}</strong></span>
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
  }
}

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
  if (subtotalEl) subtotalEl.textContent = formatPrice(subtotal);

  const selectedState = stateSelect ? stateSelect.value : "";
  const delivery = calculateDelivery(selectedState, subtotal);

  if (deliveryEl) {
    if (!selectedState) {
      deliveryEl.textContent = "Select state";
      deliveryEl.style.color = "var(--text-muted)";
    } else if (delivery.fee === 0) {
      deliveryEl.textContent = "FREE (Promo: Lagos/Kaduna > ₦50k)";
      deliveryEl.style.color = "var(--accent-green)";
    } else {
      deliveryEl.textContent = formatPrice(delivery.fee);
      deliveryEl.style.color = "var(--text-primary)";
    }
  }

  const grandTotal = subtotal + (delivery.isKnown ? delivery.fee : 0);
  if (grandTotalEl) {
    grandTotalEl.textContent = formatPrice(grandTotal);
  }
}

// ─── Order Submission Handler ────────────────────────────────

async function handleCheckoutSubmit(event) {
  event.preventDefault();

  const name = document.getElementById("co-name")?.value.trim();
  const phone = document.getElementById("co-phone")?.value.trim();
  const state = document.getElementById("co-state")?.value.trim();
  const city = document.getElementById("co-city")?.value.trim();
  const address = document.getElementById("co-address")?.value.trim();
  const notes = document.getElementById("co-notes")?.value.trim() || "";
  const errorEl = document.getElementById("checkout-error");
  const submitBtn = document.getElementById("btn-submit-order");

  if (!name || !phone || !state || !city || !address) {
    if (errorEl) {
      errorEl.textContent = "Please fill in all required fields.";
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

  if (errorEl) errorEl.style.display = "none";
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span>Registering Order Record…</span>`;
  }

  const subtotal = typeof getCartSubtotal === "function" ? getCartSubtotal() : 0;
  const delivery = calculateDelivery(state, subtotal);
  const deliveryFee = delivery.isKnown ? delivery.fee : 0;
  const grandTotal = subtotal + deliveryFee;

  // Prepare order record payload
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
      size: item.size || "Standard",
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
    // 1. Save durable order record to Supabase
    let saveResult = null;
    if (typeof createOrder === "function") {
      saveResult = await createOrder(orderPayload);
    }

    const finalOrderRef = saveResult?.orderRef || orderRef;
    orderPayload.order_ref = finalOrderRef;

    // 2. Generate multi-item WhatsApp link
    const waUrl = (typeof buildMultiItemWhatsAppMessage === "function")
      ? buildMultiItemWhatsAppMessage(orderPayload, items)
      : `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("Order " + finalOrderRef)}`;

    // 3. Open WhatsApp in new tab
    const waWindow = window.open(waUrl, "_blank", "noopener,noreferrer");

    // 4. Show success modal with order reference
    closeCheckoutModal();
    showOrderSuccessModal(finalOrderRef, waUrl);

    // 5. Clear cart only after successful order registration
    if (typeof clearCart === "function") {
      clearCart();
    }

  } catch (err) {
    console.error("[QJ Checkout] Order submission error:", err);
    if (errorEl) {
      errorEl.textContent = `Error creating order: ${err.message}. Please try again.`;
      errorEl.style.display = "block";
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
        <span>Submit Order via WhatsApp</span>
      `;
    }
  }
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
  navigator.clipboard.writeText(text).then(() => {
    showToast(`Order reference "${text}" copied to clipboard!`);
  }).catch(() => {
    showToast(`Order reference: ${text}`);
  });
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

window.addEventListener("qj:cart-updated", () => {
  syncHeaderCartButtons();
  renderCartDrawer();
});

document.addEventListener("DOMContentLoaded", () => {
  injectCartUIElements();
  syncHeaderCartButtons();
});
