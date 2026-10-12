// ============================================================
// Quantum Jersey — POST /api/paystack/initialize
// Server-side Payment & Order Initialization Endpoint
// ============================================================

const crypto = require('crypto');
const { validateCustomer, validateItems, resolveTrustedCallbackUrl, validateRequestOrigin } = require('../_lib/validator');
const { getProductsByIds, createOrderAndAttempt, cancelOrderAndAttempt } = require('../_lib/supabase');
const { initializeTransaction } = require('../_lib/paystack');

const STANDARD_DELIVERY_FEE = 5000; // Flat ₦5,000 nationwide
const MAX_ITEM_QUANTITY = 50;

/**
 * Generate an unpredictable, collision-resistant order reference (e.g. QJ-178234-A7BC)
 */
function generateOrderRef() {
  const ts = Date.now().toString().slice(-6);
  const rand = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `QJ-${ts}-${rand}`;
}

/**
 * Generate a cryptographically strong, unique Paystack payment reference.
 */
function generatePaymentReference() {
  const ts = Date.now();
  const rand = crypto.randomBytes(8).toString('hex').toUpperCase();
  return `QJ-PAY-${ts}-${rand}`;
}

/**
 * Normalizes and consolidates duplicate cart items by (id, size).
 * Enforces maximum aggregate quantity per line item.
 */
function consolidateCartItems(items) {
  const map = new Map();

  for (const item of items) {
    const key = `${item.id}___${item.size}`;
    if (map.has(key)) {
      const existing = map.get(key);
      const combinedQty = existing.quantity + item.quantity;
      if (combinedQty > MAX_ITEM_QUANTITY) {
        throw new Error(`Combined quantity for item "${item.id}" (size: ${item.size}) exceeds limit of ${MAX_ITEM_QUANTITY}.`);
      }
      existing.quantity = combinedQty;
    } else {
      map.set(key, { ...item });
    }
  }

  return Array.from(map.values());
}

module.exports = async function handler(req, res) {
  // 1. Method check: POST only
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({
      success: false,
      error: 'Method Not Allowed. Only POST requests are accepted.'
    });
  }

  // 1.1. Incoming Request Origin check (browser-initiated CORS origin validation)
  const originCheck = validateRequestOrigin(req);
  if (!originCheck.valid) {
    return res.status(403).json({
      success: false,
      error: `Forbidden: Request Origin rejected (${originCheck.error})`
    });
  }

  let createdOrder = null;
  let createdAttempt = null;

  try {
    // 2. Parse and validate JSON request body
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    // 3. Validate customer information
    const customerValidation = validateCustomer(body.customer);
    if (!customerValidation.valid) {
      return res.status(400).json({
        success: false,
        error: customerValidation.error
      });
    }
    const customer = customerValidation.data;

    // 4. Validate items array structure
    const itemsValidation = validateItems(body.items);
    if (!itemsValidation.valid) {
      return res.status(400).json({
        success: false,
        error: itemsValidation.error
      });
    }

    // 4.1. Validate and resolve trusted callback URL early (fail closed before DB mutation)
    const callbackResult = resolveTrustedCallbackUrl(body.callback_url || body.return_path);
    if (!callbackResult.valid) {
      return res.status(400).json({
        success: false,
        error: callbackResult.error || 'Invalid callback URL.'
      });
    }
    const trustedCallbackUrl = callbackResult.callbackUrl;

    // 5. Consolidate duplicate cart lines by (id, size)
    let requestedItems;
    try {
      requestedItems = consolidateCartItems(itemsValidation.data);
    } catch (normErr) {
      return res.status(400).json({
        success: false,
        error: normErr.message
      });
    }

    // 6. Fetch trusted product data directly from database
    const productIds = requestedItems.map(item => item.id);
    const dbProducts = await getProductsByIds(productIds);
    const productMap = new Map(dbProducts.map(p => [p.id, p]));

    // 7. Recalculate trusted prices, variants, and stock server-side
    let calculatedSubtotal = 0;
    const verifiedOrderItems = [];

    for (const reqItem of requestedItems) {
      const dbProduct = productMap.get(reqItem.id);

      if (!dbProduct) {
        return res.status(400).json({
          success: false,
          error: `Product with ID "${reqItem.id}" not found or no longer available.`
        });
      }

      // Check stock status
      if (dbProduct.in_stock === false) {
        return res.status(400).json({
          success: false,
          error: `Product "${dbProduct.product_name}" is currently out of stock.`
        });
      }

      // Validate size variant against database record
      if (Array.isArray(dbProduct.sizes) && dbProduct.sizes.length > 0) {
        if (!dbProduct.sizes.includes(reqItem.size)) {
          return res.status(400).json({
            success: false,
            error: `Invalid size "${reqItem.size}" for product "${dbProduct.product_name}". Permitted sizes: ${dbProduct.sizes.join(', ')}`
          });
        }
      }

      const unitPrice = parseInt(dbProduct.price, 10);
      if (isNaN(unitPrice) || unitPrice < 0) {
        return res.status(500).json({
          success: false,
          error: 'Authoritative product price is invalid.'
        });
      }

      const lineSubtotal = unitPrice * reqItem.quantity;
      calculatedSubtotal += lineSubtotal;

      verifiedOrderItems.push({
        id: dbProduct.id,
        name: dbProduct.product_name,
        category: dbProduct.category,
        size: reqItem.size,
        quantity: reqItem.quantity,
        price: unitPrice,
        line_subtotal: lineSubtotal,
        image: dbProduct.image_url
      });
    }

    // 8. Calculate final totals (Standard flat delivery fee charged once per order)
    const deliveryFee = STANDARD_DELIVERY_FEE;
    const totalAmountNaira = calculatedSubtotal + deliveryFee;
    const amountKobo = totalAmountNaira * 100; // Paystack requires kobo

    // 9. Generate unique order reference and payment reference
    const orderRef = generateOrderRef();
    const paystackRef = generatePaymentReference();

    // 10. Prepare Order record for public.orders schema
    const orderPayload = {
      order_ref: orderRef,
      customer_name: customer.name,
      customer_email: customer.email,
      customer_phone: customer.phone,
      delivery_state: customer.delivery_state,
      delivery_city: customer.delivery_city,
      delivery_address: customer.delivery_address,
      delivery_notes: customer.delivery_notes,
      items: verifiedOrderItems,
      subtotal: calculatedSubtotal,
      delivery_fee: deliveryFee,
      total_amount: totalAmountNaira,
      status: 'awaiting_confirmation',
      payment_status: 'unpaid',
      payment_method: 'paystack',
      currency: 'NGN',
      paystack_reference: paystackRef,
      payment_metadata: {
        channel: 'paystack_inline',
        initialized_at: new Date().toISOString()
      }
    };

    // 11. Prepare Payment Attempt record for public.payment_attempts schema
    const attemptPayload = {
      reference: paystackRef,
      amount: amountKobo,
      currency: 'NGN',
      status: 'initiated',
      metadata: {
        order_ref: orderRef,
        item_count: verifiedOrderItems.length,
        subtotal: calculatedSubtotal,
        delivery_fee: deliveryFee
      }
    };

    // 12. Create order and payment attempt in database
    const dbResult = await createOrderAndAttempt(orderPayload, attemptPayload);
    createdOrder = dbResult.order;
    createdAttempt = dbResult.attempt;

    // 13. Initialize transaction with Paystack Gateway using trusted callback URL
    let paystackInit;

    try {
      paystackInit = await initializeTransaction({
        email: customer.email,
        amount: amountKobo,
        reference: paystackRef,
        callback_url: trustedCallbackUrl,
        metadata: {
          order_id: createdOrder.id,
          order_ref: orderRef,
          customer_name: customer.name
        }
      });
    } catch (gatewayErr) {
      const isDefiniteRejection = gatewayErr.status >= 400 && gatewayErr.status < 500;

      if (isDefiniteRejection) {
        // Gateway rejected with 4xx: Definitely no transaction created on Paystack.
        // Clean up database records immediately to avoid orphan pending records.
        await cancelOrderAndAttempt(
          createdOrder.id,
          createdAttempt.id,
          gatewayErr.message || 'Paystack rejected initialization'
        );
      } else {
        // Ambiguous outcome (5xx server error, timeout, socket hangup):
        // Paystack might have processed the request before dropping connection.
        // Keep order in 'unpaid' and attempt in 'initiated' with audit flag,
        // so any subsequent webhook or verify call can reconcile it without orphan loss.
        console.warn('[API /paystack/initialize] Ambiguous gateway error; order preserved for reconciliation:', {
          reference: paystackRef,
          orderRef,
          status: gatewayErr.status || 'TIMEOUT'
        });
      }

      throw gatewayErr;
    }

    // 14. Return only safe, necessary details to the client
    return res.status(200).json({
      success: true,
      authorization_url: paystackInit.authorization_url,
      access_code: paystackInit.access_code,
      reference: paystackRef,
      order_ref: orderRef,
      total_amount: totalAmountNaira,
      currency: 'NGN'
    });

  } catch (err) {
    console.error('[API /paystack/initialize] Error:', {
      name: err.name,
      message: err.message,
      status: err.status || 500
    });

    const clientStatusCode = err.status >= 400 && err.status < 600 ? err.status : 500;
    const clientErrorMessage = err.status >= 400 && err.status < 500
      ? (err.message || 'Initialization request rejected by payment gateway.')
      : 'An error occurred while initializing payment. Please try again.';

    return res.status(clientStatusCode).json({
      success: false,
      error: clientErrorMessage
    });
  }
};
