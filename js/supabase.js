// ============================================================
// Quantum Jersey — Supabase Client & Gemini AI Configuration
// ============================================================
//
// ⚡ LOCAL:  http://localhost:3000  (current)
// 🚀 HOSTED: https://pbuntpobwsaddoexpmej.supabase.co  ← swap this in after Vercel deploy
//
// To switch to production, replace the SUPABASE_URL value below
// with: "https://pbuntpobwsaddoexpmej.supabase.co"
// ============================================================

// 🔧 UPDATE THIS after hosting on Vercel:
const SUPABASE_URL = window.QJ_SUPABASE_URL || "https://pbuntpobwsaddoexpmej.supabase.co";
const SUPABASE_ANON_KEY = window.QJ_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBidW50cG9id3NhZGRvZXhwbWVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMzAxNTksImV4cCI6MjA5NzcwNjE1OX0.DfqwSTlLtGBrmM-AgwqE1yXRLklmefuJo9TtHxMI5hI";
const STORAGE_BUCKET = "product-images";
const PAGE_SIZE = 24; // Products per page — scalable for 500+

// ─── Supabase Client ─────────────────────────────────────────
let _supabase = null;

function getSupabaseClient() {
  if (_supabase) return _supabase;
  if (typeof supabase === "undefined" || typeof supabase.createClient !== "function") {
    console.warn("[QJ] Supabase SDK not loaded — falling back to local data.");
    return null;
  }
  if (SUPABASE_URL.startsWith("YOUR_")) {
    console.warn("[QJ] Supabase not configured — falling back to local data.");
    return null;
  }
  _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return _supabase;
}

// ─── Supabase Auth ───────────────────────────────────────────

async function signInAdmin(email, password) {
  const client = getSupabaseClient();
  if (!client) return { error: { message: "Supabase not configured." } };
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  return { data, error };
}

async function signOutAdmin() {
  const client = getSupabaseClient();
  if (!client) return;
  await client.auth.signOut();
}

async function getAdminSession() {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data?.session || null;
}

// ─── Supabase Storage ────────────────────────────────────────

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB limit

/**
 * Upload a product image file to Supabase Storage.
 * Validates MIME type and file size, then returns public URL.
 */
async function uploadProductImage(file, session) {
  if (!file || !file.name) {
    throw new Error("Invalid file provided for upload.");
  }

  // Enforce MIME type validation
  const mimeType = (file.type || "").toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.includes(mimeType)) {
    throw new Error("Invalid image format. Only JPG, PNG, and WEBP images are allowed.");
  }

  // Enforce 10 MB size limit
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Image file exceeds the 10 MB maximum size limit.");
  }

  const client = getSupabaseClient();
  if (!client || !session) throw new Error("Not authenticated or Supabase not configured.");

  const rawExt = file.name.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "");
  const ext = ["jpg", "jpeg", "png", "webp"].includes(rawExt) ? rawExt : "jpg";
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;

  const { data, error } = await client.storage
    .from(STORAGE_BUCKET)
    .upload(filename, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: mimeType,
    });

  if (error) throw new Error(`Image upload failed: ${error.message}`);

  const { data: urlData } = client.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(data.path);

  return urlData.publicUrl;
}

/**
 * Delete a product image from Supabase Storage by its full public URL.
 * Safely parses the object path within the product-images bucket.
 */
async function deleteStorageImageByUrl(imageUrl, session) {
  if (!imageUrl || typeof imageUrl !== "string") return { success: true, skipped: true };

  // Only attempt storage deletion if image URL points to the Supabase product-images bucket
  if (!imageUrl.includes(`/${STORAGE_BUCKET}/`)) {
    return { success: true, skipped: true, reason: "Not a Supabase Storage URL" };
  }

  const client = getSupabaseClient();
  if (!client || !session) return { success: false, error: "Not authenticated or Supabase not configured." };

  try {
    // Extract filename from URL (e.g. /product-images/1783554996541-eij4g3q6agm.jpeg)
    const urlParts = imageUrl.split(`/${STORAGE_BUCKET}/`);
    if (urlParts.length < 2) return { success: true, skipped: true };

    const objectPath = decodeURIComponent(urlParts[1].split("?")[0].trim());
    if (!objectPath) return { success: true, skipped: true };

    const { error } = await client.storage
      .from(STORAGE_BUCKET)
      .remove([objectPath]);

    if (error) {
      console.warn(`[QJ Storage] Failed to delete image "${objectPath}":`, error.message);
      return { success: false, error: error.message };
    }

    return { success: true, deletedPath: objectPath };
  } catch (err) {
    console.warn(`[QJ Storage] Error during image deletion:`, err.message);
    return { success: false, error: err.message };
  }
}

// ─── Supabase Database Operations ───────────────────────────

/**
 * Normalise a Supabase product row to the standard UI format.
 */
function normaliseProduct(row) {
  return {
    id: row.id,
    name: row.product_name,
    category: row.category,
    price: row.price,
    sizes: Array.isArray(row.sizes) ? row.sizes : JSON.parse(row.sizes || "[]"),
    image: row.image_url,
    description: row.description,
    badge: row.badge || null,
    featured: row.featured || false,
    slug: row.slug || null,
    inStock: row.in_stock !== false,
  };
}

/**
 * Fetch products with pagination metadata and total count matching filters.
 */
async function fetchProductsPaginated({ category = null, featuredOnly = false, search = null, page = 0, pageSize = PAGE_SIZE } = {}) {
  const client = getSupabaseClient();
  if (!client) {
    let filtered = [...DEFAULT_PRODUCTS];
    if (category) filtered = filtered.filter(p => p.category === category);
    if (featuredOnly) filtered = filtered.filter(p => p.featured);
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(p => (p.name || "").toLowerCase().includes(q) || (p.description || "").toLowerCase().includes(q));
    }
    const totalCount = filtered.length;
    const from = page * pageSize;
    const pageProducts = filtered.slice(from, from + pageSize);
    if (typeof registerProducts === "function") registerProducts(pageProducts);
    return {
      products: pageProducts,
      totalCount,
      hasMore: from + pageSize < totalCount,
      page,
    };
  }

  try {
    let query = client
      .from("products")
      .select("*", { count: "exact" })
      .eq("in_stock", true)
      .order("created_at", { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (category) query = query.eq("category", category);
    if (featuredOnly) query = query.eq("featured", true);
    if (search) {
      query = query.or(
        `product_name.ilike.%${search}%,description.ilike.%${search}%`
      );
    }

    const { data, count, error } = await query;
    if (error) throw error;

    const normalised = (data || []).map(normaliseProduct);
    if (typeof registerProducts === "function") {
      registerProducts(normalised);
    }

    const totalCount = typeof count === "number" ? count : normalised.length;
    const from = page * pageSize;
    const hasMore = from + pageSize < totalCount;

    return {
      products: normalised,
      totalCount,
      hasMore,
      page,
    };
  } catch (err) {
    console.error("[QJ] Supabase fetch error:", err.message);
    const fallback = DEFAULT_PRODUCTS.slice(page * pageSize, (page + 1) * pageSize);
    if (typeof registerProducts === "function") registerProducts(fallback);
    return {
      products: fallback,
      totalCount: DEFAULT_PRODUCTS.length,
      hasMore: (page + 1) * pageSize < DEFAULT_PRODUCTS.length,
      page,
    };
  }
}

/**
 * Fetch all products from Supabase with optional filters (backwards compatible).
 */
async function fetchProducts({ category = null, featuredOnly = false, search = null, page = 0 } = {}) {
  const result = await fetchProductsPaginated({ category, featuredOnly, search, page, pageSize: PAGE_SIZE });
  return result.products;
}

/**
 * Insert a new product into the database (requires auth session).
 */
async function publishProduct(productData, session) {
  const client = getSupabaseClient();
  if (!client || !session) throw new Error("Not authenticated.");

  const slug = productData.product_name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") + "-" + Date.now();

  const { data, error } = await client.from("products").insert([{
    product_name: productData.product_name,
    category: productData.category,
    price: productData.price,
    sizes: productData.sizes,
    image_url: productData.image_url,
    description: productData.description,
    badge: productData.badge || null,
    featured: productData.featured || false,
    slug,
    in_stock: true,
  }]).select().single();

  if (error) throw new Error(`Publish failed: ${error.message}`);
  return normaliseProduct(data);
}

/**
 * Delete a product by ID (requires auth session).
 */
async function deleteProductById(id, session) {
  const client = getSupabaseClient();
  if (!client || !session) throw new Error("Not authenticated.");
  const { error } = await client.from("products").delete().eq("id", id);
  if (error) throw new Error(`Delete failed: ${error.message}`);
}

/**
 * Toggle featured status for a product (requires auth session).
 */
async function toggleFeatured(id, featured, session) {
  const client = getSupabaseClient();
  if (!client || !session) throw new Error("Not authenticated.");
  const { error } = await client.from("products").update({ featured }).eq("id", id);
  if (error) throw new Error(`Update failed: ${error.message}`);
}

// ─── Gemini AI Vision ─────────────────────────────────────────

/**
 * Call Gemini API with a product image (base64) to generate
 * structured product metadata (title, category, description).
 * API key is read from localStorage — stored only in admin browser.
 */
async function analyzeProductImage(base64Data, mimeType) {
  const apiKey = localStorage.getItem("qj_gemini_key");
  if (!apiKey) {
    throw new Error("Gemini API key not set. Please add it in Admin Settings.");
  }

  const prompt = `You are a professional product copywriter for a premium Nigerian football retail store called Quantum Jersey.

Analyze this product image and return a JSON object with the following fields:
- "product_name": A concise, professional product title (max 8 words). Be specific (e.g., "Nike Mercurial Vapor Elite FG Boots")
- "category": One of exactly: "boots", "jerseys", "sportswear"
- "description": A compelling 2-sentence product description highlighting key features and benefits (50-80 words). Write for a premium sports retail audience.
- "badge": One of "Bestseller", "New Arrival", "Premium", or null

Respond ONLY with valid JSON, no markdown, no extra text.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: mimeType, data: base64Data } },
            { text: prompt }
          ]
        }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 512 }
      })
    }
  );

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err?.error?.message || `Gemini API error ${response.status}`);
  }

  const result = await response.json();
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text || "";

  try {
    const cleaned = text.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    throw new Error("AI returned invalid JSON. Please try again.");
  }
}

// ─── Dashboard Stats ─────────────────────────────────────────

/**
 * Returns aggregate stats for the admin dashboard.
 * { total, featured, byCategory, recentUploads, storageFiles }
 */
async function fetchDashboardStats() {
  const client = getSupabaseClient();
  if (!client) {
    // Fallback counts from DEFAULT_PRODUCTS
    return {
      total: DEFAULT_PRODUCTS.length,
      featured: DEFAULT_PRODUCTS.filter(p => p.featured).length,
      byCategory: {
        boots: DEFAULT_PRODUCTS.filter(p => p.category === "boots").length,
        jerseys: DEFAULT_PRODUCTS.filter(p => p.category === "jerseys").length,
        sportswear: DEFAULT_PRODUCTS.filter(p => p.category === "sportswear").length,
      },
      recentUploads: DEFAULT_PRODUCTS.slice(0, 5),
      storageFiles: 0,
      storageBytes: 0,
    };
  }

  // Run all queries in parallel for speed
  const [totalRes, featuredRes, recentRes, storageRes] = await Promise.allSettled([
    // Total count
    client.from("products").select("*", { count: "exact", head: true }),
    // Featured count
    client.from("products").select("*", { count: "exact", head: true }).eq("featured", true),
    // 6 most recent products
    client.from("products")
      .select("id, product_name, category, price, image_url, created_at, featured")
      .order("created_at", { ascending: false })
      .limit(6),
    // Storage bucket file list
    client.storage.from(STORAGE_BUCKET).list("", { limit: 1000, sortBy: { column: "created_at", order: "desc" } }),
  ]);

  const total    = totalRes.status    === "fulfilled" ? (totalRes.value.count    || 0) : 0;
  const featured = featuredRes.status === "fulfilled" ? (featuredRes.value.count || 0) : 0;
  const recent   = recentRes.status   === "fulfilled" ? (recentRes.value.data    || []) : [];
  const files    = storageRes.status  === "fulfilled" ? (storageRes.value.data   || []) : [];

  // Calculate approximate storage usage from file metadata
  const storageBytes = files.reduce((sum, f) => sum + (f.metadata?.size || 0), 0);

  // Category breakdown (separate quick queries)
  let byCategory = { boots: 0, jerseys: 0, sportswear: 0 };
  try {
    const [b, j, s] = await Promise.all([
      client.from("products").select("*", { count: "exact", head: true }).eq("category", "boots"),
      client.from("products").select("*", { count: "exact", head: true }).eq("category", "jerseys"),
      client.from("products").select("*", { count: "exact", head: true }).eq("category", "sportswear"),
    ]);
    byCategory = { boots: b.count || 0, jerseys: j.count || 0, sportswear: s.count || 0 };
  } catch (_) {}

  return {
    total,
    featured,
    byCategory,
    recentUploads: recent.map(r => normaliseProduct({
      ...r,
      product_name: r.product_name,
      image_url: r.image_url,
      sizes: r.sizes || [],
      description: "",
    })),
    storageFiles: files.length,
    storageBytes,
  };
}

/** Format bytes to a human-readable string */
function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

