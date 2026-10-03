// ============================================================
// Quantum Jersey — Shopping Cart State & Business Logic
// ============================================================

const CART_STORAGE_KEY = "qj_cart_v1";

// ─── Cart State Management ───────────────────────────────────

/**
 * Retrieves the current cart array from localStorage.
 * Handles migration or corrupted JSON gracefully.
 */
function getCartItems() {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn("[QJ Cart] Failed to parse cart from storage, resetting:", err);
    return [];
  }
}

/**
 * Saves the cart array to localStorage and broadcasts update event.
 */
function saveCartItems(items) {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  } catch (err) {
    console.error("[QJ Cart] Failed to save cart items:", err);
  }
  dispatchCartUpdated();
}

/**
 * Generate a unique line key distinguishing product ID, selected size, and color.
 */
function generateLineKey(productId, size = "Default", color = "Default") {
  const cleanId = String(productId).trim();
  const cleanSize = String(size || "Default").trim();
  const cleanColor = String(color || "Default").trim();
  return `${cleanId}___${cleanSize}___${cleanColor}`;
}

/**
 * Add a product to the cart.
 * If the exact same product ID + size exists, increments quantity.
 * Recalculates unit price from trusted registry.
 */
function addToCart(productOrId, size = null, quantity = 1, metadata = {}) {
  let product = null;
  let productId = null;

  if (typeof productOrId === "object" && productOrId !== null) {
    product = productOrId;
    productId = product.id;
  } else {
    productId = productOrId;
    if (typeof getProductById === "function") {
      product = getProductById(productId);
    }
  }

  if (!productId) {
    console.error("[QJ Cart] Cannot add product without valid ID.");
    return { success: false, message: "Invalid product." };
  }

  // Determine size
  let selectedSize = size;
  if (!selectedSize) {
    if (product && Array.isArray(product.sizes) && product.sizes.length > 0) {
      selectedSize = product.sizes[0];
    } else {
      selectedSize = "Standard";
    }
  }

  const cleanQty = Math.max(1, parseInt(quantity, 10) || 1);
  const lineKey = generateLineKey(productId, selectedSize, metadata.color || "Default");
  const items = getCartItems();
  const existingIndex = items.findIndex(item => item.lineKey === lineKey);

  // Trusted price extraction
  let trustedPrice = 0;
  if (product && typeof product.price === "number") {
    trustedPrice = product.price;
  } else if (metadata.price && typeof metadata.price === "number") {
    trustedPrice = metadata.price;
  } else if (existingIndex > -1) {
    trustedPrice = items[existingIndex].price;
  }

  const productName = product?.name || metadata.name || "Football Gear";
  const productImage = product?.image || metadata.image || "assets/images/boots_product.webp";
  const productCategory = product?.category || metadata.category || "gear";
  const productSlug = product?.slug || metadata.slug || "";

  if (existingIndex > -1) {
    items[existingIndex].quantity += cleanQty;
    items[existingIndex].price = trustedPrice; // Refresh trusted price
    items[existingIndex].name = productName;
    items[existingIndex].image = productImage;
  } else {
    items.push({
      lineKey,
      id: productId,
      name: productName,
      category: productCategory,
      size: selectedSize,
      color: metadata.color || "Default",
      price: trustedPrice,
      image: productImage,
      slug: productSlug,
      quantity: cleanQty,
      addedAt: Date.now(),
    });
  }

  saveCartItems(items);
  return { success: true, count: getCartTotalCount(), lineKey };
}

/**
 * Updates quantity of a specific cart line item.
 * If newQuantity <= 0, the item is removed.
 */
function updateCartQuantity(lineKey, newQuantity) {
  const qty = parseInt(newQuantity, 10);
  let items = getCartItems();

  if (isNaN(qty) || qty <= 0) {
    items = items.filter(item => item.lineKey !== lineKey);
  } else {
    const item = items.find(i => i.lineKey === lineKey);
    if (item) {
      item.quantity = Math.min(99, qty); // Cap maximum per line
    }
  }

  saveCartItems(items);
}

/**
 * Remove an item completely from the cart.
 */
function removeCartItem(lineKey) {
  const items = getCartItems().filter(item => item.lineKey !== lineKey);
  saveCartItems(items);
}

/**
 * Clear all items from the cart.
 */
function clearCart() {
  saveCartItems([]);
}

/**
 * Total number of units across all cart lines.
 */
function getCartTotalCount() {
  const items = getCartItems();
  return items.reduce((sum, item) => sum + (parseInt(item.quantity, 10) || 0), 0);
}

/**
 * Calculate total subtotal from trusted product prices in registry.
 */
function getCartSubtotal() {
  const items = getCartItems();
  return items.reduce((sum, item) => {
    let trustedPrice = item.price;
    if (typeof getProductById === "function") {
      const live = getProductById(item.id);
      if (live && typeof live.price === "number") {
        trustedPrice = live.price;
      }
    }
    const qty = parseInt(item.quantity, 10) || 0;
    return sum + (trustedPrice * qty);
  }, 0);
}

/**
 * Calculates delivery fee based on state and subtotal.
 * Free delivery in Lagos and Kaduna on orders >= ₦50,000.
 */
function calculateDelivery(stateName, subtotal) {
  if (!stateName) {
    return { fee: 0, isKnown: false, isFreePromo: false, label: "Calculated at confirmation" };
  }

  const s = stateName.trim().toLowerCase();
  const isLagosOrKaduna = s.includes("lagos") || s.includes("kaduna");

  if (isLagosOrKaduna) {
    if (subtotal >= 50000) {
      return { fee: 0, isKnown: true, isFreePromo: true, label: "FREE (Promo: Orders over ₦50,000)" };
    }
    return { fee: 3000, isKnown: true, isFreePromo: false, label: "₦3,000 (Local Dispatch)" };
  }

  // Other Nigerian states (Abuja, Port Harcourt, Kano, etc.)
  return { fee: 4500, isKnown: true, isFreePromo: false, label: "₦4,500 (Nationwide Courier)" };
}

/**
 * Refreshes all cart items against the latest product registry.
 */
function syncCartWithRegistry() {
  if (typeof getProductById !== "function") return;
  const items = getCartItems();
  let modified = false;

  items.forEach(item => {
    const live = getProductById(item.id);
    if (live) {
      if (live.price && live.price !== item.price) {
        item.price = live.price;
        modified = true;
      }
      if (live.name && live.name !== item.name) {
        item.name = live.name;
        modified = true;
      }
      if (live.image && live.image !== item.image) {
        item.image = live.image;
        modified = true;
      }
    }
  });

  if (modified) {
    saveCartItems(items);
  }
}

/**
 * Broadcasts a custom event for any UI component to re-render.
 */
function dispatchCartUpdated() {
  const event = new CustomEvent("qj:cart-updated", {
    detail: {
      count: getCartTotalCount(),
      subtotal: getCartSubtotal(),
      items: getCartItems(),
    }
  });
  window.dispatchEvent(event);
}

// Automatically sync cart prices on load
if (typeof window !== "undefined") {
  window.addEventListener("DOMContentLoaded", () => {
    syncCartWithRegistry();
    dispatchCartUpdated();
  });
}
