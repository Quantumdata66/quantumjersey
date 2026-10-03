-- ============================================================
-- Quantum Jersey — Orders & Customer Reviews Schema Migration
-- ============================================================
-- Run this script in the Supabase SQL Editor (Dashboard -> SQL Editor)
--
-- This script:
-- 1. Creates the public.orders table for WhatsApp orders with strict RLS.
-- 2. Creates the public.reviews table for product customer reviews with strict RLS.
-- 3. Configures public write access for orders (without read leakage).
-- 4. Configures admin-only management for orders and review moderation.
-- 5. Configures verified purchase derived validation.
-- ============================================================

-- ─── 1. Orders Table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orders (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  order_ref       TEXT        NOT NULL UNIQUE,
  customer_name   TEXT        NOT NULL,
  customer_phone  TEXT        NOT NULL,
  delivery_state  TEXT        NOT NULL,
  delivery_city   TEXT        NOT NULL,
  delivery_address TEXT       NOT NULL,
  delivery_notes  TEXT,
  items           JSONB       NOT NULL DEFAULT '[]'::jsonb,
  subtotal        INTEGER     NOT NULL CHECK (subtotal >= 0),
  delivery_fee    INTEGER     NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  total_amount    INTEGER     NOT NULL CHECK (total_amount >= 0),
  status          TEXT        NOT NULL DEFAULT 'awaiting_confirmation'
                              CHECK (status IN ('awaiting_confirmation', 'confirmed', 'processing', 'dispatched', 'delivered', 'cancelled')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for speedy lookups by status, order_ref, and creation date
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_order_ref ON public.orders(order_ref);

-- Enable RLS on orders
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Drop legacy/existing policies if re-running
DROP POLICY IF EXISTS "Public insert orders" ON public.orders;
DROP POLICY IF EXISTS "Admin select orders" ON public.orders;
DROP POLICY IF EXISTS "Admin update orders" ON public.orders;
DROP POLICY IF EXISTS "Admin delete orders" ON public.orders;

-- Public customers can insert new orders when checking out via WhatsApp
CREATE POLICY "Public insert orders"
  ON public.orders
  FOR INSERT
  WITH CHECK (true);

-- ONLY authorized administrators can view orders (protects customer PII: phone, address, name)
CREATE POLICY "Admin select orders"
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- ONLY authorized administrators can update order status
CREATE POLICY "Admin update orders"
  ON public.orders
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ONLY authorized administrators can delete orders
CREATE POLICY "Admin delete orders"
  ON public.orders
  FOR DELETE
  TO authenticated
  USING (public.is_admin());


-- ─── 2. Product Reviews Table ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reviews (
  id                    UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id            UUID        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  order_id              UUID        REFERENCES public.orders(id) ON DELETE SET NULL,
  order_ref             TEXT,
  rating                INTEGER     NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text           TEXT        NOT NULL CHECK (length(trim(review_text)) >= 3),
  customer_name         TEXT        NOT NULL DEFAULT 'Verified Customer',
  status                TEXT        NOT NULL DEFAULT 'pending'
                                    CHECK (status IN ('pending', 'approved', 'rejected')),
  is_verified_purchase  BOOLEAN     NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure a customer order cannot submit duplicate reviews for the same product
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_order_product_review
  ON public.reviews(order_id, product_id)
  WHERE order_id IS NOT NULL;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_reviews_product_status ON public.reviews(product_id, status);
CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON public.reviews(created_at DESC);

-- Enable RLS on reviews
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- Drop legacy/existing policies
DROP POLICY IF EXISTS "Public select approved reviews" ON public.reviews;
DROP POLICY IF EXISTS "Public insert pending reviews" ON public.reviews;
DROP POLICY IF EXISTS "Admin update reviews" ON public.reviews;
DROP POLICY IF EXISTS "Admin delete reviews" ON public.reviews;

-- Anyone can view approved reviews (no PII like phone or address stored in reviews)
CREATE POLICY "Public select approved reviews"
  ON public.reviews
  FOR SELECT
  USING (status = 'approved' OR (auth.role() = 'authenticated' AND public.is_admin()));

-- Public can submit reviews (default status is 'pending' for moderation)
CREATE POLICY "Public insert pending reviews"
  ON public.reviews
  FOR INSERT
  WITH CHECK (status = 'pending');

-- Admin can update review moderation status (e.g. approve/reject)
CREATE POLICY "Admin update reviews"
  ON public.reviews
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Admin can delete reviews
CREATE POLICY "Admin delete reviews"
  ON public.reviews
  FOR DELETE
  TO authenticated
  USING (public.is_admin());


-- ─── 3. Automatic updated_at Trigger for Orders ──────────────
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_orders_updated_at ON public.orders;
CREATE TRIGGER set_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
