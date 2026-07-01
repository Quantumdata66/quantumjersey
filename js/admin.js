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
    const stats = await fetchDashboardStats();

    // ── Stat cards
    animateCount("stat-total",    stats.total);
    animateCount("stat-featured", stats.featured);
    animateCount("stat-files",    stats.storageFiles);
    document.getElementById("stat-storage").textContent = formatBytes(stats.storageBytes);

    // ── Category bars
    const maxCat = Math.max(
      stats.byCategory.boots,
      stats.byCategory.jerseys,
      stats.byCategory.sportswear,
      1 // avoid div by 0
    );
    setCategoryBar("boots",      stats.byCategory.boots,      maxCat);
    setCategoryBar("jerseys",    stats.byCategory.jerseys,    maxCat);
    setCategoryBar("sportswear", stats.byCategory.sportswear, maxCat);

    // ── Storage bar (out of 1 GB free tier)
    const ONE_GB = 1024 * 1024 * 1024;
    const pct    = Math.min((stats.storageBytes / ONE_GB) * 100, 100).toFixed(1);
    requestAnimationFrame(() => {
      document.getElementById("storage-bar").style.width = pct + "%";
    });
    document.getElementById("storage-used-label").textContent  = formatBytes(stats.storageBytes) + " used";
    document.getElementById("storage-files-label").textContent = `${stats.storageFiles} file${stats.storageFiles !== 1 ? "s" : ""}`;

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
  const el    = document.getElementById(id);
  if (!el) return;
  const start = 0;
  const dur   = 700;
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
    const imageUrl = await uploadProductImage(_uploadedFile, _adminSession);

    btn.textContent = "Publishing…";
    showMsg("📝 Publishing product to database…", "info");
    const published = await publishProduct(
      { product_name: name, category, price, sizes, image_url: imageUrl, description, badge, featured },
      _adminSession
    );

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
                  onclick="handleDeleteProduct('${p.id}', '${p.name.replace(/'/g, "\\'")}')">
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

async function handleDeleteProduct(id, name) {
  if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
  try {
    await deleteProductById(id, _adminSession);
    showMsg(`Deleted "${name}".`, "info");
    loadAdminProductList();
    loadDashboard();
  } catch (err) {
    showMsg(`❌ ${err.message}`, "error");
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
