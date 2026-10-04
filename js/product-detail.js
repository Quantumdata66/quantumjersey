// ============================================================
// Quantum Jersey — Product Detail Page Controller & Reviews
// ============================================================

let _currentProduct = null;
let _selectedSize = null;
let _selectedQty = 1;

/**
 * Initializes the Product Detail Page on DOM ready.
 */
async function initProductDetailPage() {
  const urlParams = new URLSearchParams(window.location.search);
  const productId = urlParams.get("id") || urlParams.get("slug");

  // Ensure products are registered
  if (typeof fetchProducts === "function") {
    try {
      await fetchProducts();
    } catch (_) {}
  }

  let product = null;
  if (productId && typeof getProductById === "function") {
    product = getProductById(productId);
  }

  // Fallback to first default product if ID is missing or not found
  if (!product) {
    product = (typeof DEFAULT_PRODUCTS !== "undefined" && DEFAULT_PRODUCTS.length > 0)
      ? DEFAULT_PRODUCTS[0]
      : null;
  }

  if (!product) {
    const container = document.getElementById("product-detail-container");
    if (container) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;">
          <h2>Product Not Found</h2>
          <p>The product you are looking for might have moved or is out of stock.</p>
          <a href="catalog.html" class="btn-primary" style="margin-top:16px;">Browse All Products</a>
        </div>
      `;
    }
    return;
  }

  _currentProduct = product;
  _selectedSize = (product.sizes && product.sizes.length > 0) ? product.sizes[0] : "Standard";
  _selectedQty = 1;

  // Update Page Title and Meta Tags
  document.title = `${product.name} | Quantum Jersey`;
  const pageTitleEl = document.getElementById("page-title");
  if (pageTitleEl) pageTitleEl.textContent = `${product.name} | Quantum Jersey`;

  // Update Breadcrumbs
  updateBreadcrumbs(product);

  // Render Showcase
  renderProductDetailView(product);

  // Load Reviews for this product
  loadProductReviews(product.id);

  // Load Related Products
  loadRelatedProducts(product);
}

/**
 * Update breadcrumb links.
 */
function updateBreadcrumbs(product) {
  const catEl = document.getElementById("bc-category");
  const titleEl = document.getElementById("bc-title");

  if (catEl) {
    const catLabel = getCategoryLabel(product.category);
    catEl.textContent = catLabel;
    const catPage = product.category === "boots" ? "boots.html" : (product.category === "jerseys" ? "jerseys.html" : "sportswear.html");
    catEl.href = catPage;
  }

  if (titleEl) {
    titleEl.textContent = product.name;
  }
}

/**
 * Renders the main 2-column Product Detail UI.
 */
function renderProductDetailView(product) {
  const container = document.getElementById("product-detail-container");
  if (!container) return;

  let badgeHTML = "";
  if (product.badge) {
    let badgeClass = "card-badge";
    if (product.badge === "New Arrival") badgeClass += " badge-new";
    else if (product.badge === "Premium") badgeClass += " badge-premium";
    badgeHTML = `<span class="${badgeClass}">${product.badge}</span>`;
  }

  const sizes = Array.isArray(product.sizes) ? product.sizes : ["Standard"];
  const sizesHTML = sizes.map((s, i) => `
    <button type="button" class="detail-size-chip ${i === 0 ? "active" : ""}" data-size="${s}" onclick="selectDetailSize('${s}')">
      ${s}
    </button>
  `).join("");

  const waLink = typeof buildWhatsAppLink === "function" ? buildWhatsAppLink(product, _selectedSize) : "#";

  container.innerHTML = `
    <!-- Left Column: Image Showcase -->
    <div class="detail-gallery-wrap">
      <div class="detail-img-card">
        ${badgeHTML}
        <img src="${product.image}" alt="${product.name}" class="detail-main-img" id="detail-main-img"
             onerror="this.src='assets/images/boots_product.webp'"/>
        <div class="detail-img-glow"></div>
      </div>
      <div class="detail-guarantee-pill">
        <span>🛡️ 100% Guaranteed Authentic</span>
        <span>⚡ Verified Courier Packaging</span>
      </div>
    </div>

    <!-- Right Column: Product Information & Purchase Controls -->
    <div class="detail-info-wrap">
      <div class="detail-header-meta">
        <a href="${product.category}.html" class="detail-category-tag">${getCategoryLabel(product.category)}</a>
        <span class="detail-stock-badge">🟢 In Stock — Ready to Dispatch</span>
      </div>

      <h1 class="detail-product-title">${product.name}</h1>

      <div class="detail-rating-row" onclick="scrollToReviews()" style="cursor:pointer;" title="Read verified customer reviews">
        <div class="detail-stars">★★★★★</div>
        <span class="detail-rating-text">5.0</span>
        <span class="detail-review-link">(Verified Customer Feedback)</span>
      </div>

      <div class="detail-price-box">
        <span class="detail-price-num">${formatPrice(product.price)}</span>
        <span class="detail-price-note">Tax included · Local dispatch rates apply</span>
      </div>

      <p class="detail-description">${product.description}</p>

      <!-- Size Selector -->
      <div class="detail-option-group">
        <div class="detail-option-label-row">
          <label class="detail-option-label">Select Size:</label>
          <span class="selected-size-indicator">Selected: <strong id="current-size-display">${_selectedSize}</strong></span>
        </div>
        <div class="detail-sizes-grid" id="detail-sizes-grid">
          ${sizesHTML}
        </div>
      </div>

      <!-- Quantity Control & Action Buttons -->
      <div class="detail-purchase-panel">
        <div class="detail-qty-wrap">
          <label class="detail-option-label">Quantity:</label>
          <div class="qty-stepper detail-stepper">
            <button type="button" class="qty-btn" onclick="changeDetailQty(-1)" aria-label="Decrease quantity">−</button>
            <span class="qty-value" id="detail-qty-val">1</span>
            <button type="button" class="qty-btn" onclick="changeDetailQty(1)" aria-label="Increase quantity">+</button>
          </div>
        </div>

        <div class="detail-actions-grid">
          <!-- Add to Cart CTA -->
          <button type="button" id="btn-add-to-cart" class="btn-primary btn-detail-cart" onclick="handleDetailAddToCart()">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/>
            </svg>
            <span>Add to Cart</span>
          </button>

          <!-- Direct WhatsApp Single Item Order -->
          <a href="${waLink}" target="_blank" rel="noopener noreferrer" id="detail-wa-btn" class="btn-secondary btn-detail-wa" onclick="handleDetailWaClick(event)">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            <span>Buy Single Item on WhatsApp</span>
          </a>
        </div>
      </div>

      <!-- Specification Cards / Badges -->
      <div class="detail-specs-grid">
        <div class="spec-card">
          <span class="spec-label">Category</span>
          <strong class="spec-val">${getCategoryLabel(product.category)}</strong>
        </div>
        <div class="spec-card">
          <span class="spec-label">Delivery</span>
          <strong class="spec-val">Nationwide (1-3 Days)</strong>
        </div>
        <div class="spec-card">
          <span class="spec-label">Delivery Fee</span>
          <strong class="spec-val" style="color:var(--accent-green);">₦5,000 Nationwide</strong>
        </div>
        <div class="spec-card">
          <span class="spec-label">Support</span>
          <strong class="spec-val">WhatsApp Sales Desk</strong>
        </div>
      </div>

    </div>
  `;
}

// ─── Interaction Handlers ────────────────────────────────────

function selectDetailSize(size) {
  _selectedSize = size;
  const display = document.getElementById("current-size-display");
  if (display) display.textContent = size;

  const chips = document.querySelectorAll(".detail-size-chip");
  chips.forEach(chip => {
    chip.classList.toggle("active", chip.dataset.size === size);
  });

  // Update direct WhatsApp link
  const waBtn = document.getElementById("detail-wa-btn");
  if (waBtn && _currentProduct && typeof buildWhatsAppLink === "function") {
    waBtn.href = buildWhatsAppLink(_currentProduct, size);
  }
}

function changeDetailQty(delta) {
  _selectedQty = Math.max(1, Math.min(99, _selectedQty + delta));
  const valEl = document.getElementById("detail-qty-val");
  if (valEl) valEl.textContent = _selectedQty;
}

function handleDetailAddToCart() {
  if (!_currentProduct) return;

  if (typeof addToCart === "function") {
    const result = addToCart(_currentProduct, _selectedSize, _selectedQty, {
      name: _currentProduct.name,
      price: _currentProduct.price,
      image: _currentProduct.image,
      category: _currentProduct.category,
    });

    if (result.success) {
      if (typeof showToast === "function") {
        showToast(`Added ${_selectedQty} × ${_currentProduct.name} (Size: ${_selectedSize}) to cart! 🛍️`);
      }
      if (typeof openCartDrawer === "function") {
        openCartDrawer();
      }
    }
  }
}

function handleDetailWaClick(event) {
  if (_currentProduct && typeof buildWhatsAppLink === "function") {
    event.currentTarget.href = buildWhatsAppLink(_currentProduct, _selectedSize);
  }
}

function scrollToReviews() {
  const section = document.getElementById("reviews-section");
  if (section) {
    section.scrollIntoView({ behavior: "smooth" });
  }
}

// ─── Customer Reviews Section (Task 5) ────────────────────────

async function loadProductReviews(productId) {
  const listContainer = document.getElementById("reviews-list-container");
  const avgNumEl = document.getElementById("avg-rating-num");
  const starsEl = document.getElementById("avg-rating-stars");
  const countEl = document.getElementById("total-reviews-count");

  if (!listContainer) return;

  try {
    const result = (typeof fetchProductReviews === "function")
      ? await fetchProductReviews(productId)
      : { reviews: [], averageRating: 5.0, totalCount: 0 };

    if (avgNumEl) avgNumEl.textContent = result.averageRating.toFixed(1);
    if (starsEl) starsEl.textContent = "★".repeat(Math.round(result.averageRating)) + "☆".repeat(5 - Math.round(result.averageRating));
    if (countEl) countEl.textContent = `Based on ${result.totalCount} verified order${result.totalCount !== 1 ? "s" : ""}`;

    if (result.reviews.length === 0) {
      listContainer.innerHTML = `
        <div class="review-empty-state">
          <p>No verified customer reviews yet for this product.</p>
          <span>Have you received this item? Click "Write a Review" to share your thoughts!</span>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = result.reviews.map(r => `
      <div class="review-card">
        <div class="review-card-top">
          <div class="review-author-info">
            <span class="review-author-name">${r.customer_name}</span>
            ${r.is_verified_purchase ? '<span class="verified-badge">✓ Verified Purchase</span>' : ''}
          </div>
          <div class="review-stars">★ ${r.rating}.0</div>
        </div>
        <p class="review-text">"${r.review_text}"</p>
        <span class="review-date">${new Date(r.created_at).toLocaleDateString("en-NG", { month: "short", day: "numeric", year: "numeric" })}</span>
      </div>
    `).join("");

  } catch (err) {
    listContainer.innerHTML = `<p style="color:var(--text-muted);font-size:0.85rem;">Could not load reviews at this time.</p>`;
  }
}

// ─── Review Modal Controls ───────────────────────────────────

function openReviewModal() {
  const modal = document.getElementById("qj-review-modal");
  if (modal) {
    modal.style.display = "flex";
    document.body.style.overflow = "hidden";
  }
}

function closeReviewModal() {
  const modal = document.getElementById("qj-review-modal");
  if (modal) {
    modal.style.display = "none";
    document.body.style.overflow = "";
  }
}

function handleReviewModalBackdrop(event) {
  if (event.target.id === "qj-review-modal") {
    closeReviewModal();
  }
}

// Star rating selector
document.addEventListener("DOMContentLoaded", () => {
  const starPicker = document.getElementById("star-picker");
  if (starPicker) {
    starPicker.addEventListener("click", e => {
      const btn = e.target.closest(".star-pick-btn");
      if (!btn) return;
      document.querySelectorAll(".star-pick-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const hiddenRating = document.getElementById("rev-rating");
      if (hiddenRating) hiddenRating.value = btn.dataset.val;
    });
  }
});

async function handleReviewSubmit(event) {
  event.preventDefault();

  if (!_currentProduct) return;

  const orderRef = document.getElementById("rev-order-ref")?.value.trim() || null;
  const name = document.getElementById("rev-name")?.value.trim();
  const rating = document.getElementById("rev-rating")?.value || 5;
  const comment = document.getElementById("rev-comment")?.value.trim();
  const msgEl = document.getElementById("review-msg");
  const submitBtn = document.getElementById("btn-submit-review");

  if (!name || !comment) {
    if (msgEl) {
      msgEl.textContent = "Please fill in your name and review.";
      msgEl.className = "review-feedback error";
      msgEl.style.display = "block";
    }
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting Review…";
  }

  try {
    if (typeof submitReview === "function") {
      const res = await submitReview({
        productId: _currentProduct.id,
        orderRef,
        customerName: name,
        rating: parseInt(rating, 10),
        reviewText: comment,
      });

      if (msgEl) {
        msgEl.textContent = res.message || "Thank you! Your review has been submitted for moderation.";
        msgEl.className = "review-feedback success";
        msgEl.style.display = "block";
      }

      setTimeout(() => {
        closeReviewModal();
        document.getElementById("review-form")?.reset();
        if (msgEl) msgEl.style.display = "none";
      }, 2500);
    }
  } catch (err) {
    if (msgEl) {
      msgEl.textContent = err.message || "Failed to submit review.";
      msgEl.className = "review-feedback error";
      msgEl.style.display = "block";
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Review for Moderation";
    }
  }
}

// ─── Related Products ────────────────────────────────────────

async function loadRelatedProducts(currentProduct) {
  const relatedGrid = document.getElementById("related-grid");
  if (!relatedGrid) return;

  let products = [];
  if (typeof fetchProducts === "function") {
    try {
      products = await fetchProducts({ category: currentProduct.category });
    } catch (_) {
      products = DEFAULT_PRODUCTS.filter(p => p.category === currentProduct.category);
    }
  } else {
    products = DEFAULT_PRODUCTS.filter(p => p.category === currentProduct.category);
  }

  // Exclude current product
  const filtered = products.filter(p => p.id !== currentProduct.id).slice(0, 4);
  if (filtered.length === 0) {
    const fallbacks = DEFAULT_PRODUCTS.filter(p => p.id !== currentProduct.id).slice(0, 4);
    renderProducts(fallbacks, "related-grid", false);
  } else {
    renderProducts(filtered, "related-grid", false);
  }
}

// ─── DOM Ready ───────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  initProductDetailPage();
});
