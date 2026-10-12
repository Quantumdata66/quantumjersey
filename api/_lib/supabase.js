// ============================================================
// Quantum Jersey — Serverless Supabase Service Client
// ============================================================

/**
 * Validates and retrieves the Supabase URL and Service Role Key.
 * Throws a sanitized error if not configured.
 */
function getSupabaseCredentials() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || typeof url !== 'string' || !url.startsWith('https://')) {
    throw new Error('SUPABASE_URL is not configured or invalid on the server.');
  }

  if (!serviceKey || typeof serviceKey !== 'string') {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured on the server.');
  }

  return {
    url: url.trim().replace(/\/+$/, ''),
    serviceKey: serviceKey.trim()
  };
}

/**
 * Helper to execute Supabase REST requests using the Service Role Key.
 */
async function supabaseRequest(endpoint, { method = 'GET', body = null, headers = {} } = {}) {
  const { url, serviceKey } = getSupabaseCredentials();

  const reqHeaders = {
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    ...headers
  };

  const options = {
    method,
    headers: reqHeaders
  };

  if (body !== null) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(`${url}/rest/v1${endpoint}`, options);

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    const err = new Error(`Supabase request failed: HTTP ${res.status}`);
    err.status = res.status;
    err.details = errorText;
    throw err;
  }

  // Handle 204 No Content
  if (res.status === 204) {
    return null;
  }

  return await res.json();
}

/**
 * Helper to execute Supabase RPC (Remote Procedure Call) functions.
 */
async function supabaseRpc(rpcName, params = {}) {
  const { url, serviceKey } = getSupabaseCredentials();

  const res = await fetch(`${url}/rest/v1/rpc/${rpcName}`, {
    method: 'POST',
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(params)
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    const err = new Error(`Supabase RPC ${rpcName} failed: HTTP ${res.status}`);
    err.status = res.status;
    err.details = errorText;
    throw err;
  }

  return await res.json();
}

/**
 * Fetches products by an array of IDs using trusted database catalog.
 *
 * @param {string[]} ids
 * @returns {Promise<Array<Object>>}
 */
async function getProductsByIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return [];
  }

  // Filter and sanitize IDs
  const cleanIds = ids.map(id => String(id).trim()).filter(Boolean);
  const filter = `in.(${cleanIds.map(encodeURIComponent).join(',')})`;
  const endpoint = `/products?id=${filter}&select=id,product_name,category,price,sizes,image_url,in_stock`;

  const products = await supabaseRequest(endpoint);
  return Array.isArray(products) ? products : [];
}

/**
 * Atomically creates an order record and associated payment attempt record.
 *
 * @param {Object} orderData
 * @param {Object} attemptData
 * @returns {Promise<{ order: Object, attempt: Object }>}
 */
async function createOrderAndAttempt(orderData, attemptData) {
  // 1. Insert Order
  const orders = await supabaseRequest('/orders', {
    method: 'POST',
    headers: { 'Prefer': 'return=representation' },
    body: orderData
  });

  if (!Array.isArray(orders) || orders.length === 0) {
    throw new Error('Failed to create order record in database.');
  }

  const createdOrder = orders[0];

  // 2. Insert Payment Attempt with foreign key to createdOrder.id
  try {
    const attemptPayload = {
      ...attemptData,
      order_id: createdOrder.id
    };

    const attempts = await supabaseRequest('/payment_attempts', {
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: attemptPayload
    });

    if (!Array.isArray(attempts) || attempts.length === 0) {
      throw new Error('Failed to create payment_attempt record in database.');
    }

    return {
      order: createdOrder,
      attempt: attempts[0]
    };
  } catch (err) {
    // Fail-safe cleanup: Mark the order as failed/cancelled if attempt creation fails
    await supabaseRequest(`/orders?id=eq.${createdOrder.id}`, {
      method: 'PATCH',
      body: {
        status: 'cancelled',
        payment_status: 'failed',
        updated_at: new Date().toISOString()
      }
    }).catch(() => {});

    throw err;
  }
}

/**
 * Cancels or marks an order and attempt as failed following definite initialization rejection.
 */
async function cancelOrderAndAttempt(orderId, attemptId, reason = 'Initialization failed') {
  const now = new Date().toISOString();

  if (attemptId) {
    await supabaseRequest(`/payment_attempts?id=eq.${attemptId}`, {
      method: 'PATCH',
      body: {
        status: 'failed',
        gateway_response: reason,
        updated_at: now
      }
    }).catch(() => {});
  }

  if (orderId) {
    await supabaseRequest(`/orders?id=eq.${orderId}`, {
      method: 'PATCH',
      body: {
        status: 'cancelled',
        payment_status: 'failed',
        updated_at: now
      }
    }).catch(() => {});
  }
}

/**
 * Fetches a payment attempt and its associated order by transaction reference.
 *
 * @param {string} reference
 * @returns {Promise<{ attempt: Object|null, order: Object|null }>}
 */
async function getAttemptByReference(reference) {
  if (!reference || typeof reference !== 'string') {
    return { attempt: null, order: null };
  }

  const endpoint = `/payment_attempts?reference=eq.${encodeURIComponent(reference.trim())}&select=*,orders(*)`;
  const records = await supabaseRequest(endpoint);

  if (!Array.isArray(records) || records.length === 0) {
    return { attempt: null, order: null };
  }

  const attempt = records[0];
  const order = attempt.orders || null;

  return { attempt, order };
}

/**
 * Atomically settles a successful payment using the PostgreSQL settle_paystack_payment RPC.
 * Acquires row locks (FOR UPDATE), validates amounts/currencies, prevents terminal state
 * regression, and completes updates in a single database transaction.
 *
 * @param {Object} params
 * @param {string} params.reference - Unique Paystack reference
 * @param {number} params.amountKobo - Verified amount in kobo
 * @param {string} [params.currency] - Expected currency ('NGN')
 * @param {number|string} [params.paystackId] - Paystack gateway ID
 * @param {string} [params.channel] - Payment channel (card, bank, etc.)
 * @param {string} [params.gatewayResponse] - Gateway response message
 * @param {string} [params.paidAt] - ISO timestamp of payment
 * @param {Object} [params.metadata] - Audit metadata
 * @returns {Promise<Object>} RPC result object with { success, code, status, order_ref, reference }
 */
async function settlePaymentSuccessAtomic({
  reference,
  amountKobo,
  currency = 'NGN',
  paystackId = null,
  channel = null,
  gatewayResponse = 'Successful',
  paidAt = null,
  metadata = {}
}) {
  return await supabaseRpc('settle_paystack_payment', {
    p_reference: reference.trim(),
    p_expected_amount_kobo: parseInt(amountKobo, 10),
    p_expected_currency: currency,
    p_paystack_id: paystackId ? parseInt(paystackId, 10) : null,
    p_channel: channel || null,
    p_gateway_response: gatewayResponse || 'Successful',
    p_paid_at: paidAt || new Date().toISOString(),
    p_metadata: metadata
  });
}

/**
 * Atomically marks a payment as failed using the fail_paystack_payment RPC.
 * Prevents demoting already paid or terminal orders.
 *
 * @param {Object} params
 * @param {string} params.reference - Unique Paystack reference
 * @param {string} [params.gatewayResponse] - Gateway decline reason
 * @param {boolean} [params.isAbandoned] - Whether user abandoned transaction
 * @param {Object} [params.metadata] - Audit metadata
 * @returns {Promise<Object>} RPC result object
 */
async function settlePaymentFailureAtomic({
  reference,
  gatewayResponse = 'Transaction failed',
  isAbandoned = false,
  metadata = {}
}) {
  return await supabaseRpc('fail_paystack_payment', {
    p_reference: reference.trim(),
    p_gateway_response: gatewayResponse,
    p_is_abandoned: isAbandoned,
    p_metadata: metadata
  });
}

module.exports = {
  getProductsByIds,
  createOrderAndAttempt,
  cancelOrderAndAttempt,
  getAttemptByReference,
  settlePaymentSuccessAtomic,
  settlePaymentFailureAtomic,
  supabaseRpc,
  getSupabaseCredentials
};
