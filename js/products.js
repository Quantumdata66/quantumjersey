// ============================================================
// Quantum Jersey — Product Data Store (Supabase + Static Fallback)
// ============================================================

const WHATSAPP_NUMBER = "2348116154796";

// ─── Static Fallback Products ────────────────────────────────
// Displayed when Supabase is not yet configured.
// All new products are managed exclusively through the Admin Panel.

const DEFAULT_PRODUCTS = [
  // ── FOOTBALL BOOTS ─────────────────────────────────────────
  {
    id: "boots-001",
    name: "Phantom Strike Pro",
    category: "boots",
    price: 65000,
    sizes: ["39", "40", "41", "42", "43", "44", "45"],
    description: "Elite-level football boots with dynamic fit collar, thin-skin upper for superior ball control, and bladed stud configuration for explosive acceleration on firm ground.",
    image: "assets/images/boots_product.webp",
    badge: "Bestseller",
    featured: true,
    inStock: true
  },
  {
    id: "boots-002",
    name: "Predator Elite FG",
    category: "boots",
    price: 78000,
    sizes: ["39", "40", "41", "42", "43", "44"],
    description: "Control-freak football boots featuring CONTROLSKIN upper with advanced grip zones. Precision zone element placement for total ball mastery in every touch.",
    image: "assets/images/boots_product.webp",
    badge: "New Arrival",
    featured: false,
    inStock: true
  },
  {
    id: "boots-003",
    name: "Mercurial Vapor XV",
    category: "boots",
    price: 85000,
    sizes: ["40", "41", "42", "43", "44", "45"],
    description: "Speed-engineered football boots with Flyknit upper for a second-skin fit. Lightweight NikeSkin coating and split outsole deliver explosive pace and directional changes.",
    image: "assets/images/boots_product.webp",
    badge: "Premium",
    featured: false,
    inStock: true
  },
  {
    id: "boots-004",
    name: "Copa Mundial Classic",
    category: "boots",
    price: 45000,
    sizes: ["39", "40", "41", "42", "43", "44", "45", "46"],
    description: "Timeless kangaroo leather football boots with anatomical last for superior comfort. The choice of legends — built for the player who values touch and tradition.",
    image: "assets/images/boots_product.webp",
    badge: null,
    featured: false,
    inStock: true
  },

  // ── JERSEYS ────────────────────────────────────────────────
  {
    id: "jersey-001",
    name: "Nigeria Home Jersey 2024",
    category: "jerseys",
    price: 28000,
    sizes: ["S", "M", "L", "XL", "XXL"],
    description: "The official Nigeria Super Eagles home jersey. Iconic green and white design with modern adidas Aeroready technology. Represent the Eagles in style.",
    image: "assets/images/jersey_nigeria.webp",
    badge: "🦅 Super Eagles",
    featured: true,
    inStock: true
  },
  {
    id: "jersey-002",
    name: "Nigeria Away Jersey 2024",
    category: "jerseys",
    price: 28000,
    sizes: ["S", "M", "L", "XL", "XXL"],
    description: "Nigeria Super Eagles away kit in striking white and green. Premium Aeroready moisture-wicking fabric keeps you cool as you cheer the Eagles to glory.",
    image: "assets/images/jersey_nigeria.webp",
    badge: "🦅 Super Eagles",
    featured: false,
    inStock: true
  },
  {
    id: "jersey-003",
    name: "Man City 24/25 Home",
    category: "jerseys",
    price: 32000,
    sizes: ["S", "M", "L", "XL", "XXL"],
    description: "Manchester City 2024/25 home jersey in sky blue. Official Puma club replica with embroidered badge. Show your City pride with this premium fan jersey.",
    image: "assets/images/jersey_club.webp",
    badge: "New Arrival",
    featured: false,
    inStock: true
  },
  {
    id: "jersey-004",
    name: "Real Madrid 24/25 Home",
    category: "jerseys",
    price: 35000,
    sizes: ["S", "M", "L", "XL", "XXL"],
    description: "Real Madrid 2024/25 home jersey in classic white. Adidas Aeroready technology with embroidered club crest. Wear the jersey of the greatest club in history.",
    image: "assets/images/jersey_club.webp",
    badge: "Bestseller",
    featured: true,
    inStock: true
  },
  {
    id: "jersey-005",
    name: "Arsenal 24/25 Home",
    category: "jerseys",
    price: 30000,
    sizes: ["S", "M", "L", "XL", "XXL"],
    description: "Arsenal 2024/25 home jersey in iconic red. Adidas premium replica with modern fit and breathable fabric. Perfect for the Gooners faithful.",
    image: "assets/images/jersey_club.webp",
    badge: null,
    featured: false,
    inStock: true
  },
  {
    id: "jersey-006",
    name: "Chelsea 24/25 Home",
    category: "jerseys",
    price: 30000,
    sizes: ["S", "M", "L", "XL", "XXL"],
    description: "Chelsea 2024/25 home jersey in royal blue. Nike Dri-FIT technology with embroidered lion crest. Fly the Blue Flag in premium style.",
    image: "assets/images/jersey_club.webp",
    badge: null,
    featured: false,
    inStock: true
  },

  // ── SPORTSWEAR ─────────────────────────────────────────────
  {
    id: "sport-001",
    name: "Pro Training Joggers",
    category: "sportswear",
    price: 18000,
    sizes: ["S", "M", "L", "XL", "XXL"],
    description: "High-performance training joggers with tapered fit, moisture-wicking fabric, and zip pockets. Built for the serious athlete — train harder, recover faster.",
    image: "assets/images/sportswear_product.webp",
    badge: "Bestseller",
    featured: true,
    inStock: true
  },
  {
    id: "sport-002",
    name: "Elite Training Top",
    category: "sportswear",
    price: 15000,
    sizes: ["S", "M", "L", "XL", "XXL"],
    description: "Lightweight athletic training top with UV protection and mesh ventilation panels. 4-way stretch fabric moves with your body for unrestricted performance.",
    image: "assets/images/sportswear_product.webp",
    badge: "New Arrival",
    featured: false,
    inStock: true
  },
  {
    id: "sport-003",
    name: "Compression Shorts",
    category: "sportswear",
    price: 12000,
    sizes: ["S", "M", "L", "XL", "XXL"],
    description: "Pro-grade compression shorts with muscle support technology. Reduces fatigue and improves blood circulation during intense training sessions and match days.",
    image: "assets/images/sportswear_product.webp",
    badge: null,
    featured: false,
    inStock: true
  },
  {
    id: "sport-004",
    name: "Sports Training Hoodie",
    category: "sportswear",
    price: 22000,
    sizes: ["S", "M", "L", "XL", "XXL"],
    description: "Premium heavyweight training hoodie with fleece lining, kangaroo pocket, and ribbed cuffs. Perfect for warm-up, cool-down, and everyday athletic lifestyle.",
    image: "assets/images/sportswear_product.webp",
    badge: "Premium",
    featured: false,
    inStock: true
  }
];

// ─── Stable Product Registry (eliminates cache desync across multi-grid/search renders) ───
const _productRegistry = new Map();

/**
 * Register a single product or array of products into the permanent lookup registry.
 * Normalizes description text and parses embedded version metadata.
 */
function registerProducts(products) {
  if (!products) return;
  const list = Array.isArray(products) ? products : [products];
  list.forEach(p => {
    if (p && p.id) {
      if (p.description) {
        const verInfo = parseProductVersions(p.description);
        if (verInfo.isVersioned) {
          p.versions = verInfo.versions;
        } else if (!p.versions) {
          p.versions = null;
        }
        p.isVersionCorrupt = verInfo.isCorrupt;
        p.description = cleanProductDescription(p.description);
      }
      _productRegistry.set(p.id, p);
    }
  });
}

// Pre-populate registry with default static products
registerProducts(DEFAULT_PRODUCTS);

/**
 * Retrieve a product by ID from the permanent registry (with fallback to DEFAULT_PRODUCTS).
 */
function getProductById(id) {
  if (!id) return null;
  if (_productRegistry.has(id)) {
    return _productRegistry.get(id);
  }
  const fallback = DEFAULT_PRODUCTS.find(p => p.id === id);
  if (fallback) {
    registerProducts([fallback]);
    return _productRegistry.get(fallback.id);
  }
  return null;
}

// ─── Synchronous fallback (backwards compatibility) ─────────
function getProductsSync() {
  return Array.from(_productRegistry.values());
}

// ─── Utility ─────────────────────────────────────────────────

function formatPrice(price) {
  if (typeof price !== "number") price = parseInt(price, 10) || 0;
  return "₦" + price.toLocaleString("en-NG");
}

/**
 * Returns full absolute or canonical product link for WhatsApp messages and sharing.
 */
function buildProductUrl(productId) {
  if (typeof window !== "undefined" && window.location) {
    const origin = window.location.origin;
    return `${origin}/product.html?id=${encodeURIComponent(productId)}`;
  }
  return `https://quantumjersey.vercel.app/product.html?id=${encodeURIComponent(productId)}`;
}

/**
 * Builds single-item WhatsApp link for fast quick-ordering from cards or detail page.
 */
function buildWhatsAppLink(product, size, version = null) {
  if (!product) return `https://wa.me/${WHATSAPP_NUMBER}`;

  const productName = product.name || product.product_name || "Football Gear";
  let productPrice = typeof product.price === "number" ? product.price : (parseInt(product.price, 10) || 0);

  if (version && product.versions) {
    const vKey = normalizeVersionKey(version);
    if (vKey && product.versions[vKey]) {
      productPrice = product.versions[vKey].price;
    }
  }

  const prodUrl = buildProductUrl(product.id);
  const versionLine = version ? `👕 Edition: *${version}*\n` : "";
  const sizeLine = size ? `📏 Size: *${size}*\n` : "";

  const msg = encodeURIComponent(
    `Hello Quantum Jersey! 👋\n\nI'd like to order:\n\n` +
    `🛍️ *${productName}*\n` +
    versionLine +
    sizeLine +
    `💰 Price: *${formatPrice(productPrice)}*\n` +
    `🔗 Product Link: ${prodUrl}\n` +
    `📍 Delivery Location: [Enter State/City, e.g. Lagos, Kaduna]\n\n` +
    `Please confirm availability and delivery details. Thank you!`
  );
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`;
}

/**
 * Builds a complete, readable multi-item WhatsApp message for cart checkout.
 * Accurately shows item details, versions, sizes, quantities, subtotals, and delivery estimates.
 */
function buildMultiItemWhatsAppMessage(orderData, items) {
  const orderRef = orderData.order_ref || "QJ-ORDER";
  const customerName = orderData.customer_name || "Customer";
  const customerPhone = orderData.customer_phone || "";
  const address = orderData.delivery_address || "";
  const cityState = `${orderData.delivery_city || ""}, ${orderData.delivery_state || ""}`.trim().replace(/^,\s*|,\s*$/g, "");
  const notes = orderData.delivery_notes ? `• Notes: ${orderData.delivery_notes}\n` : "";

  let itemsText = "";
  (items || []).forEach((item, index) => {
    const itemSubtotal = (item.price || 0) * (item.quantity || 1);
    const link = buildProductUrl(item.id);
    const versionPart = item.version ? `   • Edition: *${item.version}*\n` : "";
    const sizePart = item.size ? `   • Size: *${item.size}*` : "";
    const colorPart = (item.color && item.color !== "Default") ? (sizePart ? ` | Color: ${item.color}` : `   • Color: ${item.color}`) : "";
    const variantLine = (sizePart || colorPart) ? `${sizePart}${colorPart}\n` : "";

    itemsText += `\n${index + 1}. *${item.name}*\n` +
                 versionPart +
                 variantLine +
                 `   • Qty: ${item.quantity} × ${formatPrice(item.price)} = *${formatPrice(itemSubtotal)}*\n` +
                 `   • Link: ${link}\n`;
  });

  const deliveryFee = typeof orderData.delivery_fee === "number" ? orderData.delivery_fee : 5000;
  const deliveryFeeLabel = `${formatPrice(deliveryFee)} (Standard Nationwide)`;

  const fullMessage =
    `⚡ *NEW ORDER — Quantum Jersey*\n` +
    `📋 *Order Ref:* ${orderRef}\n` +
    `⏳ *Status:* Awaiting Confirmation\n\n` +
    `👤 *Customer Details:*\n` +
    `• Name: ${customerName}\n` +
    `• Phone: ${customerPhone}\n` +
    `• Address: ${address}\n` +
    `• Location: ${cityState || "Nigeria"}\n` +
    notes +
    `\n🛍️ *Order Items (${(items || []).length} items):*` +
    itemsText +
    `\n💰 *Financial Summary:*\n` +
    `• Items Subtotal: *${formatPrice(orderData.subtotal)}*\n` +
    `• Standard Delivery: *${deliveryFeeLabel}*\n` +
    `• *Estimated Total: ${formatPrice(orderData.total_amount)}*\n\n` +
    `_Note: Standard nationwide delivery is ₦5,000. For remote locations, any courier waybill surcharge will be confirmed with you before dispatch._`;

  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(fullMessage)}`;
}

// ─── Jersey Versions Helper Functions ─────────────────────────

const VERSION_METADATA_REGEX = /(?:\r?\n\r?\n)?<!--QJ_VERSIONS:([\s\S]*?)-->/;

/**
 * Normalizes a user- or client-supplied version string into 'fan' or 'player'.
 */
function normalizeVersionKey(versionStr) {
  if (!versionStr || typeof versionStr !== "string") return null;
  const clean = versionStr.trim().toLowerCase();
  if (clean === "fan" || clean === "fan version" || clean === "fan_version") return "fan";
  if (clean === "player" || clean === "player version" || clean === "player_version") return "player";
  return null;
}

/**
 * Parses and validates version configuration from a product object or raw description.
 *
 * @param {Object|string} productOrRaw
 * @returns {{ isVersioned: boolean, versions: Object|null, isCorrupt: boolean, error?: string }}
 */
function parseProductVersions(productOrRaw) {
  if (!productOrRaw) {
    return { isVersioned: false, versions: null, isCorrupt: false };
  }

  // If already an object with validated versions property
  if (typeof productOrRaw === "object" && productOrRaw !== null) {
    if (productOrRaw.isVersionCorrupt) {
      return { isVersioned: false, versions: null, isCorrupt: true, error: "Product has corrupt version metadata." };
    }
    if (productOrRaw.versions && typeof productOrRaw.versions === "object") {
      const v = productOrRaw.versions;
      const fanValid = v.fan && typeof v.fan === "object" && parseInt(v.fan.price, 10) > 0 && Array.isArray(v.fan.sizes) && v.fan.sizes.length > 0;
      const playerValid = v.player && typeof v.player === "object" && parseInt(v.player.price, 10) > 0 && Array.isArray(v.player.sizes) && v.player.sizes.length > 0;
      if (fanValid || playerValid) {
        return { isVersioned: true, versions: v, isCorrupt: false };
      }
    }
    productOrRaw = productOrRaw.description || "";
  }

  if (typeof productOrRaw !== "string") {
    return { isVersioned: false, versions: null, isCorrupt: false };
  }

  // Reject ambiguous duplicate or unclosed metadata markers
  const markerCount = (productOrRaw.match(/<!--QJ_VERSIONS:/g) || []).length;
  if (markerCount > 1) {
    return { isVersioned: false, versions: null, isCorrupt: true, error: "Ambiguous duplicate version metadata markers detected." };
  }

  const match = productOrRaw.match(VERSION_METADATA_REGEX);
  if (!match) {
    if (markerCount === 1) {
      return { isVersioned: false, versions: null, isCorrupt: true, error: "Malformed or unclosed version metadata marker." };
    }
    return { isVersioned: false, versions: null, isCorrupt: false };
  }

  try {
    const parsed = JSON.parse(match[1]);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { isVersioned: false, versions: null, isCorrupt: true, error: "Invalid versions metadata payload." };
    }

    const validated = {};
    if (parsed.fan) {
      const price = parseInt(parsed.fan.price, 10);
      const sizes = Array.isArray(parsed.fan.sizes)
        ? parsed.fan.sizes.map(s => String(s).trim()).filter(Boolean)
        : [];
      if (isNaN(price) || price <= 0 || sizes.length === 0) {
        return { isVersioned: false, versions: null, isCorrupt: true, error: "Invalid Fan Version configuration." };
      }
      validated.fan = {
        label: parsed.fan.label || "Fan Version",
        price,
        sizes
      };
    }

    if (parsed.player) {
      const price = parseInt(parsed.player.price, 10);
      const sizes = Array.isArray(parsed.player.sizes)
        ? parsed.player.sizes.map(s => String(s).trim()).filter(Boolean)
        : [];
      if (isNaN(price) || price <= 0 || sizes.length === 0) {
        return { isVersioned: false, versions: null, isCorrupt: true, error: "Invalid Player Version configuration." };
      }
      validated.player = {
        label: parsed.player.label || "Player Version",
        price,
        sizes
      };
    }

    if (validated.fan || validated.player) {
      return { isVersioned: true, versions: validated, isCorrupt: false };
    }

    return { isVersioned: false, versions: null, isCorrupt: true, error: "Empty versions definition." };
  } catch (err) {
    return { isVersioned: false, versions: null, isCorrupt: true, error: err.message };
  }
}

/**
 * Strips any embedded version metadata comments from product description.
 * Always returns clean, user-facing marketing copy.
 */
function cleanProductDescription(description) {
  if (!description || typeof description !== "string") return "";
  return description
    .replace(/(?:\r?\n\r?\n)?<!--QJ_VERSIONS:[\s\S]*?-->/g, "")
    .replace(/(?:\r?\n\r?\n)?<!--QJ_VERSIONS:[\s\S]*$/g, "")
    .trim();
}

/**
 * Formats clean marketing text and appends the validated version metadata comment.
 */
function formatProductDescription(cleanDescription, versions) {
  const baseDesc = cleanProductDescription(cleanDescription || "");
  if (!versions || typeof versions !== "object") {
    return baseDesc;
  }

  const payload = {};
  if (versions.fan && parseInt(versions.fan.price, 10) > 0 && Array.isArray(versions.fan.sizes) && versions.fan.sizes.length > 0) {
    payload.fan = {
      label: versions.fan.label || "Fan Version",
      price: parseInt(versions.fan.price, 10),
      sizes: versions.fan.sizes.map(s => String(s).trim()).filter(Boolean)
    };
  }
  if (versions.player && parseInt(versions.player.price, 10) > 0 && Array.isArray(versions.player.sizes) && versions.player.sizes.length > 0) {
    payload.player = {
      label: versions.player.label || "Player Version",
      price: parseInt(versions.player.price, 10),
      sizes: versions.player.sizes.map(s => String(s).trim()).filter(Boolean)
    };
  }

  if (Object.keys(payload).length === 0) {
    return baseDesc;
  }

  const json = JSON.stringify(payload);
  return baseDesc ? `${baseDesc}\n\n<!--QJ_VERSIONS:${json}-->` : `<!--QJ_VERSIONS:${json}-->`;
}

// ─── Node.js CommonJS Exports (for automated testing) ───────
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    DEFAULT_PRODUCTS,
    registerProducts,
    getProductById,
    getProductsSync,
    formatPrice,
    buildProductUrl,
    buildWhatsAppLink,
    buildMultiItemWhatsAppMessage,
    parseProductVersions,
    cleanProductDescription,
    formatProductDescription,
    normalizeVersionKey,
    WHATSAPP_NUMBER
  };
}
