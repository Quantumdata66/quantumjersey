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

/**
 * Upload a product image file to Supabase Storage.
 * Returns the public URL of the uploaded image.
 */
async function uploadProductImage(file, session) {
  const client = getSupabaseClient();
  if (!client || !session) throw new Error("Not authenticated or Supabase not configured.");

  const ext = file.name.split(".").pop().toLowerCase();
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { data, error } = await client.storage
    .from(STORAGE_BUCKET)
    .upload(filename, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });

  if (error) throw new Error(`Image upload failed: ${error.message}`);

  const { data: urlData } = client.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(data.path);

  return urlData.publicUrl;
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
 * Fetch all products from Supabase with optional filters.
 * Falls back to DEFAULT_PRODUCTS if Supabase is not configured.
 */
async function fetchProducts({ category = null, featuredOnly = false, search = null, page = 0 } = {}) {
  const client = getSupabaseClient();
  if (!client) return DEFAULT_PRODUCTS;

  try {
    let query = client
      .from("products")
      .select("*")
      .eq("in_stock", true)
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (category) query = query.eq("category", category);
    if (featuredOnly) query = query.eq("featured", true);
    if (search) {
      query = query.or(
        `product_name.ilike.%${search}%,description.ilike.%${search}%`
      );
    }

    const { data, error } = await query;
    if (error) throw error;
    return data.map(normaliseProduct);
  } catch (err) {
    console.error("[QJ] Supabase fetch error:", err.message);
    return DEFAULT_PRODUCTS;
  }
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

