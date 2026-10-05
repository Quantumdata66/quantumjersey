// ============================================================
// Quantum Jersey — Card Renderer, Filter Logic & Async Fetch
// ============================================================

/**
 * Gracefully handles product image load errors.
 */
function handleProductImageError(img, category) {
  const fallback = `assets/images/${category}_product.webp`;
  if (!img.dataset.fallbackTried) {
    img.dataset.fallbackTried = "true";
    img.src = fallback;
  } else if (!img.dataset.placeholderTried) {
    img.dataset.placeholderTried = "true";
    img.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300' viewBox='0 0 100 100' style='background:%23111'><text y='50%' x='50%' font-size='40' text-anchor='middle' dy='.3em' fill='%23333'>⚽</text></svg>";
  }
}

/**
 * Show a skeleton loading grid while products are being fetched.
 */
function showSkeletonGrid(containerId, count = 4) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = Array(count).fill(`
    <div class="product-card skeleton-card" aria-hidden="true">
      <div class="skeleton skeleton-img"></div>
      <div class="card-body">
        <div class="skeleton skeleton-line short"></div>
        <div class="skeleton skeleton-line"></div>
        <div class="skeleton skeleton-line"></div>
        <div class="skeleton skeleton-line short"></div>
      </div>
    </div>`).join("");
}

/**
 * Creates the HTML for a single product card.
 */
function createProductCard(product) {
  let badgeHTML = "";
  if (product.badge) {
    let badgeClass = "card-badge";
    if (product.badge === "New Arrival") badgeClass += " badge-new";
    else if (product.badge === "Premium") badgeClass += " badge-premium";
    badgeHTML = `<span class="${badgeClass}">${product.badge}</span>`;
  }
  if (product.badge === "Bestseller") {
    badgeHTML += `<span class="card-badge badge-urgent" style="left:auto;right:14px;">🔥 LOW STOCK</span>`;
  }

  const sizesHTML = product.sizes
    .map((s, i) => `<label class="size-chip">
          <input type="radio" name="size-${product.id}" value="${s}" ${i === 0 ? "checked" : ""}/>
          <span>${s}</span>
        </label>`)
    .join("");

  const defaultSize = product.sizes[0];
  const waLink = typeof buildWhatsAppLink === "function" ? buildWhatsAppLink(product, defaultSize) : "#";
  const detailUrl = `product.html?id=${encodeURIComponent(product.id)}`;

  return `
    <article class="product-card" data-id="${product.id}" data-category="${product.category}">
      <div class="card-img-wrap">
        ${badgeHTML}
        <a href="${detailUrl}" class="card-img-link" aria-label="View ${product.name}">
          <img src="${product.image}" alt="${product.name}" loading="lazy" class="card-img"
               onerror="handleProductImageError(this, '${product.category}')"/>
          <div class="card-img-overlay">
            <span class="card-view-hint">View Details →</span>
          </div>
        </a>
      </div>
      <div class="card-body">
        <p class="card-category">${getCategoryLabel(product.category)}</p>
        <h3 class="card-title">
          <a href="${detailUrl}" class="card-title-link">${product.name}</a>
        </h3>
        <p class="card-desc">${product.description}</p>
        <div class="card-sizes">
          <p class="sizes-label">Select Size:</p>
          <div class="sizes-grid">${sizesHTML}</div>
        </div>
        <div class="card-footer">
          <p class="card-price">${formatPrice(product.price)}</p>
          <div class="card-btn-group">
            <button type="button" class="btn-card-cart" onclick="handleCardAddToCart(event, '${product.id}')" title="Add to Cart" aria-label="Add ${product.name} to cart">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/>
              </svg>
              <span>+ Cart</span>
            </button>
            <a href="${waLink}" class="btn-whatsapp" id="order-${product.id}"
               target="_blank" rel="noopener noreferrer"
               onclick="updateWhatsAppLink(event, '${product.id}')" title="Order via WhatsApp">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              <span>Order</span>
            </a>
          </div>
        </div>
      </div>
    </article>`;
}

/**
 * Handles adding a product to cart directly from the product card.
 */
function handleCardAddToCart(event, productId) {
  event.stopPropagation();
  event.preventDefault();

  const selected = document.querySelector(`input[name="size-${productId}"]:checked`);
  const size = selected ? selected.value : null;
  const product = (typeof getProductById === "function") ? getProductById(productId) : null;

  if (product && typeof addToCart === "function") {
    const res = addToCart(product, size, 1, {
      name: product.name,
      price: product.price,
      image: product.image,
      category: product.category,
    });

    if (res.success) {
      if (typeof showToast === "function") {
        showToast(`Added ${product.name} (${size || "Standard"}) to cart! 🛍️`);
      }
      if (typeof openCartDrawer === "function") {
        openCartDrawer();
      }
    }
  }
}

/**
 * Updates the WhatsApp link with the currently selected size.
 * Uses permanent getProductById lookup to eliminate cache desync bugs.
 */
function updateWhatsAppLink(event, productId) {
  const selected = document.querySelector(`input[name="size-${productId}"]:checked`);
  const size = selected ? selected.value : null;
  const product = (typeof getProductById === "function") ? getProductById(productId) : null;
  if (product && event.currentTarget) {
    event.currentTarget.href = buildWhatsAppLink(product, size);
  }
}

// Update links on size radio change using permanent product registry
document.addEventListener("change", function(e) {
  if (e.target && e.target.type === "radio" && e.target.name.startsWith("size-")) {
    const productId = e.target.name.replace("size-", "");
    const product = (typeof getProductById === "function") ? getProductById(productId) : null;
    const btn = document.getElementById(`order-${productId}`);
    if (product && btn) {
      btn.href = buildWhatsAppLink(product, e.target.value);
    }
  }
});

function getCategoryLabel(cat) {
  return { boots: "Football Boots", jerseys: "Jersey", sportswear: "Sportswear" }[cat] || cat;
}

/**
 * Renders product cards into a container element.
 * Supports appending new cards for "Load More" pagination.
 */
function renderProducts(products, containerId, append = false) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Always register fetched products into the permanent registry
  if (typeof registerProducts === "function") {
    registerProducts(products);
  }

  if (!append && products.length === 0) {
    container.innerHTML = `<div class="empty-state"><p>No products found.</p></div>`;
    return;
  }

  const cardsHTML = products.map(createProductCard).join("");

  if (append) {
    container.insertAdjacentHTML("beforeend", cardsHTML);
  } else {
    container.innerHTML = cardsHTML;
  }

  const newCards = container.querySelectorAll(".product-card:not(.card-animate-in)");
  newCards.forEach((card, i) => {
    card.style.animationDelay = `${i * 0.05}s`;
    card.classList.add("card-animate-in");
  });
}

// ─── Async Page Initialisation & "Load More" Pagination ──────

/**
 * Asynchronously load and render products for category/catalogue pages with Load More pagination.
 * @param {string} containerId - Grid container ID
 * @param {string} defaultCategory - Default category filter ('all' or slug)
 */
async function initPageProducts(containerId, defaultCategory = "all") {
  showSkeletonGrid(containerId, 8);

  const tabs = document.querySelectorAll(".filter-tab");
  const searchInput = document.getElementById("catalog-search");

  let currentCategory = defaultCategory;
  let currentSearch = "";
  let currentPage = 0;
  let totalMatchingCount = 0;
  let loadedProductsCount = 0;

  // Ensure pagination container exists right after the grid
  let paginationWrapper = document.getElementById(`pagination-${containerId}`);
  if (!paginationWrapper) {
    const gridEl = document.getElementById(containerId);
    if (gridEl) {
      paginationWrapper = document.createElement("div");
      paginationWrapper.id = `pagination-${containerId}`;
      paginationWrapper.className = "pagination-wrap";
      gridEl.parentNode.insertBefore(paginationWrapper, gridEl.nextSibling);
    }
  }

  function updatePaginationUI(hasMore) {
    if (!paginationWrapper) return;
    if (totalMatchingCount === 0) {
      paginationWrapper.innerHTML = "";
      return;
    }

    paginationWrapper.innerHTML = `
      <div class="pagination-status" style="text-align:center;margin-top:36px;display:flex;flex-direction:column;align-items:center;gap:14px;">
        <p style="color:var(--text-secondary);font-size:0.9rem;font-weight:500;">
          Showing <span style="color:var(--accent-green);font-weight:700;">${loadedProductsCount}</span> of <span style="color:var(--text-primary);font-weight:700;">${totalMatchingCount}</span> products
        </p>
        ${hasMore ? `
          <button id="btn-load-more-${containerId}" class="btn-secondary" style="padding:12px 32px;font-size:0.92rem;border-radius:var(--radius-md);cursor:pointer;display:inline-flex;align-items:center;gap:8px;">
            <span>Load More Products</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>
            </svg>
          </button>
        ` : ""}
      </div>
    `;

    if (hasMore) {
      const loadMoreBtn = document.getElementById(`btn-load-more-${containerId}`);
      if (loadMoreBtn) {
        loadMoreBtn.addEventListener("click", loadNextPage);
      }
    }
  }

  async function loadInitialPage() {
    currentPage = 0;
    loadedProductsCount = 0;
    showSkeletonGrid(containerId, 8);
    if (paginationWrapper) paginationWrapper.innerHTML = "";

    const options = { page: 0 };
    if (currentCategory !== "all") options.category = currentCategory;
    if (currentSearch.trim()) options.search = currentSearch.trim();

    const result = (typeof fetchProductsPaginated === "function")
      ? await fetchProductsPaginated(options)
      : { products: await fetchProducts(options), totalCount: 0, hasMore: false };

    renderProducts(result.products, containerId, false);
    totalMatchingCount = result.totalCount;
    loadedProductsCount = result.products.length;

    updatePaginationUI(result.hasMore);
  }

  async function loadNextPage() {
    const loadMoreBtn = document.getElementById(`btn-load-more-${containerId}`);
    if (loadMoreBtn) {
      loadMoreBtn.disabled = true;
      loadMoreBtn.innerHTML = `<span>Loading…</span>`;
    }

    currentPage += 1;
    const options = { page: currentPage };
    if (currentCategory !== "all") options.category = currentCategory;
    if (currentSearch.trim()) options.search = currentSearch.trim();

    const result = (typeof fetchProductsPaginated === "function")
      ? await fetchProductsPaginated(options)
      : { products: await fetchProducts(options), totalCount: totalMatchingCount, hasMore: false };

    renderProducts(result.products, containerId, true);
    loadedProductsCount += result.products.length;

    updatePaginationUI(result.hasMore);
  }

  function applyFilter(cat) {
    tabs.forEach(t => t.classList.remove("active"));
    const activeTab = document.querySelector(`.filter-tab[data-cat="${cat}"]`);
    if (activeTab) activeTab.classList.add("active");
    currentCategory = cat;
    loadInitialPage();
  }

  tabs.forEach(tab => tab.addEventListener("click", () => applyFilter(tab.dataset.cat)));

  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener("input", e => {
      clearTimeout(debounceTimer);
      currentSearch = e.target.value;
      debounceTimer = setTimeout(loadInitialPage, 300);
    });
  }

  applyFilter(defaultCategory);
}

/**
 * Asynchronously load and render featured products on the homepage.
 */
async function renderFeatured(containerId, count = 4) {
  showSkeletonGrid(containerId, count);
  const products = await fetchProducts({ featuredOnly: true });
  const fallback = products.length === 0 ? DEFAULT_PRODUCTS.slice(0, count) : products.slice(0, count);
  renderProducts(fallback, containerId, false);
}

// ─── Shared UI: Hamburger, Navbar, Scroll Reveal ─────────────

document.addEventListener("DOMContentLoaded", () => {
  // Hamburger menu
  const hamburger = document.getElementById("hamburger");
  const mobileMenu = document.getElementById("mobile-menu");
  if (hamburger && mobileMenu) {
    hamburger.addEventListener("click", () => {
      hamburger.classList.toggle("open");
      mobileMenu.classList.toggle("open");
      document.body.style.overflow = mobileMenu.classList.contains("open") ? "hidden" : "";
    });
  }

  // Scroll reveal
  const animates = document.querySelectorAll(".scroll-animate");
  if (animates.length > 0 && "IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: "0px 0px -50px 0px" });
    animates.forEach(el => observer.observe(el));
  } else {
    animates.forEach(el => el.classList.add("visible"));
  }
});
