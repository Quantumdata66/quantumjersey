// ============================================================
// Quantum Jersey — Admin Panel Logic
// Supabase Auth + Storage + Gemini AI + Dashboard
// ============================================================

let _adminSession = null;
let _uploadedFile = null;

// ─── Helpers ─────────────────────────────────────────────────
function getCategoryLabel(cat) {
  return { boots: "Football Boots", jerseys: "Jersey", sportswear: "Sportswear" }[cat] || cat;
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

  _adminSession = data.session;
  enterAdminPanel();
}

async function handleLogout() {
  await signOutAdmin();
  _adminSession = null;
  document.getElementById("admin-panel").style.display = "none";
  document.getElementById("login-gate").style.display  = "flex";
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
    const result = await fetchOrders({
      status: _currentOrdersStatus,
      search: _currentOrdersSearch,
      page: _currentOrdersPage,
      pageSize: 25,
    }, _adminSession);

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
    list.innerHTML = `<p class="admin-empty" style="color:#f87171">Error loading orders: ${err.message}</p>`;
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
    const itemsSummary = items.map(i => `${i.quantity}x ${i.name} (${i.size || "Standard"})`).join(", ");

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
      _currentOrdersSearch = e.target.value;
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
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:0.86rem;">
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
        <div style="border:1px solid var(--border);border-radius:var(--radius-md);overflow:hidden;">
          <table style="width:100%;border-collapse:collapse;font-size:0.84rem;text-align:left;">
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
                  <td style="padding:10px 12px;"><span class="admin-cat-tag">${item.size || "Standard"}</span></td>
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

    container.innerHTML = data.map(rev => `
      <div class="admin-product-row" style="align-items:flex-start;">
        <div class="admin-product-info">
          <div style="display:flex;align-items:center;gap:8px;">
            <strong>${rev.customer_name}</strong>
            <span class="status-badge status-${rev.status}">${rev.status.toUpperCase()}</span>
            <span style="color:var(--accent-gold);">★ ${rev.rating}.0</span>
          </div>
          <p style="font-size:0.86rem;color:var(--text-primary);margin:4px 0;">"${rev.review_text}"</p>
          <span style="font-size:0.75rem;color:var(--text-muted);">
            Product: <strong>${rev.products?.product_name || rev.product_id}</strong> · Order: ${rev.order_ref || "None"}
          </span>
        </div>
        <div class="admin-row-actions">
          ${rev.status !== "approved" ? `
            <button class="btn-admin-feature" onclick="handleModerateReview('${rev.id}', 'approved')">
              ✓ Approve
            </button>
          ` : ""}
          ${rev.status !== "rejected" ? `
            <button class="btn-admin-delete" onclick="handleModerateReview('${rev.id}', 'rejected')">
              ✕ Reject
            </button>
          ` : ""}
        </div>
      </div>
    `).join("");
  } catch (err) {
    container.innerHTML = `<p class="admin-empty" style="color:#f87171">Error loading reviews: ${err.message}</p>`;
  }
}

async function handleModerateReview(reviewId, newStatus) {
  const client = getSupabaseClient();
  if (!client || !_adminSession) return;

  try {
    const { error } = await client
      .from("reviews")
      .update({ status: newStatus })
      .eq("id", reviewId);

    if (error) throw error;
    showMsg(`✅ Review ${newStatus}!`, "success");
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

  const name        = document.getElementById("prod-name")?.value.trim();
  const category    = document.getElementById("prod-category")?.value;
  const price       = document.getElementById("prod-price")?.value.trim();
  const sizes       = document.getElementById("prod-sizes")?.value.trim();
  const description = document.getElementById("prod-desc")?.value.trim();

  if (name && category && price && sizes && description) {
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
  const priceRaw    = document.getElementById("prod-price").value.trim();
  const sizesRaw    = document.getElementById("prod-sizes").value.trim();
  const description = document.getElementById("prod-desc").value.trim();
  const badge       = document.getElementById("prod-badge").value.trim() || null;
  const featured    = document.getElementById("prod-featured").checked;

  if (!name || !category || !priceRaw || !sizesRaw || !description) {
    showMsg("Please fill in all required fields.", "error"); return;
  }
  if (!_uploadedFile) {
    showMsg("Please select a product image.", "error"); return;
  }

  const price = parseInt(priceRaw.replace(/[^0-9]/g, ""), 10);
  if (isNaN(price) || price < 1) {
    showMsg("Please enter a valid price.", "error"); return;
  }
  const sizes = sizesRaw.split(",").map(s => s.trim()).filter(Boolean);

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

    if (products.length === 0) {
      list.innerHTML = `<p class="admin-empty">No products yet.</p>`;
      return;
    }

    list.innerHTML = products.map(p => `
      <div class="admin-product-row">
        <img src="${p.image}" alt="${p.name}" class="admin-product-img"
             onerror="this.src='assets/images/boots_product.webp'"/>
        <div class="admin-product-info">
          <strong>${p.name}</strong>
          <span class="admin-cat-tag">${getCategoryLabel(p.category)}</span>
          <span class="admin-price">₦${p.price.toLocaleString()}</span>
          <span class="admin-sizes">Sizes: ${(p.sizes || []).join(", ")}</span>
          ${p.featured ? '<span class="admin-featured-tag">⭐ Featured</span>' : ""}
        </div>
        <div class="admin-row-actions">
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
    _adminSession = session;
    enterAdminPanel();
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
