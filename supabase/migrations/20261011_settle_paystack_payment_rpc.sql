-- ============================================================
-- Quantum Jersey — Atomic Paystack Settlement RPC Functions
-- ============================================================
-- File: supabase/migrations/20261011_settle_paystack_payment_rpc.sql
-- Migration Strategy: Additive, Strictly Idempotent, Non-Breaking
--
-- This migration establishes atomic transactional RPC functions for:
-- 1. public.settle_paystack_payment: Atomically settles successful Paystack payments.
-- 2. public.fail_paystack_payment: Atomically records failed/abandoned Paystack payments.
--
-- Security Controls:
-- - Row-level exclusive locks (FOR UPDATE) prevent split-state concurrency races.
-- - Strictly checks against terminal state regression (refunded/disputed).
-- - Execution privileges REVOKED from PUBLIC, anon, and authenticated.
-- - Execution privileges GRANTED EXCLUSIVELY to service_role and postgres.
-- ============================================================

-- ─── 1. Atomic Settlement RPC Function ────────────────────────

CREATE OR REPLACE FUNCTION public.settle_paystack_payment(
  p_reference TEXT,
  p_expected_amount_kobo INTEGER,
  p_expected_currency TEXT,
  p_paystack_id BIGINT,
  p_channel TEXT,
  p_gateway_response TEXT,
  p_paid_at TIMESTAMPTZ,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_attempt record;
  v_order record;
  v_now timestamptz;
BEGIN
  -- 1. Input sanitization
  IF p_reference IS NULL OR trim(p_reference) = '' THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_REFERENCE', 'message', 'Reference must be provided');
  END IF;

  -- 2. Acquire exclusive row lock on payment_attempts
  SELECT id, order_id, reference, amount, currency, status
  INTO v_attempt
  FROM public.payment_attempts
  WHERE reference = trim(p_reference)
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'ATTEMPT_NOT_FOUND', 'message', 'Payment attempt record not found');
  END IF;

  -- 3. Acquire exclusive row lock on orders
  SELECT id, order_ref, total_amount, currency, status, payment_status, paid_at
  INTO v_order
  FROM public.orders
  WHERE id = v_attempt.order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'ORDER_NOT_FOUND', 'message', 'Associated order record not found');
  END IF;

  -- 4. Terminal status check: Prevent overwriting refunded or disputed orders
  IF v_attempt.status IN ('refunded', 'disputed') OR v_order.payment_status IN ('refunded', 'disputed') THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'TERMINAL_STATUS',
      'status', v_order.payment_status,
      'message', 'Order or attempt is in a terminal status (' || COALESCE(v_order.payment_status, v_attempt.status) || '). Regression blocked.'
    );
  END IF;

  -- 5. Idempotency check: Already settled successfully
  IF v_attempt.status = 'successful' AND v_order.payment_status = 'paid' THEN
    RETURN jsonb_build_object(
      'success', true,
      'code', 'ALREADY_SETTLED',
      'status', 'paid',
      'order_ref', v_order.order_ref,
      'reference', v_attempt.reference,
      'paid_at', v_order.paid_at,
      'message', 'Payment already settled and verified.'
    );
  END IF;

  -- 6. Validate expected amount in kobo
  IF v_attempt.amount <> p_expected_amount_kobo THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'AMOUNT_MISMATCH',
      'message', 'Transaction amount does not match stored attempt amount'
    );
  END IF;

  -- 7. Validate expected currency
  IF v_attempt.currency <> p_expected_currency OR v_order.currency <> p_expected_currency THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'CURRENCY_MISMATCH',
      'message', 'Currency mismatch (expected ' || p_expected_currency || ')'
    );
  END IF;

  -- 8. Atomic state transition
  v_now := COALESCE(p_paid_at, now());

  UPDATE public.payment_attempts
  SET
    status = 'successful',
    paystack_id = COALESCE(p_paystack_id, paystack_id),
    channel = COALESCE(p_channel, channel),
    gateway_response = COALESCE(p_gateway_response, 'Successful'),
    metadata = COALESCE(public.payment_attempts.metadata, '{}'::jsonb) || COALESCE(p_metadata, '{}'::jsonb),
    updated_at = now()
  WHERE id = v_attempt.id;

  UPDATE public.orders
  SET
    payment_status = 'paid',
    status = 'confirmed',
    paid_at = v_now,
    updated_at = now()
  WHERE id = v_order.id;

  RETURN jsonb_build_object(
    'success', true,
    'code', 'SETTLED',
    'status', 'paid',
    'order_ref', v_order.order_ref,
    'reference', v_attempt.reference,
    'paid_at', v_now
  );
END;
$$;


-- ─── 2. Atomic Failure Recording RPC Function ─────────────────

CREATE OR REPLACE FUNCTION public.fail_paystack_payment(
  p_reference TEXT,
  p_gateway_response TEXT,
  p_is_abandoned BOOLEAN DEFAULT false,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_attempt record;
  v_order record;
  v_target_status text;
BEGIN
  IF p_reference IS NULL OR trim(p_reference) = '' THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_REFERENCE', 'message', 'Reference must be provided');
  END IF;

  -- Acquire row locks
  SELECT id, order_id, reference, status
  INTO v_attempt
  FROM public.payment_attempts
  WHERE reference = trim(p_reference)
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'ATTEMPT_NOT_FOUND', 'message', 'Payment attempt record not found');
  END IF;

  SELECT id, order_ref, status, payment_status
  INTO v_order
  FROM public.orders
  WHERE id = v_attempt.order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'ORDER_NOT_FOUND', 'message', 'Associated order record not found');
  END IF;

  -- Do not demote an already paid or terminal order
  IF v_order.payment_status IN ('paid', 'refunded', 'disputed') OR v_attempt.status IN ('successful', 'refunded', 'disputed') THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'PROTECTED_STATUS',
      'status', v_order.payment_status,
      'message', 'Cannot mark payment as failed because order is in protected status: ' || v_order.payment_status
    );
  END IF;

  v_target_status := CASE WHEN p_is_abandoned THEN 'abandoned' ELSE 'failed' END;

  UPDATE public.payment_attempts
  SET
    status = v_target_status,
    gateway_response = COALESCE(p_gateway_response, 'Transaction failed'),
    metadata = COALESCE(public.payment_attempts.metadata, '{}'::jsonb) || COALESCE(p_metadata, '{}'::jsonb),
    updated_at = now()
  WHERE id = v_attempt.id;

  UPDATE public.orders
  SET
    payment_status = 'failed',
    updated_at = now()
  WHERE id = v_order.id;

  RETURN jsonb_build_object(
    'success', true,
    'code', 'FAILURE_RECORDED',
    'status', v_target_status,
    'order_ref', v_order.order_ref,
    'reference', v_attempt.reference
  );
END;
$$;


-- ─── 3. Restrict Execution Privileges ─────────────────────────

REVOKE ALL ON FUNCTION public.settle_paystack_payment FROM PUBLIC;
REVOKE ALL ON FUNCTION public.settle_paystack_payment FROM anon;
REVOKE ALL ON FUNCTION public.settle_paystack_payment FROM authenticated;

GRANT EXECUTE ON FUNCTION public.settle_paystack_payment TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_paystack_payment TO postgres;

REVOKE ALL ON FUNCTION public.fail_paystack_payment FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fail_paystack_payment FROM anon;
REVOKE ALL ON FUNCTION public.fail_paystack_payment FROM authenticated;

GRANT EXECUTE ON FUNCTION public.fail_paystack_payment TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_paystack_payment TO postgres;
