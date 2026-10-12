// ============================================================
// Quantum Jersey — POST /api/paystack/webhook
// Secure Asynchronous Paystack Webhook Handler
// ============================================================

const { verifyWebhookSignature } = require('../_lib/paystack');
const { getAttemptByReference, settlePaymentSuccessAtomic } = require('../_lib/supabase');

const MAX_WEBHOOK_BYTES = 1024 * 1024; // 1 MiB (1,048,576 bytes)

/**
 * Safely reads the exact raw request body from Node.js stream.
 * Enforces a strict 1 MiB upper bound and halts stream consumption if exceeded.
 */
async function getRawBody(req) {
  // 1. Explicit rawBody property (e.g. test harnesses or custom raw-body middleware)
  if (req.rawBody) {
    const str = typeof req.rawBody === 'string' ? req.rawBody : req.rawBody.toString('utf8');
    if (Buffer.byteLength(str) > MAX_WEBHOOK_BYTES) {
      const err = new Error('Payload Too Large: exceeds 1 MiB limit');
      err.status = 413;
      throw err;
    }
    return str;
  }

  // 2. Consume from readable stream FIRST if available.
  // In @vercel/node, restoreBody() wraps req.on('data'/'end') via PassThrough to provide raw bytes,
  // while installing a lazy getter on req.body. On the outer IncomingMessage, readableEnded/destroyed
  // may be true while the inner restored PassThrough is ready to stream.
  const hasLazyBodyGetter = Boolean(
    Object.getOwnPropertyDescriptor(req, 'body')?.get
  );
  const isStreamAvailable = typeof req.on === 'function' && (hasLazyBodyGetter || (!req.readableEnded && !req.destroyed));

  if (isStreamAvailable) {
    return new Promise((resolve, reject) => {
      let totalBytes = 0;
      const chunks = [];
      let isTimedOut = false;

      const timer = setTimeout(() => {
        isTimedOut = true;
        cleanup();
        const err = new Error('Stream read timeout exceeded');
        err.status = 408;
        reject(err);
      }, 5000);

      function cleanup() {
        clearTimeout(timer);
        if (typeof req.removeListener === 'function') {
          req.removeListener('data', onData);
          req.removeListener('end', onEnd);
          req.removeListener('error', onError);
        }
      }

      function onData(chunk) {
        if (isTimedOut) return;
        totalBytes += chunk.length;
        if (totalBytes > MAX_WEBHOOK_BYTES) {
          cleanup();
          if (typeof req.destroy === 'function') {
            req.destroy();
          }
          const err = new Error('Payload Too Large: exceeds 1 MiB limit');
          err.status = 413;
          reject(err);
        } else {
          chunks.push(chunk);
        }
      }

      function onEnd() {
        if (isTimedOut) return;
        cleanup();
        resolve(Buffer.concat(chunks).toString('utf8'));
      }

      function onError(err) {
        if (isTimedOut) return;
        cleanup();
        reject(err);
      }

      req.on('data', onData);
      req.on('end', onEnd);
      req.on('error', onError);
    });
  }

  // 3. Fallback: Stream was already consumed or unavailable; inspect pre-buffered body
  if (Buffer.isBuffer(req.body)) {
    if (req.body.length > MAX_WEBHOOK_BYTES) {
      const err = new Error('Payload Too Large: exceeds 1 MiB limit');
      err.status = 413;
      throw err;
    }
    return req.body.toString('utf8');
  }

  if (typeof req.body === 'string') {
    if (Buffer.byteLength(req.body) > MAX_WEBHOOK_BYTES) {
      const err = new Error('Payload Too Large: exceeds 1 MiB limit');
      err.status = 413;
      throw err;
    }
    return req.body;
  }

  // 4. If body was pre-parsed as an object, do NOT guess or reconstruct JSON (HMAC unsafe)
  if (typeof req.body === 'object' && req.body !== null) {
    const err = new Error('Webhook raw body stream unavailable; request body was pre-parsed into an object.');
    err.status = 400;
    err.code = 'RAW_BODY_UNAVAILABLE';
    throw err;
  }

  // 5. Fail closed if stream has already ended and raw bytes were not captured
  const err = new Error('Webhook raw body stream has already ended and raw bytes were not captured.');
  err.status = 400;
  err.code = 'STREAM_ALREADY_ENDED';
  throw err;
}

/**
 * Webhook handler
 */
async function handler(req, res) {
  // 1. Method check: POST only
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  let rawBody;
  try {
    rawBody = await getRawBody(req);
  } catch (err) {
    if (err.status === 413) {
      return res.status(413).json({ error: 'Payload Too Large' });
    }
    console.error('[Webhook] Failed to read request body:', err.message);
    return res.status(err.status || 400).json({
      error: 'Failed to read raw request body for signature verification',
      code: err.code || 'RAW_BODY_ERROR'
    });
  }

  // 2. Validate HMAC SHA-512 Signature
  const signatureHeader = req.headers['x-paystack-signature'];
  if (!signatureHeader || !verifyWebhookSignature(rawBody, signatureHeader)) {
    console.warn('[Webhook] Invalid or missing signature header rejected.');
    return res.status(401).json({ error: 'Unauthorized: Invalid webhook signature' });
  }

  // 3. Parse JSON event payload
  let eventPayload;
  try {
    eventPayload = JSON.parse(rawBody);
  } catch (err) {
    console.error('[Webhook] JSON parse error:', err.message);
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  const { event, data } = eventPayload;

  // 4. Handle 'charge.success' events
  if (event === 'charge.success' && data) {
    const reference = data.reference;
    const amountKobo = data.amount;
    const currency = data.currency;

    if (!reference || typeof reference !== 'string') {
      return res.status(400).json({ error: 'Missing reference in event data' });
    }

    try {
      // 5. Retrieve associated local payment attempt
      const { attempt, order } = await getAttemptByReference(reference);

      if (!attempt || !order) {
        console.warn(`[Webhook] Event received for unknown reference: "${reference.slice(0, 15)}..."`);
        // Acknowledge receipt to avoid repeated delivery attempts by Paystack
        return res.status(200).json({ received: true, message: 'Reference not found locally.' });
      }

      // 6. Pre-check: If already settled, acknowledge idempotently
      if (attempt.status === 'successful' && order.payment_status === 'paid') {
        return res.status(200).json({ received: true, message: 'Payment already settled.' });
      }

      // 7. Prevent status regression if order is in terminal status
      if (['refunded', 'disputed'].includes(attempt.status) || ['refunded', 'disputed'].includes(order.payment_status)) {
        console.warn(`[Webhook] Attempt ${attempt.id} is in terminal status (${attempt.status}). Refusing regression.`);
        return res.status(200).json({ received: true, message: 'Order in terminal status.' });
      }

      // 8. Amount and Currency validation
      if (parseInt(amountKobo, 10) !== parseInt(attempt.amount, 10)) {
        console.error('[Webhook] Charge amount mismatch:', {
          attemptAmount: attempt.amount,
          eventAmount: amountKobo
        });
        return res.status(400).json({ error: 'Amount mismatch' });
      }

      if (currency !== 'NGN' || attempt.currency !== 'NGN') {
        console.error('[Webhook] Currency mismatch:', { currency });
        return res.status(400).json({ error: 'Currency mismatch' });
      }

      // 9. Execute Atomic Settlement RPC
      const settlement = await settlePaymentSuccessAtomic({
        reference: attempt.reference,
        amountKobo,
        currency,
        paystackId: data.id,
        channel: data.channel,
        gatewayResponse: data.gateway_response || 'Successful (Webhook)',
        paidAt: data.paid_at || new Date().toISOString(),
        metadata: {
          webhook_event: event,
          ip_address: data.ip_address,
          processed_at: new Date().toISOString()
        }
      });

      if (!settlement.success) {
        if (settlement.code === 'TERMINAL_STATUS' || settlement.code === 'ALREADY_SETTLED') {
          return res.status(200).json({ received: true, message: settlement.message });
        }
        return res.status(400).json({ error: settlement.message || 'Settlement failed' });
      }

      return res.status(200).json({ received: true });

    } catch (err) {
      console.error('[Webhook] Error processing charge.success event:', {
        name: err.name,
        message: err.message
      });
      return res.status(500).json({ error: 'Failed to process webhook event' });
    }
  }

  // Acknowledge other unhandled event types cleanly
  return res.status(200).json({ received: true, message: 'Event ignored' });
}

// Disable Next/Vercel default bodyParser to ensure rawBody stream is available for HMAC
module.exports = handler;
module.exports.config = {
  api: {
    bodyParser: false
  }
};
handler.config = module.exports.config;

