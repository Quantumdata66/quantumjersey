-- ============================================================
-- Quantum Jersey — Paystack Payment Tracking Schema Migration
-- ============================================================
-- File: supabase/migrations/20261010_paystack_payment_tracking.sql
-- Target Tables: public.orders (enhanced) & public.payment_attempts (new)
-- Migration Strategy: Additive, Strictly Idempotent, Non-Breaking, Fail-Safe
--
-- ============================================================
-- ARCHITECTURAL SPECIFICATION & SECURITY CONTROLS
-- ============================================================
--
-- 1. PAYMENT ATTEMPTS POLICY ROLES:
--    - Row-Level Security (RLS) is enabled on public.payment_attempts.
--    - The approved "Admin select payment_attempts" policy MUST apply EXCLUSIVELY
--      to the 'authenticated' role (polroles = ARRAY[authenticated_oid]), with
--      command SELECT ('r'), predicate public.is_admin(), and no WITH CHECK.
--    - Any other role configuration (including public, anon, or multiple roles)
--      fails safely with an explicit EXCEPTION.
--    - No client-side INSERT, UPDATE, or DELETE policies are permitted for any role.
--    - All attempt creation and mutations are restricted to trusted backend endpoints
--      using the Supabase Service Role Key.
--
-- 2. PUBLIC ORDER INSERTION BOUNDARY (BANK TRANSFER ONLY):
--    - Anonymous/public checkout via browser MUST ONLY create orders with:
--        status = 'awaiting_confirmation'
--        payment_status = 'unpaid'
--        payment_method = 'bank_transfer'
--    - Direct browser inserts for Paystack orders are STRICTLY FORBIDDEN.
--    - Paystack orders will be created exclusively in Stage 3 by the trusted
--      server-side initialization endpoint (/api/paystack/initialize) using the
--      Supabase Service Role Key, which calculates authoritative cart totals
--      directly from public.products and applies the standard flat delivery fee.
--    - The existing "Public insert orders" policy is inspected prior to alteration;
--      only explicitly recognized definitions are accepted (substring matching is
--      strictly prohibited). If the definition is ambiguous, execution halts with an EXCEPTION.
--    - All applicable INSERT and ALL policies on public.orders (including policies granted
--      to authenticated users) are inspected to ensure no alternative permissive policy
--      bypasses the intended bank-transfer-only rule.
--
-- 3. RIGOROUS EXISTING COLUMN & INDEX CATALOG VALIDATION:
--    - Existing payment columns on public.orders are validated for data type, nullability,
--      and exact catalog defaults before ALTER TABLE, preventing silent schema drift.
--    - Every index is validated through native catalogs (pg_index, pg_class, pg_namespace, pg_attribute):
--      validates that the index strictly belongs to schema 'public', targets the exact intended
--      table in schema 'public' (preventing cross-schema collisions), matches ordered key columns,
--      uniqueness, predicates, sort directions (indoption), absence of unexpected expressions,
--      validity (indisvalid), and readiness (indisready).
--    - An index is never dropped solely by name: public.idx_payment_attempts_reference
--      is verified to be strictly a non-unique, non-primary, single-column index on 'reference'
--      targeting public.payment_attempts before removal.
--
-- 4. VALIDATED PAYMENT ATTEMPTS CONSTRAINTS:
--    - Verifies all constraints on public.payment_attempts are enabled and validated
--      (convalidated = true).
--    - Verifies the unique reference index is valid, ready, unique, non-primary, and
--      strictly non-partial (indpred IS NULL).
--    - Verifies the foreign key specifically references public.orders(id) with
--      ON DELETE RESTRICT or NO ACTION, and is validated.
--
-- 5. STAGE 3 PAYMENT VERIFICATION & ATOMIC RPC TRANSACTION:
--    - Before any payment settlement occurs in Stage 3, the backend MUST verify the
--      transaction with Paystack's authoritative verification endpoint:
--        GET https://api.paystack.co/transaction/verify/:reference
--    - The backend matches the entire verification tuple:
--        a) Transaction reference matches stored attempt reference.
--        b) Gateway status is strictly 'success'.
--        c) Amount in kobo matches order total amount * 100.
--        d) Currency is strictly 'NGN'.
--        e) Associated attempt order_id matches target public.orders(id).
--    - State changes MUST be executed atomically using a PostgreSQL RPC transaction
--      function (e.g. supabase.rpc('settle_paystack_payment', ...)) that acquires
--      exclusive row-level locks (SELECT ... FOR UPDATE on orders and payment_attempts).
--    - Separate Supabase REST client calls (supabase.from(...).update(...)) execute
--      as independent HTTP requests and CANNOT provide a database transaction.
--    - Handlers must reconcile duplicate deliveries, reject regressions from out-of-order
--      failures, and detect simultaneous successful payments (double debits) by logging
--      the attempt and flagging reconciliation_status = 'MULTIPLE_SUCCESSFUL_CHARGES'
--      for admin refund without duplicate fulfillment.
-- ============================================================


-- ─── 1. Compatibility Check & Additive Columns on public.orders ───

DO $$
DECLARE
  rec record;
  col_info record;
  norm_default text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'orders') THEN
    FOR rec IN
      SELECT * FROM (VALUES
        ('customer_email', 'text', 'YES', ARRAY[]::text[]),
        ('payment_status', 'text', 'NO', ARRAY['''unpaid''::text', '''unpaid''']),
        ('payment_method', 'text', 'NO', ARRAY['''bank_transfer''::text', '''bank_transfer''']),
        ('currency', 'text', 'NO', ARRAY['''NGN''::text', '''NGN''']),
        ('paystack_reference', 'text', 'YES', ARRAY[]::text[]),
        ('paid_at', 'timestamp with time zone', 'YES', ARRAY[]::text[]),
        ('payment_metadata', 'jsonb', 'NO', ARRAY['''{}''::jsonb', '''{}'''])
      ) AS t(col, expected_type, expected_null, valid_defaults)
    LOOP
      SELECT data_type, udt_name, is_nullable, column_default
      INTO col_info
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'orders'
        AND column_name = rec.col;

      IF FOUND THEN
        -- 1. Validate data type
        IF col_info.data_type <> rec.expected_type AND col_info.udt_name <> rec.expected_type THEN
          RAISE EXCEPTION 'Column public.orders.% exists with incompatible data type % (expected %)',
            rec.col, col_info.data_type, rec.expected_type;
        END IF;

        -- 2. Validate nullability
        IF col_info.is_nullable <> rec.expected_null THEN
          RAISE EXCEPTION 'Column public.orders.% exists with incompatible nullability % (expected %)',
            rec.col, col_info.is_nullable, rec.expected_null;
        END IF;

        -- 3. Strict default validation (no substring matching)
        IF array_length(rec.valid_defaults, 1) IS NULL THEN
          -- Expected NO default (NULL)
          IF col_info.column_default IS NOT NULL THEN
            RAISE EXCEPTION 'Column public.orders.% exists with unexpected default % (expected NULL)',
              rec.col, col_info.column_default;
          END IF;
        ELSE
          norm_default := regexp_replace(COALESCE(col_info.column_default, ''), '\s+', ' ', 'g');
          IF NOT (norm_default = ANY(rec.valid_defaults)) THEN
            RAISE EXCEPTION 'Column public.orders.% exists with unrecognized default % (expected one of %)',
              rec.col, col_info.column_default, rec.valid_defaults;
          END IF;
        END IF;
      END IF;
    END LOOP;
  END IF;
END $$;

-- Add additive columns to public.orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_email TEXT;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid';

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'bank_transfer';

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'NGN';

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS paystack_reference TEXT;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;


-- ─── 2. Exact Check Constraint Validation on public.orders ────

-- 1. Payment Status Constraint on public.orders
-- Permitted values: strictly ('unpaid', 'pending', 'paid', 'failed', 'refunded', 'disputed')
DO $$
DECLARE
  con_rec record;
  norm_def text;
BEGIN
  SELECT oid, convalidated, pg_get_constraintdef(oid) AS def
  INTO con_rec
  FROM pg_constraint
  WHERE conrelid = 'public.orders'::regclass
    AND conname = 'orders_payment_status_check';

  IF NOT FOUND THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_payment_status_check
      CHECK (payment_status IN ('unpaid', 'pending', 'paid', 'failed', 'refunded', 'disputed'));
  ELSE
    IF con_rec.convalidated = false THEN
      RAISE EXCEPTION 'Constraint orders_payment_status_check exists on public.orders but is NOT VALIDATED';
    END IF;
    norm_def := regexp_replace(regexp_replace(con_rec.def, '::text', '', 'g'), '\s+', ' ', 'g');
    IF norm_def NOT IN (
      'CHECK ((payment_status = ANY (ARRAY[''unpaid'', ''pending'', ''paid'', ''failed'', ''refunded'', ''disputed''])))',
      'CHECK (payment_status = ANY (ARRAY[''unpaid'', ''pending'', ''paid'', ''failed'', ''refunded'', ''disputed'']))',
      'CHECK ((payment_status IN (''unpaid'', ''pending'', ''paid'', ''failed'', ''refunded'', ''disputed'')))',
      'CHECK (payment_status IN (''unpaid'', ''pending'', ''paid'', ''failed'', ''refunded'', ''disputed''))'
    ) THEN
      RAISE EXCEPTION 'Constraint orders_payment_status_check exists on public.orders with an unverified or conflicting definition: %', con_rec.def;
    END IF;
  END IF;
END $$;

-- 2. Payment Method Constraint on public.orders
-- Permitted values: strictly ('bank_transfer', 'paystack')
DO $$
DECLARE
  con_rec record;
  norm_def text;
BEGIN
  SELECT oid, convalidated, pg_get_constraintdef(oid) AS def
  INTO con_rec
  FROM pg_constraint
  WHERE conrelid = 'public.orders'::regclass
    AND conname = 'orders_payment_method_check';

  IF NOT FOUND THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_payment_method_check
      CHECK (payment_method IN ('bank_transfer', 'paystack'));
  ELSE
    IF con_rec.convalidated = false THEN
      RAISE EXCEPTION 'Constraint orders_payment_method_check exists on public.orders but is NOT VALIDATED';
    END IF;
    norm_def := regexp_replace(regexp_replace(con_rec.def, '::text', '', 'g'), '\s+', ' ', 'g');
    IF norm_def NOT IN (
      'CHECK ((payment_method = ANY (ARRAY[''bank_transfer'', ''paystack''])))',
      'CHECK (payment_method = ANY (ARRAY[''bank_transfer'', ''paystack'']))',
      'CHECK ((payment_method IN (''bank_transfer'', ''paystack'')))',
      'CHECK (payment_method IN (''bank_transfer'', ''paystack''))'
    ) THEN
      RAISE EXCEPTION 'Constraint orders_payment_method_check exists on public.orders with an unverified or conflicting definition: %', con_rec.def;
    END IF;
  END IF;
END $$;

-- 3. Currency Constraint on public.orders
-- Permitted values: strictly ('NGN')
DO $$
DECLARE
  con_rec record;
  norm_def text;
BEGIN
  SELECT oid, convalidated, pg_get_constraintdef(oid) AS def
  INTO con_rec
  FROM pg_constraint
  WHERE conrelid = 'public.orders'::regclass
    AND conname = 'orders_currency_check';

  IF NOT FOUND THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_currency_check
      CHECK (currency IN ('NGN'));
  ELSE
    IF con_rec.convalidated = false THEN
      RAISE EXCEPTION 'Constraint orders_currency_check exists on public.orders but is NOT VALIDATED';
    END IF;
    norm_def := regexp_replace(regexp_replace(con_rec.def, '::text', '', 'g'), '\s+', ' ', 'g');
    IF norm_def NOT IN (
      'CHECK ((currency = ANY (ARRAY[''NGN''])))',
      'CHECK (currency = ANY (ARRAY[''NGN'']))',
      'CHECK ((currency = ''NGN''))',
      'CHECK (currency = ''NGN'')',
      'CHECK ((currency IN (''NGN'')))',
      'CHECK (currency IN (''NGN''))'
    ) THEN
      RAISE EXCEPTION 'Constraint orders_currency_check exists on public.orders with an unverified or conflicting definition: %', con_rec.def;
    END IF;
  END IF;
END $$;

-- 4. Customer Email Format Constraint on public.orders
DO $$
DECLARE
  con_rec record;
  norm_def text;
BEGIN
  SELECT oid, convalidated, pg_get_constraintdef(oid) AS def
  INTO con_rec
  FROM pg_constraint
  WHERE conrelid = 'public.orders'::regclass
    AND conname = 'orders_customer_email_check';

  IF NOT FOUND THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_customer_email_check
      CHECK (customer_email IS NULL OR (length(trim(customer_email)) >= 3 AND customer_email LIKE '%@%.%'));
  ELSE
    IF con_rec.convalidated = false THEN
      RAISE EXCEPTION 'Constraint orders_customer_email_check exists on public.orders but is NOT VALIDATED';
    END IF;
    norm_def := regexp_replace(regexp_replace(con_rec.def, '::text', '', 'g'), '\s+', ' ', 'g');
    IF norm_def NOT IN (
      'CHECK (((customer_email IS NULL) OR ((length(TRIM(BOTH FROM customer_email)) >= 3) AND (customer_email ~~ ''%@%.%''))))',
      'CHECK ((customer_email IS NULL) OR ((length(TRIM(BOTH FROM customer_email)) >= 3) AND (customer_email ~~ ''%@%.%'')))',
      'CHECK (((customer_email IS NULL) OR ((length(trim(both from customer_email)) >= 3) AND (customer_email ~~ ''%@%.%''))))',
      'CHECK ((customer_email IS NULL) OR ((length(trim(both from customer_email)) >= 3) AND (customer_email ~~ ''%@%.%'')))',
      'CHECK (((customer_email IS NULL) OR ((length(TRIM(BOTH FROM customer_email)) >= 3) AND (customer_email LIKE ''%@%.%''))))',
      'CHECK ((customer_email IS NULL) OR ((length(TRIM(BOTH FROM customer_email)) >= 3) AND (customer_email LIKE ''%@%.%'')))',
      'CHECK (((customer_email IS NULL) OR ((length(btrim(customer_email)) >= 3) AND (customer_email ~~ ''%@%.%''))))',
      'CHECK ((customer_email IS NULL) OR ((length(btrim(customer_email)) >= 3) AND (customer_email ~~ ''%@%.%'')))',
      'CHECK (((customer_email IS NULL) OR ((length(trim(customer_email)) >= 3) AND (customer_email ~~ ''%@%.%''))))',
      'CHECK ((customer_email IS NULL) OR ((length(trim(customer_email)) >= 3) AND (customer_email ~~ ''%@%.%'')))',
      'CHECK (((customer_email IS NULL) OR ((length(btrim(customer_email)) >= 3) AND (customer_email LIKE ''%@%.%''))))',
      'CHECK ((customer_email IS NULL) OR ((length(btrim(customer_email)) >= 3) AND (customer_email LIKE ''%@%.%'')))',
      'CHECK (((customer_email IS NULL) OR ((length(trim(customer_email)) >= 3) AND (customer_email LIKE ''%@%.%''))))',
      'CHECK ((customer_email IS NULL) OR ((length(trim(customer_email)) >= 3) AND (customer_email LIKE ''%@%.%'')))',
      'CHECK (customer_email IS NULL OR (length(trim(customer_email)) >= 3 AND customer_email LIKE ''%@%.%''))',
      'CHECK (customer_email IS NULL OR (length(btrim(customer_email)) >= 3 AND customer_email ~~ ''%@%.%''))'
    ) THEN
      RAISE EXCEPTION 'Constraint orders_customer_email_check exists on public.orders with an unverified or conflicting definition: %', con_rec.def;
    END IF;
  END IF;
END $$;


-- ─── 3. Catalog-Based Index Validation on public.orders ────────

-- 1. Partial unique index on orders(paystack_reference)
DO $$
DECLARE
  idx_rec record;
  col_name text;
  norm_pred text;
BEGIN
  SELECT 
    c.oid AS index_oid,
    n.nspname AS index_schema,
    tn.nspname AS table_schema,
    t.relname AS table_name,
    i.indrelid,
    i.indisunique,
    i.indisprimary,
    i.indisvalid,
    i.indisready,
    i.indnkeyatts,
    i.indnatts,
    i.indexprs,
    i.indpred,
    i.indkey
  INTO idx_rec
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_index i ON i.indexrelid = c.oid
  JOIN pg_class t ON t.oid = i.indrelid
  JOIN pg_namespace tn ON tn.oid = t.relnamespace
  WHERE c.relname = 'idx_orders_paystack_reference_unique';

  IF FOUND THEN
    IF idx_rec.index_schema <> 'public' THEN
      RAISE EXCEPTION 'Index idx_orders_paystack_reference_unique exists in unexpected schema % (expected public)', idx_rec.index_schema;
    END IF;
    IF idx_rec.table_schema <> 'public' OR idx_rec.table_name <> 'orders' THEN
      RAISE EXCEPTION 'Index public.idx_orders_paystack_reference_unique targets unexpected table %.% (expected public.orders)',
        idx_rec.table_schema, idx_rec.table_name;
    END IF;
    IF NOT (idx_rec.indisvalid AND idx_rec.indisready) THEN
      RAISE EXCEPTION 'Index public.idx_orders_paystack_reference_unique exists but is INVALID or NOT READY';
    END IF;
    IF NOT idx_rec.indisunique THEN
      RAISE EXCEPTION 'Index public.idx_orders_paystack_reference_unique exists but is NOT UNIQUE';
    END IF;
    IF idx_rec.indisprimary THEN
      RAISE EXCEPTION 'Index public.idx_orders_paystack_reference_unique exists but is a PRIMARY KEY index';
    END IF;
    IF idx_rec.indnkeyatts <> 1 OR idx_rec.indnatts <> 1 THEN
      RAISE EXCEPTION 'Index public.idx_orders_paystack_reference_unique exists but has unexpected column count (key: %, total: %)',
        idx_rec.indnkeyatts, idx_rec.indnatts;
    END IF;
    IF idx_rec.indexprs IS NOT NULL THEN
      RAISE EXCEPTION 'Index public.idx_orders_paystack_reference_unique exists but contains expression keys';
    END IF;

    SELECT a.attname INTO col_name
    FROM pg_attribute a
    WHERE a.attrelid = idx_rec.indrelid
      AND a.attnum = idx_rec.indkey[0];

    IF col_name <> 'paystack_reference' THEN
      RAISE EXCEPTION 'Index public.idx_orders_paystack_reference_unique indexes column % (expected paystack_reference)', col_name;
    END IF;

    IF idx_rec.indpred IS NULL THEN
      RAISE EXCEPTION 'Index public.idx_orders_paystack_reference_unique is NOT PARTIAL (expected predicate paystack_reference IS NOT NULL)';
    END IF;

    norm_pred := regexp_replace(regexp_replace(pg_get_expr(idx_rec.indpred, idx_rec.indrelid), '::text', '', 'g'), '\s+', ' ', 'g');
    IF norm_pred NOT IN ('(paystack_reference IS NOT NULL)', 'paystack_reference IS NOT NULL') THEN
      RAISE EXCEPTION 'Index public.idx_orders_paystack_reference_unique exists with incompatible predicate: %', norm_pred;
    END IF;
  ELSE
    CREATE UNIQUE INDEX idx_orders_paystack_reference_unique
      ON public.orders(paystack_reference)
      WHERE paystack_reference IS NOT NULL;
  END IF;
END $$;

-- 2. Composite index for admin dashboard order list queries (status filter + recency sort)
DO $$
DECLARE
  idx_rec record;
  col1_name text;
  col2_name text;
BEGIN
  SELECT 
    c.oid AS index_oid,
    n.nspname AS index_schema,
    tn.nspname AS table_schema,
    t.relname AS table_name,
    i.indrelid,
    i.indisunique,
    i.indisprimary,
    i.indisvalid,
    i.indisready,
    i.indnkeyatts,
    i.indnatts,
    i.indexprs,
    i.indpred,
    i.indkey,
    i.indoption
  INTO idx_rec
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_index i ON i.indexrelid = c.oid
  JOIN pg_class t ON t.oid = i.indrelid
  JOIN pg_namespace tn ON tn.oid = t.relnamespace
  WHERE c.relname = 'idx_orders_payment_lookup';

  IF FOUND THEN
    IF idx_rec.index_schema <> 'public' THEN
      RAISE EXCEPTION 'Index idx_orders_payment_lookup exists in unexpected schema % (expected public)', idx_rec.index_schema;
    END IF;
    IF idx_rec.table_schema <> 'public' OR idx_rec.table_name <> 'orders' THEN
      RAISE EXCEPTION 'Index public.idx_orders_payment_lookup targets unexpected table %.% (expected public.orders)',
        idx_rec.table_schema, idx_rec.table_name;
    END IF;
    IF NOT (idx_rec.indisvalid AND idx_rec.indisready) THEN
      RAISE EXCEPTION 'Index public.idx_orders_payment_lookup exists but is INVALID or NOT READY';
    END IF;
    IF idx_rec.indisunique THEN
      RAISE EXCEPTION 'Index public.idx_orders_payment_lookup exists but is unexpectedly UNIQUE';
    END IF;
    IF idx_rec.indisprimary THEN
      RAISE EXCEPTION 'Index public.idx_orders_payment_lookup exists but is a PRIMARY KEY index';
    END IF;
    IF idx_rec.indpred IS NOT NULL THEN
      RAISE EXCEPTION 'Index public.idx_orders_payment_lookup exists but is unexpectedly PARTIAL';
    END IF;
    IF idx_rec.indexprs IS NOT NULL THEN
      RAISE EXCEPTION 'Index public.idx_orders_payment_lookup exists but contains expression keys';
    END IF;
    IF idx_rec.indnkeyatts <> 2 OR idx_rec.indnatts <> 2 THEN
      RAISE EXCEPTION 'Index public.idx_orders_payment_lookup exists but does not index exactly 2 columns (key: %, total: %)',
        idx_rec.indnkeyatts, idx_rec.indnatts;
    END IF;

    SELECT a.attname INTO col1_name
    FROM pg_attribute a
    WHERE a.attrelid = idx_rec.indrelid
      AND a.attnum = idx_rec.indkey[0];

    SELECT a.attname INTO col2_name
    FROM pg_attribute a
    WHERE a.attrelid = idx_rec.indrelid
      AND a.attnum = idx_rec.indkey[1];

    IF col1_name <> 'payment_status' OR col2_name <> 'created_at' THEN
      RAISE EXCEPTION 'Index public.idx_orders_payment_lookup indexes columns (%, %) (expected payment_status, created_at)',
        col1_name, col2_name;
    END IF;

    IF (idx_rec.indoption[0] & 1) <> 0 OR (idx_rec.indoption[1] & 1) <> 1 THEN
      RAISE EXCEPTION 'Index public.idx_orders_payment_lookup has invalid sort directions (expected ASC, DESC)';
    END IF;
  ELSE
    CREATE INDEX idx_orders_payment_lookup
      ON public.orders(payment_status, created_at DESC);
  END IF;
END $$;


-- ─── 4. Dedicated Payment Attempts Table (public.payment_attempts) ─

-- Create table if not present
CREATE TABLE IF NOT EXISTS public.payment_attempts (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id            UUID        NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  reference           TEXT        NOT NULL UNIQUE,
  amount              INTEGER     NOT NULL CHECK (amount > 0),
  currency            TEXT        NOT NULL DEFAULT 'NGN' CHECK (currency = 'NGN'),
  status              TEXT        NOT NULL DEFAULT 'initiated'
                                  CHECK (status IN ('initiated', 'successful', 'failed', 'abandoned', 'refunded', 'disputed')),
  gateway_response    TEXT,
  paystack_id         BIGINT,
  channel             TEXT,
  metadata            JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Rigorous schema verification if table already existed prior to migration
DO $$
DECLARE
  rec record;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'payment_attempts') THEN
    -- 1. Check all required columns, exact types, and nullability
    FOR rec IN 
      SELECT * FROM (VALUES
        ('id', 'uuid', 'NO'),
        ('order_id', 'uuid', 'NO'),
        ('reference', 'text', 'NO'),
        ('amount', 'integer', 'NO'),
        ('currency', 'text', 'NO'),
        ('status', 'text', 'NO'),
        ('gateway_response', 'text', 'YES'),
        ('paystack_id', 'bigint', 'YES'),
        ('channel', 'text', 'YES'),
        ('metadata', 'jsonb', 'NO'),
        ('created_at', 'timestamp with time zone', 'NO'),
        ('updated_at', 'timestamp with time zone', 'NO')
      ) AS t(col, dtype, is_null)
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'payment_attempts'
          AND column_name = rec.col
          AND (data_type = rec.dtype OR udt_name = rec.dtype)
          AND is_nullable = rec.is_null
      ) THEN
        RAISE EXCEPTION 'Table public.payment_attempts exists with an incompatible column definition for: % (expected type %, nullable %)', rec.col, rec.dtype, rec.is_null;
      END IF;
    END LOOP;

    -- 2. Check validated single-column primary key constraint on payment_attempts(id)
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      WHERE c.conrelid = 'public.payment_attempts'::regclass
        AND c.contype = 'p'
        AND a.attname = 'id'
        AND array_length(c.conkey, 1) = 1
        AND c.convalidated = true
    ) THEN
      RAISE EXCEPTION 'Table public.payment_attempts exists but lacks a validated single-column PRIMARY KEY constraint on column id';
    END IF;

    -- 3. Check valid, ready, unique, non-primary, non-partial single-column index on reference
    IF NOT EXISTS (
      SELECT 1 FROM pg_index i
      JOIN pg_class c ON c.oid = i.indexrelid
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
      WHERE i.indrelid = 'public.payment_attempts'::regclass
        AND i.indisunique = true
        AND i.indisvalid = true
        AND i.indisready = true
        AND i.indisprimary = false
        AND i.indpred IS NULL
        AND i.indexprs IS NULL
        AND a.attname = 'reference'
        AND i.indnkeyatts = 1
        AND i.indnatts = 1
    ) THEN
      RAISE EXCEPTION 'Table public.payment_attempts exists but lacks a valid, ready, non-partial, single-column UNIQUE index on column reference';
    END IF;

    -- 4. Check foreign key specifically referencing public.orders(id) with ON DELETE RESTRICT or NO ACTION, and validated
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      WHERE c.conrelid = 'public.payment_attempts'::regclass
        AND c.contype = 'f'
        AND c.confrelid = 'public.orders'::regclass
        AND c.confdeltype IN ('r', 'a')
        AND c.convalidated = true
        AND (
          SELECT a.attname FROM pg_attribute a 
          WHERE a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
        ) = 'order_id'
        AND (
          SELECT fa.attname FROM pg_attribute fa 
          WHERE fa.attrelid = c.confrelid AND fa.attnum = c.confkey[1]
        ) = 'id'
        AND array_length(c.conkey, 1) = 1
        AND array_length(c.confkey, 1) = 1
    ) THEN
      RAISE EXCEPTION 'Table public.payment_attempts exists but lacks a validated single-column FOREIGN KEY referencing public.orders(id) ON DELETE RESTRICT / NO ACTION';
    END IF;

    -- 5. Check validated status check constraint on payment_attempts
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      WHERE c.conrelid = 'public.payment_attempts'::regclass
        AND c.contype = 'c'
        AND c.convalidated = true
        AND (
          regexp_replace(regexp_replace(pg_get_constraintdef(oid), '::text', '', 'g'), '\s+', ' ', 'g') IN (
            'CHECK ((status = ANY (ARRAY[''initiated'', ''successful'', ''failed'', ''abandoned'', ''refunded'', ''disputed''])))',
            'CHECK (status = ANY (ARRAY[''initiated'', ''successful'', ''failed'', ''abandoned'', ''refunded'', ''disputed'']))',
            'CHECK ((status IN (''initiated'', ''successful'', ''failed'', ''abandoned'', ''refunded'', ''disputed'')))',
            'CHECK (status IN (''initiated'', ''successful'', ''failed'', ''abandoned'', ''refunded'', ''disputed''))'
          )
        )
    ) THEN
      RAISE EXCEPTION 'Table public.payment_attempts exists but lacks an equivalent, validated status check constraint';
    END IF;

    -- 6. Check validated amount check constraint on payment_attempts (amount > 0)
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      WHERE c.conrelid = 'public.payment_attempts'::regclass
        AND c.contype = 'c'
        AND c.convalidated = true
        AND (
          regexp_replace(pg_get_constraintdef(oid), '\s+', ' ', 'g') IN (
            'CHECK ((amount > 0))',
            'CHECK (amount > 0)'
          )
        )
    ) THEN
      RAISE EXCEPTION 'Table public.payment_attempts exists but lacks an equivalent, validated amount > 0 check constraint';
    END IF;

    -- 7. Check validated currency check constraint on payment_attempts (strictly 'NGN')
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      WHERE c.conrelid = 'public.payment_attempts'::regclass
        AND c.contype = 'c'
        AND c.convalidated = true
        AND (
          regexp_replace(regexp_replace(pg_get_constraintdef(oid), '::text', '', 'g'), '\s+', ' ', 'g') IN (
            'CHECK ((currency = ANY (ARRAY[''NGN''])))',
            'CHECK (currency = ANY (ARRAY[''NGN'']))',
            'CHECK ((currency = ''NGN''))',
            'CHECK (currency = ''NGN'')',
            'CHECK ((currency IN (''NGN'')))',
            'CHECK (currency IN (''NGN''))'
          )
        )
    ) THEN
      RAISE EXCEPTION 'Table public.payment_attempts exists but lacks an equivalent, validated currency check constraint';
    END IF;
  END IF;
END $$;

-- Safe index check: do not drop blindly by name. Verify it is strictly a redundant
-- non-unique index on reference before removing it; otherwise fail safely.
DO $$
DECLARE
  idx_rec record;
BEGIN
  SELECT 
    c.oid AS index_oid,
    n.nspname AS index_schema,
    tn.nspname AS table_schema,
    t.relname AS table_name,
    i.indisunique,
    i.indisprimary,
    i.indnkeyatts,
    a.attname
  INTO idx_rec
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_index i ON i.indexrelid = c.oid
  JOIN pg_class t ON t.oid = i.indrelid
  JOIN pg_namespace tn ON tn.oid = t.relnamespace
  JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = i.indkey[0]
  WHERE c.relname = 'idx_payment_attempts_reference';

  IF FOUND THEN
    IF idx_rec.index_schema = 'public' AND idx_rec.table_schema = 'public' AND idx_rec.table_name = 'payment_attempts' AND
       idx_rec.indisunique = false AND idx_rec.indisprimary = false AND idx_rec.indnkeyatts = 1 AND idx_rec.attname = 'reference' THEN
      DROP INDEX public.idx_payment_attempts_reference;
    ELSE
      RAISE EXCEPTION 'Index idx_payment_attempts_reference exists with unexpected definition (schema: %, table: %.%, is_unique: %, is_primary: %, cols: %, attname: %). Refusing to drop.',
        idx_rec.index_schema, idx_rec.table_schema, idx_rec.table_name, idx_rec.indisunique, idx_rec.indisprimary, idx_rec.indnkeyatts, idx_rec.attname;
    END IF;
  END IF;
END $$;

-- Catalog-validated lookup indexes on payment_attempts
DO $$
DECLARE
  idx_rec record;
  col_name text;
BEGIN
  SELECT 
    c.oid AS index_oid,
    n.nspname AS index_schema,
    tn.nspname AS table_schema,
    t.relname AS table_name,
    i.indrelid,
    i.indisunique,
    i.indisprimary,
    i.indisvalid,
    i.indisready,
    i.indnkeyatts,
    i.indnatts,
    i.indexprs,
    i.indpred,
    i.indkey,
    i.indoption
  INTO idx_rec
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_index i ON i.indexrelid = c.oid
  JOIN pg_class t ON t.oid = i.indrelid
  JOIN pg_namespace tn ON tn.oid = t.relnamespace
  WHERE c.relname = 'idx_payment_attempts_order_id';

  IF FOUND THEN
    IF idx_rec.index_schema <> 'public' THEN
      RAISE EXCEPTION 'Index idx_payment_attempts_order_id exists in unexpected schema % (expected public)', idx_rec.index_schema;
    END IF;
    IF idx_rec.table_schema <> 'public' OR idx_rec.table_name <> 'payment_attempts' THEN
      RAISE EXCEPTION 'Index public.idx_payment_attempts_order_id targets unexpected table %.% (expected public.payment_attempts)',
        idx_rec.table_schema, idx_rec.table_name;
    END IF;
    IF NOT (idx_rec.indisvalid AND idx_rec.indisready) THEN
      RAISE EXCEPTION 'Index public.idx_payment_attempts_order_id exists but is INVALID or NOT READY';
    END IF;
    IF idx_rec.indisunique THEN
      RAISE EXCEPTION 'Index public.idx_payment_attempts_order_id exists but is unexpectedly UNIQUE';
    END IF;
    IF idx_rec.indisprimary THEN
      RAISE EXCEPTION 'Index public.idx_payment_attempts_order_id exists but is a PRIMARY KEY index';
    END IF;
    IF idx_rec.indpred IS NOT NULL THEN
      RAISE EXCEPTION 'Index public.idx_payment_attempts_order_id exists but is unexpectedly PARTIAL';
    END IF;
    IF idx_rec.indexprs IS NOT NULL THEN
      RAISE EXCEPTION 'Index public.idx_payment_attempts_order_id exists but contains expression keys';
    END IF;
    IF idx_rec.indnkeyatts <> 1 OR idx_rec.indnatts <> 1 THEN
      RAISE EXCEPTION 'Index public.idx_payment_attempts_order_id does not index exactly 1 column';
    END IF;

    SELECT a.attname INTO col_name
    FROM pg_attribute a
    WHERE a.attrelid = idx_rec.indrelid
      AND a.attnum = idx_rec.indkey[0];

    IF col_name <> 'order_id' THEN
      RAISE EXCEPTION 'Index public.idx_payment_attempts_order_id indexes column % (expected order_id)', col_name;
    END IF;
    IF (idx_rec.indoption[0] & 1) <> 0 THEN
      RAISE EXCEPTION 'Index public.idx_payment_attempts_order_id is DESC (expected ASC)';
    END IF;
  ELSE
    CREATE INDEX idx_payment_attempts_order_id
      ON public.payment_attempts(order_id);
  END IF;
END $$;

DO $$
DECLARE
  idx_rec record;
  col_name text;
BEGIN
  SELECT 
    c.oid AS index_oid,
    n.nspname AS index_schema,
    tn.nspname AS table_schema,
    t.relname AS table_name,
    i.indrelid,
    i.indisunique,
    i.indisprimary,
    i.indisvalid,
    i.indisready,
    i.indnkeyatts,
    i.indnatts,
    i.indexprs,
    i.indpred,
    i.indkey,
    i.indoption
  INTO idx_rec
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_index i ON i.indexrelid = c.oid
  JOIN pg_class t ON t.oid = i.indrelid
  JOIN pg_namespace tn ON tn.oid = t.relnamespace
  WHERE c.relname = 'idx_payment_attempts_status';

  IF FOUND THEN
    IF idx_rec.index_schema <> 'public' THEN
      RAISE EXCEPTION 'Index idx_payment_attempts_status exists in unexpected schema % (expected public)', idx_rec.index_schema;
    END IF;
    IF idx_rec.table_schema <> 'public' OR idx_rec.table_name <> 'payment_attempts' THEN
      RAISE EXCEPTION 'Index public.idx_payment_attempts_status targets unexpected table %.% (expected public.payment_attempts)',
        idx_rec.table_schema, idx_rec.table_name;
    END IF;
    IF NOT (idx_rec.indisvalid AND idx_rec.indisready) THEN
      RAISE EXCEPTION 'Index public.idx_payment_attempts_status exists but is INVALID or NOT READY';
    END IF;
    IF idx_rec.indisunique THEN
      RAISE EXCEPTION 'Index public.idx_payment_attempts_status exists but is unexpectedly UNIQUE';
    END IF;
    IF idx_rec.indisprimary THEN
      RAISE EXCEPTION 'Index public.idx_payment_attempts_status exists but is a PRIMARY KEY index';
    END IF;
    IF idx_rec.indpred IS NOT NULL THEN
      RAISE EXCEPTION 'Index public.idx_payment_attempts_status exists but is unexpectedly PARTIAL';
    END IF;
    IF idx_rec.indexprs IS NOT NULL THEN
      RAISE EXCEPTION 'Index public.idx_payment_attempts_status exists but contains expression keys';
    END IF;
    IF idx_rec.indnkeyatts <> 1 OR idx_rec.indnatts <> 1 THEN
      RAISE EXCEPTION 'Index public.idx_payment_attempts_status does not index exactly 1 column';
    END IF;

    SELECT a.attname INTO col_name
    FROM pg_attribute a
    WHERE a.attrelid = idx_rec.indrelid
      AND a.attnum = idx_rec.indkey[0];

    IF col_name <> 'status' THEN
      RAISE EXCEPTION 'Index public.idx_payment_attempts_status indexes column % (expected status)', col_name;
    END IF;
    IF (idx_rec.indoption[0] & 1) <> 0 THEN
      RAISE EXCEPTION 'Index public.idx_payment_attempts_status is DESC (expected ASC)';
    END IF;
  ELSE
    CREATE INDEX idx_payment_attempts_status
      ON public.payment_attempts(status);
  END IF;
END $$;

DO $$
DECLARE
  idx_rec record;
  col_name text;
BEGIN
  SELECT 
    c.oid AS index_oid,
    n.nspname AS index_schema,
    tn.nspname AS table_schema,
    t.relname AS table_name,
    i.indrelid,
    i.indisunique,
    i.indisprimary,
    i.indisvalid,
    i.indisready,
    i.indnkeyatts,
    i.indnatts,
    i.indexprs,
    i.indpred,
    i.indkey,
    i.indoption
  INTO idx_rec
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_index i ON i.indexrelid = c.oid
  JOIN pg_class t ON t.oid = i.indrelid
  JOIN pg_namespace tn ON tn.oid = t.relnamespace
  WHERE c.relname = 'idx_payment_attempts_created_at';

  IF FOUND THEN
    IF idx_rec.index_schema <> 'public' THEN
      RAISE EXCEPTION 'Index idx_payment_attempts_created_at exists in unexpected schema % (expected public)', idx_rec.index_schema;
    END IF;
    IF idx_rec.table_schema <> 'public' OR idx_rec.table_name <> 'payment_attempts' THEN
      RAISE EXCEPTION 'Index public.idx_payment_attempts_created_at targets unexpected table %.% (expected public.payment_attempts)',
        idx_rec.table_schema, idx_rec.table_name;
    END IF;
    IF NOT (idx_rec.indisvalid AND idx_rec.indisready) THEN
      RAISE EXCEPTION 'Index public.idx_payment_attempts_created_at exists but is INVALID or NOT READY';
    END IF;
    IF idx_rec.indisunique THEN
      RAISE EXCEPTION 'Index public.idx_payment_attempts_created_at exists but is unexpectedly UNIQUE';
    END IF;
    IF idx_rec.indisprimary THEN
      RAISE EXCEPTION 'Index public.idx_payment_attempts_created_at exists but is a PRIMARY KEY index';
    END IF;
    IF idx_rec.indpred IS NOT NULL THEN
      RAISE EXCEPTION 'Index public.idx_payment_attempts_created_at exists but is unexpectedly PARTIAL';
    END IF;
    IF idx_rec.indexprs IS NOT NULL THEN
      RAISE EXCEPTION 'Index public.idx_payment_attempts_created_at exists but contains expression keys';
    END IF;
    IF idx_rec.indnkeyatts <> 1 OR idx_rec.indnatts <> 1 THEN
      RAISE EXCEPTION 'Index public.idx_payment_attempts_created_at does not index exactly 1 column';
    END IF;

    SELECT a.attname INTO col_name
    FROM pg_attribute a
    WHERE a.attrelid = idx_rec.indrelid
      AND a.attnum = idx_rec.indkey[0];

    IF col_name <> 'created_at' THEN
      RAISE EXCEPTION 'Index public.idx_payment_attempts_created_at indexes column % (expected created_at)', col_name;
    END IF;
    IF (idx_rec.indoption[0] & 1) <> 1 THEN
      RAISE EXCEPTION 'Index public.idx_payment_attempts_created_at is NOT DESC (expected DESC)';
    END IF;
  ELSE
    CREATE INDEX idx_payment_attempts_created_at
      ON public.payment_attempts(created_at DESC);
  END IF;
END $$;

-- Ensure public.handle_updated_at() trigger function exists in repository
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'handle_updated_at' 
      AND n.nspname = 'public'
  ) THEN
    RAISE EXCEPTION 'Required trigger function public.handle_updated_at() does not exist in schema public';
  END IF;
END $$;

-- Idempotent trigger creation (only creates if trigger does not already exist; non-destructive)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_payment_attempts_updated_at'
      AND tgrelid = 'public.payment_attempts'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER set_payment_attempts_updated_at
      BEFORE UPDATE ON public.payment_attempts
      FOR EACH ROW
      EXECUTE FUNCTION public.handle_updated_at();
  END IF;
END $$;


-- ─── 5. Row-Level Security & Policy Audit for payment_attempts ─

ALTER TABLE public.payment_attempts ENABLE ROW LEVEL SECURITY;

-- Audit all existing policies on public.payment_attempts
DO $$
DECLARE
  pol_rec record;
  norm_qual text;
  auth_oid oid;
  is_valid_admin_select boolean;
BEGIN
  SELECT oid INTO auth_oid FROM pg_roles WHERE rolname = 'authenticated';
  IF auth_oid IS NULL THEN
    RAISE EXCEPTION 'Role "authenticated" does not exist in pg_roles';
  END IF;

  FOR pol_rec IN
    SELECT 
      pol.polname,
      pol.polcmd,
      pol.polroles,
      pg_get_expr(pol.polqual, pol.polrelid) AS qual_expr,
      pg_get_expr(pol.polwithcheck, pol.polrelid) AS with_check_expr
    FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'payment_attempts'
  LOOP
    norm_qual := regexp_replace(COALESCE(pol_rec.qual_expr, ''), '\s+', ' ', 'g');

    -- Check if this policy matches the intended read-only admin policy EXCLUSIVELY granted to authenticated
    is_valid_admin_select := (
      pol_rec.polname = 'Admin select payment_attempts' AND
      pol_rec.polcmd = 'r' AND
      norm_qual IN ('public.is_admin()', '(public.is_admin())', 'is_admin()', '(is_admin())') AND
      pol_rec.with_check_expr IS NULL AND
      pol_rec.polroles = ARRAY[auth_oid]
    );

    IF is_valid_admin_select THEN
      CONTINUE;
    END IF;

    -- Safely drop known test drafts if present
    IF pol_rec.polname IN (
      'Admin update payment_attempts',
      'Admin insert payment_attempts',
      'Admin delete payment_attempts',
      'Public select payment_attempts',
      'Public insert payment_attempts',
      'Public update payment_attempts',
      'Public delete payment_attempts'
    ) THEN
      EXECUTE format('DROP POLICY %I ON public.payment_attempts', pol_rec.polname);
    ELSE
      -- Any unexpected policy, or an "Admin select payment_attempts" policy with any other role configuration!
      RAISE EXCEPTION 'Unexpected or invalid policy "%" on public.payment_attempts detected (cmd: %, roles: %, qual: %, with_check: %). Required: SELECT exclusively TO authenticated with public.is_admin().',
        pol_rec.polname, pol_rec.polcmd, pol_rec.polroles, pol_rec.qual_expr, pol_rec.with_check_expr;
    END IF;
  END LOOP;
END $$;

-- Idempotently create admin SELECT policy (audit and review only)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'payment_attempts' 
      AND policyname = 'Admin select payment_attempts'
  ) THEN
    CREATE POLICY "Admin select payment_attempts"
      ON public.payment_attempts
      FOR SELECT
      TO authenticated
      USING (public.is_admin());
  END IF;
END $$;

-- Post-audit verification assertion on public.payment_attempts
DO $$
DECLARE
  pol_rec record;
  pol_count integer := 0;
  auth_oid oid;
BEGIN
  SELECT oid INTO auth_oid FROM pg_roles WHERE rolname = 'authenticated';

  FOR pol_rec IN
    SELECT pol.polname, pol.polcmd, pol.polroles, pol.polwithcheck
    FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'payment_attempts'
  LOOP
    pol_count := pol_count + 1;
    IF pol_rec.polname <> 'Admin select payment_attempts' OR
       pol_rec.polcmd <> 'r' OR
       pol_rec.polroles <> ARRAY[auth_oid] OR
       pol_rec.polwithcheck IS NOT NULL THEN
      RAISE EXCEPTION 'Post-audit check failed: policy "%" has invalid configuration on public.payment_attempts (expected SELECT exclusively TO authenticated)', pol_rec.polname;
    END IF;
  END LOOP;

  IF pol_count <> 1 THEN
    RAISE EXCEPTION 'Post-audit check failed: expected exactly 1 policy on public.payment_attempts, found %', pol_count;
  END IF;
END $$;


-- ─── 6. Restrict Public Insert RLS Policy on public.orders ─────

-- Anonymous/public checkout can create ONLY bank transfer orders with:
--   status = 'awaiting_confirmation'
--   payment_status = 'unpaid'
--   payment_method = 'bank_transfer'

DO $$
DECLARE
  existing_check_expr text;
  norm_check_expr text;
  is_already_hardened boolean := false;
  is_known_upgradeable boolean := false;
BEGIN
  SELECT pg_get_expr(pol.polwithcheck, pol.polrelid) INTO existing_check_expr
  FROM pg_policy pol
  JOIN pg_class c ON c.oid = pol.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'orders'
    AND pol.polname = 'Public insert orders';

  IF existing_check_expr IS NOT NULL THEN
    norm_check_expr := regexp_replace(regexp_replace(existing_check_expr, '::text', '', 'g'), '\s+', ' ', 'g');

    -- Explicitly recognized hardened definitions (no substrings)
    IF norm_check_expr IN (
      '(((status = ''awaiting_confirmation'') AND (payment_status = ''unpaid'')) AND (payment_method = ''bank_transfer''))',
      '((status = ''awaiting_confirmation'') AND (payment_status = ''unpaid'') AND (payment_method = ''bank_transfer''))',
      '(status = ''awaiting_confirmation'') AND (payment_status = ''unpaid'') AND (payment_method = ''bank_transfer'')',
      'status = ''awaiting_confirmation'' AND payment_status = ''unpaid'' AND payment_method = ''bank_transfer'''
    ) THEN
      is_already_hardened := true;
    -- Explicitly recognized legacy/transitional definitions (no substrings)
    ELSIF norm_check_expr IN (
      'true',
      '(status = ''awaiting_confirmation'')',
      'status = ''awaiting_confirmation''',
      '(((status = ''awaiting_confirmation'') AND (payment_status = ANY (ARRAY[''unpaid'', ''pending'']))) AND (payment_method = ANY (ARRAY[''bank_transfer'', ''paystack''])))',
      '((status = ''awaiting_confirmation'') AND (payment_status = ANY (ARRAY[''unpaid'', ''pending''])) AND (payment_method = ANY (ARRAY[''bank_transfer'', ''paystack''])))',
      '(status = ''awaiting_confirmation'') AND (payment_status = ANY (ARRAY[''unpaid'', ''pending''])) AND (payment_method = ANY (ARRAY[''bank_transfer'', ''paystack'']))',
      'status = ''awaiting_confirmation'' AND payment_status IN (''unpaid'', ''pending'') AND payment_method IN (''bank_transfer'', ''paystack'')',
      'status = ''awaiting_confirmation'' AND (payment_status = ANY (ARRAY[''unpaid'', ''pending''])) AND (payment_method = ANY (ARRAY[''bank_transfer'', ''paystack'']))'
    ) THEN
      is_known_upgradeable := true;
    ELSE
      -- Ambiguous or unrecognized definition; fail closed!
      RAISE EXCEPTION 'Policy "Public insert orders" on public.orders has an unrecognized or ambiguous definition: %. Halting execution.', existing_check_expr;
    END IF;

    IF is_known_upgradeable THEN
      DROP POLICY "Public insert orders" ON public.orders;
      CREATE POLICY "Public insert orders"
        ON public.orders
        FOR INSERT
        WITH CHECK (
          status = 'awaiting_confirmation' AND
          payment_status = 'unpaid' AND
          payment_method = 'bank_transfer'
        );
    END IF;
  ELSE
    CREATE POLICY "Public insert orders"
      ON public.orders
      FOR INSERT
      WITH CHECK (
        status = 'awaiting_confirmation' AND
        payment_status = 'unpaid' AND
        payment_method = 'bank_transfer'
      );
  END IF;
END $$;

-- Inspect ALL applicable INSERT and ALL policies on public.orders (including authenticated)
-- to ensure no alternative permissive policy bypasses the bank-transfer-only insertion rule.
DO $$
DECLARE
  unexpected_pol record;
BEGIN
  FOR unexpected_pol IN
    SELECT pol.polname, pol.polcmd, pol.polroles, pg_get_expr(pol.polwithcheck, pol.polrelid) AS with_check_expr
    FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'orders'
      AND pol.polcmd IN ('a', '*')
      AND pol.polname <> 'Public insert orders'
  LOOP
    RAISE EXCEPTION 'Alternative INSERT/ALL policy "%" detected on public.orders (cmd: %, roles: %, with_check: %). This could bypass the bank-transfer-only insertion rule.',
      unexpected_pol.polname, unexpected_pol.polcmd, unexpected_pol.polroles, unexpected_pol.with_check_expr;
  END LOOP;
END $$;
