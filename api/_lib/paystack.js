// ============================================================
// Quantum Jersey — Paystack Gateway Integration Library
// ============================================================

const crypto = require('crypto');

const PAYSTACK_API_BASE = 'https://api.paystack.co';

/**
 * Retrieves the server-side Paystack Secret Key from environment variables.
 * Throws a sanitized error if not configured.
 */
function getPaystackSecretKey() {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key || typeof key !== 'string' || !key.startsWith('sk_')) {
    throw new Error('PAYSTACK_SECRET_KEY is not configured or invalid on the server.');
  }
  return key.trim();
}

/**
 * Initializes a transaction on Paystack.
 *
 * @param {Object} params
 * @param {string} params.email - Customer email
 * @param {number} params.amount - Total amount in KOBO (integer)
 * @param {string} params.reference - Unique order payment reference
 * @param {string} [params.callback_url] - Redirect URL after payment
 * @param {Object} [params.metadata] - Additional contextual metadata
 * @returns {Promise<{ authorization_url: string, access_code: string, reference: string }>}
 */
async function initializeTransaction({ email, amount, reference, callback_url, metadata = {} }) {
  const secretKey = getPaystackSecretKey();

  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('Amount must be a positive integer in kobo.');
  }

  const payload = {
    email: email.trim(),
    amount,
    reference: reference.trim(),
    currency: 'NGN',
    metadata
  };

  if (callback_url) {
    payload.callback_url = callback_url;
  }

  const res = await fetch(`${PAYSTACK_API_BASE}/transaction/initialize`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok || !body.status) {
    const errorMsg = body.message || `Paystack initialization failed (HTTP ${res.status})`;
    const err = new Error(errorMsg);
    err.status = res.status;
    err.gateway_response = body;
    throw err;
  }

  return {
    authorization_url: body.data.authorization_url,
    access_code: body.data.access_code,
    reference: body.data.reference
  };
}

/**
 * Verifies a transaction reference directly against Paystack.
 *
 * @param {string} reference
 * @returns {Promise<Object>} The verified transaction data
 */
async function verifyTransaction(reference) {
  const secretKey = getPaystackSecretKey();

  if (!reference || typeof reference !== 'string') {
    throw new Error('Transaction reference is required for verification.');
  }

  const res = await fetch(`${PAYSTACK_API_BASE}/transaction/verify/${encodeURIComponent(reference.trim())}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type': 'application/json'
    }
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok || !body.status) {
    const errorMsg = body.message || `Paystack verification request failed (HTTP ${res.status})`;
    const err = new Error(errorMsg);
    err.status = res.status;
    err.gateway_response = body;
    throw err;
  }

  return body.data;
}

/**
 * Validates the Paystack webhook HMAC SHA-512 signature using timing-safe comparison.
 *
 * @param {string|Buffer} rawBody - Exact unmodified request body
 * @param {string} signatureHeader - Value of 'x-paystack-signature'
 * @returns {boolean} True if the signature is authentic
 */
function verifyWebhookSignature(rawBody, signatureHeader) {
  if (!rawBody || !signatureHeader || typeof signatureHeader !== 'string') {
    return false;
  }

  let secretKey;
  try {
    secretKey = getPaystackSecretKey();
  } catch (_) {
    return false;
  }

  const computedHash = crypto
    .createHmac('sha512', secretKey)
    .update(rawBody)
    .digest('hex');

  const signatureBuffer = Buffer.from(signatureHeader.trim(), 'hex');
  const computedBuffer = Buffer.from(computedHash, 'hex');

  if (signatureBuffer.length !== computedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(signatureBuffer, computedBuffer);
}

module.exports = {
  initializeTransaction,
  verifyTransaction,
  verifyWebhookSignature,
  getPaystackSecretKey
};
