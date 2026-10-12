// ============================================================
// Quantum Jersey — POST /api/paystack/verify
// Server-side Payment Verification Endpoint
// ============================================================

const { validateReference, validateRequestOrigin } = require('../_lib/validator');
const {
  getAttemptByReference,
  settlePaymentSuccessAtomic,
  settlePaymentFailureAtomic
} = require('../_lib/supabase');
const { verifyTransaction } = require('../_lib/paystack');

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

  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const reference = body.reference;

    // 2. Validate reference input
    if (!validateReference(reference)) {
      return res.status(400).json({
        success: false,
        error: 'A valid payment reference is required.'
      });
    }

    // 3. Locate matching payment attempt and order in database
    const { attempt, order } = await getAttemptByReference(reference);

    if (!attempt || !order) {
      return res.status(404).json({
        success: false,
        error: 'No matching payment attempt found for the provided reference.'
      });
    }

    // 4. Terminal Status Guard: Protect refunded and disputed orders from regression
    if (
      ['refunded', 'disputed'].includes(attempt.status) ||
      ['refunded', 'disputed'].includes(order.payment_status)
    ) {
      const currentTerminalStatus = order.payment_status || attempt.status;
      return res.status(200).json({
        success: true,
        status: currentTerminalStatus,
        reference: attempt.reference,
        order_ref: order.order_ref,
        message: `Order is in a terminal status (${currentTerminalStatus}). Status regression blocked.`
      });
    }

    // 5. Idempotency Check: If already successful, return verified state immediately
    if (attempt.status === 'successful' && order.payment_status === 'paid') {
      return res.status(200).json({
        success: true,
        status: 'paid',
        reference: attempt.reference,
        order_ref: order.order_ref,
        amount: order.total_amount,
        currency: order.currency,
        paid_at: order.paid_at,
        message: 'Payment already verified and confirmed.'
      });
    }

    // 6. Query Paystack authoritative verification endpoint
    const gatewayData = await verifyTransaction(reference);

    // 7. Security verification tuple:
    // a) Reference strictly matches
    if (gatewayData.reference !== reference) {
      return res.status(400).json({
        success: false,
        error: 'Gateway reference mismatch detected.'
      });
    }

    // b) Amount strictly matches expected attempt amount (in kobo)
    if (parseInt(gatewayData.amount, 10) !== parseInt(attempt.amount, 10)) {
      console.error('[API /paystack/verify] Amount mismatch:', {
        expectedKobo: attempt.amount,
        actualKobo: gatewayData.amount
      });
      return res.status(400).json({
        success: false,
        error: 'Transaction amount does not match expected order total.'
      });
    }

    // c) Currency strictly matches 'NGN'
    if (gatewayData.currency !== 'NGN' || attempt.currency !== 'NGN') {
      return res.status(400).json({
        success: false,
        error: 'Transaction currency mismatch (NGN required).'
      });
    }

    // 8. Process based on authoritative Paystack status using Atomic RPC
    if (gatewayData.status === 'success') {
      const settlement = await settlePaymentSuccessAtomic({
        reference: attempt.reference,
        amountKobo: gatewayData.amount,
        currency: gatewayData.currency,
        paystackId: gatewayData.id,
        channel: gatewayData.channel,
        gatewayResponse: gatewayData.gateway_response || 'Successful',
        paidAt: gatewayData.paid_at || new Date().toISOString(),
        metadata: {
          ip_address: gatewayData.ip_address,
          authorization: {
            brand: gatewayData.authorization?.brand,
            last4: gatewayData.authorization?.last4,
            bank: gatewayData.authorization?.bank
          }
        }
      });

      if (!settlement.success) {
        if (settlement.code === 'TERMINAL_STATUS') {
          return res.status(200).json({
            success: true,
            status: settlement.status,
            reference: attempt.reference,
            order_ref: order.order_ref,
            message: settlement.message
          });
        }
        return res.status(400).json({
          success: false,
          error: settlement.message || 'Settlement failed.'
        });
      }

      return res.status(200).json({
        success: true,
        status: 'paid',
        reference: attempt.reference,
        order_ref: order.order_ref,
        amount: order.total_amount,
        currency: order.currency,
        paid_at: settlement.paid_at || order.paid_at
      });

    } else if (gatewayData.status === 'failed' || gatewayData.status === 'abandoned') {
      // Definitive terminal failure on gateway: settle failure atomically
      const isAbandoned = gatewayData.status === 'abandoned';
      await settlePaymentFailureAtomic({
        reference: attempt.reference,
        gatewayResponse: gatewayData.gateway_response || (isAbandoned ? 'Transaction abandoned by customer' : 'Transaction failed'),
        isAbandoned,
        metadata: {
          gateway_status: gatewayData.status
        }
      });

      return res.status(200).json({
        success: false,
        status: gatewayData.status,
        reference: attempt.reference,
        order_ref: order.order_ref,
        error: gatewayData.gateway_response || (isAbandoned ? 'Transaction was abandoned.' : 'Payment was declined by payment gateway.')
      });

    } else if (gatewayData.status === 'pending' || gatewayData.status === 'ongoing') {
      // Intermediate / non-terminal state: DO NOT mark failed in database.
      // Leave order in 'unpaid' and attempt in 'initiated' so a later verification or webhook can reconcile it.
      return res.status(200).json({
        success: false,
        status: 'pending',
        gateway_status: gatewayData.status,
        reference: attempt.reference,
        order_ref: order.order_ref,
        message: 'Payment is currently pending bank or gateway confirmation.'
      });

    } else {
      // Unknown, unexpected, or malformed status: Fail safely without mutating database records
      console.warn('[API /paystack/verify] Unrecognized gateway status received:', {
        status: gatewayData.status,
        reference
      });

      return res.status(400).json({
        success: false,
        status: 'unknown',
        reference: attempt.reference,
        order_ref: order.order_ref,
        error: `Unrecognized payment status "${gatewayData.status || 'null'}" received from gateway.`
      });
    }

  } catch (err) {
    console.error('[API /paystack/verify] Error:', {
      name: err.name,
      message: err.message,
      status: err.status || 500
    });

    return res.status(err.status || 500).json({
      success: false,
      error: 'An error occurred during payment verification.'
    });
  }
};
