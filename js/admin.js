// ============================================================
// Quantum Jersey — Admin Panel Logic
// Supabase Auth + Storage + Gemini AI + Dashboard
// ============================================================

let _adminSession = null;
let _uploadedFile = null;
let _adminProductsCache = [];
let _currentEditingProduct = null;
let _editReplacementFile = null;

// ─── Helpers ─────────────────────────────────────────────────
function getCategoryLabel(cat) {
  return { boots: "Football Boots", jerseys: "Jersey", sportswear: "Sportswear" }[cat] || cat;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


// ─── Auth ────────────────────────────────────────────────────

async function handleAdminLogin(e) {
  e.preventDefault();
  const email    = document.getElementById("admin-email").value.trim();
  const password = document.getElementById("admin-password").value;
  const btn      = document.getElementById("login-btn");
  const errEl    = document.getElementById("login-error");

  btn.textContent = "Signing in…";
  btn.disabled    = true;
  errEl.style.display = "none";

  const { data, error } = await signInAdmin(email, password);

  if (error) {
    errEl.textContent    = `❌ ${error.message}`;
    errEl.style.display  = "block";
    btn.textContent      = "Sign In";
    btn.disabled         = false;
    document.getElementById("admin-password").value = "";
    return;
  }

  const userRole = data.session?.user?.app_metadata?.role;
  if (userRole !== "admin") {
    errEl.textContent    = "❌ Access Denied: This account does not have administrator authorization.";
    errEl.style.display  = "block";
    btn.textContent      = "Sign In";
    btn.disabled         = false;
    document.getElementById("admin-password").value = "";
    await signOutAdmin();
    return;
  }

  _adminSession = data.session;
  enterAdminPanel();
}

async function handleLogout() {
  if (typeof signOutAdmin === "function") {
    await signOutAdmin();
  }
  _adminSession = null;
  const adminPanel = document.getElementById("admin-panel");
  if (adminPanel) adminPanel.style.display = "none";
  const loginGate = document.getElementById("login-gate");
  if (loginGate) loginGate.style.display  = "flex";
}

function enterAdminPanel() {
  document.getElementById("login-gate").style.display  = "none";
  document.getElementById("admin-panel").style.display = "block";

  const email = _adminSession?.user?.email || "Admin";
  const name  = email.split("@")[0];

  document.getElementById("admin-user-email").textContent = email;
  document.getElementById("dash-user-name").textContent   = name;
  updateDashClock();
  setInterval(updateDashClock, 60000);

  // Land on dashboard and load it
  switchTab("dashboard");
}

function updateDashClock() {
  const el = document.getElementById("dash-time");
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleString("en-NG", {
    weekday: "long", year: "numeric", month: "long",
    day: "numeric", hour: "2-digit", minute: "2-digit"
  });
}

// ─── Dashboard ────────────────────────────────────────────────

async function loadDashboard() {
  document.getElementById("dash-loading").style.display = "flex";
  document.getElementById("dash-content").style.display = "none";

  try {
    const stats = await fetchDashboardStats(_adminSession);

    // ── Stat cards
    animateCount("stat-total", stats.total);
    animateCount("stat-featured", stats.featured);
    animateCount("stat-files", stats.storageFiles);
    animateCount("stat-orders", stats.ordersCount || 0);
    animateCount("stat-awaiting-orders", stats.awaitingOrdersCount || 0);
    document.getElementById("stat-storage").textContent = formatBytes(stats.storageBytes);

    // Update sidebar badge for pending orders
    const badge = document.getElementById("nav-orders-count-badge");
    if (badge) {
      if (stats.awaitingOrdersCount > 0) {
        badge.textContent = stats.awaitingOrdersCount;
        badge.style.display = "inline-flex";
      } else {
        badge.style.display = "none";
      }
    }

    // ── Category bars
    const maxCat = Math.max(
      stats.byCategory.boots,
      stats.byCategory.jerseys,
      stats.byCategory.sportswear,
      1 // avoid div by 0
    );
    setCategoryBar("boots", stats.byCategory.boots, maxCat);
    setCategoryBar("jerseys", stats.byCategory.jerseys, maxCat);
    setCategoryBar("sportswear", stats.byCategory.sportswear, maxCat);

    // ── Storage bar (out of 1 GB free tier)
    const ONE_GB = 1024 * 1024 * 1024;
    const pct = Math.min((stats.storageBytes / ONE_GB) * 100, 100).toFixed(1);
    requestAnimationFrame(() => {
      document.getElementById("storage-bar").style.width = pct + "%";
    });
    document.getElementById("storage-used-label").textContent = formatBytes(stats.storageBytes) + " used";
    document.getElementById("storage-files-label").textContent = `${stats.storageFiles} file${stats.storageFiles !== 1 ? "s" : ""}`;

    // ── Recent orders on dashboard
    renderRecentOrdersGrid(stats.recentOrders || []);

    // ── Recent uploads grid
    renderRecentGrid(stats.recentUploads);

    // Show content
    document.getElementById("dash-loading").style.display = "none";
    document.getElementById("dash-content").style.display = "block";

  } catch (err) {
    document.getElementById("dash-loading").innerHTML =
      `<p style="color:#f87171">❌ Dashboard error: ${err.message}</p>`;
  }
}

function animateCount(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  const start = 0;
  const dur = 700;
  const begin = performance.now();
  function tick(now) {
    const p = Math.min((now - begin) / dur, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(start + (target - start) * ease);
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function setCategoryBar(cat, count, max) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  requestAnimationFrame(() => {
    const bar = document.getElementById("bar-" + cat);
    if (bar) bar.style.width = pct + "%";
  });
  const countEl = document.getElementById("count-" + cat);
  if (countEl) countEl.textContent = count;
}

function renderRecentGrid(products) {
  const grid = document.getElementById("dash-recent-grid");
  if (!grid) return;
  if (!products || products.length === 0) {
    grid.innerHTML = `<p class="admin-empty" style="grid-column:1/-1;">No products yet — add your first one!</p>`;
    return;
  }
  grid.innerHTML = products.map(p => `
    <div class="recent-card">
      <img class="recent-card-img" src="${p.image}" alt="${p.name}"
           onerror="this.src='assets/images/boots_product.webp'"/>
      <div class="recent-card-body">
        <div class="recent-card-name">
          ${p.name}${p.featured ? '<span class="recent-featured-dot" title="Featured"></span>' : ""}
        </div>
        <div class="recent-card-meta">
          <span class="recent-card-cat">${getCategoryLabel(p.category)}</span>
          <span class="recent-card-price">${formatPrice(p.price)}</span>
        </div>
      </div>
    </div>
  `).join("");
}

function renderRecentOrdersGrid(orders) {
  const container = document.getElementById("dash-recent-orders");
  if (!container) return;
  if (!orders || orders.length === 0) {
    container.innerHTML = `<div class="admin-empty" style="background:var(--bg-surface-1);border:1px solid var(--border);border-radius:var(--radius-md);padding:24px;">No customer orders recorded yet.</div>`;
    return;
  }

  container.innerHTML = `
    <div style="background:var(--bg-surface-1);border:1px solid var(--border);border-radius:var(--radius-md);overflow:hidden;">
      ${orders.map(o => `
        <div class="admin-order-row" onclick="openAdminOrderDetail('${o.id || o.order_ref}')" style="cursor:pointer;">
          <div class="admin-order-main">
            <div style="display:flex;align-items:center;gap:8px;">
              <strong style="color:var(--text-primary);font-size:0.92rem;">${o.order_ref}</strong>
              <span class="status-badge status-${o.status}">${getStatusLabel(o.status)}</span>
            </div>
            <p style="font-size:0.8rem;color:var(--text-secondary);margin:3px 0 0;">
              👤 ${o.customer_name} (${o.customer_phone}) · 📍 ${o.delivery_city}, ${o.delivery_state}
            </p>
          </div>
          <div class="admin-order-meta">
            <strong style="color:var(--accent-green);font-size:0.95rem;">${formatPrice(o.total_amount || o.subtotal)}</strong>
            <span style="font-size:0.75rem;color:var(--text-muted);">${formatOrderDate(o.created_at)}</span>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

// ─── Order Management (Task 4) ───────────────────────────────

let _currentOrdersStatus = "all";
let _currentOrdersSearch = "";
let _currentOrdersPage = 0;
let _adminOrdersCache = [];

function getStatusLabel(status) {
  const labels = {
    awaiting_confirmation: "⏳ Awaiting Confirmation",
    confirmed: "🔵 Confirmed",
    processing: "🟣 Processing",
    dispatched: "🚚 Dispatched",
    delivered: "🟢 Delivered",
    cancelled: "🔴 Cancelled",
  };
  return labels[status] || status;
}

function formatOrderDate(dateString) {
  if (!dateString) return "Recently";
  try {
    const d = new Date(dateString);
    return d.toLocaleString("en-NG", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch (_) {
    return dateString;
  }
}

async function loadAdminOrders() {
  const list = document.getElementById("admin-orders-list");
  const pagination = document.getElementById("admin-orders-pagination");
  if (!list) return;

  list.innerHTML = `<p class="admin-empty">Loading orders…</p>`;

  try {
    if (!_adminSession && typeof getAdminSession === "function") {
      _adminSession = await getAdminSession();
    }

    const searchInput = document.getElementById("orders-search");
    if (searchInput) {
      const adminEmail = _adminSession?.user?.email || "";
      if (adminEmail && searchInput.value.trim().toLowerCase() === adminEmail.toLowerCase()) {
        searchInput.value = "";
        _currentOrdersSearch = "";
      } else if (!searchInput.value.trim()) {
        _currentOrdersSearch = "";
      }
    }

    const result = await fetchOrders({
      status: _currentOrdersStatus,
      search: _currentOrdersSearch,
      page: _currentOrdersPage,
      pageSize: 25,
    }, _adminSession);

    if (result && result.error) {
      list.innerHTML = "";
      const p = document.createElement("p");
      p.className = "admin-empty";
      p.style.color = "#f87171";
      p.textContent = `⚠️ Error loading orders: ${result.error}. Please try again.`;
      list.appendChild(p);
      return;
    }

    _adminOrdersCache = result.orders || [];

    // Update pending badge
    const awaitingCount = _adminOrdersCache.filter(o => o.status === "awaiting_confirmation").length;
    const badge = document.getElementById("nav-orders-count-badge");
    if (badge) {
      if (awaitingCount > 0) {
        badge.textContent = awaitingCount;
        badge.style.display = "inline-flex";
      } else {
        badge.style.display = "none";
      }
    }

    renderAdminOrdersList(_adminOrdersCache, result.totalCount);

  } catch (err) {
    list.innerHTML = "";
    const p = document.createElement("p");
    p.className = "admin-empty";
    p.style.color = "#f87171";
    p.textContent = `Error loading orders: ${err.message}`;
    list.appendChild(p);
  }
}

function renderAdminOrdersList(orders, totalCount) {
  const list = document.getElementById("admin-orders-list");
  if (!list) return;

  if (orders.length === 0) {
    list.innerHTML = `<p class="admin-empty">No orders found matching this filter.</p>`;
    return;
  }

  list.innerHTML = orders.map(order => {
    const items = Array.isArray(order.items) ? order.items : [];
    const itemsSummary = items.map(i => `${i.quantity}x ${i.name}${i.version ? ` [${i.version}]` : ""} (${i.size || "Standard"})`).join(", ");

    return `
      <div class="admin-order-card" id="order-card-${order.id || order.order_ref}">
        <div class="admin-order-card-header">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <strong class="order-ref-text">${order.order_ref}</strong>
            <span class="status-badge status-${order.status}">${getStatusLabel(order.status)}</span>
            <span class="order-time-text">📅 ${formatOrderDate(order.created_at)}</span>
          </div>
          <div class="order-total-price">
            ${formatPrice(order.total_amount || order.subtotal)}
          </div>
        </div>

        <div class="admin-order-card-body">
          <div class="order-customer-snippet">
            <span class="cust-name">👤 <strong>${order.customer_name}</strong></span>
            <span class="cust-phone">📞 <a href="tel:${order.customer_phone}" style="color:var(--text-primary);text-decoration:underline;">${order.customer_phone}</a></span>
            <span class="cust-location">📍 ${order.delivery_address}, ${order.delivery_city}, ${order.delivery_state}</span>
          </div>

          <div class="order-items-snippet">
            <span class="items-count-badge">🛍️ ${items.length} item${items.length !== 1 ? "s" : ""}:</span>
            <span class="items-text">${itemsSummary || "No item details recorded"}</span>
          </div>

          ${order.delivery_notes ? `
            <div class="order-notes-snippet">
              💬 <em>Notes: ${order.delivery_notes}</em>
            </div>
          ` : ""}
        </div>

        <div class="admin-order-card-actions">
          <button class="btn-admin-order-view" onclick="openAdminOrderDetail('${order.id || order.order_ref}')">
            🔍 View Full Details & Status
          </button>
          <a href="https://wa.me/${(order.customer_phone || '').replace(/[^0-9]/g, '')}?text=${encodeURIComponent('Hello ' + order.customer_name + '! This is Quantum Jersey regarding your order ' + order.order_ref + '.')}"
             target="_blank" rel="noopener noreferrer" class="btn-admin-order-wa">
            💬 WhatsApp Customer
          </a>
        </div>
      </div>
    `;
  }).join("");
}

function filterOrdersByStatus(status) {
  _currentOrdersStatus = status;
  _currentOrdersPage = 0;

  // Update pills
  const pills = document.querySelectorAll("#order-status-filters .admin-pill");
  pills.forEach(p => {
    p.classList.toggle("active", p.dataset.status === status);
  });

  loadAdminOrders();
}

// Search input listener
document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById("orders-search");
  if (searchInput) {
    let debounce;
    searchInput.addEventListener("input", e => {
      clearTimeout(debounce);
      const val = e.target.value.trim();
      const adminEmail = _adminSession?.user?.email || "";
      if (adminEmail && val.toLowerCase() === adminEmail.toLowerCase()) {
        e.target.value = "";
        _currentOrdersSearch = "";
      } else {
        _currentOrdersSearch = val;
      }
      debounce = setTimeout(() => {
        _currentOrdersPage = 0;
        loadAdminOrders();
      }, 300);
    });
  }
});

// ─── Order Details Modal (Task 4) ────────────────────────────

async function openAdminOrderDetail(orderIdOrRef) {
  let order = _adminOrdersCache.find(o => o.id === orderIdOrRef || o.order_ref === orderIdOrRef);

  if (!order && typeof fetchOrderById === "function") {
    order = await fetchOrderById(orderIdOrRef, _adminSession);
  }

  if (!order) {
    showMsg("Could not load order details.", "error");
    return;
  }

  const modal = document.getElementById("admin-order-detail-modal");
  const refEl = document.getElementById("modal-order-ref");
  const dateEl = document.getElementById("modal-order-date");
  const contentEl = document.getElementById("modal-order-content");

  if (refEl) refEl.textContent = `Order ${order.order_ref}`;
  if (dateEl) dateEl.textContent = `Created: ${new Date(order.created_at).toLocaleString("en-NG")}`;

  const items = Array.isArray(order.items) ? order.items : [];
  const cleanPhone = (order.customer_phone || "").replace(/[^0-9]/g, "");
  const waMsg = encodeURIComponent(`Hello ${order.customer_name}! This is Quantum Jersey regarding your order ${order.order_ref}.`);

  if (contentEl) {
    contentEl.innerHTML = `
      <!-- Customer & Delivery info -->
      <div class="admin-modal-section" style="background:var(--bg-surface-2);border:1px solid var(--border);border-radius:var(--radius-md);padding:18px;margin-bottom:18px;">
        <h4 style="font-size:0.9rem;margin-bottom:10px;color:var(--accent-green);">👤 Customer & Delivery Information</h4>
        <div class="admin-modal-grid-2col" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:0.86rem;">
          <div><strong>Customer Name:</strong> ${order.customer_name}</div>
          <div>
            <strong>Phone:</strong> <a href="tel:${order.customer_phone}" style="color:var(--accent-green);">${order.customer_phone}</a>
          </div>
          <div><strong>State / City:</strong> ${order.delivery_city}, ${order.delivery_state}</div>
          <div><strong>Address:</strong> ${order.delivery_address}</div>
          ${order.delivery_notes ? `<div style="grid-column:1/-1;"><strong>Notes:</strong> <em>${order.delivery_notes}</em></div>` : ""}
        </div>
        <div style="margin-top:14px;">
          <a href="https://wa.me/${cleanPhone}?text=${waMsg}" target="_blank" rel="noopener noreferrer"
             class="quick-action-btn primary" style="display:inline-flex;width:fit-content;text-decoration:none;">
            💬 Open Direct WhatsApp Chat With Customer
          </a>
        </div>
      </div>

      <!-- Items Table -->
      <div class="admin-modal-section" style="margin-bottom:18px;">
        <h4 style="font-size:0.9rem;margin-bottom:10px;color:var(--text-secondary);">🛍️ Order Items (${items.length})</h4>
        <div class="admin-modal-table-wrap" style="border:1px solid var(--border);border-radius:var(--radius-md);overflow-x:auto;-webkit-overflow-scrolling:touch;">
          <table style="width:100%;min-width:440px;border-collapse:collapse;font-size:0.84rem;text-align:left;">
            <thead>
              <tr style="background:var(--bg-surface-2);border-bottom:1px solid var(--border);color:var(--text-muted);">
                <th style="padding:10px 12px;">Item</th>
                <th style="padding:10px 12px;">Size</th>
                <th style="padding:10px 12px;">Qty</th>
                <th style="padding:10px 12px;">Unit Price</th>
                <th style="padding:10px 12px;text-align:right;">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(item => `
                <tr style="border-bottom:1px solid var(--border);">
                  <td style="padding:10px 12px;display:flex;align-items:center;gap:10px;">
                    <img src="${item.image || 'assets/images/boots_product.webp'}" alt="${item.name}"
                         style="width:36px;height:36px;object-fit:cover;border-radius:4px;"/>
                    <strong>${item.name}</strong>
                  </td>
                  <td style="padding:10px 12px;"><span class="admin-cat-tag">${item.version ? `${item.version} · ` : ""}${item.size || "Standard"}</span></td>
                  <td style="padding:10px 12px;">${item.quantity}</td>
                  <td style="padding:10px 12px;">${formatPrice(item.price)}</td>
                  <td style="padding:10px 12px;text-align:right;font-weight:700;color:var(--text-primary);">${formatPrice((item.price || 0) * (item.quantity || 1))}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Financial Breakdown -->
      <div style="background:var(--bg-surface-2);border:1px solid var(--border);border-radius:var(--radius-md);padding:14px 18px;margin-bottom:20px;font-size:0.88rem;">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
          <span style="color:var(--text-secondary);">Items Subtotal:</span>
          <strong>${formatPrice(order.subtotal)}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
          <span style="color:var(--text-secondary);">Delivery Fee:</span>
          <strong>${order.delivery_fee === 0 ? '<span style="color:var(--accent-green)">FREE</span>' : formatPrice(order.delivery_fee)}</strong>
        </div>
        <div style="height:1px;background:var(--border);margin:8px 0;"></div>
        <div style="display:flex;justify-content:space-between;font-size:1.05rem;">
          <strong>Total Order Amount:</strong>
          <strong style="color:var(--accent-green);">${formatPrice(order.total_amount || order.subtotal)}</strong>
        </div>
      </div>

      <!-- Status Update Controls -->
      <div style="background:var(--bg-surface-1);border:1px solid var(--border-accent);border-radius:var(--radius-md);padding:18px;">
        <label for="modal-order-status-select" style="display:block;font-size:0.84rem;font-weight:700;color:var(--text-primary);margin-bottom:8px;">
          Update Order Status:
        </label>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <select id="modal-order-status-select" style="flex:1;min-width:200px;padding:10px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-surface-2);color:var(--text-primary);font-size:0.88rem;outline:none;">
            <option value="awaiting_confirmation" ${order.status === "awaiting_confirmation" ? "selected" : ""}>⏳ Awaiting Confirmation</option>
            <option value="confirmed" ${order.status === "confirmed" ? "selected" : ""}>🔵 Confirmed</option>
            <option value="processing" ${order.status === "processing" ? "selected" : ""}>🟣 Processing</option>
            <option value="dispatched" ${order.status === "dispatched" ? "selected" : ""}>🚚 Dispatched</option>
            <option value="delivered" ${order.status === "delivered" ? "selected" : ""}>🟢 Delivered</option>
            <option value="cancelled" ${order.status === "cancelled" ? "selected" : ""}>🔴 Cancelled</option>
          </select>
          <button type="button" id="btn-save-order-status" class="btn-primary" style="padding:10px 20px;font-size:0.86rem;"
                  onclick="handleSaveOrderStatus('${order.id}')">
            Save Status
          </button>
        </div>
      </div>
    `;
  }

  if (modal) {
    modal.style.display = "flex";
    document.body.style.overflow = "hidden";
  }
}

function closeAdminOrderDetail() {
  const modal = document.getElementById("admin-order-detail-modal");
  if (modal) {
    modal.style.display = "none";
    document.body.style.overflow = "";
  }
}

function handleAdminOrderModalBackdrop(event) {
  if (event.target.id === "admin-order-detail-modal") {
    closeAdminOrderDetail();
  }
}

async function handleSaveOrderStatus(orderId) {
  const select = document.getElementById("modal-order-status-select");
  const btn = document.getElementById("btn-save-order-status");
  if (!select) return;

  const newStatus = select.value;
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Saving…";
  }

  try {
    if (typeof updateOrderStatus === "function") {
      await updateOrderStatus(orderId, newStatus, _adminSession);
      showMsg(`✅ Order status updated to "${getStatusLabel(newStatus)}"`, "success");
      closeAdminOrderDetail();
      loadAdminOrders();
      loadDashboard();
    }
  } catch (err) {
    showMsg(`❌ Failed to update status: ${err.message}`, "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Save Status";
    }
  }
}

// ─── Customer Reviews Moderation (Task 5) ─────────────────────

async function loadAdminReviews() {
  const container = document.getElementById("admin-reviews-list");
  if (!container) return;
  container.innerHTML = `<p class="admin-empty">Loading reviews…</p>`;

  const client = getSupabaseClient();
  if (!client || !_adminSession) {
    container.innerHTML = `<div class="admin-empty">Reviews will appear here when submitted by customers.</div>`;
    return;
  }

  try {
    const { data, error } = await client
      .from("reviews")
      .select("*, products(product_name)")
      .order("created_at", { ascending: false });

    if (error) throw error;

    if (!data || data.length === 0) {
      container.innerHTML = `<p class="admin-empty">No reviews submitted yet.</p>`;
      return;
    }

    container.innerHTML = data.map(rev => {
      const isPreviousCustomer = rev.review_source === "previous_customer";
      const sourceBadge = isPreviousCustomer
        ? `<span class="status-badge" style="background:rgba(96,165,250,0.15);border:1px solid rgba(96,165,250,0.4);color:#93c5fd;">🏷️ Previous Customer</span>`
        : `<span class="status-badge" style="background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.4);color:#4ade80;">🛍️ Website Order</span>`;

      const verifiedBadge = rev.is_verified_purchase
        ? `<span style="font-size:0.75rem;color:var(--accent-green);font-weight:700;">✓ Verified</span>`
        : `<span style="font-size:0.75rem;color:var(--text-muted);">Unverified</span>`;

      const dateStr = rev.created_at ? new Date(rev.created_at).toLocaleDateString("en-NG", { month: "short", day: "numeric", year: "numeric" }) : "";

      // Format product name: prioritize customer-typed product_name, then catalogue product_name, then product_id fallback
      const enteredName = rev.product_name ? escapeHtml(rev.product_name) : "";
      const catalogueName = rev.products?.product_name ? escapeHtml(rev.products.product_name) : "";
      let productDisplayHtml = "";

      if (enteredName && catalogueName && enteredName.toLowerCase() !== catalogueName.toLowerCase()) {
        productDisplayHtml = `<strong style="color:var(--text-primary);">${enteredName}</strong> <span style="font-size:0.75rem;color:var(--text-muted);">(Catalogue: ${catalogueName})</span>`;
      } else if (enteredName) {
        productDisplayHtml = `<strong style="color:var(--text-primary);">${enteredName}</strong>${!rev.product_id ? ' <span style="font-size:0.75rem;color:var(--accent-gold);">(Custom / Offline Item)</span>' : ''}`;
      } else if (catalogueName) {
        productDisplayHtml = `<strong style="color:var(--text-primary);">${catalogueName}</strong>`;
      } else if (rev.product_id) {
        productDisplayHtml = `<strong style="color:var(--text-primary);">Product ID: ${escapeHtml(rev.product_id)}</strong>`;
      } else {
        productDisplayHtml = `<strong style="color:var(--text-muted);">Unspecified Product</strong>`;
      }

      return `
        <div class="admin-product-row" style="align-items:flex-start;padding:18px;margin-bottom:12px;background:var(--bg-surface-2);border:1px solid var(--border);border-radius:var(--radius-md);">
          <div class="admin-product-info" style="flex:1;">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px;">
              <strong style="font-size:0.95rem;color:var(--text-primary);">${escapeHtml(rev.customer_name || 'Verified Customer')}</strong>
              ${sourceBadge}
              <span class="status-badge status-${escapeHtml(rev.status)}">${escapeHtml(rev.status).toUpperCase()}</span>
              ${verifiedBadge}
              <span style="color:var(--accent-gold);font-weight:700;margin-left:auto;">★ ${parseInt(rev.rating, 10) || 5}.0</span>
            </div>

            <p style="font-size:0.9rem;color:var(--text-primary);margin:6px 0;line-height:1.5;">"${escapeHtml(rev.review_text)}"</p>

            <div style="font-size:0.78rem;color:var(--text-muted);display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-top:6px;">
              <span>Product: ${productDisplayHtml}</span>
              ${rev.order_ref ? `<span>Order Ref: <strong style="color:var(--accent-green);">${escapeHtml(rev.order_ref)}</strong></span>` : ""}
              ${dateStr ? `<span>Submitted: ${escapeHtml(dateStr)}</span>` : ""}
            </div>

            ${rev.purchase_details ? `
              <div style="font-size:0.8rem;color:var(--text-secondary);background:var(--bg-surface-1);border:1px solid var(--border);border-radius:var(--radius-xs);padding:8px 12px;margin-top:10px;">
                💬 <strong>Previous Purchase Details:</strong> <em>${escapeHtml(rev.purchase_details)}</em>
              </div>
            ` : ""}
          </div>

          <div class="admin-row-actions" style="margin-left:14px;flex-shrink:0;display:flex;flex-direction:column;gap:6px;">
            ${rev.status !== "approved" ? `
              <button class="btn-admin-feature" title="Approve and publish review" onclick="handleModerateReview('${rev.id}', 'approved')">
                ✓ Approve
              </button>
            ` : ""}
            ${rev.status !== "rejected" ? `
              <button class="btn-admin-delete" title="Reject review" onclick="handleModerateReview('${rev.id}', 'rejected')">
                ✕ Reject
              </button>
            ` : ""}
            <button class="btn-admin-edit" title="${rev.is_verified_purchase ? 'Remove verified badge' : 'Mark purchase as verified'}" onclick="handleToggleReviewVerification('${rev.id}', ${rev.is_verified_purchase ? 'true' : 'false'})" style="font-size:0.75rem;padding:6px 10px;">
              ${rev.is_verified_purchase ? '🛡️ Unverify' : '🛡️ Mark Verified'}
            </button>
            <button class="btn-admin-delete" title="Permanently delete review" onclick="handleDeleteReview('${rev.id}')" style="font-size:0.75rem;padding:6px 10px;background:rgba(239,68,68,0.1);color:#f87171;border-color:rgba(239,68,68,0.3);">
              🗑 Delete
            </button>
          </div>
        </div>
      `;
    }).join("");
  } catch (err) {
    container.innerHTML = `<p class="admin-empty" style="color:#f87171">Error loading reviews: ${escapeHtml(err.message)}</p>`;
  }
}

/**
 * Moderate review status (approve or reject).
 * NOTE: Moderation approval strictly updates publication status and does NOT automatically
 * toggle purchase verification. Verification is an independent, explicit action.
 */
async function handleModerateReview(reviewId, newStatus) {
  const client = getSupabaseClient();
  if (!client || !_adminSession) return;

  try {
    const updatePayload = {
      status: newStatus,
    };

    const { error } = await client
      .from("reviews")
      .update(updatePayload)
      .eq("id", reviewId);

    if (error) throw error;
    showMsg(`✅ Review ${newStatus === 'approved' ? 'approved' : 'rejected'}!`, "success");
    loadAdminReviews();
  } catch (err) {
    showMsg(`❌ Error: ${err.message}`, "error");
  }
}

/**
 * Toggle purchase verification status independently of approval status.
 */
async function handleToggleReviewVerification(reviewId, currentVerified) {
  const client = getSupabaseClient();
  if (!client || !_adminSession) return;

  try {
    const nextVerified = !currentVerified;
    const { error } = await client
      .from("reviews")
      .update({ is_verified_purchase: nextVerified })
      .eq("id", reviewId);

    if (error) throw error;
    showMsg(`✅ Review marked as ${nextVerified ? 'verified purchase' : 'unverified'}.`, "success");
    loadAdminReviews();
  } catch (err) {
    showMsg(`❌ Error: ${err.message}`, "error");
  }
}

/**
 * Permanently delete a review record.
 */
async function handleDeleteReview(reviewId) {
  const client = getSupabaseClient();
  if (!client || !_adminSession) return;

  if (!confirm("Are you sure you want to permanently delete this review?")) return;

  try {
    const { error } = await client
      .from("reviews")
      .delete()
      .eq("id", reviewId);

    if (error) throw error;
    showMsg("✅ Review deleted.", "success");
    loadAdminReviews();
  } catch (err) {
    showMsg(`❌ Error: ${err.message}`, "error");
  }
}

// ─── Settings ────────────────────────────────────────────────


function loadSettings() {
  const key    = localStorage.getItem("qj_gemini_key") || "";
  const input  = document.getElementById("gemini-key-input");
  if (!input) return;
  input.value        = key ? "•".repeat(24) : "";
  input.dataset.set  = key ? "1" : "";
}

function saveGeminiKey() {
  const input = document.getElementById("gemini-key-input");
  const val   = input.value.trim();
  if (!val || val.startsWith("•")) {
    showMsg("No change — key not updated.", "info");
    return;
  }
  localStorage.setItem("qj_gemini_key", val);
  input.value       = "•".repeat(24);
  input.dataset.set = "1";
  showMsg("✅ Gemini API key saved.", "success");
}

function clearGeminiKey() {
  localStorage.removeItem("qj_gemini_key");
  const input = document.getElementById("gemini-key-input");
  if (input) { input.value = ""; input.dataset.set = ""; }
  showMsg("Gemini key removed.", "info");
}

// ─── Image Upload & AI Analysis ──────────────────────────────

function handleImageSelect(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    showMsg("Please select a valid image file.", "error"); return;
  }
  if (file.size > 10 * 1024 * 1024) {
    showMsg("Image must be under 10 MB.", "error"); return;
  }

  _uploadedFile = file;

  // Preview
  const reader = new FileReader();
  reader.onload = ev => {
    document.getElementById("img-preview").src = ev.target.result;
    document.getElementById("img-preview-wrap").style.display = "block";
    document.getElementById("img-placeholder").style.display  = "none";
    updatePublishSteps();
  };
  reader.readAsDataURL(file);
}

async function triggerManualAIAnalysis() {
  if (!_uploadedFile) {
    showMsg("Please upload a product image first.", "error"); return;
  }
  await runAIAnalysis(_uploadedFile);
}

async function runAIAnalysis(file) {
  const aiSection = document.getElementById("ai-result-section");
  const aiStatus  = document.getElementById("ai-status");
  const aiError   = document.getElementById("ai-error");

  aiSection.style.display = "block";
  aiStatus.style.display  = "flex";
  aiError.style.display   = "none";
  aiStatus.style.color    = "";
  aiStatus.innerHTML      = `<span class="ai-spinner"></span> Analyzing image with Gemini AI…`;
  clearFormFields();

  try {
    const base64 = await fileToBase64(file);
    const result = await analyzeProductImage(base64, file.type);

    document.getElementById("prod-name").value     = result.product_name || "";
    document.getElementById("prod-category").value = result.category     || "";
    document.getElementById("prod-desc").value     = result.description  || "";
    if (result.badge) document.getElementById("prod-badge").value = result.badge;

    aiStatus.innerHTML  = `✅ AI analysis complete — review and edit before publishing.`;
    aiStatus.style.color = "var(--accent-green)";
    updatePublishSteps();
  } catch (err) {
    aiStatus.style.display = "none";
    aiError.style.display  = "block";
    aiError.textContent    = `⚠️ ${err.message}`;
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function clearFormFields() {
  ["prod-name","prod-desc","prod-badge"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  const catEl = document.getElementById("prod-category");
  if (catEl) catEl.value = "";
}

function updatePublishSteps() {
  const stepUpload  = document.getElementById("step-upload");
  const stepDetails = document.getElementById("step-details");
  const stepPublish = document.getElementById("step-publish");

  if (!stepUpload || !stepDetails || !stepPublish) return;

  if (_uploadedFile) {
    stepUpload.classList.add("done");
  } else {
    stepUpload.classList.remove("done");
  }

  const category        = document.getElementById("prod-category")?.value;
  const isJersey        = category === "jerseys";
  const versionsWrap    = document.getElementById("prod-jersey-versions-wrap");
  const versionsInputs  = document.getElementById("prod-jersey-versions-inputs");
  const hasVersionsCheck = document.getElementById("prod-has-versions");
  const hasVersions     = isJersey && (hasVersionsCheck?.checked ?? false);

  if (versionsWrap) {
    versionsWrap.style.display = isJersey ? "block" : "none";
  }
  if (versionsInputs) {
    versionsInputs.style.display = hasVersions ? "block" : "none";
  }

  const priceWrap  = document.getElementById("prod-price-wrap");
  const priceInput = document.getElementById("prod-price");
  const hasSizes   = document.getElementById("prod-has-sizes")?.checked ?? true;
  const sizesInput = document.getElementById("prod-sizes");
  const sizesGroup = document.getElementById("prod-sizes-group");
  const sizesLabel = document.getElementById("prod-sizes-label");

  if (hasVersions) {
    if (priceWrap) priceWrap.style.display = "none";
    if (sizesGroup) sizesGroup.style.display = "none";
    if (priceInput) priceInput.required = false;
    if (sizesInput) sizesInput.required = false;
  } else {
    if (priceWrap) priceWrap.style.display = "block";
    if (priceInput) priceInput.required = true;
    if (sizesGroup) sizesGroup.style.display = hasSizes ? "block" : "none";
    if (sizesInput) sizesInput.required = hasSizes;
    if (sizesLabel) sizesLabel.textContent = hasSizes ? "Sizes *" : "Sizes";
  }

  const name        = document.getElementById("prod-name")?.value.trim();
  const price       = priceInput?.value.trim();
  const sizes       = sizesInput?.value.trim();
  const description = document.getElementById("prod-desc")?.value.trim();

  let versionsValid = true;
  if (hasVersions) {
    const fanPrice = parseInt(document.getElementById("prod-fan-price")?.value.trim() || "0", 10);
    const fanSizes = document.getElementById("prod-fan-sizes")?.value.trim();
    const playerPrice = parseInt(document.getElementById("prod-player-price")?.value.trim() || "0", 10);
    const playerSizes = document.getElementById("prod-player-sizes")?.value.trim();
    versionsValid = fanPrice > 0 && fanSizes && playerPrice > 0 && playerSizes;
  }

  const isDetailsDone = hasVersions
    ? (name && category && versionsValid && description)
    : (name && category && price && (!hasSizes || sizes) && description);

  if (isDetailsDone) {
    stepDetails.classList.add("done");
  } else {
    stepDetails.classList.remove("done");
  }
}

// ─── Publish Product ─────────────────────────────────────────

async function handlePublish(e) {
  e.preventDefault();

  const name        = document.getElementById("prod-name").value.trim();
  const category    = document.getElementById("prod-category").value;
  const isJersey    = category === "jerseys";
  const hasVersions = isJersey && (document.getElementById("prod-has-versions")?.checked ?? false);
  const rawDesc     = document.getElementById("prod-desc").value.trim();
  const badge       = document.getElementById("prod-badge").value.trim() || null;
  const featured    = document.getElementById("prod-featured").checked;

  let price = 0;
  let sizes = [];
  let description = "";

  if (hasVersions) {
    const fanPrice = parseInt(document.getElementById("prod-fan-price")?.value.trim() || "0", 10);
    const fanSizes = (document.getElementById("prod-fan-sizes")?.value.trim() || "").split(",").map(s => s.trim()).filter(Boolean);
    const playerPrice = parseInt(document.getElementById("prod-player-price")?.value.trim() || "0", 10);
    const playerSizes = (document.getElementById("prod-player-sizes")?.value.trim() || "").split(",").map(s => s.trim()).filter(Boolean);

    if (!name || !category || !rawDesc) {
      showMsg("Please fill in all required fields.", "error"); return;
    }
    if (!fanPrice || fanPrice < 1 || fanSizes.length === 0) {
      showMsg("Please enter a valid Fan Version price and at least one size.", "error"); return;
    }
    if (!playerPrice || playerPrice < 1 || playerSizes.length === 0) {
      showMsg("Please enter a valid Player Version price and at least one size.", "error"); return;
    }

    const versions = {
      fan: { label: "Fan Version", price: fanPrice, sizes: fanSizes },
      player: { label: "Player Version", price: playerPrice, sizes: playerSizes }
    };

    price = fanPrice;
    sizes = Array.from(new Set([...fanSizes, ...playerSizes]));
    description = (typeof formatProductDescription === "function")
      ? formatProductDescription(rawDesc, versions)
      : rawDesc;
  } else {
    const priceRaw = document.getElementById("prod-price").value.trim();
    const hasSizes = document.getElementById("prod-has-sizes")?.checked ?? true;
    const sizesRaw = document.getElementById("prod-sizes")?.value.trim() || "";

    if (!name || !category || !priceRaw || (hasSizes && !sizesRaw) || !rawDesc) {
      showMsg("Please fill in all required fields.", "error"); return;
    }

    price = parseInt(priceRaw.replace(/[^0-9]/g, ""), 10);
    if (isNaN(price) || price < 1) {
      showMsg("Please enter a valid price.", "error"); return;
    }
    sizes = hasSizes ? sizesRaw.split(",").map(s => s.trim()).filter(Boolean) : [];
    description = (typeof cleanProductDescription === "function")
      ? cleanProductDescription(rawDesc)
      : rawDesc;
  }

  const btn = document.getElementById("publish-btn");
  btn.disabled    = true;
  btn.textContent = "Uploading image…";

  try {
    showMsg("⬆️ Uploading image to Supabase Storage…", "info");
    let imageUrl;
    try {
      imageUrl = await uploadProductImage(_uploadedFile, _adminSession);
    } catch (uploadErr) {
      throw new Error(`Image upload failed: ${uploadErr.message}. The product was not saved.`);
    }

    btn.textContent = "Publishing…";
    showMsg("📝 Publishing product to database…", "info");

    let published;
    try {
      published = await publishProduct(
        { product_name: name, category, price, sizes, image_url: imageUrl, description, badge, featured },
        _adminSession
      );
    } catch (publishErr) {
      // If DB insert fails after image was uploaded, attempt to clean up the uploaded image
      await deleteStorageImageByUrl(imageUrl, _adminSession).catch(() => {});
      throw new Error(`Database publishing failed: ${publishErr.message}`);
    }

    showMsg(`✅ "${published.name}" published successfully!`, "success");
    resetPublishForm();
    // Refresh dashboard in background
    loadDashboard();
  } catch (err) {
    showMsg(`❌ ${err.message}`, "error");
  } finally {
    btn.disabled    = false;
    btn.textContent = "🚀 Publish Product";
  }
}

function resetPublishForm() {
  document.getElementById("publish-form").reset();
  document.getElementById("img-preview-wrap").style.display = "none";
  document.getElementById("img-placeholder").style.display  = "flex";
  document.getElementById("ai-result-section").style.display = "none";
  _uploadedFile = null;
  updatePublishSteps();
}

// ─── Product List ─────────────────────────────────────────────

async function loadAdminProductList() {
  const list = document.getElementById("admin-product-list");
  if (!list) return;
  list.innerHTML = `<p class="admin-empty">Loading…</p>`;

  try {
    const products = await fetchProducts();
    _adminProductsCache = products || [];

    if (products.length === 0) {
      list.innerHTML = `<p class="admin-empty">No products yet.</p>`;
      return;
    }

    list.innerHTML = products.map(p => `
      <div class="admin-product-row">
        <div class="admin-product-row-top">
        <img src="${p.image}" alt="${p.name}" class="admin-product-img"
             onerror="this.src='assets/images/boots_product.webp'"/>
        <div class="admin-product-info">
          <strong>${p.name}</strong>
          <span class="admin-cat-tag">${getCategoryLabel(p.category)}</span>
          <span class="admin-price">${p.versions ? `₦${p.versions.fan.price.toLocaleString()} / ₦${p.versions.player.price.toLocaleString()}` : `₦${p.price.toLocaleString()}`}</span>
          <span class="admin-sizes">${p.versions ? `<span style="color:var(--accent-green);font-weight:600;">Fan: ₦${p.versions.fan.price.toLocaleString()} (${p.versions.fan.sizes.join(", ")}) · Player: ₦${p.versions.player.price.toLocaleString()} (${p.versions.player.sizes.join(", ")})</span>` : ((Array.isArray(p.sizes) && p.sizes.length > 0) ? `Sizes: ${p.sizes.join(", ")}` : '<span style="color:var(--text-muted);">No size required</span>')}</span>
          ${p.featured ? '<span class="admin-featured-tag">⭐ Featured</span>' : ""}
        </div>
        </div>
        <div class="admin-row-actions">
          <button class="btn-admin-edit"
                  title="Edit product"
                  onclick="openEditProductModal('${p.id}')">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
                 fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round"
                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
            </svg>
            Edit
          </button>
          <button class="btn-admin-feature"
                  title="${p.featured ? "Remove from featured" : "Mark as featured"}"
                  onclick="handleToggleFeatured('${p.id}', ${!p.featured})">
            ${p.featured ? "★ Unfeature" : "☆ Feature"}
          </button>
          <button class="btn-admin-delete"
                  onclick="handleDeleteProduct('${p.id}', '${p.name.replace(/'/g, "\\'")}', '${(p.image || "").replace(/'/g, "\\'")}')">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
                 fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
            Delete
          </button>
        </div>
      </div>
    `).join("");
  } catch (err) {
    list.innerHTML = `<p class="admin-empty" style="color:#f87171">Error: ${err.message}</p>`;
  }
}

// ─── Edit Product Modal Logic ────────────────────────────────

function openEditProductModal(productId) {
  let prod = _adminProductsCache.find(p => p.id === productId);
  if (!prod && typeof getProductById === "function") {
    prod = getProductById(productId);
  }
  if (!prod) {
    showMsg("❌ Could not find product to edit.", "error");
    return;
  }

  _currentEditingProduct = prod;
  _editReplacementFile = null;

  // Set modal header
  const titleNameEl = document.getElementById("edit-modal-title-name");
  if (titleNameEl) titleNameEl.textContent = prod.name || "Product";

  // Name, Category, Badge, Featured, Stock
  const nameInput = document.getElementById("edit-prod-name");
  if (nameInput) nameInput.value = prod.name || "";

  const catSelect = document.getElementById("edit-prod-category");
  if (catSelect) catSelect.value = prod.category || "jerseys";

  const badgeInput = document.getElementById("edit-prod-badge");
  if (badgeInput) badgeInput.value = prod.badge || "";

  const featuredCheck = document.getElementById("edit-prod-featured");
  if (featuredCheck) featuredCheck.checked = Boolean(prod.featured);

  const stockCheck = document.getElementById("edit-prod-in-stock");
  if (stockCheck) stockCheck.checked = (prod.in_stock !== false && prod.inStock !== false);

  // Description (clean description text)
  const descEl = document.getElementById("edit-prod-desc");
  if (descEl) {
    descEl.value = (typeof cleanProductDescription === "function")
      ? cleanProductDescription(prod.description)
      : (prod.description || "");
  }

  // Versioned vs non-versioned setup
  const verInfo = prod.versions
    ? { isVersioned: true, versions: prod.versions }
    : (typeof parseProductVersions === "function" && prod.description
        ? parseProductVersions(prod.description)
        : { isVersioned: false });

  const hasVersions = (prod.category === "jerseys") && verInfo.isVersioned && verInfo.versions;
  const versionsCheck = document.getElementById("edit-prod-has-versions");
  if (versionsCheck) versionsCheck.checked = Boolean(hasVersions);

  if (hasVersions) {
    const fPrice = document.getElementById("edit-prod-fan-price");
    if (fPrice) fPrice.value = verInfo.versions.fan?.price || "";
    const fSizes = document.getElementById("edit-prod-fan-sizes");
    if (fSizes) fSizes.value = Array.isArray(verInfo.versions.fan?.sizes) ? verInfo.versions.fan.sizes.join(", ") : "";

    const pPrice = document.getElementById("edit-prod-player-price");
    if (pPrice) pPrice.value = verInfo.versions.player?.price || "";
    const pSizes = document.getElementById("edit-prod-player-sizes");
    if (pSizes) pSizes.value = Array.isArray(verInfo.versions.player?.sizes) ? verInfo.versions.player.sizes.join(", ") : "";

    const priceInput = document.getElementById("edit-prod-price");
    if (priceInput) priceInput.value = prod.price || verInfo.versions.fan?.price || "";
    const sizesInput = document.getElementById("edit-prod-sizes");
    if (sizesInput) sizesInput.value = Array.isArray(prod.sizes) ? prod.sizes.join(", ") : "";
  } else {
    const priceInput = document.getElementById("edit-prod-price");
    if (priceInput) priceInput.value = (typeof prod.price === "number") ? prod.price : "";

    const hasSizes = Array.isArray(prod.sizes) && prod.sizes.length > 0;
    const hasSizesCheck = document.getElementById("edit-prod-has-sizes");
    if (hasSizesCheck) hasSizesCheck.checked = hasSizes;

    const sizesInput = document.getElementById("edit-prod-sizes");
    if (sizesInput) sizesInput.value = hasSizes ? prod.sizes.join(", ") : "";

    const fPrice = document.getElementById("edit-prod-fan-price");
    if (fPrice) fPrice.value = "";
    const fSizes = document.getElementById("edit-prod-fan-sizes");
    if (fSizes) fSizes.value = "";
    const pPrice = document.getElementById("edit-prod-player-price");
    if (pPrice) pPrice.value = "";
    const pSizes = document.getElementById("edit-prod-player-sizes");
    if (pSizes) pSizes.value = "";
  }

  // Image preview setup
  const currentImg = document.getElementById("edit-img-current-preview");
  if (currentImg) {
    currentImg.src = prod.image || prod.image_url || "assets/images/boots_product.webp";
  }
  const fileInput = document.getElementById("edit-image-picker");
  if (fileInput) fileInput.value = "";
  const newWrap = document.getElementById("edit-img-new-wrap");
  if (newWrap) newWrap.style.display = "none";

  // Clear any existing error
  const errEl = document.getElementById("edit-product-error");
  if (errEl) {
    errEl.textContent = "";
    errEl.style.display = "none";
  }

  // Update layout visibility
  updateEditFormVisibility();

  // Show modal
  const modal = document.getElementById("admin-edit-product-modal");
  if (modal) modal.style.display = "flex";
}

function closeEditProductModal() {
  const modal = document.getElementById("admin-edit-product-modal");
  if (modal) modal.style.display = "none";
  _currentEditingProduct = null;
  _editReplacementFile = null;
  const fileInput = document.getElementById("edit-image-picker");
  if (fileInput) fileInput.value = "";
  const newWrap = document.getElementById("edit-img-new-wrap");
  if (newWrap) newWrap.style.display = "none";
}

function handleAdminEditProductModalBackdrop(e) {
  if (e.target && e.target.id === "admin-edit-product-modal") {
    closeEditProductModal();
  }
}

function handleEditCategoryChange() {
  updateEditFormVisibility();
}

function handleEditVersionsToggle() {
  updateEditFormVisibility();
}

function handleEditHasSizesToggle() {
  updateEditFormVisibility();
}

function updateEditFormVisibility() {
  const cat = document.getElementById("edit-prod-category")?.value;
  const isJersey = cat === "jerseys";
  const hasVersionsCheck = document.getElementById("edit-prod-has-versions");
  const hasVersions = isJersey && (hasVersionsCheck?.checked ?? false);

  const versionsWrap = document.getElementById("edit-prod-jersey-versions-wrap");
  if (versionsWrap) versionsWrap.style.display = isJersey ? "block" : "none";

  const versionsInputs = document.getElementById("edit-prod-jersey-versions-inputs");
  if (versionsInputs) versionsInputs.style.display = hasVersions ? "block" : "none";

  const priceWrap = document.getElementById("edit-prod-price-wrap");
  const priceInput = document.getElementById("edit-prod-price");
  const sizesWrap = document.getElementById("edit-prod-sizes-wrap");
  const sizesInput = document.getElementById("edit-prod-sizes");
  const hasSizes = document.getElementById("edit-prod-has-sizes")?.checked ?? true;
  const sizesGroup = document.getElementById("edit-prod-sizes-group");

  if (hasVersions) {
    if (priceWrap) priceWrap.style.display = "none";
    if (sizesWrap) sizesWrap.style.display = "none";
    if (priceInput) priceInput.required = false;
    if (sizesInput) sizesInput.required = false;
  } else {
    if (priceWrap) priceWrap.style.display = "block";
    if (priceInput) priceInput.required = true;
    if (sizesWrap) sizesWrap.style.display = "block";
    if (sizesGroup) sizesGroup.style.display = hasSizes ? "block" : "none";
    if (sizesInput) sizesInput.required = hasSizes;
  }
}

function handleEditImageSelect(e) {
  const file = e.target.files?.[0];
  const errEl = document.getElementById("edit-product-error");
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    if (errEl) {
      errEl.textContent = "Please select a valid image file (JPG, PNG, or WEBP).";
      errEl.style.display = "block";
    }
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    if (errEl) {
      errEl.textContent = "Image must be under 10 MB.";
      errEl.style.display = "block";
    }
    return;
  }

  _editReplacementFile = file;
  if (errEl) errEl.style.display = "none";

  const reader = new FileReader();
  reader.onload = ev => {
    const preview = document.getElementById("edit-img-new-preview");
    if (preview) preview.src = ev.target.result;
    const wrap = document.getElementById("edit-img-new-wrap");
    if (wrap) wrap.style.display = "block";
  };
  reader.readAsDataURL(file);
}

function cancelEditImageReplacement() {
  _editReplacementFile = null;
  const fileInput = document.getElementById("edit-image-picker");
  if (fileInput) fileInput.value = "";
  const wrap = document.getElementById("edit-img-new-wrap");
  if (wrap) wrap.style.display = "none";
}

async function handleSaveEditProduct(e) {
  if (e && typeof e.preventDefault === "function") e.preventDefault();

  if (!_currentEditingProduct) {
    showMsg("❌ No product selected for editing.", "error");
    return;
  }

  const errEl = document.getElementById("edit-product-error");
  if (errEl) {
    errEl.textContent = "";
    errEl.style.display = "none";
  }

  const name = document.getElementById("edit-prod-name")?.value.trim();
  const category = document.getElementById("edit-prod-category")?.value;
  const isJersey = category === "jerseys";
  const hasVersions = isJersey && (document.getElementById("edit-prod-has-versions")?.checked ?? false);
  const rawDesc = document.getElementById("edit-prod-desc")?.value.trim();
  const badge = document.getElementById("edit-prod-badge")?.value.trim() || null;
  const featured = Boolean(document.getElementById("edit-prod-featured")?.checked);
  const inStock = Boolean(document.getElementById("edit-prod-in-stock")?.checked);

  let price = 0;
  let sizes = [];
  let description = "";

  if (hasVersions) {
    const fanPrice = parseInt(document.getElementById("edit-prod-fan-price")?.value.trim() || "0", 10);
    const fanSizes = (document.getElementById("edit-prod-fan-sizes")?.value.trim() || "").split(",").map(s => s.trim()).filter(Boolean);
    const playerPrice = parseInt(document.getElementById("edit-prod-player-price")?.value.trim() || "0", 10);
    const playerSizes = (document.getElementById("edit-prod-player-sizes")?.value.trim() || "").split(",").map(s => s.trim()).filter(Boolean);

    if (!name || !category || !rawDesc) {
      if (errEl) {
        errEl.textContent = "Please fill in all required fields (Name, Category, Description).";
        errEl.style.display = "block";
      }
      return;
    }
    if (!fanPrice || fanPrice < 1 || fanSizes.length === 0) {
      if (errEl) {
        errEl.textContent = "Please enter a valid Fan Version price and at least one size.";
        errEl.style.display = "block";
      }
      return;
    }
    if (!playerPrice || playerPrice < 1 || playerSizes.length === 0) {
      if (errEl) {
        errEl.textContent = "Please enter a valid Player Version price and at least one size.";
        errEl.style.display = "block";
      }
      return;
    }

    const versions = {
      fan: { label: "Fan Version", price: fanPrice, sizes: fanSizes },
      player: { label: "Player Version", price: playerPrice, sizes: playerSizes }
    };

    price = fanPrice;
    sizes = Array.from(new Set([...fanSizes, ...playerSizes]));
    description = (typeof formatProductDescription === "function")
      ? formatProductDescription(rawDesc, versions)
      : rawDesc;
  } else {
    const priceRaw = document.getElementById("edit-prod-price")?.value.trim();
    const hasSizes = document.getElementById("edit-prod-has-sizes")?.checked ?? true;
    const sizesRaw = document.getElementById("edit-prod-sizes")?.value.trim() || "";

    if (!name || !category || !priceRaw || (hasSizes && !sizesRaw) || !rawDesc) {
      if (errEl) {
        errEl.textContent = "Please fill in all required fields (Name, Price, Sizes, Description).";
        errEl.style.display = "block";
      }
      return;
    }

    price = parseInt(String(priceRaw).replace(/[^0-9]/g, ""), 10);
    if (isNaN(price) || price < 1) {
      if (errEl) {
        errEl.textContent = "Please enter a valid price.";
        errEl.style.display = "block";
      }
      return;
    }
    sizes = hasSizes ? sizesRaw.split(",").map(s => s.trim()).filter(Boolean) : [];
    description = (typeof cleanProductDescription === "function")
      ? cleanProductDescription(rawDesc)
      : rawDesc;
  }

  const saveBtn = document.getElementById("edit-save-btn");
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving changes…";
  }

  try {
    let finalImageUrl = _currentEditingProduct.image || _currentEditingProduct.image_url;

    // If replacement image was selected, upload it first
    if (_editReplacementFile) {
      if (saveBtn) saveBtn.textContent = "Uploading replacement image…";
      try {
        finalImageUrl = await uploadProductImage(_editReplacementFile, _adminSession);
      } catch (uploadErr) {
        throw new Error(`Image upload failed: ${uploadErr.message}. The product was not saved.`);
      }
    }

    if (saveBtn) saveBtn.textContent = "Updating database…";

    const updatePayload = {
      product_name: name,
      category,
      price,
      sizes,
      image_url: finalImageUrl,
      description,
      badge,
      featured,
      in_stock: inStock
    };

    const updated = await updateProduct(_currentEditingProduct.id, updatePayload, _adminSession);

    closeEditProductModal();
    showMsg(`✅ Product "${updated.name || name}" updated successfully!`, "success");

    await loadAdminProductList();
    if (typeof loadDashboard === "function") loadDashboard();

  } catch (err) {
    if (errEl) {
      errEl.textContent = `❌ ${err.message}`;
      errEl.style.display = "block";
    } else {
      showMsg(`❌ ${err.message}`, "error");
    }
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = "💾 Save Changes";
    }
  }
}

async function handleDeleteProduct(id, name, imageUrl) {
  if (!confirm(`Delete "${name}"? This will permanently remove the product and its image.`)) return;

  try {
    // 1. If imageUrl is not passed, attempt to find it via getProductById
    let targetImageUrl = imageUrl;
    if (!targetImageUrl && typeof getProductById === "function") {
      const prod = getProductById(id);
      if (prod) targetImageUrl = prod.image || prod.image_url;
    }

    // 2. Clean up storage image if hosted in product-images bucket
    let storageDeleted = true;
    let storageError = null;
    if (targetImageUrl && typeof deleteStorageImageByUrl === "function") {
      const storageResult = await deleteStorageImageByUrl(targetImageUrl, _adminSession);
      if (!storageResult.success && !storageResult.skipped) {
        storageDeleted = false;
        storageError = storageResult.error;
      }
    }

    // 3. Delete database record
    await deleteProductById(id, _adminSession);

    // 4. Report outcome clearly to the admin
    if (!storageDeleted) {
      showMsg(`⚠️ Product "${name}" deleted, but the image file could not be removed from storage (${storageError}).`, "info");
    } else {
      showMsg(`✅ Deleted "${name}" and cleaned up its storage image.`, "info");
    }

    loadAdminProductList();
    loadDashboard();
  } catch (err) {
    showMsg(`❌ Delete failed: ${err.message}`, "error");
  }
}

async function handleToggleFeatured(id, featured) {
  try {
    await toggleFeatured(id, featured, _adminSession);
    showMsg(featured ? "⭐ Product featured on homepage." : "Removed from featured.", "info");
    loadAdminProductList();
    loadDashboard();
  } catch (err) {
    showMsg(`❌ ${err.message}`, "error");
  }
}

// ─── Message Toast ────────────────────────────────────────────

function showMsg(msg, type = "info") {
  const el = document.getElementById("admin-message");
  if (!el) return;
  el.textContent  = msg;
  el.className    = `admin-message admin-msg-${type}`;
  el.style.display = "block";
  clearTimeout(el._t);
  el._t = setTimeout(() => (el.style.display = "none"), 5000);
}

// ─── Init ─────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  // Check if already logged in (persisted session)
  const session = await getAdminSession();
  if (session) {
    const role = session.user?.app_metadata?.role;
    if (role === "admin") {
      _adminSession = session;
      enterAdminPanel();
    } else {
      await signOutAdmin();
    }
  }

  // Login form
  document.getElementById("login-form")
    ?.addEventListener("submit", handleAdminLogin);

  // Publish form
  const pubForm = document.getElementById("publish-form");
  if (pubForm) {
    pubForm.addEventListener("submit", handlePublish);
    pubForm.addEventListener("input", updatePublishSteps);
    pubForm.addEventListener("change", updatePublishSteps);
  }

  // Image picker
  document.getElementById("image-picker")
    ?.addEventListener("change", handleImageSelect);

  // Drop zone
  const zone = document.getElementById("drop-zone");
  if (zone) {
    zone.addEventListener("click", () =>
      document.getElementById("image-picker")?.click()
    );
    zone.addEventListener("dragover", e => {
      e.preventDefault();
      zone.classList.add("drag-over");
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
    zone.addEventListener("drop", e => {
      e.preventDefault();
      zone.classList.remove("drag-over");
      const file = e.dataTransfer.files[0];
      if (file) {
        _uploadedFile = file;
        handleImageSelect({ target: { files: [file] } });
      }
    });
  }

  // Logout buttons
  document.getElementById("logout-btn")
    ?.addEventListener("click", handleLogout);
});

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    loadAdminOrders,
    renderAdminOrdersList,
    handleAdminLogin,
    handleLogout,
    loadAdminProductList,
    openEditProductModal,
    closeEditProductModal,
    handleAdminEditProductModalBackdrop,
    handleEditCategoryChange,
    handleEditVersionsToggle,
    handleEditHasSizesToggle,
    handleEditImageSelect,
    cancelEditImageReplacement,
    handleSaveEditProduct,
    setAdminSessionForTest: (s) => { _adminSession = s; },
    setAdminProductsCacheForTest: (p) => { _adminProductsCache = p; },
    getAdminProductsCacheForTest: () => _adminProductsCache,
    getCurrentEditingProductForTest: () => _currentEditingProduct,
    setCurrentEditingProductForTest: (p) => { _currentEditingProduct = p; },
    setEditReplacementFileForTest: (f) => { _editReplacementFile = f; },
    getEditReplacementFileForTest: () => _editReplacementFile,
  };
}
