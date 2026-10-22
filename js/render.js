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

  const hasSizes = Array.isArray(product.sizes) && product.sizes.length > 0;
  const sizesHTML = hasSizes
    ? product.sizes
        .map((s, i) => `<label class="size-chip">
          <input type="radio" name="size-${product.id}" value="${s}" ${i === 0 ? "checked" : ""}/>
          <span>${s}</span>
        </label>`)
        .join("")
    : "";

  const defaultSize = hasSizes ? product.sizes[0] : null;
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
        ${product.versions ? `
        <div class="card-sizes">
          <p class="sizes-label" style="color:var(--accent-green);font-weight:600;font-size:0.78rem;">✨ Fan & Player Editions Available</p>
        </div>` : (hasSizes ? `
        <div class="card-sizes">
          <p class="sizes-label">Select Size:</p>
          <div class="sizes-grid">${sizesHTML}</div>
        </div>` : "")}
        <div class="card-footer">
          <p class="card-price">${product.versions ? `From ${formatPrice(product.versions.fan.price)}` : formatPrice(product.price)}</p>
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

  const product = (typeof getProductById === "function") ? getProductById(productId) : null;
  if (product && product.versions) {
    // Versioned products require explicit edition and size selection on detail page
    window.location.href = `product.html?id=${encodeURIComponent(productId)}`;
    return;
  }

  const hasSizes = product && Array.isArray(product.sizes) && product.sizes.length > 0;
  const selected = hasSizes ? document.querySelector(`input[name="size-${productId}"]:checked`) : null;
  const size = selected ? selected.value : (hasSizes ? product.sizes[0] : null);

  if (product && typeof addToCart === "function") {
    const res = addToCart(product, size, 1, {
      name: product.name,
      price: product.price,
      image: product.image,
      category: product.category,
    });

    if (res.success) {
      if (typeof showToast === "function") {
        showToast(size ? `Added ${product.name} (${size}) to cart! 🛍️` : `Added ${product.name} to cart! 🛍️`);
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
if (typeof document !== "undefined") {
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
}

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

// ─── Async Page Initialisation & Full Catalog Pagination ──────

/**
 * Asynchronously load and render products for category/catalogue pages with paginated navigation.
 * @param {string} containerId - Grid container ID
 * @param {string} defaultCategory - Default category filter ('all' or slug)
 * @param {Object} [initOptions] - Optional configurations (e.g. initialPageSize)
 */
async function initPageProducts(containerId, defaultCategory = "all", initOptions = {}) {
  const tabs = document.querySelectorAll(".filter-tab");
  const searchInput = document.getElementById("catalog-search");

  let currentCategory = defaultCategory;
  let currentSearch = "";
  let currentPage = 0; // 0-indexed internally
  let pageSize = (initOptions && initOptions.pageSize) || 12; // default 12, optional 24
  let totalMatchingCount = 0;
  let totalPages = 1;
  let currentRequestId = 0;

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

  function updatePaginationUI() {
    if (!paginationWrapper) return;
    if (totalMatchingCount === 0) {
      paginationWrapper.innerHTML = "";
      return;
    }

    const fromItem = (currentPage * pageSize) + 1;
    const toItem = Math.min((currentPage + 1) * pageSize, totalMatchingCount);

    // Build page numbers (with windowing if totalPages > 7)
    let pageNumbers = [];
    if (totalPages <= 7) {
      for (let i = 0; i < totalPages; i++) pageNumbers.push(i);
    } else {
      pageNumbers.push(0);
      let start = Math.max(1, currentPage - 1);
      let end = Math.min(totalPages - 2, currentPage + 1);

      if (currentPage <= 2) {
        start = 1;
        end = 3;
      } else if (currentPage >= totalPages - 3) {
        start = totalPages - 4;
        end = totalPages - 2;
      }

      if (start > 1) pageNumbers.push("ellipsis-start");
      for (let i = start; i <= end; i++) pageNumbers.push(i);
      if (end < totalPages - 2) pageNumbers.push("ellipsis-end");
      pageNumbers.push(totalPages - 1);
    }

    const pagesHTML = pageNumbers.map(item => {
      if (typeof item === "string") {
        return `<span class="pagination-ellipsis" aria-hidden="true">…</span>`;
      }
      const isActive = item === currentPage;
      return `<button type="button" class="pagination-btn pagination-page-btn ${isActive ? "active" : ""}"
                data-page="${item}" aria-label="Page ${item + 1}" ${isActive ? 'aria-current="page"' : ''}>
                ${item + 1}
              </button>`;
    }).join("");

    paginationWrapper.innerHTML = `
      <nav class="pagination-bar" aria-label="Catalog pagination navigation">
        <div class="pagination-info">
          <span>Showing <strong>${fromItem}–${toItem}</strong> of <strong>${totalMatchingCount}</strong> products</span>
          <label class="page-size-label">
            <span>Per page:</span>
            <select id="select-page-size-${containerId}" class="page-size-select" aria-label="Products per page">
              <option value="12" ${pageSize === 12 ? "selected" : ""}>12</option>
              <option value="24" ${pageSize === 24 ? "selected" : ""}>24</option>
            </select>
          </label>
        </div>
        <div class="pagination-controls">
          <button type="button" id="btn-prev-${containerId}" class="pagination-btn pagination-nav-btn"
                  aria-label="Previous page" ${currentPage === 0 ? "disabled aria-disabled=\"true\"" : ""}>
            ‹ Prev
          </button>
          <div class="pagination-pages-group">
            ${pagesHTML}
          </div>
          <button type="button" id="btn-next-${containerId}" class="pagination-btn pagination-nav-btn"
                  aria-label="Next page" ${currentPage >= totalPages - 1 ? "disabled aria-disabled=\"true\"" : ""}>
            Next ›
          </button>
        </div>
      </nav>
    `;

    // Attach listeners
    const prevBtn = document.getElementById(`btn-prev-${containerId}`);
    if (prevBtn && currentPage > 0) {
      prevBtn.addEventListener("click", () => goToPage(currentPage - 1));
    }

    const nextBtn = document.getElementById(`btn-next-${containerId}`);
    if (nextBtn && currentPage < totalPages - 1) {
      nextBtn.addEventListener("click", () => goToPage(currentPage + 1));
    }

    const pageBtns = paginationWrapper.querySelectorAll(".pagination-page-btn");
    pageBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        const targetPage = parseInt(btn.dataset.page, 10);
        if (!isNaN(targetPage) && targetPage !== currentPage) {
          goToPage(targetPage);
        }
      });
    });

    const sizeSelect = document.getElementById(`select-page-size-${containerId}`);
    if (sizeSelect) {
      sizeSelect.addEventListener("change", (e) => {
        const newSize = parseInt(e.target.value, 10);
        if (newSize > 0 && newSize !== pageSize) {
          pageSize = newSize;
          currentPage = 0; // Reset to page 1
          loadPage(false);
        }
      });
    }
  }

  async function loadPage(shouldScroll = true) {
    const requestId = ++currentRequestId;
    showSkeletonGrid(containerId, Math.min(pageSize, 8));

    const options = {
      page: currentPage,
      pageSize: pageSize,
    };
    if (currentCategory !== "all") options.category = currentCategory;
    if (currentSearch.trim()) options.search = currentSearch.trim();

    try {
      const result = (typeof fetchProductsPaginated === "function")
        ? await fetchProductsPaginated(options)
        : { products: await fetchProducts(options), totalCount: 0, hasMore: false };

      if (requestId !== currentRequestId) return; // Stale request discard

      totalMatchingCount = typeof result.totalCount === "number" ? result.totalCount : result.products.length;
      totalPages = Math.max(1, Math.ceil(totalMatchingCount / pageSize));

      // Boundary check if total pages shrank
      if (currentPage >= totalPages && totalPages > 0) {
        currentPage = totalPages - 1;
        return loadPage(shouldScroll);
      }

      // Render only products for the current page (clean DOM replacement)
      renderProducts(result.products, containerId, false);

      updatePaginationUI();

      if (shouldScroll && typeof window !== "undefined") {
        const gridEl = document.getElementById(containerId);
        if (gridEl && window.scrollY > gridEl.offsetTop - 60) {
          window.scrollTo({ top: gridEl.offsetTop - 60, behavior: "smooth" });
        }
      }
    } catch (err) {
      if (requestId !== currentRequestId) return;
      console.error("[QJ] Failed to load paginated products:", err);

      let fallback = (typeof DEFAULT_PRODUCTS !== "undefined" && Array.isArray(DEFAULT_PRODUCTS))
        ? [...DEFAULT_PRODUCTS]
        : [];
      if (currentCategory !== "all") fallback = fallback.filter(p => p.category === currentCategory);
      if (currentSearch.trim()) {
        const q = currentSearch.trim().toLowerCase();
        fallback = fallback.filter(p => (p.name || "").toLowerCase().includes(q) || (p.description || "").toLowerCase().includes(q));
      }

      totalMatchingCount = fallback.length;
      totalPages = Math.max(1, Math.ceil(totalMatchingCount / pageSize));

      if (totalMatchingCount > 0) {
        const from = currentPage * pageSize;
        const pageItems = fallback.slice(from, from + pageSize);
        renderProducts(pageItems, containerId, false);
        updatePaginationUI();
      } else {
        const container = document.getElementById(containerId);
        if (container) {
          container.innerHTML = `
            <div class="empty-state" style="padding: 40px 20px; text-align: center;">
              <p style="font-size: 1.1rem; color: var(--text-primary); margin-bottom: 8px;">🔍 No products found</p>
              <p style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 16px;">Try adjusting your filters or search terms.</p>
              <button class="btn-secondary" id="btn-reset-filters-${containerId}" style="padding: 8px 18px; font-size: 0.85rem;">↻ Reset Filters</button>
            </div>`;
          const resetBtn = document.getElementById(`btn-reset-filters-${containerId}`);
          if (resetBtn) {
            resetBtn.addEventListener("click", () => {
              if (searchInput) searchInput.value = "";
              currentSearch = "";
              applyFilter(defaultCategory);
            });
          }
        }
        if (paginationWrapper) paginationWrapper.innerHTML = "";
      }
    }
  }

  function goToPage(targetPage) {
    if (targetPage >= 0 && targetPage < totalPages && targetPage !== currentPage) {
      currentPage = targetPage;
      loadPage(true);
    }
  }

  function applyFilter(cat) {
    tabs.forEach(t => t.classList.remove("active"));
    const activeTab = document.querySelector(`.filter-tab[data-cat="${cat}"]`);
    if (activeTab) activeTab.classList.add("active");
    currentCategory = cat;
    currentPage = 0; // Reset to page 1 on filter change
    loadPage(false);
  }

  tabs.forEach(tab => tab.addEventListener("click", () => applyFilter(tab.dataset.cat)));

  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener("input", e => {
      clearTimeout(debounceTimer);
      currentSearch = e.target.value;
      debounceTimer = setTimeout(() => {
        currentPage = 0; // Reset to page 1 on search change
        loadPage(false);
      }, 300);
    });
  }

  // Initial load
  applyFilter(defaultCategory);

  return {
    getCurrentPage: () => currentPage,
    getPageSize: () => pageSize,
    getTotalCount: () => totalMatchingCount,
    getTotalPages: () => totalPages,
    goToPage,
    setPageSize: (size) => { pageSize = size; currentPage = 0; return loadPage(false); },
    setCategory: (cat) => applyFilter(cat),
    setSearch: (query) => { currentSearch = query; currentPage = 0; return loadPage(false); }
  };
}

/**
 * Asynchronously calculates and renders the dynamic product count for the homepage hero stat.
 * Queries Supabase total product count (in-stock distinct listings) or falls back to DEFAULT_PRODUCTS catalog.
 */
async function updateHeroProductCount() {
  const countEl = document.getElementById("hero-product-count");
  if (!countEl) return;

  // Immediate default from loaded catalog
  const fallbackCount = (typeof DEFAULT_PRODUCTS !== "undefined" && Array.isArray(DEFAULT_PRODUCTS))
    ? DEFAULT_PRODUCTS.length
    : 0;

  if (fallbackCount > 0 && !countEl.textContent.trim()) {
    countEl.textContent = `${fallbackCount}+`;
  }

  try {
    if (typeof fetchProductsPaginated === "function") {
      const result = await fetchProductsPaginated({ pageSize: 1 });
      if (result && typeof result.totalCount === "number" && result.totalCount > 0) {
        countEl.textContent = `${result.totalCount}+`;
        return;
      }
    }
  } catch (err) {
    console.warn("[QJ] Dynamic product count fetch error:", err.message);
  }

  if (fallbackCount > 0) {
    countEl.textContent = `${fallbackCount}+`;
  }
}

/**
 * Asynchronously load and render featured products on the homepage.
 */
async function renderFeatured(containerId, count = 4) {
  showSkeletonGrid(containerId, count);
  updateHeroProductCount();
  try {
    const products = await fetchProducts({ featuredOnly: true });
    const fallback = (!products || products.length === 0)
      ? (typeof DEFAULT_PRODUCTS !== "undefined" ? DEFAULT_PRODUCTS.slice(0, count) : [])
      : products.slice(0, count);
    renderProducts(fallback, containerId, false);
  } catch (err) {
    console.error("[QJ] Failed to load featured products:", err);
    if (typeof DEFAULT_PRODUCTS !== "undefined" && Array.isArray(DEFAULT_PRODUCTS)) {
      renderProducts(DEFAULT_PRODUCTS.slice(0, count), containerId, false);
    }
  }
}

// ─── Shared UI: Hamburger, Navbar, Scroll Reveal ─────────────

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
  updateHeroProductCount();

  // Hamburger menu
  const hamburger = document.getElementById("hamburger");
  const mobileMenu = document.getElementById("mobile-menu");
  const navbar = document.getElementById("navbar") || document.querySelector(".navbar");

  if (hamburger && mobileMenu) {
    function updateMenuPosition() {
      if (navbar) {
        const navRect = navbar.getBoundingClientRect();
        mobileMenu.style.top = `${Math.round(navRect.bottom)}px`;
        mobileMenu.style.height = `calc(100dvh - ${Math.round(navRect.bottom)}px)`;
      }
    }

    function closeMobileMenu() {
      hamburger.classList.remove("open", "active");
      mobileMenu.classList.remove("open");
      document.body.style.overflow = "";
      mobileMenu.style.top = "";
      mobileMenu.style.height = "";
    }

    hamburger.addEventListener("click", (e) => {
      e.stopPropagation();
      const willOpen = !mobileMenu.classList.contains("open");
      if (willOpen) {
        updateMenuPosition();
        mobileMenu.classList.add("open");
        hamburger.classList.add("open", "active");
        document.body.style.overflow = "hidden";
      } else {
        closeMobileMenu();
      }
    });

    window.addEventListener("resize", () => {
      if (mobileMenu.classList.contains("open")) {
        updateMenuPosition();
      }
    });

    mobileMenu.querySelectorAll(".nav-link").forEach((link) => {
      link.addEventListener("click", () => {
        closeMobileMenu();
      });
    });

    document.addEventListener("click", (e) => {
      if (mobileMenu.classList.contains("open") && !mobileMenu.contains(e.target) && !hamburger.contains(e.target)) {
        closeMobileMenu();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && mobileMenu.classList.contains("open")) {
        closeMobileMenu();
      }
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
    }, { threshold: 0, rootMargin: "50px 0px 50px 0px" });

    animates.forEach(el => {
      // Immediately reveal elements that are already within or above the viewport
      const rect = el.getBoundingClientRect();
      if (rect.top <= (window.innerHeight || document.documentElement.clientHeight) + 50) {
        el.classList.add("visible");
      } else {
        observer.observe(el);
      }
    });
  } else {
    animates.forEach(el => el.classList.add("visible"));
  }
  });
}

// ─── CommonJS Exports for Testing ───────────────────────────
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    handleProductImageError,
    showSkeletonGrid,
    createProductCard,
    handleCardAddToCart,
    updateWhatsAppLink,
    getCategoryLabel,
    renderProducts,
    initPageProducts,
    updateHeroProductCount,
    renderFeatured
  };
}
